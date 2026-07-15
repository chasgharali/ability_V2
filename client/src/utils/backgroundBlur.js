import { GaussianBlurBackgroundProcessor, isSupported } from '@twilio/video-processors';

export const BACKGROUND_BLUR_STORAGE_KEY = 'preferredBackgroundBlur';

const PROCESSOR_OPTIONS = {
  inputFrameBufferType: 'videoframe',
  outputFrameBufferContextType: 'bitmaprenderer'
};

let blurProcessorPromise = null;

/**
 * Whether the current browser can run Twilio background blur.
 */
export const isBackgroundBlurSupported = () => Boolean(isSupported);

/**
 * Read the user's saved background blur preference.
 */
export const isBackgroundBlurEnabled = () => {
  try {
    return localStorage.getItem(BACKGROUND_BLUR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

/**
 * Persist the user's background blur preference.
 * @param {boolean} enabled
 */
export const setBackgroundBlurEnabled = (enabled) => {
  try {
    localStorage.setItem(BACKGROUND_BLUR_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch (error) {
    console.warn('Unable to save background blur preference:', error);
  }
};

const getAssetsPath = () => {
  const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  return `${publicUrl}/twilio-video-processors`;
};

/**
 * Lazily create and load a shared Gaussian blur processor.
 * @returns {Promise<GaussianBlurBackgroundProcessor | null>}
 */
const getBlurProcessor = async () => {
  if (!isBackgroundBlurSupported()) {
    return null;
  }

  if (!blurProcessorPromise) {
    blurProcessorPromise = (async () => {
      const processor = new GaussianBlurBackgroundProcessor({
        assetsPath: getAssetsPath(),
        blurFilterRadius: 15,
        maskBlurRadius: 8
      });
      await processor.loadModel();
      return processor;
    })().catch((error) => {
      console.error('Failed to load background blur model:', error);
      blurProcessorPromise = null;
      throw error;
    });
  }

  return blurProcessorPromise;
};

/**
 * Apply background blur to a Twilio LocalVideoTrack when the preference is enabled.
 * Fails soft — call continues without blur if the processor cannot load.
 * @param {import('twilio-video').LocalVideoTrack | null | undefined} videoTrack
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<boolean>} true if blur was applied
 */
export const applyBackgroundBlurToTrack = async (videoTrack, options = {}) => {
  if (!videoTrack || typeof videoTrack.addProcessor !== 'function') {
    return false;
  }

  const shouldBlur = options.force === true || isBackgroundBlurEnabled();
  if (!shouldBlur || !isBackgroundBlurSupported()) {
    return false;
  }

  try {
    const processor = await getBlurProcessor();
    if (!processor) {
      return false;
    }

    // Avoid stacking processors if this track already has one.
    if (typeof videoTrack.processor !== 'undefined' && videoTrack.processor) {
      try {
        videoTrack.removeProcessor(videoTrack.processor);
      } catch {
        // Ignore remove errors from stale processors.
      }
    }

    videoTrack.addProcessor(processor, PROCESSOR_OPTIONS);
    return true;
  } catch (error) {
    console.error('Unable to apply background blur:', error);
    return false;
  }
};

/**
 * Remove any background processor from a video track.
 * @param {import('twilio-video').LocalVideoTrack | null | undefined} videoTrack
 */
export const removeBackgroundBlurFromTrack = (videoTrack) => {
  if (!videoTrack || typeof videoTrack.removeProcessor !== 'function') {
    return;
  }

  try {
    if (videoTrack.processor) {
      videoTrack.removeProcessor(videoTrack.processor);
    }
  } catch (error) {
    console.warn('Unable to remove background blur processor:', error);
  }
};
