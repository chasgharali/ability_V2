const { MongoClient, ObjectId } = require('mongodb');

const uri = 'mongodb+srv://alidev1525:UW99QLF8wiqgJwmZ@cluster0.ik2v2ci.mongodb.net/ab_V2';
const boothId = '68de8e6d5a66921a8ef25308'; // meta booth
const interpreterEmail = 'asl@gmail.com';

async function fixInterpreter() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db('ab_V2');
    const users = db.collection('users');
    
    console.log('Choose how to fix the interpreter:\n');
    console.log('1. Make it a BOOTH interpreter (assigned to meta booth)');
    console.log('2. Make it a GLOBAL interpreter (available to all booths)\n');
    
    const option = process.argv[2];
    
    if (option === '1') {
      // Option 1: Assign to booth
      console.log('📝 Assigning interpreter to booth...\n');
      
      const result = await users.updateOne(
        { email: interpreterEmail },
        { 
          $set: { 
            assignedBooth: new ObjectId(boothId),
            role: 'Interpreter'
          } 
        }
      );
      
      if (result.modifiedCount > 0) {
        console.log('✅ SUCCESS! Interpreter assigned to meta booth');
        console.log(`   Interpreter: asl@gmail.com`);
        console.log(`   Booth: meta (${boothId})`);
      } else {
        console.log('⚠️  No changes made');
      }
      
    } else if (option === '2') {
      // Option 2: Make global
      console.log('📝 Converting to global interpreter...\n');
      
      const result = await users.updateOne(
        { email: interpreterEmail },
        { 
          $set: { 
            role: 'GlobalInterpreter'
          },
          $unset: {
            assignedBooth: ''
          }
        }
      );
      
      if (result.modifiedCount > 0) {
        console.log('✅ SUCCESS! Interpreter is now global');
        console.log(`   Interpreter: asl@gmail.com`);
        console.log(`   Available to: ALL booths`);
      } else {
        console.log('⚠️  No changes made');
      }
      
    } else {
      console.log('❌ Please specify option 1 or 2');
      console.log('\nUsage:');
      console.log('  node fix-interpreter.js 1    (assign to booth)');
      console.log('  node fix-interpreter.js 2    (make global)');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

fixInterpreter();
