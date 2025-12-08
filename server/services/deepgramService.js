/**
 * Deepgram Service - Real-time speech-to-text transcription
 * 
 * This service provides server-side integration with Deepgram's live transcription API.
 * It manages WebSocket connections per participant and streams audio for transcription.
 * 
 * Features:
 * - Real-time transcription with interim and final results
 * - Connection management per participant
 * - Automatic reconnection on errors
 * - Graceful fallback when API key is not configured
 */

const WebSocket = require('ws');
const logger = require('../utils/logger');

// Deepgram API configuration
const DEEPGRAM_API_URL = 'wss://api.deepgram.com/v1/listen';
const DEEPGRAM_MODEL = 'nova-2';  // Deepgram's latest and most accurate model
const DEEPGRAM_LANGUAGE = 'en-US';

class DeepgramService {
    constructor() {
        this.apiKey = process.env.DEEPGRAM_API_KEY;
        this.connections = new Map(); // Map of connectionKey -> { ws, callId, roomName, participantId, participantName }
        this.reconnectAttempts = new Map(); // Track reconnection attempts
        
        if (!this.apiKey) {
            logger.warn('⚠️ DEEPGRAM_API_KEY not configured - caption service will be unavailable');
            logger.warn('   Set DEEPGRAM_API_KEY in your .env file to enable real-time captions');
        } else {
            logger.info('✅ Deepgram service initialized');
        }
    }

    /**
     * Check if Deepgram service is available
     * @returns {boolean}
     */
    isAvailable() {
        return !!this.apiKey;
    }

    /**
     * Build Deepgram WebSocket URL with query parameters
     * @returns {string}
     */
    buildUrl() {
        const params = new URLSearchParams({
            model: DEEPGRAM_MODEL,
            language: DEEPGRAM_LANGUAGE,
            smart_format: 'true',
            interim_results: 'true',
            punctuate: 'true',
            endpointing: '300',       // End of speech detection (ms)
            utterance_end_ms: '1000', // Utterance end timeout
            vad_events: 'true',       // Voice activity detection
            encoding: 'linear16',
            sample_rate: '16000',
            channels: '1'
        });

        return `${DEEPGRAM_API_URL}?${params.toString()}`;
    }

    /**
     * Start transcription for a participant
     * @param {string} connectionKey - Unique key for this connection (callId_participantId)
     * @param {string} callId - Call identifier
     * @param {string} roomName - Room name for socket broadcasting
     * @param {string} participantId - Participant identifier
     * @param {string} participantName - Participant display name
     * @param {Function} onTranscription - Callback for transcriptions
     * @returns {Promise<boolean>} Success status
     */
    async startTranscription(connectionKey, callId, roomName, participantId, participantName, onTranscription) {
        if (!this.isAvailable()) {
            logger.warn('Cannot start transcription - Deepgram not configured');
            return false;
        }

        // Check if connection already exists
        if (this.connections.has(connectionKey)) {
            logger.warn(`Connection already exists for ${connectionKey}`);
            return false;
        }

        try {
            const url = this.buildUrl();
            
            const ws = new WebSocket(url, {
                headers: {
                    'Authorization': `Token ${this.apiKey}`
                }
            });

            // Store connection info
            const connectionInfo = {
                ws,
                callId,
                roomName,
                participantId,
                participantName,
                onTranscription,
                isOpen: false,
                lastActivity: Date.now()
            };

            this.connections.set(connectionKey, connectionInfo);
            this.reconnectAttempts.set(connectionKey, 0);

            // Set up event handlers
            ws.on('open', () => {
                connectionInfo.isOpen = true;
                connectionInfo.lastActivity = Date.now();
                logger.info(`✅ Deepgram WebSocket opened for ${participantName} (${connectionKey})`);
                logger.info(`   Ready to receive audio and send transcriptions`);
                logger.info(`   WebSocket URL: ${url.split('?')[0]}... (API key configured)`);
                
                // Send a test message to verify connection
                logger.debug(`   Testing Deepgram connection...`);
            });

            ws.on('message', (data) => {
                connectionInfo.lastActivity = Date.now();
                try {
                    this.handleMessage(connectionKey, data);
                } catch (error) {
                    logger.error(`Error handling Deepgram message for ${connectionKey}:`, error);
                }
            });

            ws.on('error', (error) => {
                logger.error(`❌ Deepgram WebSocket error for ${participantName}:`, error.message);
                logger.error(`   Error details:`, error);
                if (error.message && error.message.includes('401')) {
                    logger.error(`   ⚠️  This usually means the API key is invalid or expired`);
                }
                this.handleError(connectionKey, error);
            });

            ws.on('close', (code, reason) => {
                connectionInfo.isOpen = false;
                const reasonStr = reason ? reason.toString() : 'No reason provided';
                logger.info(`🔌 Deepgram connection closed for ${participantName}: code=${code}, reason=${reasonStr}`);
                
                if (code === 1008) {
                    logger.error(`   ⚠️  Code 1008 usually means invalid API key or authentication failed`);
                } else if (code === 1002) {
                    logger.error(`   ⚠️  Code 1002 usually means protocol error - check audio format`);
                }
                
                // Attempt reconnection if it was an unexpected close
                if (code !== 1000 && code !== 1001) {
                    logger.info(`   Attempting reconnection...`);
                    this.attemptReconnection(connectionKey);
                }
            });

            // Wait for connection to open (with timeout)
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 10000);

                ws.once('open', () => {
                    clearTimeout(timeout);
                    resolve();
                });

                ws.once('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });

            return true;

        } catch (error) {
            logger.error(`Failed to start transcription for ${participantName}:`, error.message);
            this.connections.delete(connectionKey);
            this.reconnectAttempts.delete(connectionKey);
            return false;
        }
    }

    /**
     * Handle incoming message from Deepgram
     * @param {string} connectionKey - Connection identifier
     * @param {Buffer|string} data - Raw message data
     */
    handleMessage(connectionKey, data) {
        const connectionInfo = this.connections.get(connectionKey);
        if (!connectionInfo) {
            logger.warn(`No connection info found for ${connectionKey}`);
            return;
        }

        try {
            const message = JSON.parse(data.toString());
            
            // Log all message types for debugging
            if (message.type !== 'Results') {
                logger.debug(`Deepgram message type: ${message.type} for ${connectionKey}`);
            }

            // Handle transcription results
            if (message.type === 'Results') {
                const channel = message.channel;
                const alternatives = channel?.alternatives;
                
                logger.info(`📝 Deepgram Results received for ${connectionInfo.participantName}: isFinal=${message.is_final}, alternatives=${alternatives?.length || 0}`);
                
                if (alternatives && alternatives.length > 0) {
                    const transcript = alternatives[0].transcript;
                    const confidence = alternatives[0].confidence;
                    const isFinal = message.is_final;

                    logger.debug(`   Transcript: "${transcript}", Confidence: ${confidence}, isFinal: ${isFinal}`);

                    // Only emit if there's actual content
                    if (transcript && transcript.trim().length > 0) {
                        logger.info(`✅ Deepgram transcription: "${transcript.trim()}" (confidence: ${confidence}, isFinal: ${isFinal})`);
                        
                        const transcription = {
                            participantId: connectionInfo.participantId,
                            participantName: connectionInfo.participantName,
                            callId: connectionInfo.callId,
                            roomName: connectionInfo.roomName,
                            text: transcript.trim(),
                            isFinal: isFinal,
                            confidence: confidence,
                            timestamp: new Date().toISOString(),
                            words: alternatives[0].words || []
                        };

                        // Call the transcription callback
                        if (typeof connectionInfo.onTranscription === 'function') {
                            logger.info(`📞 Calling onTranscription callback for ${connectionInfo.participantName} with text: "${transcript.trim()}"`);
                            try {
                                connectionInfo.onTranscription(transcription);
                                logger.debug(`✅ onTranscription callback executed successfully`);
                            } catch (error) {
                                logger.error(`❌ Error in onTranscription callback:`, error);
                            }
                        } else {
                            logger.error(`❌ No onTranscription callback found for ${connectionKey}`);
                        }
                    } else {
                        logger.debug(`⚠️ Empty transcript received for ${connectionInfo.participantName} (transcript: "${transcript}")`);
                    }
                } else {
                    logger.warn(`⚠️ No alternatives in Deepgram results for ${connectionInfo.participantName}`);
                    logger.debug(`   Full message:`, JSON.stringify(message, null, 2));
                }
            } else if (message.type === 'Metadata') {
                logger.debug(`📊 Deepgram Metadata: ${JSON.stringify(message)}`);
            } else if (message.type === 'Error') {
                logger.error(`❌ Deepgram Error: ${JSON.stringify(message)}`);
            } else {
                logger.debug(`📨 Deepgram message type "${message.type}": ${JSON.stringify(message).substring(0, 200)}`);
            }

            // Handle metadata
            if (message.type === 'Metadata') {
                logger.debug(`Deepgram metadata for ${connectionInfo.participantName}:`, {
                    request_id: message.request_id,
                    model: message.model_info?.name
                });
            }

            // Handle utterance end (silence detected)
            if (message.type === 'UtteranceEnd') {
                logger.debug(`Utterance ended for ${connectionInfo.participantName}`);
            }

            // Handle speech started
            if (message.type === 'SpeechStarted') {
                logger.debug(`Speech started for ${connectionInfo.participantName}`);
            }

        } catch (error) {
            logger.error(`Error parsing Deepgram message for ${connectionKey}:`, error.message);
        }
    }

    /**
     * Handle WebSocket error
     * @param {string} connectionKey - Connection identifier
     * @param {Error} error - Error object
     */
    handleError(connectionKey, error) {
        const connectionInfo = this.connections.get(connectionKey);
        if (!connectionInfo) return;

        logger.error(`Deepgram error for ${connectionInfo.participantName}:`, error.message);

        // Close connection if still open
        if (connectionInfo.ws && connectionInfo.ws.readyState === WebSocket.OPEN) {
            connectionInfo.ws.close(1000, 'Error occurred');
        }
    }

    /**
     * Attempt to reconnect after an unexpected disconnection
     * @param {string} connectionKey - Connection identifier
     */
    async attemptReconnection(connectionKey) {
        const connectionInfo = this.connections.get(connectionKey);
        if (!connectionInfo) return;

        const attempts = this.reconnectAttempts.get(connectionKey) || 0;
        
        if (attempts >= 3) {
            logger.warn(`Max reconnection attempts reached for ${connectionInfo.participantName}`);
            this.connections.delete(connectionKey);
            this.reconnectAttempts.delete(connectionKey);
            return;
        }

        this.reconnectAttempts.set(connectionKey, attempts + 1);
        
        const delay = Math.min(1000 * Math.pow(2, attempts), 10000); // Exponential backoff, max 10s
        
        logger.info(`Attempting to reconnect for ${connectionInfo.participantName} in ${delay}ms (attempt ${attempts + 1}/3)`);

        setTimeout(async () => {
            // Remove old connection
            this.connections.delete(connectionKey);

            // Try to start a new connection
            const success = await this.startTranscription(
                connectionKey,
                connectionInfo.callId,
                connectionInfo.roomName,
                connectionInfo.participantId,
                connectionInfo.participantName,
                connectionInfo.onTranscription
            );

            if (success) {
                logger.info(`Reconnection successful for ${connectionInfo.participantName}`);
                this.reconnectAttempts.set(connectionKey, 0);
            }
        }, delay);
    }

    /**
     * Send audio data to Deepgram for transcription
     * @param {string} connectionKey - Connection identifier
     * @param {Buffer|ArrayBuffer} audioData - Audio data in 16-bit PCM format
     * @returns {boolean} Success status
     */
    sendAudio(connectionKey, audioData) {
        const connectionInfo = this.connections.get(connectionKey);
        
        if (!connectionInfo) {
            logger.error(`❌ No connection found for ${connectionKey} - cannot send audio`);
            logger.error(`   Available connections: ${Array.from(this.connections.keys()).join(', ')}`);
            return false;
        }

        if (!connectionInfo.isOpen) {
            logger.error(`❌ Connection ${connectionKey} is not open (isOpen: ${connectionInfo.isOpen})`);
            return false;
        }
        
        if (connectionInfo.ws.readyState !== WebSocket.OPEN) {
            logger.error(`❌ WebSocket not open for ${connectionKey} (readyState: ${connectionInfo.ws.readyState})`);
            logger.error(`   WebSocket states: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED`);
            return false;
        }

        try {
            // Ensure we're sending a Buffer
            const buffer = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData);
            
            // Track chunk count for periodic logging
            if (!connectionInfo._chunkCount) {
                connectionInfo._chunkCount = 0;
                logger.info(`🎤 First audio chunk being sent to Deepgram for ${connectionInfo.participantName} (size: ${buffer.length} bytes)`);
            }
            connectionInfo._chunkCount++;
            connectionInfo.lastActivity = Date.now();
            
            // Log first chunk and periodically
            if (connectionInfo._chunkCount === 1) {
                logger.info(`✅ Successfully sent first audio chunk to Deepgram for ${connectionInfo.participantName}`);
            } else if (connectionInfo._chunkCount % 50 === 0) {
                logger.info(`📤 Sent ${connectionInfo._chunkCount} audio chunks to Deepgram for ${connectionInfo.participantName} (last chunk: ${buffer.length} bytes)`);
            }
            connectionInfo.ws.send(buffer);
            connectionInfo.lastActivity = Date.now();
            return true;
        } catch (error) {
            logger.error(`Error sending audio for ${connectionKey}:`, error.message);
            return false;
        }
    }

    /**
     * Stop transcription for a participant
     * @param {string} connectionKey - Connection identifier
     */
    stopTranscription(connectionKey) {
        const connectionInfo = this.connections.get(connectionKey);
        
        if (!connectionInfo) {
            return;
        }

        logger.info(`Stopping transcription for ${connectionInfo.participantName}`);

        try {
            if (connectionInfo.ws) {
                // Send close frame with normal closure code
                if (connectionInfo.ws.readyState === WebSocket.OPEN) {
                    connectionInfo.ws.close(1000, 'Transcription stopped');
                }
            }
        } catch (error) {
            logger.warn(`Error closing WebSocket for ${connectionKey}:`, error.message);
        }

        this.connections.delete(connectionKey);
        this.reconnectAttempts.delete(connectionKey);
    }

    /**
     * Stop all transcriptions for a specific call
     * @param {string} callId - Call identifier
     */
    stopAllForCall(callId) {
        const keysToRemove = [];
        
        this.connections.forEach((info, key) => {
            if (info.callId === callId) {
                keysToRemove.push(key);
            }
        });

        keysToRemove.forEach(key => {
            this.stopTranscription(key);
        });

        logger.info(`Stopped ${keysToRemove.length} transcriptions for call ${callId}`);
    }

    /**
     * Get connection statistics
     * @returns {Object}
     */
    getStats() {
        const stats = {
            available: this.isAvailable(),
            activeConnections: this.connections.size,
            connections: []
        };

        this.connections.forEach((info, key) => {
            stats.connections.push({
                key,
                participantName: info.participantName,
                callId: info.callId,
                isOpen: info.isOpen,
                lastActivity: info.lastActivity
            });
        });

        return stats;
    }

    /**
     * Clean up stale connections (inactive for more than 5 minutes)
     */
    cleanupStaleConnections() {
        const now = Date.now();
        const staleTimeout = 5 * 60 * 1000; // 5 minutes

        this.connections.forEach((info, key) => {
            if (now - info.lastActivity > staleTimeout) {
                logger.info(`Cleaning up stale connection for ${info.participantName}`);
                this.stopTranscription(key);
            }
        });
    }
}

// Export singleton instance
module.exports = new DeepgramService();
