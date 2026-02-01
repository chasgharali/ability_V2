/**
 * Rich Text Editor Dialog Helper Functions
 * Shared utilities for video/audio upload handling across all RTE components
 */

/**
 * Check if file is a video
 */
export const isVideoFile = (file) => {
  return (file.type || '').startsWith('video/');
};

/**
 * Check if file is audio
 */
export const isAudioFile = (file) => {
  return (file.type || '').startsWith('audio/');
};

/**
 * Close Syncfusion RTE media dialog
 */
export const closeRteMediaDialog = (rteInstance) => {
  setTimeout(() => {
    const dialogElement = document.querySelector('.e-dialog.e-rte-videodialog, .e-dialog.e-rte-audiodialog');
    if (dialogElement) {
      const closeBtn = dialogElement.querySelector('.e-dlg-closeicon-btn, .e-btn.e-cancel');
      if (closeBtn) {
        closeBtn.click();
      }
    }
  }, 50);
};

/**
 * Generate HTML for video element with proper Syncfusion attributes
 */
export const generateVideoHTML = (url, mimeType) => {
  return `<span class="e-video-wrap" contenteditable="false" data-videosrc="${url}">
    <video class="e-rte-video e-video-inline" controls style="max-width: 100%;" data-videosrc="${url}">
      <source src="${url}" type="${mimeType}">
    </video>
  </span>&nbsp;`;
};

/**
 * Generate HTML for audio element with proper Syncfusion attributes
 */
export const generateAudioHTML = (url, mimeType) => {
  return `<span class="e-audio-wrap" contenteditable="false" data-audiosrc="${url}">
    <audio class="e-rte-audio e-audio-inline" controls data-audiosrc="${url}">
      <source src="${url}" type="${mimeType}">
    </audio>
  </span>&nbsp;`;
};

/**
 * Get detailed error message from error object
 */
export const getUploadErrorMessage = (err, isVideo = true) => {
  const mediaType = isVideo ? 'video' : 'audio';
  const errorMessage = err.response?.data?.message || err.message || 'Upload failed';
  return `Failed to upload ${mediaType}: ${errorMessage}`;
};
