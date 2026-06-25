/**
 * Caption WebSocket server.
 *
 * Real-time caption audio is streamed over a DEDICATED raw WebSocket endpoint
 * (`/captions`) instead of the main Socket.IO connection. Streaming PCM audio
 * over Socket.IO saturated the same connection used for heartbeats, which caused
 * `ping timeout` / `transport error` disconnects during calls.
 *
 * Architecture:
 *  - Browser opens a WebSocket to `/captions?token=<jwt>`.
 *  - Client sends a JSON `{ type: 'start', callId, roomName, participantId, participantName }`
 *    control frame, then streams raw 16-bit PCM (16kHz mono) as BINARY frames.
 *  - Audio is forwarded to the active caption provider (Deepgram first).
 *  - Transcription RESULTS are small/infrequent and are broadcast back over the
 *    existing Socket.IO rooms (`call_<roomName>` / `video-call-<callId>`), so the
 *    client's caption rendering is unchanged.
 */

const WebSocket = require('ws');
const { URL } = require('url');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const { getCaptionService } = require('../services/captionProvider');

/** Normalized caption role for the client (recruiter | jobseeker | interpreter), or null. */
function captionParticipantRoleFromUser(user) {
    if (!user || !user.role) return null;
    const r = String(user.role).trim().toLowerCase();
    if (r === 'recruiter') return 'recruiter';
    if (r === 'jobseeker') return 'jobseeker';
    if (r === 'interpreter' || r === 'globalinterpreter') return 'interpreter';
    return null;
}

const HEARTBEAT_INTERVAL_MS = 30000;

/**
 * Attach a dedicated caption WebSocket server to the given HTTP server.
 * @param {http.Server} server - The shared HTTP server.
 * @param {import('socket.io').Server} io - Socket.IO server (used to broadcast results).
 * @returns {WebSocket.Server}
 */
const setupCaptionSocketServer = (server, io) => {
    const wss = new WebSocket.Server({ server, path: '/captions' });

    wss.on('connection', async (ws, req) => {
        // --- Authenticate via ?token=<jwt> ---
        let user = null;
        try {
            const requestUrl = new URL(req.url, 'http://localhost');
            const rawToken = requestUrl.searchParams.get('token');
            if (!rawToken) {
                ws.close(4001, 'Authentication token required');
                return;
            }
            const token = rawToken.startsWith('Bearer ') ? rawToken.slice(7) : rawToken;
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            user = await User.findById(decoded.userId).select('-hashedPassword -refreshTokens');
            if (!user || !user.isActive) {
                ws.close(4001, 'Invalid or inactive user');
                return;
            }
        } catch (error) {
            logger.warn(`Caption WS authentication failed: ${error.message}`);
            try { ws.close(4001, 'Authentication failed'); } catch { /* noop */ }
            return;
        }

        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

        let connectionKey = null;
        let service = null;

        const stop = async () => {
            if (connectionKey && service) {
                try {
                    await service.stopTranscription(connectionKey);
                } catch (error) {
                    logger.warn(`Caption WS stop error for ${connectionKey}: ${error.message}`);
                }
            }
            connectionKey = null;
            service = null;
        };

        ws.on('message', async (data, isBinary) => {
            // Binary frame => raw PCM audio chunk.
            if (isBinary) {
                if (connectionKey && service) {
                    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
                    service.sendAudio(connectionKey, buffer);
                }
                return;
            }

            // Text frame => JSON control message.
            let msg;
            try {
                msg = JSON.parse(data.toString());
            } catch {
                return;
            }

            if (msg.type === 'start') {
                const { callId, roomName, participantId, participantName } = msg;
                if (!callId || !roomName || !participantId) {
                    ws.send(JSON.stringify({
                        type: 'caption-error',
                        code: 'INVALID_START',
                        message: 'callId, roomName and participantId are required'
                    }));
                    return;
                }

                // Restart cleanly if a previous session is still open on this socket.
                await stop();

                const selected = getCaptionService();
                if (!selected.service) {
                    ws.send(JSON.stringify({
                        type: 'caption-error',
                        code: 'SERVICE_UNAVAILABLE',
                        message: 'Caption service not configured'
                    }));
                    return;
                }

                service = selected.service;
                connectionKey = `${callId}_${participantId}`;

                try {
                    await service.startTranscription(
                        connectionKey,
                        callId,
                        roomName,
                        participantId,
                        participantName || user.name,
                        (transcription) => {
                            const captionData = {
                                participantId: transcription.participantId,
                                participantName: transcription.participantName,
                                text: transcription.text,
                                isFinal: transcription.isFinal,
                                timestamp: transcription.timestamp,
                                confidence: transcription.confidence
                            };
                            const role = captionParticipantRoleFromUser(user);
                            if (role) captionData.participantRole = role;

                            // Results are small; broadcast over Socket.IO rooms (client already listens).
                            io.to(`call_${roomName}`).emit('caption-transcription', captionData);
                            io.to(`video-call-${callId}`).emit('caption-transcription', captionData);
                        }
                    );

                    ws.send(JSON.stringify({
                        type: 'caption-started',
                        connectionKey,
                        provider: selected.provider
                    }));
                    logger.info(`🎤 Caption WS started (${selected.provider}) for ${participantName || user.name} in call ${callId}`);
                } catch (error) {
                    logger.error(`Caption WS start failed for ${connectionKey}: ${error.message}`);
                    connectionKey = null;
                    service = null;
                    ws.send(JSON.stringify({ type: 'caption-error', code: 'START_FAILED' }));
                }
                return;
            }

            if (msg.type === 'stop') {
                await stop();
                ws.send(JSON.stringify({ type: 'caption-stopped' }));
            }
        });

        ws.on('close', () => { stop(); });
        ws.on('error', (error) => {
            logger.warn(`Caption WS error for ${user?.email}: ${error.message}`);
            stop();
        });
    });

    // Keep idle connections alive through proxies (audio pauses during silence).
    const heartbeat = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                ws.terminate();
                return;
            }
            ws.isAlive = false;
            try { ws.ping(); } catch { /* noop */ }
        });
    }, HEARTBEAT_INTERVAL_MS);

    wss.on('close', () => clearInterval(heartbeat));

    logger.info('✅ Caption WebSocket server listening on /captions');
    return wss;
};

module.exports = { setupCaptionSocketServer };
