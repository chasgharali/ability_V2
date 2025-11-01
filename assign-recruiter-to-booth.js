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
    
    // Find the f12 booth specifically
    let booth = await Booth.findOne({ 
      $or: [
        { name: { $regex: /f12/i } },
        { customInviteSlug: 'amazon-735202' },
        { name: { $regex: /amazon/i } }
      ]
    });
    
    if (!booth) {
      booth = await Booth.findOne({});
    }
    
    if (!booth) {
      console.log('No booth found');
      return;
    }
    
    console.log('Found booth:', booth.name);
    
    // Check if recruiter is already an administrator
    if (booth.administrators.includes(recruiter._id)) {
      console.log('Recruiter is already an administrator of this booth');
    } else {
      // Add recruiter as administrator
      booth.administrators.push(recruiter._id);
      await booth.save();
      console.log('Added recruiter as administrator to booth:', booth.name);
    }
    
    // Update booth with logos if they don't exist
    let updated = false;
    if (!booth.logoUrl) {
      booth.logoUrl = 'https://via.placeholder.com/100x50/ff9900/ffffff?text=f12';
      updated = true;
    }
    
    if (updated) {
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
