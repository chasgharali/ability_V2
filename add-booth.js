const { MongoClient, ObjectId } = require('mongodb');

async function addTestBooth() {
  const client = new MongoClient('mongodb+srv://alidev1525:UW99QLF8wiqgJwmZ@cluster0.ik2v2ci.mongodb.net/ab_V2');
  
  try {
    await client.connect();
    console.log('Connected to MongoDB Atlas');
    
    const db = client.db('ab_V2');
    
    // Check if we have any events first
    const events = await db.collection('events').findOne({});
    let eventId = events ? events._id : new ObjectId();
    
    if (!events) {
      // Create a test event
      const newEvent = {
        _id: eventId,
        name: 'Test Event for Queue',
        slug: 'test-event-queue',
        description: 'Test event for booth queue testing',
        start: new Date(),
        end: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: 'active',
        createdBy: new ObjectId(),
        administrators: [],
        booths: [],
        stats: { totalRegistrations: 0, totalCalls: 0, totalInterpreterRequests: 0 },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await db.collection('events').insertOne(newEvent);
      console.log('Created test event:', newEvent.slug);
    } else {
      console.log('Using existing event:', events.slug);
    }
    
    // Check if booth with invite slug already exists
    const existingBooth = await db.collection('booths').findOne({ customInviteSlug: 'amazon-735202' });
    
    if (existingBooth) {
      console.log('Booth with invite slug amazon-735202 already exists:', existingBooth.name);
    } else {
      // Create the booth
      const newBooth = {
        _id: new ObjectId(),
        name: 'Amazon Recruitment Booth',
        description: 'Join our team at Amazon! We are looking for talented individuals.',
        customInviteSlug: 'amazon-735202',
        eventId: eventId,
        logoUrl: null,
        companyPage: 'https://amazon.com/careers',
        recruitersCount: 3,
        expireLinkTime: null,
        richSections: [],
        administrators: [],
        settings: {
          queueSettings: {
            maxQueueSize: 50,
            estimatedWaitTime: 15,
            allowQueueJoining: true
          },
          callSettings: {
            maxCallDuration: 30,
            allowInterpreterRequests: true,
            requireInterpreterApproval: false
          },
          displaySettings: {
            showLogo: true,
            showDescription: true,
            showRichSections: true
          }
        },
        status: 'active',
        stats: {
          totalMeetings: 0,
          totalDuration: 0,
          averageRating: 0,
          totalInterpreterRequests: 0
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await db.collection('booths').insertOne(newBooth);
      console.log('Created booth with invite slug:', newBooth.customInviteSlug);
      console.log('Booth ID:', newBooth._id);
      
      // Add booth to event's booths array
      await db.collection('events').updateOne(
        { _id: eventId },
        { $addToSet: { booths: newBooth._id } }
      );
    }
    
    await client.close();
    console.log('Database operation completed successfully!');
    
  } catch (error) {
    console.error('Error:', error);
    await client.close();
  }
}

addTestBooth();
