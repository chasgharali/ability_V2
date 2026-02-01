/**
 * Shared Rich Text Editor Configuration
 * This file contains the common configuration for Syncfusion Rich Text Editor
 * used throughout the application with full toolbar options.
 */

// Full toolbar items list with all supported Syncfusion toolbar items
export const RTE_TOOLBAR_ITEMS = [
  'Undo', 'Redo', '|',
  'Bold', 'Italic', 'Underline', 'StrikeThrough', 'InlineCode', '|',
  'FontName', 'FontSize', 'FontColor', 'BackgroundColor', '|',
  'LowerCase', 'UpperCase', '|',
  'SuperScript', 'SubScript', '|',
  'Formats', 'Alignments', '|',
  'OrderedList', 'UnorderedList', '|',
  'Outdent', 'Indent', '|',
  'CreateLink', 'Image', 'Video', 'Audio', '|',
  'CreateTable', '|',
  'EmojiPicker', '|',
  'ClearFormat', '|',
  'Print', 'FullScreen', '|',
  'SourceCode'
];

// Simplified toolbar for smaller editors
export const RTE_TOOLBAR_ITEMS_SIMPLE = [
  'Undo', 'Redo', '|',
  'Bold', 'Italic', 'Underline', '|',
  'FontName', 'FontSize', '|',
  'Formats', 'Alignments', '|',
  'OrderedList', 'UnorderedList', '|',
  'CreateLink', 'Image', '|',
  'SourceCode'
];

/**
 * Get the default toolbar settings for the Rich Text Editor
 * @param {Function} customImageHandler - Optional custom handler for image insertion
 * @returns {Object} Toolbar settings object
 */
export const getRteToolbarSettings = (customImageHandler = null) => {
  const items = [...RTE_TOOLBAR_ITEMS];
  
  // If a custom image handler is provided, replace the Image item
  if (customImageHandler) {
    const imageIndex = items.indexOf('Image');
    if (imageIndex !== -1) {
      items[imageIndex] = {
        id: 'custom-image',
        tooltipText: 'Insert Image',
        template: '<button class="e-tbar-btn e-btn" tabindex="-1" id="custom-image-btn"><span class="e-icons e-image e-btn-icon"></span></button>',
        click: customImageHandler
      };
    }
  }
  
  return {
    type: 'Expand',
    enableFloating: true,
    items: items
  };
};

/**
 * Get simple toolbar settings for smaller editors
 * @param {Function} customImageHandler - Optional custom handler for image insertion
 * @returns {Object} Toolbar settings object
 */
export const getRteToolbarSettingsSimple = (customImageHandler = null) => {
  const items = [...RTE_TOOLBAR_ITEMS_SIMPLE];
  
  if (customImageHandler) {
    const imageIndex = items.indexOf('Image');
    if (imageIndex !== -1) {
      items[imageIndex] = {
        id: 'custom-image-simple',
        tooltipText: 'Insert Image',
        template: '<button class="e-tbar-btn e-btn" tabindex="-1" id="custom-image-btn"><span class="e-icons e-image e-btn-icon"></span></button>',
        click: customImageHandler
      };
    }
  }
  
  return {
    type: 'MultiRow',
    enableFloating: true,
    items: items
  };
};

/**
 * Quick toolbar settings for contextual editing
 */
export const RTE_QUICK_TOOLBAR_SETTINGS = {
  table: [
    'TableHeader', 'TableRows', 'TableColumns', 'TableCell', '-',
    'BackgroundColor', 'TableRemove', 'TableCellVerticalAlign', 'Styles'
  ],
  link: ['Open', 'Edit', 'UnLink'],
  image: [
    'Replace', 'Align', 'Caption', 'Remove', 'InsertLink', 'OpenImageLink', '-',
    'EditImageLink', 'RemoveImageLink', 'Display', 'AltText', 'Dimension'
  ],
  video: ['VideoReplace', 'VideoAlign', 'VideoRemove', 'VideoLayoutOption', 'VideoDimension'],
  audio: ['AudioReplace', 'AudioRemove', 'AudioLayoutOption'],
  text: ['Bold', 'Italic', 'Underline', 'StrikeThrough', '-', 'FontName', 'FontSize', 'FontColor', '-', 'Formats', 'Alignments', '-', 'OrderedList', 'UnorderedList'],
  showOnRightClick: true
};

/**
 * Get insert image settings for S3 upload
 * @param {string} apiBaseUrl - Base URL for API endpoints
 * @returns {Object} Insert image settings
 */
export const getInsertImageSettings = (apiBaseUrl = '') => ({
  saveUrl: `${apiBaseUrl}/api/uploads/rte-image`,
  removeUrl: `${apiBaseUrl}/api/uploads/rte-remove`,
  display: 'inline',
  width: 'auto',
  height: 'auto',
  saveFormat: 'Base64', // Will be overridden by custom upload handler
  allowedTypes: ['.jpeg', '.jpg', '.png', '.gif', '.webp', '.svg'],
  resize: true,
  resizeByPercent: true,
  minWidth: '50',
  minHeight: '50'
});

/**
 * Get insert video settings for S3 upload
 * Note: saveUrl is required for upload dialog to work, but we intercept via fileUploading event
 * @returns {Object} Insert video settings
 */
export const getInsertVideoSettings = () => ({
  saveUrl: '/api/uploads/rte-video', // Required for dialog to work, but intercepted by fileUploading
  allowedTypes: ['.mp4', '.mov', '.webm', '.ogg', '.wmv', '.avi'],
  layoutOption: 'Inline',
  width: '560px',
  height: '315px',
  resize: true,
  resizeByPercent: false
});

/**
 * Get insert audio settings for S3 upload
 * Note: saveUrl is required for upload dialog to work, but we intercept via fileUploading event
 * @returns {Object} Insert audio settings
 */
export const getInsertAudioSettings = () => ({
  saveUrl: '/api/uploads/rte-audio', // Required for dialog to work, but intercepted by fileUploading
  allowedTypes: ['.mp3', '.wav', '.ogg', '.webm', '.m4a'],
  layoutOption: 'Inline'
});

/**
 * Find the .e-video-wrap or .e-audio-wrap that contains the given node or is the given node.
 */
function findMediaWrapper(node) {
  if (!node) return null;
  let current = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  while (current && current !== document.body) {
    if (current.classList && (current.classList.contains('e-video-wrap') || current.classList.contains('e-audio-wrap'))) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

/**
 * Enhanced key event handler so Backspace/Delete remove video/audio elements.
 * Handles: (1) selection inside the media, (2) cursor immediately after (Backspace), (3) cursor immediately before (Delete).
 */
export const handleRteKeyDown = (args) => {
  const event = args?.event;
  if (!event || typeof event.key !== 'string') {
    return true;
  }

  if (event.key !== 'Backspace' && event.key !== 'Delete') {
    return true;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return true;

  const range = selection.getRangeAt(0);
  let wrapper = null;

  // Case 1: Selection is inside or on the media element
  const container = range.commonAncestorContainer;
  wrapper = findMediaWrapper(container);
  if (wrapper) {
    event.preventDefault();
    try {
      wrapper.remove();
    } catch (err) {
      console.error('Error removing media element:', err);
    }
    return false;
  }

  // Case 2 (Backspace): Cursor is immediately after a media wrap – remove that wrap
  if (event.key === 'Backspace' && range.collapsed) {
    const startContainer = range.startContainer;
    const startOffset = range.startOffset;
    if (startContainer.nodeType === Node.ELEMENT_NODE && startOffset > 0) {
      const prev = startContainer.childNodes[startOffset - 1];
      wrapper = prev && (findMediaWrapper(prev) || (prev.classList && (prev.classList.contains('e-video-wrap') || prev.classList.contains('e-audio-wrap')) ? prev : null));
      if (wrapper === null && prev) wrapper = findMediaWrapper(prev);
    } else if (startContainer.nodeType === Node.TEXT_NODE && startOffset === 0) {
      const prev = startContainer.previousSibling;
      wrapper = prev && (findMediaWrapper(prev) || (prev.classList && (prev.classList.contains('e-video-wrap') || prev.classList.contains('e-audio-wrap')) ? prev : null));
      if (wrapper === null && prev) wrapper = findMediaWrapper(prev);
    }
    if (wrapper) {
      event.preventDefault();
      try {
        wrapper.remove();
      } catch (err) {
        console.error('Error removing media element:', err);
      }
      return false;
    }
  }

  // Case 3 (Delete): Cursor is immediately before a media wrap – remove that wrap
  if (event.key === 'Delete' && range.collapsed) {
    const startContainer = range.startContainer;
    const startOffset = range.startOffset;
    if (startContainer.nodeType === Node.ELEMENT_NODE && startOffset < startContainer.childNodes.length) {
      const next = startContainer.childNodes[startOffset];
      wrapper = next && (findMediaWrapper(next) || (next.classList && (next.classList.contains('e-video-wrap') || next.classList.contains('e-audio-wrap')) ? next : null));
      if (wrapper === null && next) wrapper = findMediaWrapper(next);
    } else if (startContainer.nodeType === Node.TEXT_NODE && startOffset === startContainer.length) {
      const next = startContainer.nextSibling;
      wrapper = next && (findMediaWrapper(next) || (next.classList && (next.classList.contains('e-video-wrap') || next.classList.contains('e-audio-wrap')) ? next : null));
      if (wrapper === null && next) wrapper = findMediaWrapper(next);
    }
    if (wrapper) {
      event.preventDefault();
      try {
        wrapper.remove();
      } catch (err) {
        console.error('Error removing media element:', err);
      }
      return false;
    }
  }

  return true;
};

/**
 * Default RTE configuration object combining all settings
 */
export const getDefaultRteConfig = (customImageHandler = null) => ({
  toolbarSettings: getRteToolbarSettings(customImageHandler),
  quickToolbarSettings: RTE_QUICK_TOOLBAR_SETTINGS,
  insertImageSettings: getInsertImageSettings(),
  insertVideoSettings: getInsertVideoSettings(),
  insertAudioSettings: getInsertAudioSettings(),
  enableXhtml: true,
  showCharCount: true,
  enableTabKey: true,
  enableResize: true,
  height: 550,
  // Add key event handler to prevent deletion errors
  keyDown: handleRteKeyDown
});

/**
 * List of all services needed for full RTE functionality
 * Import these in the component:
 * import { Toolbar, Image, Link, HtmlEditor, Count, QuickToolbar, Table, 
 *          EmojiPicker, Video, Audio, FormatPainter, PasteCleanup, Resize } from '@syncfusion/ej2-react-richtexteditor';
 */
export const RTE_REQUIRED_SERVICES = [
  'Toolbar',
  'Image',
  'Link',
  'HtmlEditor',
  'Count',
  'QuickToolbar',
  'Table',
  'EmojiPicker',
  'Video',
  'Audio',
  'FormatPainter',
  'PasteCleanup',
  'Resize'
];

export default {
  RTE_TOOLBAR_ITEMS,
  RTE_TOOLBAR_ITEMS_SIMPLE,
  getRteToolbarSettings,
  getRteToolbarSettingsSimple,
  RTE_QUICK_TOOLBAR_SETTINGS,
  getInsertImageSettings,
  getInsertVideoSettings,
  getInsertAudioSettings,
  getDefaultRteConfig,
  RTE_REQUIRED_SERVICES
};
