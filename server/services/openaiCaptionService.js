const OpenAI = require('openai');
const logger = require('../utils/logger');

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const BYTES_PER_MS = (SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE) / 1000;

const DEFAULT_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
const DEFAULT_CHUNK_MS = parseInt(process.env.OPENAI_CAPTION_CHUNK_MS || '4000', 10);
const DEFAULT_MIN_CHUNK_MS = parseInt(process.env.OPENAI_CAPTION_MIN_CHUNK_MS || '2500', 10);
const MAX_BUFFER_MS = parseInt(process.env.OPENAI_CAPTION_MAX_BUFFER_MS || '12000', 10);

/** RMS threshold below which a chunk is considered silence and skipped. */
const SILENCE_RMS_THRESHOLD = parseFloat(process.env.OPENAI_CAPTION_SILENCE_THRESHOLD || '0.003');

class OpenAICaptionService {
    constructor() {
        this.connections = new Map();
        this.available = Boolean(process.env.OPENAI_API_KEY);
        this.model = DEFAULT_MODEL;
        this.chunkBytes = Math.max(DEFAULT_CHUNK_MS, 1000) * BYTES_PER_MS;
        this.minChunkBytes = Math.max(DEFAULT_MIN_CHUNK_MS, 800) * BYTES_PER_MS;
        this.maxBufferBytes = Math.max(MAX_BUFFER_MS, 3000) * BYTES_PER_MS;

        if (this.available) {
            this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            logger.info(`✅ OpenAI caption service initialized (model: ${this.model})`);
        } else {
            this.client = null;
            logger.warn('⚠️ OpenAI caption service unavailable - OPENAI_API_KEY missing');
        }
    }

    isAvailable() {
        return this.available && Boolean(this.client);
    }

    async startTranscription(connectionKey, callId, roomName, participantId, participantName, onTranscription) {
        if (!this.isAvailable()) {
            logger.warn('Cannot start OpenAI transcription: service unavailable');
            return false;
        }

        if (this.connections.has(connectionKey)) {
            this.stopTranscription(connectionKey);
        }

        this.connections.set(connectionKey, {
            callId,
            roomName,
            participantId,
            participantName,
            onTranscription,
            pendingBuffers: [],
            bufferBytes: 0,
            processing: false,
            closed: false,
            lastEmitText: '',
            lastEmitAt: 0,
            lastTranscriptContext: '' // rolling context for OpenAI prompt
        });

        return true;
    }

    sendAudio(connectionKey, audioBuffer) {
        const connection = this.connections.get(connectionKey);
        if (!connection || connection.closed) {
            return false;
        }

        if (!audioBuffer || audioBuffer.length === 0) {
            return false;
        }

        connection.pendingBuffers.push(Buffer.from(audioBuffer));
        connection.bufferBytes += audioBuffer.length;

        if (connection.bufferBytes > this.maxBufferBytes) {
            // Keep latest audio if producer outruns network/API.
            while (connection.bufferBytes > this.maxBufferBytes && connection.pendingBuffers.length > 1) {
                const dropped = connection.pendingBuffers.shift();
                connection.bufferBytes -= dropped.length;
            }
        }

        if (connection.bufferBytes >= this.chunkBytes && !connection.processing) {
            this.processConnection(connectionKey);
        }

        return true;
    }

    async processConnection(connectionKey, flushAll = false) {
        const connection = this.connections.get(connectionKey);
        if (!connection || connection.closed || connection.processing) {
            return;
        }

        if (!flushAll && connection.bufferBytes < this.minChunkBytes) {
            return;
        }

        connection.processing = true;
        try {
            while (!connection.closed && connection.pendingBuffers.length > 0) {
                if (!flushAll && connection.bufferBytes < this.minChunkBytes) {
                    break;
                }

                const targetBytes = flushAll
                    ? connection.bufferBytes
                    : Math.min(connection.bufferBytes, this.chunkBytes);
                const pcmChunk = this.takeBytes(connection, targetBytes);
                if (!pcmChunk || pcmChunk.length === 0) {
                    break;
                }

                // Skip silent chunks to avoid wasting API calls.
                if (this.isSilentChunk(pcmChunk)) {
                    logger.debug(`[OpenAI Captions] Skipping silent chunk for ${connection.participantName}`);
                    continue;
                }

                const startedAt = Date.now();
                const transcriptText = await this.transcribeChunk(pcmChunk, connection.lastTranscriptContext);
                const latencyMs = Date.now() - startedAt;
                if (!transcriptText) {
                    logger.debug(`[OpenAI Captions] Empty transcript for ${connection.participantName} (${latencyMs}ms)`);
                    continue;
                }

                const now = Date.now();
                const cleanedText = transcriptText.trim();
                if (!cleanedText) {
                    continue;
                }

                // Avoid flooding clients with duplicates from adjacent chunks.
                const isDuplicate = cleanedText === connection.lastEmitText && (now - connection.lastEmitAt < 2500);
                if (isDuplicate) {
                    continue;
                }

                connection.lastEmitText = cleanedText;
                connection.lastEmitAt = now;
                // Keep last ~100 chars as context for the next chunk prompt.
                connection.lastTranscriptContext = cleanedText.slice(-100);

                connection.onTranscription?.({
                    callId: connection.callId,
                    roomName: connection.roomName,
                    participantId: connection.participantId,
                    participantName: connection.participantName,
                    text: cleanedText,
                    isFinal: true,
                    confidence: null,
                    timestamp: new Date(now).toISOString()
                });

                logger.debug(`[OpenAI Captions] ${connection.participantName}: "${cleanedText.slice(0, 60)}" (${latencyMs}ms)`);
            }
        } catch (error) {
            logger.error(`OpenAI caption processing error for ${connectionKey}:`, error.message);
        } finally {
            connection.processing = false;
        }
    }

    async transcribeChunk(pcmBuffer, contextPrompt = '') {
        try {
            const wavBuffer = this.pcm16ToWav(pcmBuffer, SAMPLE_RATE, CHANNELS);
            const file = await OpenAI.toFile(wavBuffer, 'caption.wav', { type: 'audio/wav' });

            const requestParams = {
                file,
                model: this.model,
                language: 'en'
            };
            // Providing the tail of the previous transcript as a prompt helps OpenAI
            // continue sentences coherently across chunk boundaries.
            if (contextPrompt) {
                requestParams.prompt = contextPrompt;
            }

            const response = await this.client.audio.transcriptions.create(requestParams);

            return response?.text || '';
        } catch (error) {
            logger.error('OpenAI transcription request failed:', error.message);
            return '';
        }
    }

    /**
     * Returns true if the PCM buffer is below the silence threshold.
     * Computes RMS over Int16 samples normalised to [-1, 1].
     */
    isSilentChunk(pcmBuffer) {
        if (!pcmBuffer || pcmBuffer.length < 2) return true;
        const samples = pcmBuffer.length / BYTES_PER_SAMPLE;
        let sumSq = 0;
        for (let i = 0; i < pcmBuffer.length - 1; i += 2) {
            // Read signed 16-bit little-endian sample
            const sample = pcmBuffer.readInt16LE(i) / 32768.0;
            sumSq += sample * sample;
        }
        const rms = Math.sqrt(sumSq / samples);
        return rms < SILENCE_RMS_THRESHOLD;
    }

    takeBytes(connection, size) {
        if (size <= 0 || connection.pendingBuffers.length === 0) {
            return Buffer.alloc(0);
        }

        const chunks = [];
        let remaining = size;

        while (remaining > 0 && connection.pendingBuffers.length > 0) {
            const current = connection.pendingBuffers[0];
            if (current.length <= remaining) {
                chunks.push(current);
                connection.pendingBuffers.shift();
                connection.bufferBytes -= current.length;
                remaining -= current.length;
            } else {
                chunks.push(current.subarray(0, remaining));
                connection.pendingBuffers[0] = current.subarray(remaining);
                connection.bufferBytes -= remaining;
                remaining = 0;
            }
        }

        return Buffer.concat(chunks);
    }

    pcm16ToWav(pcmBuffer, sampleRate, channels) {
        const byteRate = sampleRate * channels * BYTES_PER_SAMPLE;
        const blockAlign = channels * BYTES_PER_SAMPLE;
        const wavHeader = Buffer.alloc(44);

        wavHeader.write('RIFF', 0);
        wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4);
        wavHeader.write('WAVE', 8);
        wavHeader.write('fmt ', 12);
        wavHeader.writeUInt32LE(16, 16); // PCM header size
        wavHeader.writeUInt16LE(1, 20); // PCM format
        wavHeader.writeUInt16LE(channels, 22);
        wavHeader.writeUInt32LE(sampleRate, 24);
        wavHeader.writeUInt32LE(byteRate, 28);
        wavHeader.writeUInt16LE(blockAlign, 32);
        wavHeader.writeUInt16LE(BITS_PER_SAMPLE, 34);
        wavHeader.write('data', 36);
        wavHeader.writeUInt32LE(pcmBuffer.length, 40);

        return Buffer.concat([wavHeader, pcmBuffer]);
    }

    async stopTranscription(connectionKey) {
        const connection = this.connections.get(connectionKey);
        if (!connection) {
            return;
        }

        connection.closed = true;

        // Flush remaining buffered audio before closing.
        if (connection.bufferBytes > 0) {
            await this.processConnection(connectionKey, true);
        }

        this.connections.delete(connectionKey);
    }

    stopAllForCall(callId) {
        const keysToStop = [];
        this.connections.forEach((connection, key) => {
            if (connection.callId === callId) {
                keysToStop.push(key);
            }
        });

        keysToStop.forEach((key) => {
            this.stopTranscription(key).catch((error) => {
                logger.error(`Error stopping OpenAI caption connection ${key}:`, error.message);
            });
        });
    }
}

module.exports = new OpenAICaptionService();
