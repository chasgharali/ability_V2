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
const mongoose = require('mongoose');
const ParsedResume = require('../models/ParsedResume');
const User = require('../models/User');
const RegisteredJobSeeker = require('../models/RegisteredJobSeeker');
const logger = require('../utils/logger');
const { buildCacheKey, getCachedJson, setCachedJson } = require('../utils/searchCache');

const CHAT_MODEL = process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini';
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const VECTOR_INDEX_NAME = process.env.PARSED_RESUME_VECTOR_INDEX || 'parsed_resume_vector_index';
const ATLAS_VECTOR_SEARCH_ENABLED =
    process.env.ATLAS_VECTOR_SEARCH_ENABLED !== 'false'; // default on; flip to "false" for self-hosted
const LLM_RERANKER_ENABLED = process.env.AI_SEARCH_ENABLE_LLM_RERANKER === 'true';
const LLM_RERANK_TOP_K = parseInt(process.env.AI_SEARCH_RERANK_TOP_K || '25', 10);
const QUERY_CONTEXT_CACHE_TTL_SECONDS = parseInt(process.env.AI_SEARCH_QUERY_CACHE_TTL_SECONDS || '900', 10);
const CANDIDATE_CACHE_TTL_SECONDS = parseInt(process.env.AI_SEARCH_CANDIDATE_CACHE_TTL_SECONDS || '180', 10);

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

function applyQueryLocationHints(filters, query) {
    const q = String(query || '').toLowerCase();
    const fromMatch = q.match(/\bfrom\s+([a-z][a-z\s-]{2,40})/i);
    if (!fromMatch) return filters;

    const hintedLocation = fromMatch[1]
        .trim()
        .replace(/\s+/g, ' ')
        .split(/\s+/)
        .slice(0, 3)
        .join(' ');
    if (!hintedLocation || hintedLocation.length < 4) return filters;

    const lowerHint = hintedLocation.toLowerCase();
    const currentLocation = [
        filters.location?.city,
        filters.location?.state,
        filters.location?.country
    ]
        .filter(Boolean)
        .map(item => String(item).toLowerCase());

    const hintAlreadyUsed = currentLocation.some(item => item.includes(lowerHint) || lowerHint.includes(item));
    if (hintAlreadyUsed) return filters;

    // If model guessed a different location than the explicit "from X" phrase,
    // trust the query phrase and avoid over-constraining with hallucinated state/country.
    return {
        ...filters,
        location: {
            city: hintedLocation,
            state: '',
            country: '',
            countryCode: ''
        }
    };
}

function normalizeScopeForCache(scope = {}) {
    if (scope.kind === 'org') {
        return { kind: 'org', orgId: String(scope.orgId || '') };
    }
    if (scope.kind === 'users') {
        const userIds = Array.isArray(scope.userIds)
            ? scope.userIds.map(id => String(id)).filter(Boolean).sort()
            : [];
        return { kind: 'users', userIds };
    }
    return { kind: 'global' };
}

function normalizeCandidateForCache(candidate) {
    return {
        ...candidate,
        userId: candidate.userId ? String(candidate.userId) : null,
        organizationIds: Array.isArray(candidate.organizationIds)
            ? candidate.organizationIds.map(id => String(id))
            : []
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
        const orgObjectId = toObjectId(scope.orgId);
        if (!orgObjectId) {
            logger.warn(`aiSearch: invalid org scope id "${scope.orgId}"`);
            filter.organizationIds = { $in: [] };
            return filter;
        }
        filter.organizationIds = orgObjectId;
    } else if (scope.kind === 'users' && Array.isArray(scope.userIds)) {
        const objectIds = scope.userIds
            .map(id => toObjectId(id))
            .filter(Boolean);
        filter.userId = { $in: objectIds };
    }
    // 'global' has no extra filter.
    return filter;
}

function toObjectId(id) {
    if (!id) return null;
    if (id instanceof mongoose.Types.ObjectId) return id;
    if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
        return new mongoose.Types.ObjectId(id);
    }
    return null;
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

async function textSearchLexical(query, scope, candidatePoolSize) {
    const scopeFilter = buildScopeFilter(scope);
    const lexicalMatch = Object.keys(scopeFilter).length === 0
        ? { $text: { $search: query } }
        : { $and: [scopeFilter, { $text: { $search: query } }] };
    const pipeline = [
        {
            $match: lexicalMatch
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
                lexicalScore: { $meta: 'textScore' }
            }
        },
        { $sort: { lexicalScore: -1 } },
        { $limit: candidatePoolSize }
    ];
    return ParsedResume.aggregate(pipeline);
}

function mergeCandidateDocs(primary = {}, secondary = {}) {
    return {
        ...secondary,
        ...primary,
        userId: primary.userId || secondary.userId,
        organizationIds: primary.organizationIds || secondary.organizationIds,
        skills: primary.skills || secondary.skills || [],
        industries: primary.industries || secondary.industries || [],
        keywords: primary.keywords || secondary.keywords || [],
        workLanguages: primary.workLanguages || secondary.workLanguages || []
    };
}

function fuseRetrievedCandidates(vectorCandidates = [], lexicalCandidates = []) {
    const byUser = new Map();
    const vectorMax = Math.max(1, ...vectorCandidates.map(c => Number(c.score) || 0));
    const lexicalMax = Math.max(1, ...lexicalCandidates.map(c => Number(c.lexicalScore) || 0));
    const RRF_K = 60;

    vectorCandidates.forEach((item, idx) => {
        const key = String(item.userId || '');
        if (!key) return;
        byUser.set(key, {
            ...(byUser.get(key) || {}),
            doc: mergeCandidateDocs(item, byUser.get(key)?.doc),
            vectorRank: idx + 1,
            vectorScoreRaw: Number(item.score) || 0
        });
    });

    lexicalCandidates.forEach((item, idx) => {
        const key = String(item.userId || '');
        if (!key) return;
        byUser.set(key, {
            ...(byUser.get(key) || {}),
            doc: mergeCandidateDocs(item, byUser.get(key)?.doc),
            lexicalRank: idx + 1,
            lexicalScoreRaw: Number(item.lexicalScore) || 0
        });
    });

    const fused = [];
    for (const entry of byUser.values()) {
        const vectorNorm = (entry.vectorScoreRaw || 0) / vectorMax;
        const lexicalNorm = (entry.lexicalScoreRaw || 0) / lexicalMax;
        const rrfVector = entry.vectorRank ? (1 / (RRF_K + entry.vectorRank)) : 0;
        const rrfLexical = entry.lexicalRank ? (1 / (RRF_K + entry.lexicalRank)) : 0;

        const fusedScore =
            (vectorNorm * 0.65) +
            (lexicalNorm * 0.35) +
            ((rrfVector + rrfLexical) * 0.2);

        fused.push({
            ...entry.doc,
            score: fusedScore,
            _vectorRank: entry.vectorRank || null,
            _lexicalRank: entry.lexicalRank || null,
            _vectorScoreRaw: entry.vectorScoreRaw || 0,
            _lexicalScoreRaw: entry.lexicalScoreRaw || 0
        });
    }
    fused.sort((a, b) => b.score - a.score);
    return fused;
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
    let vectorError = null;
    if (ATLAS_VECTOR_SEARCH_ENABLED) {
        try {
            return await vectorSearchAtlas(embedding, scope, candidatePoolSize);
        } catch (e) {
            vectorError = e;
            // Common Atlas error: index not found, or non-Atlas cluster.
            if (isLikelyMissingVectorIndex(e)) {
                logger.warn(
                    `aiSearch: $vectorSearch index issue (${e.message}) — falling back to in-Node cosine. ` +
                    `Ensure index "${VECTOR_INDEX_NAME}" exists and is READY.`
                );
            } else {
                logger.warn(
                    `aiSearch: $vectorSearch failed (${e.message}) — falling back to in-Node cosine.`
                );
            }
        }
    }
    try {
        return await vectorSearchFallback(embedding, scope, candidatePoolSize);
    } catch (fallbackError) {
        const error = new Error('AI search data backend unavailable');
        error.code = 'AI_SEARCH_BACKEND_UNAVAILABLE';
        error.details = {
            vectorError: vectorError?.message || null,
            fallbackError: fallbackError?.message || null
        };
        throw error;
    }
}

function isLikelyMissingVectorIndex(err) {
    const msg = String(err?.message || '').toLowerCase();
    return (
        msg.includes('index') &&
        (msg.includes('not found') || msg.includes('does not exist') || msg.includes('unknown index'))
    );
}

// ─── Post-search structured filtering (location, edu, work level, etc.) ──────

function matchesStructuredFilters(doc, f) {
    if (f.location.city && !locationContains(doc.city, f.location.city) &&
        !locationContains(doc.searchableText, f.location.city)) {
        return false;
    }
    if (f.location.state && !locationContains(doc.state, f.location.state) &&
        !locationContains(doc.searchableText, f.location.state)) {
        return false;
    }
    if (f.location.country) {
        const variants = [f.location.country, f.location.countryCode].filter(Boolean);
        const matched = variants.some(v =>
            locationContains(doc.country, v) || locationContains(doc.searchableText, v)
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

function locationContains(haystack, needle) {
    if (!haystack || !needle) return false;
    if (textContains(haystack, needle)) return true;

    const normalizedNeedle = normalizeLocationToken(needle);
    if (!normalizedNeedle || normalizedNeedle.length < 4) return false;

    // Allow up to two edits for city names like "denwar" vs "denver".
    const threshold = normalizedNeedle.length <= 4 ? 1 : 2;
    const tokens = tokenizeLocationString(haystack);
    return tokens.some(token => {
        if (!token) return false;
        if (Math.abs(token.length - normalizedNeedle.length) > threshold) return false;
        if (token[0] !== normalizedNeedle[0]) return false;
        return editDistance(token, normalizedNeedle) <= threshold;
    });
}

function tokenizeLocationString(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

function normalizeLocationToken(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .trim();
}

function editDistance(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const prev = Array(b.length + 1).fill(0);
    const curr = Array(b.length + 1).fill(0);
    for (let j = 0; j <= b.length; j++) prev[j] = j;

    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(
                prev[j] + 1,
                curr[j - 1] + 1,
                prev[j - 1] + cost
            );
        }
        for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
    }
    return prev[b.length];
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
const ROLE_REQUIRED_PENALTY = 0.35; // stronger penalty when role terms are missing
const ROLE_SKILL_EVIDENCE_MIN_HITS = 2; // allow role intent via strong skill evidence (e.g. MERN stack)
const RELAXED_ROLE_QUERY_MIN_SCORE = 0.22;
const LEXICAL_RERANK_MAX_BOOST = 0.12;
const LEXICAL_STOP_WORDS = new Set([
    'and', 'for', 'from', 'with', 'that', 'this', 'have', 'has', 'the',
    'are', 'you', 'your', 'their', 'about', 'into', 'across', 'where',
    'while', 'whose', 'when', 'what'
]);

function tokenizeQueryWords(query) {
    return String(query || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .map(w => w.trim())
        .filter(w => w.length >= 3 && !LEXICAL_STOP_WORDS.has(w));
}

function buildLexicalBoost(query, doc) {
    const terms = tokenizeQueryWords(query);
    if (terms.length === 0) return 0;

    const searchable = [
        doc.currentTitle,
        doc.headline,
        doc.summary,
        doc.searchableText,
        ...(doc.skills || []),
        ...(doc.keywords || [])
    ]
        .filter(Boolean)
        .map(item => String(item).toLowerCase())
        .join(' ');

    if (!searchable) return 0;
    const hitCount = terms.reduce((count, term) => (
        searchable.includes(term) ? count + 1 : count
    ), 0);
    if (hitCount === 0) return 0;
    return Math.min(LEXICAL_RERANK_MAX_BOOST, (hitCount / terms.length) * LEXICAL_RERANK_MAX_BOOST);
}

function splitTextIntoChunks(text, opts = {}) {
    const maxWords = opts.maxWords || 80;
    const overlapWords = opts.overlapWords || 20;
    const maxChunks = opts.maxChunks || 12;
    const words = String(text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean);
    if (words.length === 0) return [];

    const chunks = [];
    let start = 0;
    while (start < words.length && chunks.length < maxChunks) {
        const end = Math.min(words.length, start + maxWords);
        chunks.push(words.slice(start, end).join(' '));
        if (end >= words.length) break;
        start = Math.max(end - overlapWords, start + 1);
    }
    return chunks;
}

function scoreChunkRelevance(chunk, query, queryTerms) {
    if (!chunk) return 0;
    const haystack = String(chunk).toLowerCase();
    if (!haystack) return 0;

    const fullQuery = String(query || '').toLowerCase();
    const phraseBoost = haystack.includes(fullQuery) ? 0.45 : 0;
    const termHits = queryTerms.reduce((hits, term) => (
        haystack.includes(term) ? hits + 1 : hits
    ), 0);
    const termScore = queryTerms.length > 0 ? (termHits / queryTerms.length) : 0;
    return Math.min(1, phraseBoost + (termScore * 0.75));
}

function addChunkEvidenceAndBoost(candidates, query) {
    const queryTerms = tokenizeQueryWords(query);
    const CHUNK_BOOST_MAX = 0.18;

    return candidates.map(candidate => {
        const sourceText = [
            candidate.currentTitle,
            candidate.headline,
            candidate.summary,
            candidate.searchableText,
            ...(candidate.skills || []),
            ...(candidate.keywords || [])
        ]
            .filter(Boolean)
            .join(' ');
        const chunks = splitTextIntoChunks(sourceText);
        if (chunks.length === 0) {
            return { ...candidate, _ragChunkScore: 0, _ragSnippet: null };
        }

        let bestChunk = null;
        let bestScore = 0;
        for (const chunk of chunks) {
            const score = scoreChunkRelevance(chunk, query, queryTerms);
            if (score > bestScore) {
                bestScore = score;
                bestChunk = chunk;
            }
        }

        const chunkBoost = Math.min(CHUNK_BOOST_MAX, bestScore * CHUNK_BOOST_MAX);
        return {
            ...candidate,
            score: (candidate.score || 0) + chunkBoost,
            _ragChunkScore: bestScore,
            _ragSnippet: bestChunk ? String(bestChunk).slice(0, 260) : null
        };
    });
}

async function rerankTopCandidatesWithLLM(query, candidates, client) {
    if (!LLM_RERANKER_ENABLED) return candidates;
    if (!Array.isArray(candidates) || candidates.length < 2) return candidates;

    const topK = Math.max(2, Math.min(LLM_RERANK_TOP_K, candidates.length));
    const head = candidates.slice(0, topK);
    const tail = candidates.slice(topK);

    const items = head.map(item => ({
        userId: String(item.userId || ''),
        currentTitle: item.currentTitle || '',
        city: item.city || '',
        state: item.state || '',
        country: item.country || '',
        skills: (item.skills || []).slice(0, 10),
        summary: String(item.summary || '').slice(0, 260),
        ragSnippet: item._ragSnippet || ''
    }));

    const prompt = `Rank the candidates by best fit to this job-seeker search query.
Query: "${query}"
Candidates JSON:
${JSON.stringify(items)}

Return strict JSON:
{ "orderedUserIds": ["<userId1>", "<userId2>", "..."] }

Rules:
- Prioritize role/title, skills, location intent, then evidence snippet relevance.
- Use only provided candidate data.
- Include each candidate userId exactly once.`;

    try {
        const resp = await client.chat.completions.create({
            model: CHAT_MODEL,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0,
            max_tokens: 320
        });
        const payload = JSON.parse(resp.choices[0]?.message?.content || '{}');
        const orderedUserIds = Array.isArray(payload.orderedUserIds)
            ? payload.orderedUserIds.map(id => String(id))
            : [];
        if (orderedUserIds.length < 2) return candidates;

        const byUser = new Map(head.map(item => [String(item.userId), item]));
        const reranked = [];
        for (const userId of orderedUserIds) {
            const item = byUser.get(userId);
            if (item) reranked.push(item);
        }
        for (const item of head) {
            if (!reranked.find(r => String(r.userId) === String(item.userId))) {
                reranked.push(item);
            }
        }
        const rerankBoostMax = 0.06;
        const boosted = reranked.map((item, idx) => {
            const denominator = Math.max(1, reranked.length - 1);
            const rankFactor = (reranked.length - 1 - idx) / denominator;
            return {
                ...item,
                score: (item.score || 0) + (rankFactor * rerankBoostMax)
            };
        });
        return [...boosted, ...tail];
    } catch (error) {
        logger.warn(`aiSearch: LLM reranker failed: ${error.message}`);
        return candidates;
    }
}

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
    let roleSignalHit = false;

    for (const kw of filters.roleKeywords) {
        if (!kw) continue;
        if (title.includes(kw) || headline.includes(kw)) {
            titleHits++;
            anyHit = true;
            roleSignalHit = true;
            continue;
        }
        if (summary.includes(kw)) {
            keywordHits++;
            anyHit = true;
            roleSignalHit = true;
            continue;
        }
        if (searchable.includes(kw)) {
            textHits++;
            anyHit = true;
            roleSignalHit = true;
        }
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
    const hasStrongRoleSkillEvidence = skillHits >= ROLE_SKILL_EVIDENCE_MIN_HITS;
    if (filters.roleKeywords.length > 0 && !roleSignalHit && !hasStrongRoleSkillEvidence) {
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
                    sourceResumeUrl: d.sourceResumeUrl,
                    ragEvidence: d._ragSnippet || null
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
    const normalizedQuery = query.trim();

    const blocked = findSensitiveTerm(normalizedQuery);
    if (blocked) {
        throw new SensitiveQueryError(blocked);
    }

    const client = getClient();

    const queryContextCacheKey = buildCacheKey('aiSearch:queryContext', {
        query: normalizedQuery,
        chatModel: CHAT_MODEL,
        embeddingModel: EMBEDDING_MODEL
    });

    let queryContext = await getCachedJson(queryContextCacheKey);
    if (!queryContext) {
        // Parallelize: structured-filter extraction + embedding generation.
        const [filtersRaw, embedding] = await Promise.all([
            extractStructuredFilters(normalizedQuery, client),
            embedQuery(normalizedQuery, client)
        ]);
        queryContext = {
            filtersRaw,
            embedding
        };
        await setCachedJson(queryContextCacheKey, queryContext, QUERY_CONTEXT_CACHE_TTL_SECONDS);
    }

    const filters = applyQueryLocationHints(sanitizeFilters(queryContext.filtersRaw || {}), normalizedQuery);
    const embedding = queryContext.embedding;

    if (!embedding) {
        return { results: [], total: 0, criteria: filters, page, totalPages: 0 };
    }

    const candidateCacheKey = buildCacheKey('aiSearch:candidates', {
        query: normalizedQuery,
        scope: normalizeScopeForCache(scope),
        minScore,
        candidatePoolSize,
        rerankerEnabled: LLM_RERANKER_ENABLED,
        rerankerTopK: LLM_RERANK_TOP_K,
        pipelineVersion: 2
    });
    const cachedCandidates = await getCachedJson(candidateCacheKey);

    let candidates = Array.isArray(cachedCandidates?.candidates)
        ? cachedCandidates.candidates
        : null;

    if (!candidates) {
        const [vectorCandidates, lexicalCandidates] = await Promise.all([
            runVectorSearch(embedding, scope, candidatePoolSize),
            textSearchLexical(normalizedQuery, scope, candidatePoolSize)
                .catch(error => {
                    logger.warn(`aiSearch: lexical text retrieval unavailable (${error.message})`);
                    return [];
                })
        ]);
        candidates = fuseRetrievedCandidates(vectorCandidates, lexicalCandidates);
        if (candidates.length === 0) {
            candidates = vectorCandidates;
        }

        // Apply structured (location / education / work-level / years) filters.
        candidates = candidates.filter(c => matchesStructuredFilters(c, filters));

        // Compute hybrid score (vector + role/skill keyword boost), then sort.
        candidates = candidates.map(c => {
            const hybridScore = buildHybridScore(c, filters);
            const lexicalBoost = buildLexicalBoost(normalizedQuery, c);
            return {
                ...c,
                score: hybridScore + lexicalBoost
            };
        });
        candidates.sort((a, b) => b.score - a.score);

        // Apply relevance floor AFTER hybrid scoring so keyword matches can
        // rescue an otherwise low-cosine match (and the ROLE_REQUIRED_PENALTY
        // can prune off-topic results like a designer for a "developer" query).
        const strictCandidates = candidates.filter(c => c.score >= minScore);

        // If the query includes a role intent but strict threshold yields no
        // hits, relax slightly to avoid dropping real role matches with sparse
        // titles (e.g. "developer" seeker with MERN skills but blank title).
        if (strictCandidates.length === 0 && filters.roleKeywords.length > 0) {
            candidates = candidates.filter(c => c.score >= Math.min(minScore, RELAXED_ROLE_QUERY_MIN_SCORE));
        } else {
            candidates = strictCandidates;
        }

        candidates = addChunkEvidenceAndBoost(candidates, normalizedQuery);
        candidates.sort((a, b) => b.score - a.score);
        candidates = await rerankTopCandidatesWithLLM(normalizedQuery, candidates, client);
        candidates.sort((a, b) => b.score - a.score);

        const normalizedCandidates = candidates.map(normalizeCandidateForCache);
        await setCachedJson(
            candidateCacheKey,
            { candidates: normalizedCandidates },
            CANDIDATE_CACHE_TTL_SECONDS
        );
        candidates = normalizedCandidates;
    }

    // Drop orphan parsed docs (user deleted/missing) before counting/paging.
    // Without this, API can report non-zero totals while returning empty
    // result cards because hydration strips missing users on the current page.
    if (candidates.length > 0) {
        const candidateUserIds = Array.from(
            new Set(candidates.map(c => String(c.userId)).filter(Boolean))
        );
        const existingUsers = await User.find({ _id: { $in: candidateUserIds } })
            .select('_id')
            .lean();
        const existingUserIdSet = new Set(existingUsers.map(u => String(u._id)));
        candidates = candidates.filter(c => existingUserIdSet.has(String(c.userId)));
    }

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
