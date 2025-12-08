/**
 * AudioCapture - Captures audio from Twilio tracks and sends to server for transcription
 * 
 * This utility captures audio from Twilio Video audio tracks, converts it to the
 * format expected by Deepgram (16-bit PCM, 16kHz, mono), and streams it to the
 * server via Socket.IO.
 */

const SAMPLE_RATE = 16000; // Deepgram recommended sample rate
const BUFFER_SIZE = 4096;  // Audio processing buffer size

/**
 * AudioCapture class - handles audio capture and streaming for one participant
 */
export class AudioCapture {
  constructor(socket, callId, roomName, participantId, participantName) {
    this.socket = socket;
    this.callId = callId;
    this.roomName = roomName;
    this.participantId = participantId;
    this.participantName = participantName;
    
    // Audio processing state
    this.audioContext = null;
    this.mediaStreamSource = null;
    this.processor = null;
    this.isCapturing = false;
    this.chunksSent = 0;
    
    // Bind methods
    this.handleAudioProcess = this.handleAudioProcess.bind(this);
  }

  /**
   * Start capturing audio from a Twilio audio track
   * @param {LocalAudioTrack|RemoteAudioTrack} twilioTrack - Twilio audio track
   * @returns {Promise<boolean>} Success status
   */
  async startCapture(twilioTrack) {
    if (this.isCapturing) {
      console.warn(`[AudioCapture] Already capturing for ${this.participantName}`);
      return false;
    }

    if (!twilioTrack) {
      console.error('[AudioCapture] No audio track provided');
      return false;
    }

    try {
      console.log(`🎤 [AudioCapture] Starting capture for ${this.participantName}`);

      // Get the underlying MediaStreamTrack from Twilio track
      let mediaStreamTrack;
      
      if (twilioTrack.mediaStreamTrack) {
        // Direct access to mediaStreamTrack
        mediaStreamTrack = twilioTrack.mediaStreamTrack;
      } else if (typeof twilioTrack.attach === 'function') {
        // Create a temporary audio element to get the stream
        const audioElement = document.createElement('audio');
        twilioTrack.attach(audioElement);
        
        if (audioElement.srcObject) {
          const tracks = audioElement.srcObject.getAudioTracks();
          if (tracks.length > 0) {
            mediaStreamTrack = tracks[0];
          }
        }
        
        // Detach the temporary element
        twilioTrack.detach(audioElement);
      }

      if (!mediaStreamTrack) {
        console.error('[AudioCapture] Could not get MediaStreamTrack from Twilio track');
        return false;
      }

      // Create AudioContext with target sample rate
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: SAMPLE_RATE
      });

      // Create a MediaStream from the track
      const stream = new MediaStream([mediaStreamTrack]);

      // Create media stream source
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);

      // Create script processor for audio chunks
      // Note: ScriptProcessorNode is deprecated but still widely supported
      // For production, consider using AudioWorklet
      this.processor = this.audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
      
      // Set up audio processing
      this.processor.onaudioprocess = this.handleAudioProcess;

      // Connect the audio graph
      this.mediaStreamSource.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Notify server to start transcription
      this.socket.emit('caption-audio-stream', {
        callId: this.callId,
        roomName: this.roomName,
        participantId: this.participantId,
        participantName: this.participantName,
        isStart: true
      });

      this.isCapturing = true;
      this.chunksSent = 0;

      console.log(`✅ [AudioCapture] Started for ${this.participantName}`);
      return true;

    } catch (error) {
      console.error(`[AudioCapture] Failed to start capture for ${this.participantName}:`, error);
      this.cleanup();
      return false;
    }
  }

  /**
   * Handle audio processing - convert and send audio chunks
   * @param {AudioProcessingEvent} event - Audio processing event
   */
  handleAudioProcess(event) {
    if (!this.isCapturing || !this.socket) return;

    try {
      // Get audio data from input buffer (mono)
      const inputData = event.inputBuffer.getChannelData(0);
      
      // Convert Float32Array to Int16Array (16-bit PCM for Deepgram)
      const int16Data = this.float32ToInt16(inputData);
      
      // Convert to array for Socket.IO transmission
      const audioArray = Array.from(int16Data);

      // Send audio chunk to server
      const emitData = {
        callId: this.callId,
        roomName: this.roomName,
        participantId: this.participantId,
        participantName: this.participantName,
        audioChunk: audioArray
      };
      
      // Log first chunk details
      if (this.chunksSent === 0) {
        console.log(`📤 [AudioCapture] Sending first audio chunk to server:`, {
          callId: this.callId,
          roomName: this.roomName,
          participantId: this.participantId,
          chunkSize: audioArray.length,
          socketConnected: this.socket?.connected
        });
      }
      
      this.socket.emit('caption-audio-stream', emitData);

      this.chunksSent++;

      // Log every 10 chunks for debugging (approximately every 2.5 seconds at 16kHz)
      if (this.chunksSent % 10 === 0) {
        console.log(`📊 [AudioCapture] ${this.participantName}: sent ${this.chunksSent} chunks (chunk size: ${audioArray.length} samples)`);
      }
      
      // Log first chunk to verify audio is being captured
      if (this.chunksSent === 1) {
        console.log(`🎤 [AudioCapture] First audio chunk sent - audio capture is working!`);
        console.log(`   Chunk size: ${audioArray.length} samples, sample rate: 16000Hz`);
      }

    } catch (error) {
      console.error(`[AudioCapture] Error processing audio for ${this.participantName}:`, error);
    }
  }

  /**
   * Convert Float32 audio samples to Int16
   * @param {Float32Array} float32Array - Input audio samples (-1.0 to 1.0)
   * @returns {Int16Array} - Output audio samples (-32768 to 32767)
   */
  float32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp value to -1.0 to 1.0 range
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      // Convert to 16-bit signed integer
      int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
    
    return int16Array;
  }

  /**
   * Stop capturing audio
   */
  stopCapture() {
    if (!this.isCapturing) {
      return;
    }

    console.log(`🛑 [AudioCapture] Stopping capture for ${this.participantName}`);

    // Notify server to stop transcription
    if (this.socket) {
      this.socket.emit('caption-audio-stream', {
        callId: this.callId,
        roomName: this.roomName,
        participantId: this.participantId,
        participantName: this.participantName,
        isEnd: true
      });
    }

    this.cleanup();

    console.log(`✅ [AudioCapture] Stopped for ${this.participantName} (sent ${this.chunksSent} chunks)`);
  }

  /**
   * Clean up audio resources
   */
  cleanup() {
    this.isCapturing = false;

    // Disconnect and clean up audio nodes
    if (this.processor) {
      try {
        this.processor.onaudioprocess = null;
        this.processor.disconnect();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.processor = null;
    }

    if (this.mediaStreamSource) {
      try {
        this.mediaStreamSource.disconnect();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.mediaStreamSource = null;
    }

    if (this.audioContext) {
      try {
        if (this.audioContext.state !== 'closed') {
          this.audioContext.close();
        }
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.audioContext = null;
    }
  }

  /**
   * Check if currently capturing
   * @returns {boolean}
   */
  isActive() {
    return this.isCapturing;
  }

  /**
   * Get capture statistics
   * @returns {Object}
   */
  getStats() {
    return {
      participantId: this.participantId,
      participantName: this.participantName,
      isCapturing: this.isCapturing,
      chunksSent: this.chunksSent,
      audioContextState: this.audioContext?.state || 'none'
    };
  }
}

/**
 * CaptionManager - Manages caption capture for all participants in a call
 */
export class CaptionManager {
  constructor(socket, callId, roomName) {
    this.socket = socket;
    this.callId = callId;
    this.roomName = roomName;
    this.captures = new Map(); // Map of participantId -> AudioCapture
    this.isEnabled = false;
    
    // Set up socket listeners for caption events
    this.setupSocketListeners();
  }

  /**
   * Set up socket listeners for caption-related events
   */
  setupSocketListeners() {
    if (!this.socket) return;

    this.socket.on('caption-started', (data) => {
      console.log('✅ Caption transcription started:', data);
    });

    this.socket.on('caption-stopped', (data) => {
      console.log('🛑 Caption transcription stopped:', data);
    });

    this.socket.on('caption-error', (data) => {
      console.error('❌ Caption error:', data);
      // Optionally show error to user
      if (data.code === 'SERVICE_UNAVAILABLE') {
        console.warn('Caption service is not available. Falling back to browser-based captions.');
      }
    });
  }

  /**
   * Start capturing audio for a participant
   * @param {string} participantId - Participant identifier
   * @param {string} participantName - Participant display name
   * @param {LocalAudioTrack|RemoteAudioTrack} audioTrack - Twilio audio track
   * @returns {Promise<boolean>} Success status
   */
  async startCapture(participantId, participantName, audioTrack) {
    if (!this.isEnabled) {
      console.warn('[CaptionManager] Captions not enabled');
      return false;
    }

    if (this.captures.has(participantId)) {
      console.warn(`[CaptionManager] Already capturing for ${participantName}`);
      return false;
    }

    const capture = new AudioCapture(
      this.socket,
      this.callId,
      this.roomName,
      participantId,
      participantName
    );

    const success = await capture.startCapture(audioTrack);

    if (success) {
      this.captures.set(participantId, capture);
    }

    return success;
  }

  /**
   * Stop capturing audio for a participant
   * @param {string} participantId - Participant identifier
   */
  stopCapture(participantId) {
    const capture = this.captures.get(participantId);
    if (capture) {
      capture.stopCapture();
      this.captures.delete(participantId);
    }
  }

  /**
   * Enable captions - start capturing for all provided participants
   * @param {Array} participants - Array of {id, name, audioTrack} objects
   * @returns {Promise<number>} Number of successful captures started
   */
  async enable(participants = []) {
    this.isEnabled = true;
    let successCount = 0;

    for (const participant of participants) {
      const success = await this.startCapture(
        participant.id,
        participant.name,
        participant.audioTrack
      );
      if (success) successCount++;
    }

    console.log(`✅ [CaptionManager] Enabled - ${successCount}/${participants.length} captures started`);
    return successCount;
  }

  /**
   * Disable captions - stop all captures
   */
  disable() {
    console.log(`🛑 [CaptionManager] Disabling - stopping ${this.captures.size} captures`);

    this.captures.forEach((capture, participantId) => {
      capture.stopCapture();
    });

    this.captures.clear();
    this.isEnabled = false;

    // Notify server to stop all captions for this call
    if (this.socket) {
      this.socket.emit('caption-stop-all', { callId: this.callId });
    }
  }

  /**
   * Check if captions are enabled
   * @returns {boolean}
   */
  isActive() {
    return this.isEnabled;
  }

  /**
   * Get all capture statistics
   * @returns {Array}
   */
  getStats() {
    const stats = [];
    this.captures.forEach((capture) => {
      stats.push(capture.getStats());
    });
    return stats;
  }

  /**
   * Clean up and destroy manager
   */
  destroy() {
    this.disable();
    
    // Remove socket listeners
    if (this.socket) {
      this.socket.off('caption-started');
      this.socket.off('caption-stopped');
      this.socket.off('caption-error');
    }
  }
}

export default CaptionManager;
