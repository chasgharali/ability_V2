'use strict';

/**
 * aiSearchService — semantic search over ParsedResume.
 *
 * Pipeline:
 *   1. Reject queries that ask for sensitive (disability/race/gender/age)
 *      attributes — defense in depth on top of the schema-level guarantee.
 *   2. Optionally extract structured filters (location, education, work
 *      level) via a small GPT-4o-mini call. Sensitive filters are stripped
 *      even if the model returns them.
 *   3. Embed the cleaned query via text-embedding-3-small.
 *   4. Run MongoDB Atlas Vector Search ($vectorSearch) with the scope
 *      filter (org / global / user-id list). Falls back to in-Node cosine
 *      similarity if Atlas Vector Search isn't available (self-hosted Mongo
 *      or local development).
 *   5. Hydrate user + registration + (optional) meeting-record context for
 *      the calling module.
 *
 * Scopes:
 *   { kind: 'org', orgId }       — Org Admin job-seekers list
 *   { kind: 'global' }            — SuperAdmin job-seekers
 *   { kind: 'users', userIds: [] } — Recruiter / Admin meeting records
 *                                    (caller pre-computes the visible user set)
 */

const OpenAI = require('openai');
const ParsedResume = require('../models/ParsedResume');
const User = require('../models/User');
const RegisteredJobSeeker = require('../models/RegisteredJobSeeker');
const logger = require('../utils/logger');

const CHAT_MODEL = process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini';
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const VECTOR_INDEX_NAME = process.env.PARSED_RESUME_VECTOR_INDEX || 'parsed_resume_vector_index';
const ATLAS_VECTOR_SEARCH_ENABLED =
    process.env.ATLAS_VECTOR_SEARCH_ENABLED !== 'false'; // default on; flip to "false" for self-hosted

function getClient() {
    if (!process.env.OPENAI_API_KEY) {
        const err = new Error('OPENAI_API_KEY not configured');
        err.code = 'OPENAI_NOT_CONFIGURED';
        throw err;
    }
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ─── Sensitive query firewall ────────────────────────────────────────────────

/**
 * Reject queries that try to filter or rank job seekers by disability,
 * accessibility need, race, gender, age, or any other protected attribute.
 *
 * The list errs on the side of caution. Recruiters who legitimately want
 * to invite someone need to do so through the meeting / interview flows
 * which already collect informed consent. AI search is for skill / role /
 * location matching only.
 */
const SENSITIVE_QUERY_PATTERNS = [
    /\bdisabilit(y|ies|ed)\b/i,
    /\b(deaf|hearing[\s-]?impair|hard[\s-]of[\s-]hearing)\b/i,
    /\b(blind|visual[\s-]?impair|low[\s-]?vision)\b/i,
    /\b(wheelchair|mobility[\s-]?impair|paraplegic|quadriplegic)\b/i,
    /\b(adhd|autism|autistic|asperger|spectrum)\b/i,
    /\b(ptsd|tbi|traumatic[\s-]brain[\s-]injury)\b/i,
    /\b(asl|sign[\s-]?language|cart\b|captions?)\b/i,
    /\bscreen[\s-]?reader\b/i,
    /\bscreen[\s-]?magnif/i,
    /\b(race|racial|black|white|asian|hispanic|latino|latina|native[\s-]american|caucasian)\b/i,
    /\b(gender|male|female|man|woman|non[\s-]?binary|trans(\s|gender)?)\b/i,
    /\b(young|old|elderly|millennial|gen[\s-]?z|baby[\s-]?boomer|under\s*\d+|over\s*\d+)\b/i,
    /\b(jew(ish)?|christian|muslim|hindu|buddhist|catholic|atheist)\b/i,
    /\bcountry[\s-]of[\s-]origin\b/i,
    /\b(pregnan|maternity|paternity)\b/i,
    /\bveteran/i, // veteran status is a protected class in the US
    /\bsexual[\s-]orientation\b/i,
    /\b(gay|lesbian|bisexual|lgbtq?)\b/i
];

function findSensitiveTerm(query) {
    if (!query) return null;
    for (const pattern of SENSITIVE_QUERY_PATTERNS) {
        const match = query.match(pattern);
        if (match) return match[0];
    }
    return null;
}

/**
 * "Pakistan", "from Pakistan", "Pakistani developer" — country / nationality
 * is acceptable as a CURRENT-LOCATION filter (city/state/country fields are
 * already public on the profile), so we explicitly allow it. We only block
 * "country of origin" which is sourced from the survey.
 */

// ─── Structured filter extraction (location, edu level, work level) ──────────

async function extractStructuredFilters(query, client) {
    const prompt = `You translate a job-seeker search query into NON-SENSITIVE filters.

Allowed filters: location, education level, work level, employment type, languages, years of experience, role/title keywords, skill keywords.

DISALLOWED (return empty/null even if the user asks): disability, accessibility, race, gender, age, country of origin, religion, veteran status.

Query: "${query}"

Return ONLY this JSON:
{
  "location": { "city": "", "state": "", "country": "", "countryCode": "" },
  "educationLevel": "",
  "workLevel": "",
  "employmentTypes": [],
  "languages": [],
  "minYearsExperience": null,
  "maxYearsExperience": null,
  "roleKeywords": ["primary job titles or roles, e.g. developer, engineer, nurse, security guard"],
  "skillKeywords": ["specific skills, technologies, or domains, e.g. react, mern, accounting, plumbing"]
}

Rules:
- Lowercase everything except countryCode (ISO-2 uppercase, e.g. "US", "PK").
- roleKeywords: include the asked role + close synonyms.
  - "developer" → ["developer", "engineer", "programmer", "coder"]
  - "nurse" → ["nurse", "rn", "lpn"]
  - "security guard" → ["security guard", "security officer", "guard"]
- skillKeywords: when the role implies common tools, INCLUDE them so we
  match candidates whose title is generic but whose skills match. Examples:
  - "developer" → ["javascript", "python", "java", "react", "node", "mern", "html", "css", "git", "api", "software", "web"]
  - "nurse" → ["patient care", "ehr", "vitals", "triage"]
  - "data analyst" → ["sql", "excel", "tableau", "powerbi", "python", "r"]
  Keep skill expansions tight (5–12 items) — these become OR'd keyword hits, not required filters.
- If a phrase is ambiguous, leave the field empty rather than guess.`;

    try {
        const resp = await client.chat.completions.create({
            model: CHAT_MODEL,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            max_tokens: 300,
            temperature: 0
        });
        return JSON.parse(resp.choices[0]?.message?.content || '{}');
    } catch (e) {
        logger.warn(`aiSearch: filter extraction failed: ${e.message}`);
        return {};
    }
}

function sanitizeFilters(f = {}) {
    const cleanList = arr => Array.isArray(arr)
        ? Array.from(new Set(arr.map(s => String(s).trim().toLowerCase()).filter(Boolean)))
        : [];
    return {
        location: {
            city: (f.location?.city || '').trim(),
            state: (f.location?.state || '').trim(),
            country: (f.location?.country || '').trim(),
            countryCode: (f.location?.countryCode || '').trim().toUpperCase()
        },
        educationLevel: (f.educationLevel || '').trim(),
        workLevel: (f.workLevel || '').trim(),
        employmentTypes: Array.isArray(f.employmentTypes) ? f.employmentTypes.filter(Boolean) : [],
        languages: Array.isArray(f.languages) ? f.languages.filter(Boolean) : [],
        minYearsExperience: typeof f.minYearsExperience === 'number' ? f.minYearsExperience : null,
        maxYearsExperience: typeof f.maxYearsExperience === 'number' ? f.maxYearsExperience : null,
        roleKeywords: cleanList(f.roleKeywords),
        skillKeywords: cleanList(f.skillKeywords)
    };
}

// ─── Embedding ────────────────────────────────────────────────────────────────

async function embedQuery(query, client) {
    const resp = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: query.slice(0, 4000)
    });
    return resp.data[0]?.embedding;
}

// ─── Vector search (Atlas) with in-Node cosine fallback ──────────────────────

function buildScopeFilter(scope) {
    const filter = {};
    if (scope.kind === 'org' && scope.orgId) {
        filter.organizationIds = scope.orgId;
    } else if (scope.kind === 'users' && Array.isArray(scope.userIds)) {
        filter.userId = { $in: scope.userIds };
    }
    // 'global' has no extra filter.
    return filter;
}

async function vectorSearchAtlas(embedding, scope, candidatePoolSize) {
    const pipeline = [
        {
            $vectorSearch: {
                index: VECTOR_INDEX_NAME,
                path: 'embedding',
                queryVector: embedding,
                numCandidates: Math.max(candidatePoolSize * 10, 100),
                limit: candidatePoolSize,
                filter: buildScopeFilter(scope)
            }
        },
        {
            $project: {
                _id: 0,
                userId: 1,
                organizationIds: 1,
                currentTitle: 1,
                yearsOfExperience: 1,
                skills: 1,
                industries: 1,
                educationLevel: 1,
                workLanguages: 1,
                summary: 1,
                headline: 1,
                keywords: 1,
                employmentTypes: 1,
                workLevel: 1,
                city: 1,
                state: 1,
                country: 1,
                searchableText: 1,
                parsedAt: 1,
                sourceResumeId: 1,
                sourceResumeUrl: 1,
                score: { $meta: 'vectorSearchScore' }
            }
        }
    ];
    return ParsedResume.aggregate(pipeline);
}

function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

async function vectorSearchFallback(embedding, scope, candidatePoolSize) {
    const filter = buildScopeFilter(scope);
    // Need to explicitly include the embedding field (select:false in schema).
    const docs = await ParsedResume.find(filter)
        .select('+embedding')
        .lean();

    const scored = docs
        .filter(d => Array.isArray(d.embedding) && d.embedding.length > 0)
        .map(d => ({
            ...d,
            score: cosineSimilarity(embedding, d.embedding)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, candidatePoolSize);

    // Strip the embedding field before returning to keep the payload lean.
    return scored.map(d => {
        const { embedding: _e, ...rest } = d;
        return rest;
    });
}

async function runVectorSearch(embedding, scope, candidatePoolSize) {
    if (ATLAS_VECTOR_SEARCH_ENABLED) {
        try {
            return await vectorSearchAtlas(embedding, scope, candidatePoolSize);
        } catch (e) {
            // Common Atlas error: index not found, or non-Atlas cluster.
            logger.warn(
                `aiSearch: $vectorSearch failed (${e.message}) — falling back to in-Node cosine. ` +
                `If you are on Atlas, ensure index "${VECTOR_INDEX_NAME}" exists.`
            );
        }
    }
    return vectorSearchFallback(embedding, scope, candidatePoolSize);
}

// ─── Post-search structured filtering (location, edu, work level, etc.) ──────

function matchesStructuredFilters(doc, f) {
    if (f.location.city && !textContains(doc.city, f.location.city) &&
        !textContains(doc.searchableText, f.location.city)) {
        return false;
    }
    if (f.location.state && !textContains(doc.state, f.location.state) &&
        !textContains(doc.searchableText, f.location.state)) {
        return false;
    }
    if (f.location.country) {
        const variants = [f.location.country, f.location.countryCode].filter(Boolean);
        const matched = variants.some(v =>
            textContains(doc.country, v) || textContains(doc.searchableText, v)
        );
        if (!matched) return false;
    }
    if (f.educationLevel &&
        !textContains(doc.educationLevel, f.educationLevel)) {
        return false;
    }
    if (f.workLevel &&
        !textContains(doc.workLevel, f.workLevel)) {
        return false;
    }
    if (f.minYearsExperience != null &&
        (doc.yearsOfExperience == null || doc.yearsOfExperience < f.minYearsExperience)) {
        return false;
    }
    if (f.maxYearsExperience != null &&
        doc.yearsOfExperience != null && doc.yearsOfExperience > f.maxYearsExperience) {
        return false;
    }
    if (f.employmentTypes.length > 0) {
        const hit = f.employmentTypes.some(et =>
            (doc.employmentTypes || []).some(de => textContains(de, et))
        );
        if (!hit) return false;
    }
    if (f.languages.length > 0) {
        const hit = f.languages.some(l =>
            (doc.workLanguages || []).some(dl => textContains(dl, l))
        );
        if (!hit) return false;
    }
    return true;
}

function textContains(haystack, needle) {
    if (!haystack || !needle) return false;
    return String(haystack).toLowerCase().includes(String(needle).toLowerCase());
}

// ─── Hybrid scoring ──────────────────────────────────────────────────────────
//
// Vector similarity alone is too soft for short queries like "developer from
// US" — a designer's embedding can sit inside the same semantic neighborhood
// as a developer's. We boost candidates whose CURRENT TITLE / SKILLS /
// SEARCHABLE TEXT contain the role+skill keywords the LLM extracted from the
// query. Title hits are weighted highest because that's where the role
// signal is strongest.

const TITLE_HIT_WEIGHT = 0.20;
const SKILL_HIT_WEIGHT = 0.08;
const KEYWORD_HIT_WEIGHT = 0.05;
const TEXT_HIT_WEIGHT = 0.03;
const ROLE_REQUIRED_PENALTY = 0.55; // multiplicative penalty when role specified but not matched anywhere on the profile

function buildHybridScore(doc, filters) {
    let score = doc.score || 0;
    const allKeywords = [...filters.roleKeywords, ...filters.skillKeywords];
    if (allKeywords.length === 0) return score;

    const title = String(doc.currentTitle || '').toLowerCase();
    const headline = String(doc.headline || '').toLowerCase();
    const summary = String(doc.summary || '').toLowerCase();
    const skills = (doc.skills || []).map(s => String(s).toLowerCase());
    const industries = (doc.industries || []).map(s => String(s).toLowerCase());
    const keywords = (doc.keywords || []).map(s => String(s).toLowerCase());
    const searchable = String(doc.searchableText || '').toLowerCase();

    let titleHits = 0;
    let skillHits = 0;
    let keywordHits = 0;
    let textHits = 0;
    let anyHit = false;

    for (const kw of filters.roleKeywords) {
        if (!kw) continue;
        if (title.includes(kw) || headline.includes(kw)) { titleHits++; anyHit = true; continue; }
        if (summary.includes(kw)) { keywordHits++; anyHit = true; continue; }
        if (searchable.includes(kw)) { textHits++; anyHit = true; }
    }

    for (const kw of filters.skillKeywords) {
        if (!kw) continue;
        if (skills.some(s => s.includes(kw)) || industries.some(s => s.includes(kw))) {
            skillHits++; anyHit = true; continue;
        }
        if (keywords.some(k => k.includes(kw))) { keywordHits++; anyHit = true; continue; }
        if (searchable.includes(kw)) { textHits++; anyHit = true; }
    }

    score += titleHits * TITLE_HIT_WEIGHT;
    score += skillHits * SKILL_HIT_WEIGHT;
    score += keywordHits * KEYWORD_HIT_WEIGHT;
    score += textHits * TEXT_HIT_WEIGHT;

    // If the user clearly asked for a role and we found NO trace of it
    // anywhere on this profile, downweight aggressively. Without this, a
    // designer's embedding can rank above a developer's on a query like
    // "developer from US" because both seekers share the location signal.
    if (filters.roleKeywords.length > 0 && !anyHit) {
        score *= ROLE_REQUIRED_PENALTY;
    }

    return score;
}

// ─── Hydration: attach user + registrations to results ───────────────────────

async function hydrateResults(parsedDocs, scope) {
    if (!parsedDocs.length) return [];
    const userIds = parsedDocs.map(d => d.userId);

    const users = await User.find({ _id: { $in: userIds } })
        .select('-hashedPassword -refreshTokens -legacyPassword -emailVerificationToken -passwordResetToken -survey -usesScreenReader -usesScreenMagnifier -needsASL -needsCaptions -needsOther')
        .lean();
    const userMap = new Map(users.map(u => [String(u._id), u]));

    // Attach registrations matching the search scope.
    const regFilter = { jobSeekerId: { $in: userIds } };
    if (scope.kind === 'org' && scope.orgId) regFilter.organizationId = scope.orgId;
    const regs = await RegisteredJobSeeker.find(regFilter)
        .select('jobSeekerId organizationId eventId resumeId resumeUrl registeredAt')
        .populate('eventId', 'name slug')
        .populate('resumeId', 'title')
        .lean();
    const regMap = new Map();
    for (const r of regs) {
        const k = String(r.jobSeekerId);
        if (!regMap.has(k)) regMap.set(k, []);
        regMap.get(k).push(r);
    }

    return parsedDocs
        .map(d => {
            const user = userMap.get(String(d.userId));
            if (!user) return null;
            return {
                ...user,
                _searchScore: d.score,
                aiProfile: {
                    parsedAt: d.parsedAt,
                    currentTitle: d.currentTitle,
                    yearsOfExperience: d.yearsOfExperience,
                    skills: d.skills || [],
                    industries: d.industries || [],
                    educationLevel: d.educationLevel,
                    workLanguages: d.workLanguages || [],
                    summary: d.summary,
                    headline: d.headline,
                    keywords: d.keywords || [],
                    employmentTypes: d.employmentTypes || [],
                    workLevel: d.workLevel,
                    sourceResumeId: d.sourceResumeId,
                    sourceResumeUrl: d.sourceResumeUrl
                },
                registrations: regMap.get(String(d.userId)) || []
            };
        })
        .filter(Boolean);
}

// ─── Public entry point ──────────────────────────────────────────────────────

class SensitiveQueryError extends Error {
    constructor(term) {
        super(`Search query contains a restricted term: "${term}". AI search cannot filter by disability, accessibility need, race, gender, age, or other protected attributes.`);
        this.code = 'SENSITIVE_QUERY';
        this.term = term;
    }
}

async function search(query, scope, opts = {}) {
    const {
        page = 1,
        limit = 20,
        candidatePoolSize = 200,
        // Minimum hybrid score for a result to be shown. Tuned for
        // text-embedding-3-small + the hybrid keyword boost. Override per call
        // via opts.minScore. Set very low for pure cosine eval.
        minScore = 0.35
    } = opts;

    if (!query || !query.trim()) {
        return { results: [], total: 0, criteria: {}, page, totalPages: 0 };
    }

    const blocked = findSensitiveTerm(query);
    if (blocked) {
        throw new SensitiveQueryError(blocked);
    }

    const client = getClient();

    // Parallelize: structured-filter extraction + embedding generation.
    const [filtersRaw, embedding] = await Promise.all([
        extractStructuredFilters(query, client),
        embedQuery(query, client)
    ]);
    const filters = sanitizeFilters(filtersRaw);

    if (!embedding) {
        return { results: [], total: 0, criteria: filters, page, totalPages: 0 };
    }

    let candidates = await runVectorSearch(embedding, scope, candidatePoolSize);

    // Apply structured (location / education / work-level / years) filters.
    candidates = candidates.filter(c => matchesStructuredFilters(c, filters));

    // Compute hybrid score (vector + role/skill keyword boost), then sort.
    candidates = candidates.map(c => ({ ...c, score: buildHybridScore(c, filters) }));
    candidates.sort((a, b) => b.score - a.score);

    // Apply relevance floor AFTER hybrid scoring so keyword matches can
    // rescue an otherwise low-cosine match (and the ROLE_REQUIRED_PENALTY
    // can prune off-topic results like a designer for a "developer" query).
    candidates = candidates.filter(c => c.score >= minScore);

    const total = candidates.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const skip = (page - 1) * limit;
    const pageDocs = candidates.slice(skip, skip + limit);

    const results = await hydrateResults(pageDocs, scope);

    return {
        results,
        total,
        page,
        totalPages,
        criteria: filters,
        scope: { kind: scope.kind }
    };
}

module.exports = {
    search,
    SensitiveQueryError,
    // Exposed for tests / re-use:
    _internal: {
        findSensitiveTerm,
        SENSITIVE_QUERY_PATTERNS,
        sanitizeFilters,
        cosineSimilarity
    }
};
