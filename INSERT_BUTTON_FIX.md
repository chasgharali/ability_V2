# Insert Button Fix - Quick Test Guide

## Issue Fixed
The "Insert" button at the bottom of the video upload dialog was hidden under the editor content.

## Changes Made
Updated `client/src/App.css` with:

### 1. Dialog Structure
- Changed dialog to use flexbox layout (`display: flex`, `flex-direction: column`)
- Ensured proper centering with `transform: translate(-50%, -50%)`
- Set max dimensions: `max-width: 600px`, `max-height: 85vh`

### 2. Footer Visibility (Critical Fix)
```css
.e-dialog.e-rte-videodialog .e-footer-content {
    position: relative !important;
    z-index: 10001 !important;
    padding: 16px 20px !important;
    border-top: 1px solid #e5e7eb !important;
    background-color: #f9fafb !important;
    display: flex !important;
    justify-content: flex-end !important;
    flex-shrink: 0 !important;  /* Prevents footer from collapsing */
}
```

### 3. Insert/Cancel Buttons
```css
.e-dialog.e-rte-videodialog .e-footer-content .e-btn {
    position: relative !important;
    z-index: 10002 !important;  /* Above footer */
    min-width: 100px !important;
    padding: 10px 20px !important;
    cursor: pointer !important;
}
```

### 4. Content Area
```css
.e-dialog.e-rte-videodialog .e-dlg-content {
    padding: 20px !important;
    max-height: calc(85vh - 160px) !important;  /* Leaves room for header + footer */
    overflow-y: auto !important;
    flex: 1 1 auto !important;
}
```

## Quick Test Steps

### Test 1: Basic Visibility
1. Open BoothManagement page
2. Click "Video" button in any RTE toolbar
3. ✅ Verify Insert Video dialog appears centered
4. ✅ Verify dark overlay backdrop is visible
5. ✅ Verify BROWSE button is visible
6. ✅ **Verify Insert and Cancel buttons are VISIBLE at the bottom**

### Test 2: Button Interaction
1. Click BROWSE or drop a video file
2. ✅ Verify file name appears (e.g., "test video.mov 3.7 MB")
3. ✅ Verify radio buttons work (Embedded code / Web URL)
4. ✅ **Verify Insert button is clickable (not hidden)**
5. ✅ Verify Cancel button is clickable

### Test 3: Upload Flow
1. Select a small video file (e.g., .mov, .mp4)
2. Click Insert button
3. ✅ Verify dialog closes
4. ✅ Verify video uploads to S3
5. ✅ Verify `<video>` tag appears in editor with S3 URL
6. ✅ Verify video plays in editor

### Test 4: Responsive (Mobile)
1. Resize browser to mobile width (< 768px)
2. Open Insert Video dialog
3. ✅ Verify dialog is 95% width
4. ✅ Verify Insert/Cancel buttons are visible in row layout
5. ✅ Verify buttons are clickable on mobile

### Test 5: All RTE Instances
Test in all components:
- [ ] BoothManagement (3 placeholders)
- [ ] EventManagement (Information)
- [ ] Dashboard (3 booth placeholders)
- [ ] Notes (Content)
- [ ] Terms & Conditions (Content)

## Visual Indicators of Success

✅ **Insert button should:**
- Be visible at the bottom right of dialog
- Have black background (#000000)
- Show hover effect (changes to #333333)
- Be clearly above any scrolling content

✅ **Cancel button should:**
- Be visible next to Insert button
- Have light gray border
- Show hover effect (light gray background)

✅ **Footer should:**
- Have light gray background (#f9fafb)
- Have thin border on top (#e5e7eb)
- Be fixed at bottom (not scroll with content)

## Troubleshooting

### If Insert button still not visible:
1. **Clear browser cache** (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)
2. **Check browser console** for CSS conflicts
3. **Verify App.css loaded** - Check Network tab
4. **Check z-index** - Use browser DevTools to inspect footer z-index (should be 10001)

### If dialog appears off-center:
1. Check for custom CSS overriding `transform: translate(-50%, -50%)`
2. Verify dialog has `position: fixed`
3. Check for parent containers with `overflow: hidden`

## Before/After Comparison

### Before (Issue):
- Insert button hidden under editor content ❌
- Footer had no explicit z-index ❌
- Dialog structure not optimized for scrolling ❌

### After (Fixed):
- Insert button always visible with z-index: 10002 ✅
- Footer uses flex-shrink: 0 to prevent collapse ✅
- Dialog uses flexbox for proper layout ✅
- Content area scrolls independently ✅
- Responsive design for mobile ✅

## Files Modified
- `client/src/App.css` - Added/updated RTE dialog styles (lines ~26-150)

## Additional Features
- Mobile responsive layout
- Proper overlay backdrop
- Styled radio buttons
- Styled embedded code textarea
- File name display styling
- Hover effects on all buttons
