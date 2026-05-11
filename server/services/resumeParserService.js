'use strict';

/**
 * resumeParserService
 *
 * Pipeline:
 *   1. Gather inputs for a single user — Resume documents + uploaded resume
 *      text + non-sensitive User profile fields.
 *   2. Strip every sensitive field (survey, disabilities, accessibility
 *      flags, race, gender, age, country of origin) — applied at three
 *      layers (allowlist projection, denylist filter, schema validator).
 *   3. Send the sanitized payload to OpenAI (gpt-4o-mini) and ask for a
 *      structured non-sensitive professional profile.
 *   4. Build a single concise text representation, embed it with
 *      text-embedding-3-small, and upsert a ParsedResume row.
 *   5. Track parsedAt + inputHash so we can skip re-parsing unchanged users.
 *
 * The service is intentionally idempotent — calling parseResumeForUser
 * multiple times with the same input is cheap (cache hit on inputHash).
 */

const crypto = require('crypto');
const OpenAI = require('openai');
const axios = require('axios');

const User = require('../models/User');
const Resume = require('../models/Resume');
const RegisteredJobSeeker = require('../models/RegisteredJobSeeker');
const ParsedResume = require('../models/ParsedResume');
const logger = require('../utils/logger');

// ─── OpenAI client (lazy) ────────────────────────────────────────────────────

function getClient() {
    if (!process.env.OPENAI_API_KEY) {
        const err = new Error('OPENAI_API_KEY not configured');
        err.code = 'OPENAI_NOT_CONFIGURED';
        throw err;
    }
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const CHAT_MODEL = process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini';
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_DIMS = 1536;

// ─── Sensitive-field firewall ────────────────────────────────────────────────

/**
 * Top-level User keys we are explicitly allowed to read for parsing.
 * Anything else (notably `survey`, `usesScreenReader`, `needsASL`, etc.)
 * is dropped before it ever reaches the OpenAI prompt or the index.
 */
const ALLOWED_USER_FIELDS = [
    '_id', 'name', 'email', 'city', 'state', 'country', 'languages',
    'phoneNumber', 'linkedInUrl', 'metadata.profile', 'organizationId'
];

/**
 * Survey + accessibility fields. NEVER read these for search.
 * Keeping the list explicit so a code review will catch additions.
 */
const SENSITIVE_USER_FIELDS = [
    'survey', 'survey.race', 'survey.genderIdentity', 'survey.ageGroup',
    'survey.disabilities', 'survey.otherDisability', 'survey.countryOfOrigin',
    'usesScreenMagnifier', 'usesScreenReader', 'needsASL',
    'needsCaptions', 'needsOther'
];

/**
 * Returns a shallow copy of user with sensitive fields removed.
 * Operates on plain objects (post `.lean()` or `.toObject()`).
 */
function sanitizeUser(user) {
    if (!user) return null;
    const out = { ...user };
    delete out.survey;
    delete out.usesScreenMagnifier;
    delete out.usesScreenReader;
    delete out.needsASL;
    delete out.needsCaptions;
    delete out.needsOther;
    delete out.hashedPassword;
    delete out.legacyPassword;
    delete out.refreshTokens;
    delete out.emailVerificationToken;
    delete out.passwordResetToken;
    return out;
}

// ─── Text extraction (PDF/DOCX) ──────────────────────────────────────────────

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
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 15000
        });
        const buffer = Buffer.from(response.data);
        const ct = response.headers['content-type'] || '';
        let mimetype = 'application/pdf';
        if (ct.includes('msword') || url.toLowerCase().endsWith('.doc')) {
            mimetype = 'application/msword';
        } else if (ct.includes('wordprocessingml') || url.toLowerCase().endsWith('.docx')) {
            mimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        }
        return await extractTextFromBuffer(buffer, mimetype);
    } catch (e) {
        logger.warn(`resumeParser: failed to fetch resume from ${url}: ${e.message}`);
        return '';
    }
}

// ─── Build the parsing input bundle for a single user ────────────────────────

async function buildParsingBundle(userId) {
    const userDoc = await User.findById(userId).lean();
    if (!userDoc || userDoc.role !== 'JobSeeker') return null;

    const user = sanitizeUser(userDoc);

    // Pull all resume builder docs (highest-priority structured input).
    const resumeDocs = await Resume.find({ userId: user._id })
        .sort({ isDefault: -1, updatedAt: -1 })
        .limit(5)
        .lean();

    // If there are no resume builder docs, fall back to text from the
    // most recent uploaded resume URL (user.resumeUrl or any registration's).
    let rawResumeText = '';
    if (resumeDocs.length === 0) {
        const urls = [];
        if (userDoc.resumeUrl) urls.push(userDoc.resumeUrl);
        const regs = await RegisteredJobSeeker.find({ jobSeekerId: user._id })
            .select('resumeUrl')
            .lean();
        for (const r of regs) {
            if (r.resumeUrl && !urls.includes(r.resumeUrl)) urls.push(r.resumeUrl);
        }
        if (urls.length > 0) {
            const texts = await Promise.all(urls.slice(0, 2).map(fetchResumeText));
            rawResumeText = texts.filter(Boolean).join('\n\n---\n\n');
        }
    }

    // Re-derive the org fan-out list from registrations.
    const regs = await RegisteredJobSeeker.find({ jobSeekerId: user._id })
        .select('organizationId resumeId resumeUrl')
        .lean();
    const organizationIds = Array.from(
        new Set(regs.map(r => String(r.organizationId)).filter(Boolean))
    );

    const profile = (user.metadata && user.metadata.profile) || {};

    return {
        user,
        profile,
        resumeDocs,
        rawResumeText,
        organizationIds,
        registrations: regs
    };
}

// ─── Hashing — used to skip work when nothing changed ────────────────────────

function computeInputHash(bundle) {
    const minimal = {
        u: {
            name: bundle.user.name,
            city: bundle.user.city,
            state: bundle.user.state,
            country: bundle.user.country,
            languages: bundle.user.languages,
            profile: bundle.profile
        },
        r: bundle.resumeDocs.map(r => ({
            id: String(r._id),
            updatedAt: r.updatedAt,
            content: r.content
        })),
        raw: bundle.rawResumeText.length
    };
    return crypto.createHash('sha256')
        .update(JSON.stringify(minimal))
        .digest('hex');
}

// ─── OpenAI structured extraction ────────────────────────────────────────────

function buildResumeSnippet(bundle) {
    if (bundle.resumeDocs.length > 0) {
        return bundle.resumeDocs.map(r => {
            const c = r.content || {};
            const titles = (c.experience || [])
                .map(e => `${e.title || ''} at ${e.company || ''}`).join('; ');
            const skills = (c.skills || []).join(', ');
            const summary = c.summary || '';
            return `Resume "${r.title || 'Untitled'}":\n  Skills: ${skills}\n  Experience: ${titles}\n  Summary: ${summary}`;
        }).join('\n\n');
    }
    if (bundle.rawResumeText) {
        return `Raw uploaded resume text (truncated):\n${bundle.rawResumeText.substring(0, 6000)}`;
    }
    return 'No resume on file — extract from profile metadata only.';
}

async function extractStructured(bundle, client) {
    const u = bundle.user;
    const p = bundle.profile;

    const systemPrompt = `You are a resume parser. You extract structured PROFESSIONAL data from a job seeker's resume + non-sensitive profile.

ABSOLUTE RULE: Do NOT extract, infer, or include any of:
- disabilities or medical conditions
- accessibility needs (screen reader, ASL, captions, etc.)
- race, ethnicity, religion, gender identity, sexual orientation
- age or date of birth
- country of origin (their CURRENT country/state/city is fine)
If the resume mentions any of these, ignore them silently.

Return ONLY valid JSON, no markdown.`;

    const userPrompt = `Job seeker (non-sensitive fields only):
- Name: ${u.name || ''}
- Current location: ${u.city || ''}, ${u.state || ''}, ${u.country || ''}
- Profile headline: ${p.headline || ''}
- Profile keywords: ${p.keywords || ''}
- Primary experience areas: ${(p.primaryExperience || []).join(', ')}
- Employment types sought: ${(p.employmentTypes || []).join(', ')}
- Self-reported work level: ${p.workLevel || ''}
- Self-reported education level: ${p.educationLevel || ''}
- Spoken languages: ${(u.languages || []).join(', ')}

${buildResumeSnippet(bundle)}

Return this exact JSON structure:
{
  "currentTitle": "most recent or most relevant job title",
  "yearsOfExperience": <number or null>,
  "skills": ["skill1", "skill2"],
  "industries": ["industry1", "industry2"],
  "educationLevel": "High School / Associate / Bachelor / Master / PhD / Vocational / Other",
  "workLanguages": ["English", "Spanish"],
  "summary": "1-2 sentence professional summary, no sensitive data",
  "headline": "professional headline",
  "keywords": ["role/skill/industry keywords"],
  "employmentTypes": ["Full-time", "Part-time"],
  "workLevel": "Entry / Mid / Senior / Executive"
}`;

    const response = await client.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1200,
        temperature: 0.1
    });

    const text = response.choices[0]?.message?.content || '{}';
    try {
        return JSON.parse(text);
    } catch (e) {
        logger.error(`resumeParser: failed to parse OpenAI response: ${e.message}`);
        return {};
    }
}

// ─── Embedding ────────────────────────────────────────────────────────────────

function buildEmbeddingInput(structured, bundle) {
    const u = bundle.user;
    // Compose a single text blob optimized for semantic recall.
    // We deliberately exclude email + phone (PII) and any sensitive field.
    const lines = [
        structured.currentTitle && `Title: ${structured.currentTitle}`,
        structured.summary && `Summary: ${structured.summary}`,
        structured.headline && `Headline: ${structured.headline}`,
        structured.industries?.length && `Industries: ${structured.industries.join(', ')}`,
        structured.skills?.length && `Skills: ${structured.skills.join(', ')}`,
        structured.keywords?.length && `Keywords: ${structured.keywords.join(', ')}`,
        structured.educationLevel && `Education: ${structured.educationLevel}`,
        structured.workLevel && `Work level: ${structured.workLevel}`,
        structured.workLanguages?.length && `Languages: ${structured.workLanguages.join(', ')}`,
        structured.employmentTypes?.length && `Open to: ${structured.employmentTypes.join(', ')}`,
        structured.yearsOfExperience != null && `Years of experience: ${structured.yearsOfExperience}`,
        (u.city || u.state || u.country) &&
            `Location: ${[u.city, u.state, u.country].filter(Boolean).join(', ')}`
    ].filter(Boolean);
    return lines.join('\n');
}

async function generateEmbedding(text, client) {
    if (!text || !text.trim()) return null;
    const resp = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000) // hard guard against runaway prompts
    });
    return resp.data[0]?.embedding || null;
}

// ─── Public: parse a single user ─────────────────────────────────────────────

async function parseResumeForUser(userId, opts = {}) {
    const { force = false } = opts;
    const bundle = await buildParsingBundle(userId);
    if (!bundle) {
        logger.warn(`resumeParser: user ${userId} not found or not a JobSeeker`);
        return null;
    }

    const inputHash = computeInputHash(bundle);
    const existing = await ParsedResume.findOne({ userId }).lean();
    if (existing && existing.inputHash === inputHash && !force) {
        logger.info(`resumeParser: ${userId} unchanged — skipping (hash hit)`);
        // Still refresh organizationIds since registrations may have changed.
        if ((existing.organizationIds || []).map(String).sort().join(',') !==
            bundle.organizationIds.sort().join(',')) {
            await ParsedResume.updateOne(
                { userId },
                { $set: { organizationIds: bundle.organizationIds } }
            );
        }
        return existing;
    }

    const client = getClient();
    const structured = await extractStructured(bundle, client);
    const embeddingInput = buildEmbeddingInput(structured, bundle);
    const embedding = await generateEmbedding(embeddingInput, client);

    const u = bundle.user;
    const searchableText = [
        structured.currentTitle, structured.summary, structured.headline,
        ...(structured.skills || []),
        ...(structured.industries || []),
        ...(structured.keywords || []),
        ...(structured.workLanguages || []),
        u.city, u.state, u.country
    ].filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, ' ').trim();

    let parseSource = 'profile-only';
    if (bundle.resumeDocs.length > 0) parseSource = 'resume-builder';
    else if (bundle.rawResumeText) parseSource = 'uploaded-resume';

    const sourceResumeId = bundle.resumeDocs[0]?._id || null;
    const sourceResumeUrl = !sourceResumeId
        ? (bundle.user.resumeUrl ||
           bundle.registrations.find(r => r.resumeUrl)?.resumeUrl ||
           null)
        : null;

    const update = {
        userId,
        organizationIds: bundle.organizationIds,
        sourceResumeId,
        sourceResumeUrl,
        parseSource,
        parsedAt: new Date(),
        inputHash,
        currentTitle: structured.currentTitle || '',
        yearsOfExperience: structured.yearsOfExperience ?? null,
        skills: structured.skills || [],
        industries: structured.industries || [],
        educationLevel: structured.educationLevel || '',
        workLanguages: structured.workLanguages || (u.languages || []),
        summary: structured.summary || '',
        headline: structured.headline || '',
        keywords: structured.keywords || [],
        employmentTypes: structured.employmentTypes || [],
        workLevel: structured.workLevel || '',
        city: u.city || '',
        state: u.state || '',
        country: u.country || '',
        searchableText,
        embedding: embedding || undefined,
        embeddingModel: embedding ? EMBEDDING_MODEL : '',
        embeddingDimensions: embedding ? embedding.length : 0
    };

    const saved = await ParsedResume.findOneAndUpdate(
        { userId },
        { $set: update },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    logger.info(
        `resumeParser: parsed user ${userId} — title="${update.currentTitle}", ` +
        `skills=${update.skills.length}, embedding=${embedding ? 'yes' : 'no'}, source=${parseSource}`
    );
    return saved;
}

// ─── Listing helpers (org-scoped & global) ───────────────────────────────────

async function listJobSeekerIdsForOrg(orgId) {
    const regs = await RegisteredJobSeeker.find({
        organizationId: orgId,
        jobSeekerId: { $ne: null }
    })
        .select('jobSeekerId')
        .populate('jobSeekerId', 'role')
        .lean();
    const ids = new Set();
    for (const r of regs) {
        if (r.jobSeekerId && r.jobSeekerId.role === 'JobSeeker') {
            ids.add(String(r.jobSeekerId._id));
        }
    }
    return Array.from(ids);
}

async function listJobSeekerIdsGlobal() {
    const users = await User.find({ role: 'JobSeeker' }).select('_id').lean();
    return users.map(u => String(u._id));
}

// ─── Status (org / global) ───────────────────────────────────────────────────

async function getParseStatus({ orgId = null } = {}) {
    const userIds = orgId
        ? await listJobSeekerIdsForOrg(orgId)
        : await listJobSeekerIdsGlobal();
    const total = userIds.length;
    const objectIds = userIds.map(id => new (require('mongoose')).Types.ObjectId(id));

    const parsedDocs = await ParsedResume.find({ userId: { $in: objectIds } })
        .select('userId parsedAt currentTitle')
        .populate('userId', 'name email city state')
        .sort({ parsedAt: -1 })
        .lean();

    const parsed = parsedDocs.length;

    const recentlyIndexed = parsedDocs.slice(0, 8).map(d => ({
        _id: d.userId?._id || d.userId,
        name: d.userId?.name || 'Unknown',
        email: d.userId?.email || '',
        location: [d.userId?.city, d.userId?.state].filter(Boolean).join(', '),
        currentTitle: d.currentTitle || '',
        parsedAt: d.parsedAt
    }));

    return {
        total,
        parsed,
        unparsed: Math.max(total - parsed, 0),
        recentlyIndexed
    };
}

// ─── Batch parse (manual admin trigger) ──────────────────────────────────────

async function batchParse({ orgId = null, force = false, onProgress } = {}) {
    const userIds = orgId
        ? await listJobSeekerIdsForOrg(orgId)
        : await listJobSeekerIdsGlobal();

    logger.info(`resumeParser: batch starting — scope=${orgId ? `org:${orgId}` : 'global'} count=${userIds.length}`);

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < userIds.length; i++) {
        const id = userIds[i];
        try {
            const result = await parseResumeForUser(id, { force });
            if (result === null) skipped++;
            else processed++;
        } catch (e) {
            errors++;
            const isRateLimit = e?.status === 429 ||
                e?.message?.toLowerCase()?.includes('rate limit');
            if (isRateLimit) {
                logger.warn(`resumeParser: rate limited on user ${id} — backing off 10s`);
                await new Promise(r => setTimeout(r, 10000));
                try {
                    await parseResumeForUser(id, { force });
                    processed++;
                    errors--;
                } catch (e2) {
                    logger.warn(`resumeParser: retry failed for ${id}: ${e2.message}`);
                }
            } else {
                logger.warn(`resumeParser: failed to parse ${id}: ${e.message}`);
            }
        }
        if (onProgress) onProgress({ processed, skipped, errors, total: userIds.length });
        // Throttle — OpenAI tier 1 = 500 RPM. 250ms ≈ 240 RPM, well within limits.
        await new Promise(r => setTimeout(r, 250));
    }

    logger.info(`resumeParser: batch complete — processed=${processed} skipped=${skipped} errors=${errors}`);
    return { processed, skipped, errors, total: userIds.length };
}

module.exports = {
    parseResumeForUser,
    batchParse,
    getParseStatus,
    // Exposed for tests / admin tooling.
    _internal: {
        sanitizeUser,
        computeInputHash,
        SENSITIVE_USER_FIELDS,
        ALLOWED_USER_FIELDS,
        EMBEDDING_MODEL,
        EMBEDDING_DIMS
    }
};
