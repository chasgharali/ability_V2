'use strict';

/**
 * @deprecated Replaced by `resumeParserService` and `aiSearchService`
 * (April 2026 — privacy fix).
 *
 * The previous implementation indexed and searched survey data including
 * disabilities and accessibility needs, which violated the product policy
 * that recruiters/admins must NOT be able to filter or rank job seekers
 * by protected attributes.
 *
 * This shim exists only to surface a clear error if any legacy import path
 * is still wired up. Do NOT add code here. See:
 *   - server/services/resumeParserService.js
 *   - server/services/aiSearchService.js
 *   - server/models/ParsedResume.js
 *   - docs/skills/ai-search/SKILL.md
 */

function deprecated() {
    throw new Error(
        'jobSeekerSearchService has been removed for privacy reasons. ' +
        'Use resumeParserService + aiSearchService. ' +
        'See docs/skills/ai-search/SKILL.md.'
    );
}

module.exports = {
    parseRegistrationProfile: deprecated,
    parseJobSeekerProfile: deprecated,
    batchParseProfiles: deprecated,
    getParseStatus: deprecated,
    aiSearch: deprecated
};
