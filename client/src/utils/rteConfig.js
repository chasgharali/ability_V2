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
 * @param {string} apiBaseUrl - Base URL for API endpoints
 * @returns {Object} Insert video settings
 */
export const getInsertVideoSettings = (apiBaseUrl = '') => ({
  saveUrl: `${apiBaseUrl}/api/uploads/rte-video`,
  removeUrl: `${apiBaseUrl}/api/uploads/rte-remove`,
  allowedTypes: ['.mp4', '.mov', '.wmv', '.avi', '.webm'],
  layoutOption: 'Inline',
  width: '560px',
  height: '315px',
  resize: true,
  resizeByPercent: false
});

/**
 * Get insert audio settings for S3 upload
 * @param {string} apiBaseUrl - Base URL for API endpoints
 * @returns {Object} Insert audio settings
 */
export const getInsertAudioSettings = (apiBaseUrl = '') => ({
  saveUrl: `${apiBaseUrl}/api/uploads/rte-audio`,
  removeUrl: `${apiBaseUrl}/api/uploads/rte-remove`,
  allowedTypes: ['.mp3', '.wav', '.ogg', '.webm', '.m4a'],
  layoutOption: 'Inline'
});

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
  height: 400
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
