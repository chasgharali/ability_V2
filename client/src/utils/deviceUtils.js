/**
 * Utility functions for managing media device preferences
 */

/**
 * Validates if a device ID exists in the available devices
 * @param {string} deviceId - The device ID to validate
 * @param {MediaDeviceInfo[]} availableDevices - Array of available devices
 * @returns {boolean} - True if device exists, false otherwise
 */
export const isDeviceIdValid = (deviceId, availableDevices) => {
  if (!deviceId || !availableDevices || availableDevices.length === 0) {
    return false;
  }
  return availableDevices.some(device => device.deviceId === deviceId);
};

/**
 * Validates and clears invalid device IDs from sessionStorage
 * This should be called before attempting to use stored device preferences
 * @returns {Promise<{audioDeviceId: string | null, videoDeviceId: string | null}>}
 */
export const validateAndCleanDevicePreferences = async () => {
  try {
    // Request permissions to enumerate devices with labels
    let devices = [];
    try {
      // Try to get a temporary stream to access device labels
      const tempStream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: true 
      });
      devices = await navigator.mediaDevices.enumerateDevices();
      // Stop the temporary stream
      tempStream.getTracks().forEach(track => track.stop());
    } catch (err) {
      // If permission denied, still try to enumerate (may not have labels)
      devices = await navigator.mediaDevices.enumerateDevices();
    }

    const audioDevices = devices.filter(d => d.kind === 'audioinput');
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    const savedAudioDeviceId = sessionStorage.getItem('preferredAudioDeviceId');
    const savedVideoDeviceId = sessionStorage.getItem('preferredVideoDeviceId');

    let validAudioDeviceId = savedAudioDeviceId;
    let validVideoDeviceId = savedVideoDeviceId;

    // Validate audio device
    if (savedAudioDeviceId && !isDeviceIdValid(savedAudioDeviceId, audioDevices)) {
      console.warn('Invalid audio device ID found in sessionStorage, clearing:', savedAudioDeviceId);
      sessionStorage.removeItem('preferredAudioDeviceId');
      validAudioDeviceId = null;
    }

    // Validate video device
    if (savedVideoDeviceId && !isDeviceIdValid(savedVideoDeviceId, videoDevices)) {
      console.warn('Invalid video device ID found in sessionStorage, clearing:', savedVideoDeviceId);
      sessionStorage.removeItem('preferredVideoDeviceId');
      validVideoDeviceId = null;
    }

    return {
      audioDeviceId: validAudioDeviceId,
      videoDeviceId: validVideoDeviceId
    };
  } catch (error) {
    console.error('Error validating device preferences:', error);
    // On error, clear both preferences to be safe
    sessionStorage.removeItem('preferredAudioDeviceId');
    sessionStorage.removeItem('preferredVideoDeviceId');
    return {
      audioDeviceId: null,
      videoDeviceId: null
    };
  }
};

/**
 * Creates media constraints with device preferences, with fallback handling
 * @param {string | null} audioDeviceId - Preferred audio device ID
 * @param {string | null} videoDeviceId - Preferred video device ID
 * @returns {{audio: object, video: object}} - Media constraints
 */
export const createMediaConstraints = (audioDeviceId, videoDeviceId) => {
  const videoConstraints = {
    width: 1280,
    height: 720,
    frameRate: 30,
    facingMode: 'user',
    ...(videoDeviceId ? { deviceId: { ideal: videoDeviceId } } : {})
  };

  const audioConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(audioDeviceId ? { deviceId: { ideal: audioDeviceId } } : {})
  };

  return { audio: audioConstraints, video: videoConstraints };
};

/**
 * Creates media constraints with exact device matching (for Twilio)
 * Falls back to ideal if exact fails
 * @param {string | null} audioDeviceId - Preferred audio device ID
 * @param {string | null} videoDeviceId - Preferred video device ID
 * @returns {{audio: object, video: object}} - Media constraints
 */
export const createExactMediaConstraints = (audioDeviceId, videoDeviceId) => {
  const videoConstraints = {
    width: 1280,
    height: 720,
    frameRate: 30,
    facingMode: 'user',
    ...(videoDeviceId ? { deviceId: { exact: videoDeviceId } } : {})
  };

  const audioConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(audioDeviceId ? { deviceId: { exact: audioDeviceId } } : {})
  };

  return { audio: audioConstraints, video: videoConstraints };
};

