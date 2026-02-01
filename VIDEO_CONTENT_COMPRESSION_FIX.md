# Video Content Compression Fix

## Problem
When users embed videos in event descriptions using the rich text editor, the generated HTML contains very long strings with video elements, JWT tokens, and URLs that exceed the 1000 character limit for the description field, causing validation errors.

## Root Cause
The rich text editor generates verbose HTML for video content:
```html
<span class="e-video-wrap" contenteditable="false" data-videosrc="/api/uploads/stream?key=video%2F697c6b4937938cf1ff0299d7%2Ftest_video.mov&token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...">
  <video class="e-rte-video e-video-inline" controls="" style="max-width: 100%;" data-videosrc="...">
    <source src="..." type="video/quicktime" />
  </video>
</span>
```

This can easily exceed 1000 characters with just one video.

## Solution
Implemented a video content compression system that:

1. **Extracts video information** from HTML before saving to database
2. **Stores videos as compact references** instead of full HTML
3. **Reconstructs video HTML** when displaying content
4. **Maintains backward compatibility** with existing content

## Implementation Details

### 1. Video Content Processor (`client/src/utils/videoContentProcessor.js`)
- `compressVideoContent()` - Extracts videos and replaces with `[VIDEO:id]` references
- `decompressVideoContent()` - Reconstructs full HTML from references
- `validateContentLength()` - Validates compressed content length
- `getCompressedCharacterCount()` - Gets character count after compression

### 2. Database Schema Update (`server/models/Event.js`)
Added `videoContent` field to store video references:
```javascript
videoContent: [{
    id: String,
    key: String,
    token: String,
    src: String
}]
```

### 3. Server-Side Processing (`server/routes/events.js`)
- Compresses video content before saving
- Decompresses when returning data
- Validates compressed content length

### 4. Client-Side Enhancements
- Updated RichTextEditor to show compressed character count
- Added validation utilities for event forms
- Real-time feedback on content length

### 5. Migration Script (`server/migrations/compress-event-video-content.js`)
Handles existing events with video content.

## Usage Examples

### Before (Problematic)
```html
<!-- 1200+ characters -->
<p>Event description with <span class="e-video-wrap" contenteditable="false" data-videosrc="/api/uploads/stream?key=video%2F697c6b4937938cf1ff0299d7%2Ftest_video.mov&token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTdjNmI0OTM3OTM4Y2YxZmYwMjk5ZDciLCJlbWFpbCI6InRhZG1pbi5hYmlsaXR5QHlvcG1haWwuY29tIiwicm9sZSI6IkFkbWluIiwiaWF0IjoxNzY5OTM2OTk4LCJleHAiOjE3NzA1NDE3OTh9.wO14dnHiOUNduqTl36qKM9_OAqGCCVPTMajPuHKoLOY">...</span></p>
```

### After (Compressed)
```html
<!-- ~50 characters -->
<p>Event description with [VIDEO:video_0]</p>
```

## Benefits

1. **Solves Character Limit Issue** - Compressed content stays under 1000 characters
2. **Maintains Functionality** - Videos still display and play correctly
3. **Backward Compatible** - Existing content continues to work
4. **Better Performance** - Smaller database storage and faster queries
5. **User-Friendly** - Clear feedback on content length with compression info

## Testing

### Test Cases
1. **Create event with video** - Should compress and save successfully
2. **Update event with video** - Should handle compression on updates
3. **Display event with video** - Should decompress and show full HTML
4. **Character count display** - Should show both raw and compressed counts
5. **Migration** - Should handle existing events with video content

### Manual Testing
1. Create an event with a video in the description
2. Verify the character count shows compression info
3. Save the event - should succeed even with long video HTML
4. View the event - video should display and play correctly
5. Edit the event - should load with full video HTML

## Migration Instructions

### For Existing Deployments
1. **Backup database** before running migration
2. **Run migration script**:
   ```bash
   cd server
   node migrations/compress-event-video-content.js
   ```
3. **Verify results** - Check that events with videos still display correctly

### For New Deployments
No migration needed - the system handles compression automatically.

## Files Modified

### Client-Side
- `client/src/utils/videoContentProcessor.js` (new)
- `client/src/utils/eventValidation.js` (new)
- `client/src/components/UI/RichTextEditor.js` (updated)

### Server-Side
- `server/models/Event.js` (updated)
- `server/routes/events.js` (updated)
- `server/migrations/compress-event-video-content.js` (new)

## Error Handling

The system gracefully handles:
- **Invalid video HTML** - Falls back to storing original content
- **Missing video data** - Uses available information to reconstruct
- **Token expiration** - Generates new streaming URLs when needed
- **Migration errors** - Logs errors but continues processing other events

## Future Considerations

1. **Token Refresh** - Consider implementing automatic token refresh for long-lived content
2. **Video Thumbnails** - Could add thumbnail generation for better performance
3. **Content Versioning** - Track changes to video content over time
4. **Bulk Operations** - Optimize for bulk video content processing

## Monitoring

Monitor these metrics:
- **Compression ratio** - How much space is saved
- **Migration success rate** - Percentage of events successfully migrated
- **Video playback errors** - Issues with decompressed content
- **Character limit violations** - Events still exceeding limits after compression