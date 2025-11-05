const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID || 'process.env.TWILIO_ACCOUNT_SID';
const apiKeySid = process.env.TWILIO_API_KEY_SID || 'process.env.TWILIO_API_KEY_SID';
const apiKeySecret = process.env.TWILIO_API_KEY_SECRET || 'process.env.TWILIO_API_KEY_SECRET';

// Initialize Twilio client
const client = twilio(apiKeySid, apiKeySecret, { accountSid });

// Access Token for Video
const AccessToken = twilio.jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

/**
 * Generate access token for Twilio Video
 * @param {string} identity - User identity (unique identifier)
 * @param {string} roomName - Room name to join
 * @returns {string} Access token
 */
const generateAccessToken = (identity, roomName) => {
  // Create an access token
  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity: identity,
    ttl: 3600 // Token valid for 1 hour
  });

  // Create a Video grant
  const videoGrant = new VideoGrant({
    room: roomName
  });

  // Add the grant to the token
  token.addGrant(videoGrant);

  // Serialize the token to a JWT string
  return token.toJwt();
};

/**
 * Create or get existing Twilio Video room
 * @param {string} roomName - Unique room name
 * @param {string} type - Room type ('group', 'peer-to-peer', 'go')
 * @returns {Promise} Room object
 */
const createOrGetRoom = async (roomName, type = 'group') => {
  try {
    console.log('Attempting to fetch existing room:', roomName);
    // Try to fetch existing room
    const room = await client.video.rooms(roomName).fetch();
    console.log('Found existing room:', room.sid);
    return room;
  } catch (error) {
    console.log('Room fetch error:', error.code, error.message);
    if (error.code === 20404) {
      console.log('Room does not exist, creating new room:', roomName);
      // Room doesn't exist, create new one
      const room = await client.video.rooms.create({
        uniqueName: roomName,
        type: type,
        maxParticipants: 10, // Allow up to 10 participants (recruiter + jobseeker + interpreters)
        recordParticipantsOnConnect: false, // Don't auto-record
        videoCodecs: ['VP8', 'H264'], // Support multiple codecs for stability
        mediaRegion: 'us1' // Use US region for better performance
      });
      console.log('Created new room:', room.sid);
      return room;
    }
    console.error('Twilio room creation error:', error);
    throw error;
  }
};

/**
 * End a video room
 * @param {string} roomName - Room name to end
 * @returns {Promise} Room object
 */
const endRoom = async (roomName) => {
  try {
    console.log('📞 Twilio: Attempting to end room:', roomName);
    
    // First try to fetch the room to see if it exists
    let room;
    try {
      room = await client.video.rooms(roomName).fetch();
      console.log('📞 Twilio: Room found, status:', room.status);
      
      // If room is already completed, no need to update
      if (room.status === 'completed') {
        console.log('📞 Twilio: Room already completed');
        return room;
      }
    } catch (fetchError) {
      if (fetchError.code === 20404) {
        console.log('📞 Twilio: Room not found (already ended or never existed)');
        return null;
      }
      throw fetchError;
    }
    
    // Update room status to completed
    const updatedRoom = await client.video.rooms(roomName).update({
      status: 'completed'
    });
    console.log('✅ Twilio: Room ended successfully:', updatedRoom.sid);
    return updatedRoom;
  } catch (error) {
    console.error('❌ Twilio: Error ending room:', {
      message: error.message,
      code: error.code,
      status: error.status
    });
    throw error;
  }
};

/**
 * Get room participants
 * @param {string} roomName - Room name
 * @returns {Promise} Array of participants
 */
const getRoomParticipants = async (roomName) => {
  try {
    const participants = await client.video.rooms(roomName).participants.list();
    return participants;
  } catch (error) {
    console.error('Error getting room participants:', error);
    throw error;
  }
};

/**
 * Remove participant from room
 * @param {string} roomName - Room name
 * @param {string} participantSid - Participant SID
 * @returns {Promise} Participant object
 */
const removeParticipant = async (roomName, participantSid) => {
  try {
    const participant = await client.video.rooms(roomName)
      .participants(participantSid)
      .update({ status: 'disconnected' });
    return participant;
  } catch (error) {
    console.error('Error removing participant:', error);
    throw error;
  }
};

module.exports = {
  client,
  generateAccessToken,
  createOrGetRoom,
  endRoom,
  getRoomParticipants,
  removeParticipant
};
