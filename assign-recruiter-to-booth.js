const mongoose = require('mongoose');
const Booth = require('./server/models/Booth');
const User = require('./server/models/User');

async function assignRecruiterToBooth() {
  try {
    await mongoose.connect('mongodb+srv://alidev1525:UW99QLF8wiqgJwmZ@cluster0.ik2v2ci.mongodb.net/ab_V2');
    
    // Find a recruiter user
    const recruiter = await User.findOne({ role: 'Recruiter' });
    if (!recruiter) {
      console.log('No recruiter found');
      return;
    }
    
    console.log('Found recruiter:', recruiter.name, recruiter.email);
    
    // Find booth dynamically - prefer booth that matches recruiter context or use first available
    let booth = null;
    
    // 1. If recruiter already has assignedBooth, use that
    if (recruiter.assignedBooth) {
      booth = await Booth.findById(recruiter.assignedBooth);
      console.log('Using recruiter\'s assigned booth:', booth?.name);
    }
    
    // 2. If no assigned booth, try to find booth that matches recruiter name/email
    if (!booth) {
      const recruiterIdentifier = (recruiter.name + ' ' + recruiter.email).toLowerCase();
      booth = await Booth.findOne({
        name: { $regex: new RegExp(recruiterIdentifier.split(' ').join('|'), 'i') }
      });
      if (booth) {
        console.log('Found booth matching recruiter context:', booth.name);
      }
    }
    
    // 3. Final fallback - use any available booth
    if (!booth) {
      booth = await Booth.findOne({});
      console.log('Using first available booth:', booth?.name);
    }
    
    if (!booth) {
      console.log('No booth found');
      return;
    }
    
    console.log('Found booth:', booth.name);
    
    // Sync both systems: User.assignedBooth and Booth.administrators
    let updated = false;
    
    // 1. Update User.assignedBooth if not set
    if (!recruiter.assignedBooth || recruiter.assignedBooth.toString() !== booth._id.toString()) {
      recruiter.assignedBooth = booth._id;
      await recruiter.save();
      console.log('Updated recruiter assignedBooth to:', booth.name);
      updated = true;
    }
    
    // 2. Add recruiter to Booth.administrators if not already there
    if (!booth.administrators.includes(recruiter._id)) {
      booth.administrators.push(recruiter._id);
      await booth.save();
      console.log('Added recruiter as administrator to booth:', booth.name);
      updated = true;
    }
    
    if (!updated) {
      console.log('Recruiter is already properly assigned to this booth');
    }
    
    // Update booth with logos if they don't exist
    let logoUpdated = false;
    if (!booth.logoUrl) {
      booth.logoUrl = 'https://via.placeholder.com/100x50/ff9900/ffffff?text=f12';
      logoUpdated = true;
    }
    
    if (logoUpdated) {
      await booth.save();
      console.log('Updated booth with logo');
    }
    
    // Update event with logo if it doesn't exist
    const Event = require('./server/models/Event');
    const event = await Event.findById(booth.eventId);
    if (event && !event.logoUrl) {
      event.logoUrl = 'https://via.placeholder.com/200x50/0066cc/ffffff?text=Test+Event';
      await event.save();
      console.log('Updated event with logo');
    }
    
    console.log('Setup complete!');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

assignRecruiterToBooth();
