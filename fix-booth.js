const { MongoClient, ObjectId } = require('mongodb');

async function fixBooth() {
  const client = new MongoClient('mongodb+srv://alidev1525:UW99QLF8wiqgJwmZ@cluster0.ik2v2ci.mongodb.net/ab_V2');
  try {
    await client.connect();
    const db = client.db('ab_V2');
    
    // Update booth to ensure administrators field exists
    const result = await db.collection('booths').updateOne(
      { customInviteSlug: 'amazon-735202' },
      { $set: { administrators: [] } }
    );
    
    console.log('Updated booth administrators field:', result.modifiedCount);
    
    // Also check the event
    const event = await db.collection('events').findOne({ slug: '101-event' });
    if (event && !event.administrators) {
      await db.collection('events').updateOne(
        { slug: '101-event' },
        { $set: { administrators: [] } }
      );
      console.log('Updated event administrators field');
    }
    
    await client.close();
  } catch (error) {
    console.error('Error:', error.message);
    await client.close();
  }
}

fixBooth();
