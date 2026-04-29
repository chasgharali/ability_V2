'use strict';

const OpenAI = require('openai');
const axios = require('axios');
const User = require('../models/User');
const Resume = require('../models/Resume');
const RegisteredJobSeeker = require('../models/RegisteredJobSeeker');
const logger = require('../utils/logger');

// ─── Text extraction (mirrors resumes.js) ────────────────────────────────────

async function extractTextFromBuffer(buffer, mimetype) {
  if (mimetype === 'application/pdf') {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return data.text || '';
  }
  if (
    mimetype === 'application/msword' ||
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }
  return '';
}

async function fetchResumeText(url) {
  if (!url) return '';
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    const buffer = Buffer.from(response.data);
    const ct = response.headers['content-type'] || '';
    let mimetype = 'application/pdf';
    if (ct.includes('msword') || url.toLowerCase().endsWith('.doc')) mimetype = 'application/msword';
    else if (ct.includes('wordprocessingml') || url.toLowerCase().endsWith('.docx'))
      mimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    return await extractTextFromBuffer(buffer, mimetype);
  } catch (e) {
    logger.warn('jobSeekerSearch: failed to fetch resume text from URL:', e.message);
    return '';
  }
}

// ─── OpenAI client ───────────────────────────────────────────────────────────

function getClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ─── Build raw context string for a registration ─────────────────────────────

function buildAccessibilityNeeds(user) {
  const needs = [];
  if (user.usesScreenReader) needs.push('screen reader');
  if (user.usesScreenMagnifier) needs.push('screen magnifier');
  if (user.needsASL) needs.push('ASL interpretation');
  if (user.needsCaptions) needs.push('captions');
  if (user.needsOther) needs.push('other accessibility support');
  return needs;
}

function normalizeObjectIdString(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.toString) return value.toString();
  return String(value);
}

async function buildRegistrationContext(registration) {
  const user = registration.jobSeekerId;
  if (!user) return null;

  const currentEventName = registration.eventId?.name || '';

  // 1) Event registration history for user (used as broad context)
  const registrations = await RegisteredJobSeeker.find({ jobSeekerId: user._id })
    .populate('eventId', 'name')
    .populate('resumeId')
    .lean();

  const eventNames = registrations.map(r => r.eventId?.name).filter(Boolean);

  // 2) Resume docs — prioritize this registration's selected resume
  const userResumeDocs = await Resume.find({ userId: user._id })
    .sort({ isDefault: -1, updatedAt: -1 })
    .limit(3)
    .lean();

  const selectedResumeDoc = registration.resumeId && typeof registration.resumeId === 'object'
    ? registration.resumeId
    : null;

  const seenResumeIds = new Set();
  const prioritizedResumeDocs = [];

  if (selectedResumeDoc?._id) {
    const selectedId = normalizeObjectIdString(selectedResumeDoc._id);
    if (!seenResumeIds.has(selectedId)) {
      seenResumeIds.add(selectedId);
      prioritizedResumeDocs.push(selectedResumeDoc);
    }
  }

  for (const resume of userResumeDocs) {
    const id = normalizeObjectIdString(resume._id);
    if (!seenResumeIds.has(id)) {
      seenResumeIds.add(id);
      prioritizedResumeDocs.push(resume);
    }
  }

  const regResumeDocs = registrations
    .filter(r => r.resumeId && typeof r.resumeId === 'object' && r.resumeId._id)
    .map(r => r.resumeId)
    .filter(r => {
      const id = normalizeObjectIdString(r._id);
      if (seenResumeIds.has(id)) return false;
      seenResumeIds.add(id);
      return true;
    });

  const resumeDocs = [...prioritizedResumeDocs, ...regResumeDocs].slice(0, 5);

  // 3) Raw resume file text fallback: this registration's file first
  let rawResumeText = '';
  if (resumeDocs.length === 0) {
    const rawUrls = [];
    if (registration.resumeUrl) rawUrls.push(registration.resumeUrl);
    if (user.resumeUrl) rawUrls.push(user.resumeUrl);
    for (const reg of registrations) {
      if (reg.resumeUrl && !rawUrls.includes(reg.resumeUrl)) rawUrls.push(reg.resumeUrl);
    }
    if (rawUrls.length > 0) {
      const texts = await Promise.all(rawUrls.slice(0, 3).map(fetchResumeText));
      rawResumeText = texts.filter(Boolean).join('\n\n---\n\n');
    }
  }

  // 4) Profile metadata
  const meta = user.metadata || {};
  const profile = meta.profile || {};

  // 5) Survey / disability data
  const survey = user.survey || {};
  const disabilities = [...(survey.disabilities || [])];
  if (survey.otherDisability) disabilities.push(survey.otherDisability);

  const accessibilityNeeds = buildAccessibilityNeeds(user);

  return {
    registrationId: registration._id,
    registrationEventName: currentEventName,
    registrationDate: registration.registeredAt,
    name: user.name,
    email: user.email,
    city: user.city,
    state: user.state,
    country: user.country,
    headline: profile.headline || '',
    keywords: profile.keywords || '',
    primaryExperience: profile.primaryExperience || [],
    employmentTypes: profile.employmentTypes || [],
    workLevel: profile.workLevel || '',
    educationLevel: profile.educationLevel || '',
    languages: user.languages || [],
    disabilities,
    accessibilityNeeds,
    eventNames,
    totalEventsRegistered: registrations.length,
    resumeDocs,
    rawResumeText,
    survey: {
      race: survey.race || [],
      genderIdentity: survey.genderIdentity || '',
      ageGroup: survey.ageGroup || '',
      countryOfOrigin: survey.countryOfOrigin || ''
    }
  };
}

// ─── OpenAI extraction: build rich aiProfile from registration context ───────

async function extractProfileWithAI(ctx, client) {
  const resumeSnippet = ctx.resumeDocs.length > 0
    ? ctx.resumeDocs.map(r => {
        const c = r.content || {};
        const expTitles = (c.experience || []).map(e => `${e.title} at ${e.company}`).join(', ');
        const skills = (c.skills || []).join(', ');
        return `Resume "${r.title}": Skills: ${skills}. Experience: ${expTitles}. Summary: ${c.summary || ''}`;
      }).join('\n')
    : (ctx.rawResumeText ? `Raw resume text:\n${ctx.rawResumeText.substring(0, 4000)}` : 'No resume available');

  const prompt = `You are an AI that extracts structured professional profile data from job seeker information.
Return ONLY valid JSON, no markdown, no code fences.

Job Seeker Information:
- Name: ${ctx.name}
- Location: ${ctx.city}, ${ctx.state}, ${ctx.country}
- Current Registration Event: ${ctx.registrationEventName || 'unknown'}
- Profile Headline: ${ctx.headline}
- Profile Keywords: ${ctx.keywords}
- Primary Experience Areas: ${ctx.primaryExperience.join(', ')}
- Employment Types Sought: ${ctx.employmentTypes.join(', ')}
- Work Level: ${ctx.workLevel}
- Education Level: ${ctx.educationLevel}
- Languages: ${ctx.languages.join(', ')}
- Disabilities/Conditions: ${ctx.disabilities.join(', ')}
- Accessibility Needs: ${ctx.accessibilityNeeds.join(', ')}
- Events Attended: ${ctx.eventNames.join(', ')}
- Total Events Registered: ${ctx.totalEventsRegistered}

${resumeSnippet}

Extract and return this exact JSON structure:
{
  "currentTitle": "most recent or most relevant job title (e.g. Security Guard, Software Engineer)",
  "yearsOfExperience": <number or null if unknown>,
  "skills": ["skill1", "skill2"],
  "industries": ["industry1", "industry2"],
  "educationLevel": "High School / Associate / Bachelor / Master / PhD / Vocational / Other",
  "workLanguages": ["English", "Spanish"],
  "summary": "1-2 sentence professional summary",
  "headline": "professional headline",
  "keywords": ["keyword1", "keyword2"],
  "employmentTypes": ["Full-time", "Part-time"],
  "workLevel": "Entry / Mid / Senior / Executive",
  "disabilities": ["adhd", "visual impairment"],
  "accessibilityNeeds": ["screen reader", "ASL"],
  "searchableText": "single combined lowercase string of all relevant terms for text matching, including job titles, skills, location, disabilities, industries, keywords"
}

IMPORTANT: For disabilities, normalize to simple lowercase terms (e.g. "adhd", "autism", "visual impairment", "hearing impairment", "mobility impairment", "traumatic brain injury", "ptsd"). Include any from the profile disabilities list. The searchableText must include city, state, job titles, skills, disability names, and keywords all joined as a space-separated lowercase string.`;

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 1500,
    temperature: 0.1
  });

  const text = response.choices[0]?.message?.content || '{}';
  try {
    return JSON.parse(text);
  } catch {
    logger.error('jobSeekerSearch: failed to parse AI extraction response');
    return {};
  }
}

function buildParseSources(ctx) {
  const sources = [];
  if (ctx.resumeDocs.length > 0) sources.push('resume-builder');
  if (ctx.rawResumeText) sources.push('uploaded-resume');
  if (ctx.headline || ctx.keywords) sources.push('profile');
  return sources;
}

// ─── Parse a single registration profile ─────────────────────────────────────

async function parseRegistrationProfile(registrationId) {
  const registration = await RegisteredJobSeeker.findById(registrationId)
    .populate('jobSeekerId')
    .populate('eventId', 'name')
    .populate('resumeId');

  if (!registration) {
    logger.warn(`jobSeekerSearch: registration ${registrationId} not found — skipping`);
    return null;
  }

  const user = registration.jobSeekerId;
  if (!user || user.role !== 'JobSeeker') {
    logger.warn(`jobSeekerSearch: invalid job seeker for registration ${registrationId} — skipping`);
    return null;
  }

  logger.info(`jobSeekerSearch: parsing registration ${registration._id} for ${user.name} (${user._id})`);

  const client = getClient();
  const ctx = await buildRegistrationContext(registration);
  if (!ctx) {
    logger.warn(`jobSeekerSearch: no context for registration ${registration._id} — skipping`);
    return null;
  }
  logger.info(
    `jobSeekerSearch: context built for registration ${registration._id} — ` +
    `resumeDocs:${ctx.resumeDocs.length} rawText:${ctx.rawResumeText.length}chars events:${ctx.totalEventsRegistered}`
  );

  const extracted = await extractProfileWithAI(ctx, client);
  logger.info(
    `jobSeekerSearch: AI extraction done for registration ${registration._id} — ` +
    `title:"${extracted.currentTitle}" skills:${(extracted.skills || []).length}`
  );

  const parsedAt = new Date();
  const parseSource = buildParseSources(ctx).join('+') || 'profile';
  const aiProfile = {
    parsedAt,
    parseSource,
    currentTitle: extracted.currentTitle || '',
    yearsOfExperience: extracted.yearsOfExperience ?? null,
    skills: extracted.skills || [],
    industries: extracted.industries || [],
    educationLevel: extracted.educationLevel || ctx.educationLevel || '',
    workLanguages: extracted.workLanguages || ctx.languages || [],
    summary: extracted.summary || '',
    headline: extracted.headline || ctx.headline || '',
    keywords: extracted.keywords || [],
    employmentTypes: extracted.employmentTypes || ctx.employmentTypes || [],
    workLevel: extracted.workLevel || ctx.workLevel || '',
    disabilities: extracted.disabilities || ctx.disabilities || [],
    accessibilityNeeds: extracted.accessibilityNeeds || ctx.accessibilityNeeds || [],
    totalEventsRegistered: ctx.totalEventsRegistered,
    eventNames: ctx.eventNames,
    searchableText: [
      (extracted.searchableText || ''),
      user.city, user.state, user.country,
      user.name
    ].join(' ').toLowerCase().replace(/\s+/g, ' ').trim()
  };

  registration.aiProfile = aiProfile;
  registration.aiIndexedAt = parsedAt;
  registration.aiParseSource = parseSource;
  registration.markModified('aiProfile');
  await registration.save();

  // Keep user-level aiProfile in sync for backwards compatibility in other screens.
  user.aiProfile = aiProfile;
  user.markModified('aiProfile');
  await user.save();
  logger.info(`jobSeekerSearch: saved aiProfile for registration ${registration._id}`);
  return registration.aiProfile;
}

// Backward compatible wrapper used by legacy codepaths.
// Parses all registrations for the given user.
async function parseJobSeekerProfile(userId) {
  const registrations = await RegisteredJobSeeker.find({ jobSeekerId: userId })
    .select('_id')
    .sort({ registeredAt: -1 })
    .lean();

  if (!registrations.length) {
    logger.warn(`jobSeekerSearch: no registrations found for user ${userId}`);
    return null;
  }

  let lastProfile = null;
  for (const reg of registrations) {
    const parsed = await parseRegistrationProfile(reg._id);
    if (parsed) lastProfile = parsed;
  }
  return lastProfile;
}

// ─── Get parse status for an org (registration-level) ───────────────────────

async function listValidOrgRegistrations(orgId) {
  const registrations = await RegisteredJobSeeker.find({
    organizationId: orgId,
    jobSeekerId: { $ne: null }
  })
    .select('_id aiIndexedAt jobSeekerId')
    .populate('jobSeekerId', 'role')
    .lean();

  return registrations.filter(r => r.jobSeekerId && r.jobSeekerId.role === 'JobSeeker');
}

async function getParseStatus(orgId) {
  const validRegistrations = await listValidOrgRegistrations(orgId);
  const total = validRegistrations.length;
  const validRegistrationIds = validRegistrations.map(r => r._id);

  const parsedRegistrations = await RegisteredJobSeeker.find({
    _id: { $in: validRegistrationIds },
    aiIndexedAt: { $ne: null }
  })
    .populate('jobSeekerId', 'name email city state')
    .populate('eventId', 'name')
    .sort({ aiIndexedAt: -1 })
    .lean();

  const parsed = parsedRegistrations.length;

  const recentlyIndexed = parsedRegistrations.slice(0, 8).map(r => ({
    _id: r._id,
    name: r.jobSeekerId?.name || 'Unknown',
    email: r.jobSeekerId?.email || '',
    location: [r.jobSeekerId?.city, r.jobSeekerId?.state].filter(Boolean).join(', '),
    currentTitle: r.aiProfile?.currentTitle || '',
    parsedAt: r.aiIndexedAt,
    eventName: r.eventId?.name || ''
  }));

  return { total, parsed, unparsed: Math.max(total - parsed, 0), recentlyIndexed };
}

// ─── Batch parse unprocessed registrations for an org ────────────────────────

async function batchParseProfiles(orgId, { onProgress } = {}) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const validRegistrations = await listValidOrgRegistrations(orgId);
  const ids = validRegistrations
    .filter(r => !r.aiIndexedAt || r.aiIndexedAt < sevenDaysAgo)
    .map(r => r._id);
  logger.info(`jobSeekerSearch: batch starting for org ${orgId} — ${ids.length} registrations to parse`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    try {
      const result = await parseRegistrationProfile(id);
      if (result === null) {
        skipped++;
      } else {
        processed++;
      }
      if (onProgress) onProgress({ processed, skipped, errors, total: ids.length });

      // Log progress every 5 profiles
      if ((processed + skipped + errors) % 5 === 0) {
        logger.info(`jobSeekerSearch: batch progress [${i + 1}/${ids.length}] processed:${processed} skipped:${skipped} errors:${errors}`);
      }
    } catch (e) {
      // Retry once on OpenAI rate limit (429)
      if (e?.status === 429 || e?.message?.includes('429') || e?.message?.toLowerCase().includes('rate limit')) {
        logger.warn(`jobSeekerSearch: rate limited on registration ${id} — waiting 10s then retrying`);
        await new Promise(r => setTimeout(r, 10000));
        try {
          const result = await parseRegistrationProfile(id);
          if (result === null) { skipped++; } else { processed++; }
          if (onProgress) onProgress({ processed, skipped, errors, total: ids.length });
        } catch (retryErr) {
          errors++;
          logger.warn(`jobSeekerSearch: retry failed for registration ${id}: ${retryErr.message}`);
        }
      } else {
        errors++;
        logger.warn(`jobSeekerSearch: failed to parse registration ${id}: ${e.message}`);
      }
    }
    // Respect rate limits — delay between requests
    await new Promise(r => setTimeout(r, 300));
  }

  logger.info(`jobSeekerSearch: batch complete for org ${orgId} — processed:${processed} skipped:${skipped} errors:${errors} total:${ids.length}`);
  return { processed, skipped, errors, total: ids.length };
}

// ─── AI-powered natural language search ──────────────────────────────────────

async function translateQueryToFilters(query, client) {
  const prompt = `You are a search query translator. Convert a natural language job seeker search query into structured search criteria.
Return ONLY valid JSON, no markdown, no code fences.

Query: "${query}"

Return this exact JSON structure:
{
  "titles": ["list of job title keywords to match against currentTitle, e.g. security guard, officer"],
  "skills": ["skill keywords"],
  "location": {
    "city": "city name or empty string",
    "state": "state name or abbreviation or empty string",
    "country": "full country name lowercase or empty string",
    "countryCode": "ISO 3166-1 alpha-2 country code uppercase or empty string"
  },
  "disabilities": ["disability terms to match, e.g. adhd, autism, visual impairment"],
  "accessibilityNeeds": ["accessibility need terms"],
  "industries": ["industry keywords"],
  "educationLevel": "education level or empty string",
  "workLevel": "Entry / Mid / Senior / Executive or empty string",
  "keywords": ["general keywords to match against searchableText — do NOT include country or location terms here, only skills/role/industry terms"]
}

Rules:
- Keep all terms lowercase except countryCode which is uppercase (e.g. "pakistan" → country:"pakistan", countryCode:"PK")
- "adhd" maps to disabilities: ["adhd"]
- "deaf" maps to disabilities: ["hearing impairment"] AND accessibilityNeeds: ["ASL"]
- Location: extract city, state, country from phrases like "in denver", "denver colorado", "CO", "from pakistan"
- If a term could be a skill or a title, put it in both
- keywords should contain only non-location terms for broad text matching`;

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 500,
    temperature: 0
  });

  const text = response.choices[0]?.message?.content || '{}';
  try {
    return JSON.parse(text);
  } catch {
    return { titles: [], skills: [], location: {}, disabilities: [], keywords: [query] };
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasRegexMatch(value, term) {
  if (!value || !term) return false;
  const re = new RegExp(escapeRegex(term), 'i');
  return re.test(String(value));
}

function listHasAnyTerm(values = [], terms = []) {
  return terms.some(term => values.some(v => hasRegexMatch(v, term)));
}

function stringHasAnyTerm(value = '', terms = []) {
  return terms.some(term => hasRegexMatch(value, term));
}

function normalizeCriteria(criteria = {}) {
  return {
    titles: Array.isArray(criteria.titles) ? criteria.titles.filter(Boolean) : [],
    skills: Array.isArray(criteria.skills) ? criteria.skills.filter(Boolean) : [],
    industries: Array.isArray(criteria.industries) ? criteria.industries.filter(Boolean) : [],
    disabilities: Array.isArray(criteria.disabilities) ? criteria.disabilities.filter(Boolean) : [],
    accessibilityNeeds: Array.isArray(criteria.accessibilityNeeds) ? criteria.accessibilityNeeds.filter(Boolean) : [],
    keywords: Array.isArray(criteria.keywords) ? criteria.keywords.filter(Boolean) : [],
    educationLevel: criteria.educationLevel || '',
    workLevel: criteria.workLevel || '',
    location: criteria.location || {}
  };
}

function matchesLocation(user, ai, loc = {}) {
  const searchable = String(ai?.searchableText || '').toLowerCase();
  if (loc.city) {
    const cityMatched =
      hasRegexMatch(user.city, loc.city) ||
      searchable.includes(String(loc.city).toLowerCase());
    if (!cityMatched) return false;
  }
  if (loc.state) {
    const stateMatched =
      hasRegexMatch(user.state, loc.state) ||
      searchable.includes(String(loc.state).toLowerCase());
    if (!stateMatched) return false;
  }
  if (loc.country) {
    const countryVariants = [loc.country].filter(Boolean);
    if (loc.countryCode) countryVariants.push(loc.countryCode);
    const countryMatched = countryVariants.some(v =>
      hasRegexMatch(user.country, v) || searchable.includes(String(v).toLowerCase())
    );
    if (!countryMatched) return false;
  }
  return true;
}

function registrationMatchesCriteria(registration, criteria) {
  const user = registration.jobSeekerId || {};
  const ai = registration.aiProfile || {};
  const normalized = normalizeCriteria(criteria);
  const searchable = String(ai.searchableText || '');

  const textTerms = [
    ...normalized.titles,
    ...normalized.skills,
    ...normalized.industries,
    ...normalized.keywords
  ].filter(Boolean);

  // Strict location gating when requested
  if (!matchesLocation(user, ai, normalized.location)) return false;

  // Require disability signal when explicitly requested
  if (normalized.disabilities.length > 0) {
    const disabilityMatched =
      listHasAnyTerm(ai.disabilities || [], normalized.disabilities) ||
      stringHasAnyTerm(searchable, normalized.disabilities);
    if (!disabilityMatched) return false;
  }

  // Require accessibility signal when explicitly requested
  if (normalized.accessibilityNeeds.length > 0) {
    const accessibilityMatched =
      listHasAnyTerm(ai.accessibilityNeeds || [], normalized.accessibilityNeeds) ||
      stringHasAnyTerm(searchable, normalized.accessibilityNeeds);
    if (!accessibilityMatched) return false;
  }

  // Require at least one role/skill/keyword hit when these terms exist
  if (textTerms.length > 0) {
    const textMatched =
      stringHasAnyTerm(ai.currentTitle, textTerms) ||
      listHasAnyTerm(ai.skills || [], textTerms) ||
      listHasAnyTerm(ai.industries || [], textTerms) ||
      listHasAnyTerm(ai.keywords || [], textTerms) ||
      stringHasAnyTerm(ai.headline, textTerms) ||
      stringHasAnyTerm(ai.summary, textTerms) ||
      stringHasAnyTerm(searchable, textTerms);

    if (!textMatched) return false;
  }

  if (normalized.educationLevel && !hasRegexMatch(ai.educationLevel, normalized.educationLevel)) {
    return false;
  }
  if (normalized.workLevel && !hasRegexMatch(ai.workLevel, normalized.workLevel)) {
    return false;
  }

  return true;
}

function heuristicScore(registration, criteria) {
  const ai = registration.aiProfile || {};
  const normalized = normalizeCriteria(criteria);
  let score = 0;

  const textTerms = [
    ...normalized.titles,
    ...normalized.skills,
    ...normalized.industries,
    ...normalized.keywords
  ].filter(Boolean);

  for (const term of textTerms) {
    if (hasRegexMatch(ai.currentTitle, term)) score += 4;
    if (listHasAnyTerm(ai.skills || [], [term])) score += 3;
    if (listHasAnyTerm(ai.industries || [], [term])) score += 2;
    if (stringHasAnyTerm(ai.searchableText || '', [term])) score += 1;
  }

  if (normalized.disabilities.length > 0) {
    if (listHasAnyTerm(ai.disabilities || [], normalized.disabilities)) score += 6;
    else if (stringHasAnyTerm(ai.searchableText || '', normalized.disabilities)) score += 2;
  }

  if (normalized.accessibilityNeeds.length > 0) {
    if (listHasAnyTerm(ai.accessibilityNeeds || [], normalized.accessibilityNeeds)) score += 4;
    else if (stringHasAnyTerm(ai.searchableText || '', normalized.accessibilityNeeds)) score += 2;
  }

  return score;
}

// ─── AI re-ranking: score registration matches for relevance ──────────────────

async function reRankResults(query, registrations, client) {
  if (registrations.length <= 1) {
    return registrations.map(r => ({ ...r, _relevanceScore: 10 }));
  }

  const profiles = registrations.map((r, i) => {
    const user = r.jobSeekerId || {};
    const ai = r.aiProfile || {};
    return `[${i}] ${user.name || 'Unknown'} | event="${r.eventId?.name || ''}" | ` +
      `title="${ai.currentTitle || ''}" | skills="${(ai.skills || []).slice(0, 8).join(', ')}" | ` +
      `summary="${(ai.summary || '').slice(0, 180)}" | disabilities="${(ai.disabilities || []).join(', ')}" | ` +
      `accessibilityNeeds="${(ai.accessibilityNeeds || []).join(', ')}" | ` +
      `location="${[user.city, user.state, user.country].filter(Boolean).join(', ')}"`;
  }).join('\n');

  const prompt = `Rate each job seeker's relevance (0-10) for the query: "${query}"

${profiles}

Return ONLY a JSON array of integers [score0, score1, ...] with exactly ${registrations.length} values. 0=not relevant, 10=perfect match.`;

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0
    });

    const text = (response.choices[0]?.message?.content || '[]').replace(/```json?|```/g, '').trim();
    const scores = JSON.parse(text);
    if (!Array.isArray(scores) || scores.length !== registrations.length) {
      return registrations.map(r => ({ ...r, _relevanceScore: 0 }));
    }

    const withScores = registrations
      .map((r, i) => ({ ...r, _relevanceScore: Number(scores[i]) || 0 }))
      .sort((a, b) => b._relevanceScore - a._relevanceScore);

    const filtered = withScores.filter(r => r._relevanceScore >= 6);
    return filtered.length > 0 ? filtered : withScores.slice(0, 20);
  } catch (e) {
    logger.warn('jobSeekerSearch: re-rank failed, returning heuristic order:', e.message);
    return registrations.map(r => ({ ...r, _relevanceScore: 0 }));
  }
}

async function aiSearch(query, orgId, { page = 1, limit = 20 } = {}) {
  if (!query?.trim()) return { results: [], total: 0, criteria: {} };

  const client = getClient();

  const candidates = await RegisteredJobSeeker.find({
    organizationId: orgId,
    jobSeekerId: { $ne: null },
    aiIndexedAt: { $ne: null }
  })
    .populate('jobSeekerId', '-hashedPassword -refreshTokens -legacyPassword -emailVerificationToken -passwordResetToken')
    .populate('eventId', 'name slug')
    .populate('resumeId', 'title')
    .lean();

  if (!candidates.length) return { results: [], total: 0, criteria: {} };

  // Translate natural language to structured criteria
  const criteria = await translateQueryToFilters(query, client);
  logger.info('jobSeekerSearch aiSearch criteria:', JSON.stringify(criteria));

  const matched = candidates.filter(r => registrationMatchesCriteria(r, criteria));
  if (!matched.length) {
    return { results: [], total: 0, criteria, totalPages: 0, page };
  }

  // Heuristic pre-sort, then AI rerank a bounded pool.
  const preSorted = matched
    .map(r => ({ ...r, _heuristicScore: heuristicScore(r, criteria) }))
    .sort((a, b) => b._heuristicScore - a._heuristicScore)
    .slice(0, 80);

  const rankedRegistrations = await reRankResults(query, preSorted, client);

  // Group by user so each job seeker appears once with matching registrations attached.
  const groupedByUser = new Map();
  for (const reg of rankedRegistrations) {
    const user = reg.jobSeekerId;
    if (!user?._id) continue;
    const uid = normalizeObjectIdString(user._id);
    const existing = groupedByUser.get(uid);

    const normalizedReg = {
      _id: reg._id,
      organizationId: reg.organizationId,
      jobSeekerId: reg.jobSeekerId?._id || reg.jobSeekerId,
      eventId: reg.eventId,
      resumeId: reg.resumeId,
      resumeUrl: reg.resumeUrl || null,
      registeredAt: reg.registeredAt,
      aiIndexedAt: reg.aiIndexedAt,
      aiProfile: reg.aiProfile
    };

    if (!existing) {
      groupedByUser.set(uid, {
        ...user,
        aiProfile: reg.aiProfile || user.aiProfile || {},
        _relevanceScore: reg._relevanceScore || 0,
        registrations: [normalizedReg]
      });
    } else {
      existing.registrations.push(normalizedReg);
      if ((reg._relevanceScore || 0) > (existing._relevanceScore || 0)) {
        existing._relevanceScore = reg._relevanceScore || 0;
        existing.aiProfile = reg.aiProfile || existing.aiProfile;
      }
    }
  }

  const users = Array.from(groupedByUser.values())
    .sort((a, b) => (b._relevanceScore || 0) - (a._relevanceScore || 0));

  const total = users.length;
  const skip = (page - 1) * limit;
  const results = users.slice(skip, skip + limit);

  return { results, total, criteria, totalPages: Math.ceil(total / limit), page };
}

module.exports = {
  parseRegistrationProfile,
  parseJobSeekerProfile,
  batchParseProfiles,
  getParseStatus,
  aiSearch
};
