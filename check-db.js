const mongoose = require('mongoose');

async function checkDatabase() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect('mongodb+srv://alidev1525:UW99QLF8wiqgJwmZ@cluster0.ik2v2ci.mongodb.net/ab_V2', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000
    });
    
    console.log('Connected successfully!');
    
    // Check collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Available collections:', collections.map(c => c.name));
    
    // Check if we have any events
    const Event = require('./server/models/Event');
    const events = await Event.find({}).limit(5);
    console.log('Events found:', events.length);
    events.forEach(e => console.log(`- ${e.name} (${e.slug})`));
    
    // Check if we have any booths
    const Booth = require('./server/models/Booth');
    const booths = await Booth.find({}).limit(5);
    console.log('Booths found:', booths.length);
    booths.forEach(b => console.log(`- ${b.name} (slug: ${b.customInviteSlug || 'none'})`));
    
    await mongoose.disconnect();
    console.log('Disconnected from database');
  } catch (error) {
    console.error('Database error:', error.message);
    process.exit(1);
  }
}

checkDatabase();
