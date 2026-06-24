/**
 * AudioCapture - Captures audio from Twilio tracks and sends to server for transcription
 *
 * This utility captures audio from Twilio Video audio tracks, converts it to the
 * format expected by Deepgram (16-bit PCM, 16kHz, mono), and streams it to the
 * server via Socket.IO.
 */

const SAMPLE_RATE = 16000; // Target sample rate
const BUFFER_SIZE = 4096; // Audio processing buffer size
/** RMS level below which a buffer is considered silence (0–1 range). */
const SILENCE_THRESHOLD = 0.003;

const PCM_CAPTURE_WORKLET_SOURCE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.silenceThreshold = options.processorOptions?.silenceThreshold ?? 0.003;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || channel.length === 0) {
      return true;
    }

    let sumSq = 0;
    for (let i = 0; i < channel.length; i++) {
      sumSq += channel[i] * channel[i];
    }
    const rms = Math.sqrt(sumSq / channel.length);
    if (rms < this.silenceThreshold) {
      return true;
    }

    const int16 = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      const sample = Math.max(-1, Math.min(1, channel[i]));
      int16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }

    this.port.postMessage(int16.buffer, [int16.buffer]);
    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
`;

const workletModulePromises = new WeakMap();

async function loadPcmCaptureWorklet(audioContext) {
  if (!audioContext?.audioWorklet) {
    throw new Error('AudioWorklet is not supported in this browser');
  }

  if (!workletModulePromises.has(audioContext)) {
    const loadPromise = (async () => {
      const blob = new Blob([PCM_CAPTURE_WORKLET_SOURCE], { type: 'application/javascript' });
      const moduleUrl = URL.createObjectURL(blob);
      try {
        await audioContext.audioWorklet.addModule(moduleUrl);
      } finally {
        URL.revokeObjectURL(moduleUrl);
      }
    })();
    workletModulePromises.set(audioContext, loadPromise);
  }

  return workletModulePromises.get(audioContext);
}

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
    this.workletNode = null;
    this.silentGain = null;
    this.isCapturing = false;
    this.chunksSent = 0;
    this.sampleBuffer = new Int16Array(BUFFER_SIZE);
    this.sampleBufferOffset = 0;

    this.handleWorkletMessage = this.handleWorkletMessage.bind(this);
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

      const mediaStreamTrack = this.resolveMediaStreamTrack(twilioTrack);
      if (!mediaStreamTrack) {
        console.error('[AudioCapture] Could not get MediaStreamTrack from Twilio track');
        return false;
      }

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: SAMPLE_RATE,
      });

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      await loadPcmCaptureWorklet(this.audioContext);

      const stream = new MediaStream([mediaStreamTrack]);
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-capture-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        processorOptions: {
          silenceThreshold: SILENCE_THRESHOLD,
        },
      });
      this.workletNode.port.onmessage = this.handleWorkletMessage;

      // Keep the graph alive without audible output.
      this.silentGain = this.audioContext.createGain();
      this.silentGain.gain.value = 0;
      this.mediaStreamSource.connect(this.workletNode);
      this.workletNode.connect(this.silentGain);
      this.silentGain.connect(this.audioContext.destination);

      this.socket.emit('caption-audio-stream', {
        callId: this.callId,
        roomName: this.roomName,
        participantId: this.participantId,
        participantName: this.participantName,
        isStart: true,
      });

      this.isCapturing = true;
      this.chunksSent = 0;
      this.sampleBufferOffset = 0;

      console.log(`✅ [AudioCapture] Started for ${this.participantName}`);
      return true;
    } catch (error) {
      console.error(`[AudioCapture] Failed to start capture for ${this.participantName}:`, error);
      this.cleanup();
      return false;
    }
  }

  resolveMediaStreamTrack(twilioTrack) {
    if (twilioTrack.mediaStreamTrack) {
      return twilioTrack.mediaStreamTrack;
    }

    if (typeof twilioTrack.attach === 'function') {
      const audioElement = document.createElement('audio');
      twilioTrack.attach(audioElement);

      let mediaStreamTrack = null;
      if (audioElement.srcObject) {
        const tracks = audioElement.srcObject.getAudioTracks();
        if (tracks.length > 0) {
          mediaStreamTrack = tracks[0];
        }
      }

      twilioTrack.detach(audioElement);
      return mediaStreamTrack;
    }

    return null;
  }

  /**
   * Accumulate worklet PCM chunks and emit fixed-size buffers to the server.
   * @param {MessageEvent<ArrayBuffer>} event
   */
  handleWorkletMessage(event) {
    if (!this.isCapturing || !this.socket || !event.data) return;

    try {
      const int16Chunk = new Int16Array(event.data);
      let chunkOffset = 0;

      while (chunkOffset < int16Chunk.length) {
        const remaining = BUFFER_SIZE - this.sampleBufferOffset;
        const toCopy = Math.min(remaining, int16Chunk.length - chunkOffset);
        this.sampleBuffer.set(
          int16Chunk.subarray(chunkOffset, chunkOffset + toCopy),
          this.sampleBufferOffset
        );
        this.sampleBufferOffset += toCopy;
        chunkOffset += toCopy;

        if (this.sampleBufferOffset >= BUFFER_SIZE) {
          this.emitAudioChunk(this.sampleBuffer.slice());
          this.sampleBufferOffset = 0;
        }
      }
    } catch (error) {
      console.error(`[AudioCapture] Error processing audio for ${this.participantName}:`, error);
    }
  }

  emitAudioChunk(int16Data) {
    const audioArray = Array.from(int16Data);
    const emitData = {
      callId: this.callId,
      roomName: this.roomName,
      participantId: this.participantId,
      participantName: this.participantName,
      audioChunk: audioArray,
    };

    if (this.chunksSent === 0) {
      console.log('📤 [AudioCapture] Sending first audio chunk to server:', {
        callId: this.callId,
        roomName: this.roomName,
        participantId: this.participantId,
        chunkSize: audioArray.length,
        socketConnected: this.socket?.connected,
      });
    }

    this.socket.emit('caption-audio-stream', emitData);
    this.chunksSent += 1;

    if (this.chunksSent % 10 === 0) {
      console.log(
        `📊 [AudioCapture] ${this.participantName}: sent ${this.chunksSent} chunks (chunk size: ${audioArray.length} samples)`
      );
    }

    if (this.chunksSent === 1) {
      console.log('🎤 [AudioCapture] First audio chunk sent - audio capture is working!');
      console.log(`   Chunk size: ${audioArray.length} samples, sample rate: 16000Hz`);
    }
  }

  /**
   * Stop capturing audio
   */
  stopCapture() {
    if (!this.isCapturing) {
      return;
    }

    console.log(`🛑 [AudioCapture] Stopping capture for ${this.participantName}`);

    if (this.socket) {
      this.socket.emit('caption-audio-stream', {
        callId: this.callId,
        roomName: this.roomName,
        participantId: this.participantId,
        participantName: this.participantName,
        isEnd: true,
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
    this.sampleBufferOffset = 0;

    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.workletNode = null;
    }

    if (this.silentGain) {
      try {
        this.silentGain.disconnect();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.silentGain = null;
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
      audioContextState: this.audioContext?.state || 'none',
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

    this.setupSocketListeners();
  }

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
      if (data.code === 'SERVICE_UNAVAILABLE') {
        console.warn('Caption service is not available. Falling back to browser-based captions.');
      }
    });
  }

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

  stopCapture(participantId) {
    const capture = this.captures.get(participantId);
    if (capture) {
      capture.stopCapture();
      this.captures.delete(participantId);
    }
  }

  async enable(participants = []) {
    this.isEnabled = true;
    let successCount = 0;

    for (const participant of participants) {
      const success = await this.startCapture(
        participant.id,
        participant.name,
        participant.audioTrack
      );
      if (success) successCount += 1;
    }

    console.log(`✅ [CaptionManager] Enabled - ${successCount}/${participants.length} captures started`);
    return successCount;
  }

  disable() {
    console.log(`🛑 [CaptionManager] Disabling - stopping ${this.captures.size} captures`);

    this.captures.forEach((capture) => {
      capture.stopCapture();
    });

    this.captures.clear();
    this.isEnabled = false;

    if (this.socket) {
      this.socket.emit('caption-stop-all', { callId: this.callId });
    }
  }

  isActive() {
    return this.isEnabled;
  }

  getStats() {
    const stats = [];
    this.captures.forEach((capture) => {
      stats.push(capture.getStats());
    });
    return stats;
  }

  destroy() {
    this.disable();

    if (this.socket) {
      this.socket.off('caption-started');
      this.socket.off('caption-stopped');
      this.socket.off('caption-error');
    }
  }
}

export default CaptionManager;
