const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./server/models/User');

async function checkInterpreters() {
  try {
    await mongoose.connect('mongodb+srv://alidev1525:UW99QLF8wiqgJwmZ@cluster0.ik2v2ci.mongodb.net/ab_V2', {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    console.log('Connected to database');
    
    // Wait a moment for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check all interpreters
    const allInterpreters = await User.find({
      role: { $in: ['Interpreter', 'GlobalInterpreter'] }
    }).select('name email role assignedBooth isActive isAvailable');

    console.log('\n=== ALL INTERPRETERS ===');
    console.log(`Total interpreters found: ${allInterpreters.length}\n`);

    allInterpreters.forEach(interpreter => {
      console.log(`Name: ${interpreter.name}`);
      console.log(`Email: ${interpreter.email}`);
      console.log(`Role: ${interpreter.role}`);
      console.log(`Assigned Booth: ${interpreter.assignedBooth || 'None (Global)'}`);
      console.log(`Is Active: ${interpreter.isActive !== undefined ? interpreter.isActive : 'undefined (will default to true)'}`);
      console.log(`Is Available: ${interpreter.isAvailable !== undefined ? interpreter.isAvailable : 'undefined (will default to true)'}`);
      console.log('---');
    });

    // Check booth interpreters
    const boothInterpreters = await User.find({
      role: 'Interpreter',
      isActive: true
    });
    console.log(`\nBooth Interpreters (active): ${boothInterpreters.length}`);

    // Check global interpreters
    const globalInterpreters = await User.find({
      role: 'GlobalInterpreter',
      isActive: true
    });
    console.log(`Global Interpreters (active): ${globalInterpreters.length}`);

    // Show all booths for reference
    const Booth = require('./server/models/Booth');
    const booths = await Booth.find({}).select('_id name company');
    console.log('\n=== ALL BOOTHS ===');
    booths.forEach(booth => {
      console.log(`Booth ID: ${booth._id} - ${booth.name || booth.company}`);
    });

    await mongoose.disconnect();
    console.log('\nDisconnected from database');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkInterpreters();
