const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://alidev1525:UW99QLF8wiqgJwmZ@cluster0.ik2v2ci.mongodb.net/ab_V2';
const boothId = '68de8e6d5a66921a8ef25308';

async function quickCheck() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('ab_V2');
    const users = db.collection('users');
    
    // Check all users with Interpreter roles
    console.log('\n=== Checking Interpreter Users ===\n');
    
    const interpreters = await users.find({
      role: { $in: ['Interpreter', 'GlobalInterpreter'] }
    }).toArray();
    
    console.log(`Found ${interpreters.length} interpreters\n`);
    
    interpreters.forEach(int => {
      console.log(`📝 ${int.name} (${int.email})`);
      console.log(`   Role: ${int.role}`);
      console.log(`   Active: ${int.isActive !== false ? '✅ Yes' : '❌ No'}`);
      console.log(`   Available: ${int.isAvailable !== false ? '✅ Yes' : '❌ No'}`);
      console.log(`   Assigned Booth: ${int.assignedBooth || '(None - Global)'}`);
      console.log('');
    });
    
    // Check for booth-specific interpreters
    console.log(`\n=== Booth ${boothId} Interpreters ===\n`);
    const { ObjectId } = require('mongodb');
    
    const boothInterpreters = await users.find({
      role: 'Interpreter',
      assignedBooth: new ObjectId(boothId),
      isActive: { $ne: false }
    }).toArray();
    
    console.log(`Booth interpreters: ${boothInterpreters.length}`);
    boothInterpreters.forEach(int => console.log(`  - ${int.name} (${int.email})`));
    
    // Check for global interpreters
    console.log('\n=== Global Interpreters ===\n');
    const globalInterpreters = await users.find({
      role: 'GlobalInterpreter',
      isActive: { $ne: false }
    }).toArray();
    
    console.log(`Global interpreters: ${globalInterpreters.length}`);
    globalInterpreters.forEach(int => console.log(`  - ${int.name} (${int.email})`));
    
    // Check booth exists
    console.log('\n=== Checking Booth ===\n');
    const booths = db.collection('booths');
    const booth = await booths.findOne({ _id: new ObjectId(boothId) });
    
    if (booth) {
      console.log(`✅ Booth found: ${booth.name || booth.company}`);
    } else {
      console.log(`❌ Booth ${boothId} not found`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

quickCheck();
