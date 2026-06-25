/**
 * Caption provider selection.
 *
 * Deepgram is ALWAYS the preferred speech-to-text provider. OpenAI is only used
 * as a fallback when Deepgram is not configured/available. This is intentional:
 * Deepgram streams over a persistent WebSocket (lower latency) while OpenAI is a
 * chunked fallback.
 */

const deepgramService = require('./deepgramService');
const openaiCaptionService = require('./openaiCaptionService');
const logger = require('../utils/logger');

/**
 * Resolve the active caption service.
 * @returns {{ service: Object|null, provider: string }}
 */
const getCaptionService = () => {
    // Deepgram first, always.
    if (deepgramService.isAvailable()) {
        return { service: deepgramService, provider: 'deepgram' };
    }

    // OpenAI is only a fallback when Deepgram is unavailable.
    if (openaiCaptionService.isAvailable()) {
        logger.warn('Deepgram unavailable - falling back to OpenAI caption provider');
        return { service: openaiCaptionService, provider: 'openai' };
    }

    return { service: null, provider: 'deepgram' };
};

module.exports = { getCaptionService };
