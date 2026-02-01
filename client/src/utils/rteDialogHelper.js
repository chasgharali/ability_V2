/**
 * Rich Text Editor Dialog Helper
 * Utility functions for handling Syncfusion RTE dialog operations
 */

/**
 * Close any open Syncfusion RTE media dialog (video/audio)
 * Uses multiple approaches to ensure the dialog closes properly
 */
export const closeRteMediaDialog = (rteInstance = null) => {
  // IMPORTANT:
  // Syncfusion's RTE video/audio dialog structure varies by version/theme.
  // This function closes it using:
  // 1) RTE module dialog objects (most reliable when available)
  // 2) DOM lookup (more permissive selectors)
  // 3) ESC key fallback
  // It also retries a few times to handle race conditions (dialog not yet mounted).

  const tryHideDialogObj = (dialogObj) => {
    try {
      if (dialogObj && typeof dialogObj.hide === 'function') {
        dialogObj.hide();
        return true;
      }
    } catch (e) {
      // ignore
    }
    return false;
  };

  const dispatchEscape = () => {
    try {
      const evt = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(evt);
    } catch (e) {
      // ignore
    }
  };

  const closeViaRteInstance = () => {
    const inst = rteInstance;
    if (!inst) return false;

    // These property names vary across Syncfusion versions.
    const candidates = [
      inst?.videoModule?.dialogObj,
      inst?.audioModule?.dialogObj,
      inst?.videoModule?.videoDialogObj,
      inst?.audioModule?.audioDialogObj,
      inst?.videoModule?.dialog,
      inst?.audioModule?.dialog,
      inst?.videoModule?.dlgObj,
      inst?.audioModule?.dlgObj,
    ];

    for (const dlg of candidates) {
      if (tryHideDialogObj(dlg)) return true;
    }
    return false;
  };

  const closeViaDom = () => {
    // Start with the most specific classes, but don't require `.e-dialog` on the same node.
    const roots = Array.from(
      document.querySelectorAll(
        [
          '.e-rte-videodialog',
          '.e-rte-audiodialog',
          '.e-dialog.e-rte-videodialog',
          '.e-dialog.e-rte-audiodialog',
        ].join(',')
      )
    )
      .map((el) => el.closest?.('.e-dialog') || el)
      .filter(Boolean);

    // If those classes aren't present, fall back to "any visible dialog that contains media insert buttons".
    if (roots.length === 0) {
      const dialogs = Array.from(document.querySelectorAll('.e-dialog'));
      for (const d of dialogs) {
        const hasMediaInsert =
          d.querySelector('.e-btn.e-insertMedia, button.e-insertMedia') ||
          d.querySelector('input[type="file"]');
        if (hasMediaInsert) roots.push(d);
      }
    }

    for (const dialogRoot of roots) {
      // Try Syncfusion dialog instance if attached
      const instArr = dialogRoot?.ej2_instances;
      if (instArr && instArr[0] && tryHideDialogObj(instArr[0])) return true;

      // Try close icon / cancel button
      const closeBtnX = dialogRoot.querySelector('.e-dlg-closeicon-btn');
      const cancelBtn = dialogRoot.querySelector('.e-btn.e-cancel, button.e-cancel');
      if (closeBtnX) {
        closeBtnX.click();
        return true;
      }
      if (cancelBtn) {
        cancelBtn.click();
        return true;
      }

      // CSS fallback
      dialogRoot.style.display = 'none';
      dialogRoot.style.visibility = 'hidden';
    }

    // Hide overlays if left behind
    const overlays = document.querySelectorAll('.e-dlg-overlay, .e-rte-dialog-overlay, .e-popup-overlay');
    overlays.forEach((o) => {
      try {
        o.style.display = 'none';
      } catch {
        // ignore
      }
    });

    return roots.length > 0;
  };

  const attemptOnce = () => {
    try {
      if (closeViaRteInstance()) return true;
      // ESC sometimes closes the active dialog (depending on focus)
      dispatchEscape();
      if (closeViaDom()) return true;
    } catch (error) {
      console.error('Error closing RTE dialog:', error);
    }
    return false;
  };

  // Retry a few times to handle race conditions
  const delays = [0, 60, 160, 320];
  delays.forEach((d) => {
    setTimeout(() => {
      attemptOnce();
    }, d);
  });
};

/**
 * Check if a file is a video
 * @param {File} file - The file to check
 * @returns {boolean}
 */
export const isVideoFile = (file) => {
  if (!file) return false;
  return (file.type || '').startsWith('video/');
};

/**
 * Check if a file is an audio
 * @param {File} file - The file to check
 * @returns {boolean}
 */
export const isAudioFile = (file) => {
  if (!file) return false;
  return (file.type || '').startsWith('audio/');
};

/**
 * Check if a file is a media file (video or audio)
 * @param {File} file - The file to check
 * @returns {boolean}
 */
export const isMediaFile = (file) => {
  return isVideoFile(file) || isAudioFile(file);
};

/**
 * Generate HTML for inserting video into RTE
 * @param {string} downloadUrl - The video URL
 * @param {string} mimeType - The video MIME type
 * @returns {string} HTML string
 */
export const generateVideoHTML = (downloadUrl, mimeType) => {
  return `<span class="e-video-wrap" contenteditable="false" data-videosrc="${downloadUrl}">
    <video class="e-rte-video e-video-inline" controls preload="metadata" src="${downloadUrl}" style="max-width: 100%;" data-videosrc="${downloadUrl}">
      <source src="${downloadUrl}" type="${mimeType}">
    </video>
  </span>&nbsp;`;
};

/**
 * Generate HTML for inserting audio into RTE
 * @param {string} downloadUrl - The audio URL
 * @param {string} mimeType - The audio MIME type
 * @returns {string} HTML string
 */
export const generateAudioHTML = (downloadUrl, mimeType) => {
  return `<span class="e-audio-wrap" contenteditable="false" data-audiosrc="${downloadUrl}">
    <audio class="e-rte-audio e-audio-inline" controls preload="metadata" src="${downloadUrl}" data-audiosrc="${downloadUrl}">
      <source src="${downloadUrl}" type="${mimeType}">
    </audio>
  </span>&nbsp;`;
};
