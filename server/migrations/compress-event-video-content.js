/**
 * Migration: Compress video content in existing event descriptions
 * This migration finds events with video content in descriptions and compresses them
 * to avoid character limit issues.
 */

const mongoose = require('mongoose');
const Event = require('../models/Event');

/**
 * Compress video content in description to avoid character limit issues
 */
function compressVideoContent(htmlContent) {
    if (!htmlContent || typeof htmlContent !== 'string') {
        return { compressedHtml: htmlContent, videos: [] };
    }

    const videos = [];
    let compressedHtml = htmlContent;
    let videoIndex = 0;

    // Match video wrapper spans with data-videosrc attribute
    const videoWrapperRegex = /<span[^>]*class="e-video-wrap"[^>]*data-videosrc="([^"]*)"[^>]*>.*?<\/span>/gs;
    
    compressedHtml = compressedHtml.replace(videoWrapperRegex, (match, videoSrc) => {
        // Extract video information
        const videoId = `video_${videoIndex++}`;
        
        // Parse the video source URL to extract key and token
        const urlMatch = videoSrc.match(/key=([^&]+).*?token=([^&]+)/);
        if (urlMatch) {
            const [, key, token] = urlMatch;
            
            videos.push({
                id: videoId,
                key: decodeURIComponent(key),
                token: decodeURIComponent(token),
                src: videoSrc
            });
            
            // Replace with compact reference
            return `[VIDEO:${videoId}]`;
        }
        
        // Fallback: store the full src if we can't parse it
        videos.push({
            id: videoId,
            src: videoSrc
        });
        
        return `[VIDEO:${videoId}]`;
    });

    return { compressedHtml, videos };
}

async function migrateEventVideoContent() {
    try {
        console.log('Starting event video content compression migration...');
        
        // Find all events with descriptions containing video content
        const eventsWithVideo = await Event.find({
            description: { $regex: 'e-video-wrap', $options: 'i' }
        });
        
        console.log(`Found ${eventsWithVideo.length} events with video content`);
        
        let migratedCount = 0;
        let errorCount = 0;
        
        for (const event of eventsWithVideo) {
            try {
                const { compressedHtml, videos } = compressVideoContent(event.description);
                
                // Only update if compression actually reduced the size or found videos
                if (videos.length > 0 || compressedHtml.length < event.description.length) {
                    event.description = compressedHtml;
                    event.videoContent = videos;
                    
                    await event.save();
                    migratedCount++;
                    
                    console.log(`✓ Migrated event: ${event.name} (${event._id})`);
                    console.log(`  Original length: ${event.description.length}, Compressed: ${compressedHtml.length}, Videos: ${videos.length}`);
                }
            } catch (error) {
                console.error(`✗ Error migrating event ${event._id}:`, error.message);
                errorCount++;
            }
        }
        
        console.log(`\nMigration completed:`);
        console.log(`- Successfully migrated: ${migratedCount} events`);
        console.log(`- Errors: ${errorCount} events`);
        console.log(`- Total processed: ${eventsWithVideo.length} events`);
        
    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
}

// Run migration if called directly
if (require.main === module) {
    const dbConfig = require('../config/database');
    
    mongoose.connect(dbConfig.uri, dbConfig.options)
        .then(() => {
            console.log('Connected to MongoDB');
            return migrateEventVideoContent();
        })
        .then(() => {
            console.log('Migration completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = { migrateEventVideoContent, compressVideoContent };