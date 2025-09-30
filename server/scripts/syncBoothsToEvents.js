const mongoose = require('mongoose');
const Booth = require('../models/Booth');
const Event = require('../models/Event');

async function syncBoothsToEvents() {
    try {
        console.log('Starting booth sync...');

        // Get all booths
        const booths = await Booth.find({});
        console.log(`Found ${booths.length} booths`);

        // Group booths by event
        const boothsByEvent = {};
        booths.forEach(booth => {
            const eventId = booth.eventId.toString();
            if (!boothsByEvent[eventId]) {
                boothsByEvent[eventId] = [];
            }
            boothsByEvent[eventId].push(booth._id);
        });

        // Update each event's booths array
        for (const [eventId, boothIds] of Object.entries(boothsByEvent)) {
            await Event.findByIdAndUpdate(eventId, {
                $set: { booths: boothIds }
            });
            console.log(`Updated event ${eventId} with ${boothIds.length} booths`);
        }

        console.log('Booth sync completed successfully!');
    } catch (error) {
        console.error('Error syncing booths:', error);
    } finally {
        mongoose.connection.close();
    }
}

// Connect to MongoDB and run sync
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ability_v2')
    .then(() => {
        console.log('Connected to MongoDB');
        syncBoothsToEvents();
    })
    .catch(error => {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    });
