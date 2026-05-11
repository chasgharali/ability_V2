'use strict';

/**
 * ParsedResume — searchable, AI-parsed projection of a job seeker's
 * resume + non-sensitive profile data. ONE document per user.
 *
 * SECURITY CONTRACT (do not change without security review):
 *   - This collection MUST NOT contain disability, accessibility, race,
 *     gender, age, country-of-origin, religion, or any survey field.
 *   - Source data is taken ONLY from Resume documents, uploaded resume
 *     file text, and the non-sensitive subset of User (name, location,
 *     headline/keywords, languages, education level, employment types,
 *     work level, primary experience areas).
 *   - The fields below are an explicit allowlist. Adding a field here
 *     is the only way new data enters the search index.
 *   - The companion service `resumeParserService.js` enforces this
 *     contract at write time; this schema enforces it at storage time.
 *
 * INDEXES:
 *   - `userId` (unique) — one parsed projection per user
 *   - `organizationIds` — fan-out for org-scoped queries
 *   - Atlas Vector Search index `parsed_resume_vector_index` on `embedding`
 *     (numDimensions: 1536, similarity: cosine, filter: userId, organizationIds)
 *     — definition documented in docs/skills/ai-search/SKILL.md
 */

const mongoose = require('mongoose');

const parsedResumeSchema = new mongoose.Schema({
    // The job seeker this parsed resume belongs to.
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // All organizations this job seeker has registered an event with.
    // Re-derived on every parse from RegisteredJobSeeker.
    organizationIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        index: true
    }],
    // Source of the parse, for provenance / re-parse decisions.
    sourceResumeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Resume',
        default: null
    },
    sourceResumeUrl: {
        type: String,
        default: null
    },
    parseSource: {
        // 'resume-builder' | 'uploaded-resume' | 'profile-only'
        type: String,
        default: ''
    },
    parsedAt: {
        type: Date,
        default: Date.now
    },
    // Hash of the parsing input — lets us skip re-embedding when nothing changed.
    inputHash: {
        type: String,
        default: ''
    },

    // ── Non-sensitive structured fields (allowlist) ────────────────────
    currentTitle: { type: String, default: '' },
    yearsOfExperience: { type: Number, default: null },
    skills: [{ type: String }],
    industries: [{ type: String }],
    educationLevel: { type: String, default: '' },
    workLanguages: [{ type: String }],
    summary: { type: String, default: '' },
    headline: { type: String, default: '' },
    keywords: [{ type: String }],
    employmentTypes: [{ type: String }],
    workLevel: { type: String, default: '' },
    // Locations (already non-sensitive — same fields shown publicly on profile)
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    country: { type: String, default: '' },

    // Combined searchable text (used for keyword fallback / hybrid search).
    searchableText: { type: String, default: '' },

    // OpenAI embedding (text-embedding-3-small → 1536 dimensions).
    embedding: {
        type: [Number],
        default: undefined,
        // Hide from generic toJSON — embeddings are large + opaque.
        select: false
    },
    embeddingModel: {
        type: String,
        default: ''
    },
    embeddingDimensions: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true,
    minimize: false
});

// Disallow ANY field whose name matches a sensitive pattern from being saved.
// Defense in depth: even if upstream code tries to write disability data,
// Mongoose will silently drop it because the field is not in the schema.
// This pre-validate hook adds a hard error if a caller attempts to bypass.
const SENSITIVE_KEY_PATTERNS = [
    /disabilit/i,
    /accessibility/i,
    /\bASL\b/i,
    /screen[\s_-]?reader/i,
    /screen[\s_-]?magnif/i,
    /captions?/i,
    /\brace\b/i,
    /\bgender/i,
    /\bage[\s_]?group/i,
    /\bsurvey/i,
    /country[\s_-]?of[\s_-]?origin/i
];

parsedResumeSchema.pre('validate', function (next) {
    const docKeys = Object.keys(this.toObject({ virtuals: false }));
    for (const key of docKeys) {
        if (SENSITIVE_KEY_PATTERNS.some(p => p.test(key))) {
            return next(new Error(
                `ParsedResume rejected sensitive field "${key}". ` +
                `See SECURITY CONTRACT in models/ParsedResume.js.`
            ));
        }
    }
    next();
});

parsedResumeSchema.index({ userId: 1 }, { unique: true });
parsedResumeSchema.index({ organizationIds: 1, parsedAt: -1 });
parsedResumeSchema.index({ parsedAt: -1 });
// Plain-text fallback index for environments without Atlas Search.
parsedResumeSchema.index({ searchableText: 'text' });

module.exports = mongoose.model('ParsedResume', parsedResumeSchema);
