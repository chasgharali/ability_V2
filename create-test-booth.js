const mongoose = require('mongoose');
const Booth = require('./server/models/Booth');
const Event = require('./server/models/Event');

async function createTestBooth() {
  try {
    await mongoose.connect('mongodb+srv://alidev1525:UW99QLF8wiqgJwmZ@cluster0.ik2v2ci.mongodb.net/ab_V2');
    
    // Find or create a test event
    let event = await Event.findOne({});
    if (!event) {
      event = await Event.create({
        name: 'Test Event',
        slug: 'test-event',
        start: new Date(),
        end: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdBy: new mongoose.Types.ObjectId()
      });
    }
    
    // Create or update booth with the invite slug
    let booth = await Booth.findOne({ customInviteSlug: 'amazon-735202' });
    if (!booth) {
      booth = await Booth.create({
        name: 'Amazon Booth',
        customInviteSlug: 'amazon-735202',
        eventId: event._id,
        description: 'Test booth for Amazon'
      });
      console.log('Created booth:', booth.name, 'with invite slug:', booth.customInviteSlug);
    } else {
      console.log('Booth already exists:', booth.name);
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

createTestBooth();
