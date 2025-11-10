import axios from 'axios';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

const videoCallService = {
  /**
   * Create a new video call
   * @param {string} queueId - Queue entry ID
   * @returns {Promise} API response
   */
  createCall: async (queueId) => {
    try {
      const response = await axios.post('/api/video-call/create', { queueId }, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error creating video call:', error);
      throw error.response?.data || error;
    }
  },

  /**
   * Join an existing video call
   * @param {string} callId - Video call ID
   * @returns {Promise} API response
   */
  joinCall: async (callId) => {
    try {
      const response = await axios.post('/api/video-call/join', { callId }, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error joining video call:', error);
      throw error.response?.data || error;
    }
  },

  /**
   * Invite interpreter to call
   * @param {string} callId - Video call ID
   * @param {string} interpreterId - Interpreter user ID
   * @param {string} interpreterCategory - Interpreter category (optional)
   * @returns {Promise} API response
   */
  inviteInterpreter: async (callId, interpreterId, interpreterCategory) => {
    try {
      const response = await axios.post('/api/video-call/invite-interpreter', {
        callId,
        interpreterId,
        interpreterCategory
      }, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error inviting interpreter:', error);
      throw error.response?.data || error;
    }
  },

  /**
   * Send chat message during call
   * @param {string} callId - Video call ID
   * @param {string} message - Message content
   * @returns {Promise} API response
   */
  sendMessage: async (callId, message) => {
    try {
      const response = await axios.post('/api/video-call/send-message', {
        callId,
        message
      }, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error.response?.data || error;
    }
  },

  /**
   * Leave video call (participant leaves, call continues for others)
   * @param {string} callId - Video call ID
   * @returns {Promise} API response
   */
  leaveCall: async (callId) => {
    try {
      const response = await axios.post('/api/video-call/leave', { callId }, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error leaving video call:', error);
      throw error.response?.data || error;
    }
  },

  /**
   * End video call for everyone (recruiter only)
   * @param {string} callId - Video call ID
   * @returns {Promise} API response
   */
  endCall: async (callId) => {
    try {
      const response = await axios.post('/api/video-call/end', { callId }, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error ending video call:', error);
      throw error.response?.data || error;
    }
  },

  /**
   * Get user's active call
   * @returns {Promise} API response
   */
  getActiveCall: async () => {
    try {
      const response = await axios.get('/api/video-call/active', { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error getting active call:', error);
      throw error.response?.data || error;
    }
  },

  /**
   * Get call details
   * @param {string} callId - Video call ID
   * @returns {Promise} API response
   */
  getCallDetails: async (callId) => {
    try {
      const response = await axios.get(`/api/video-call/${callId}`, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error getting call details:', error);
      throw error.response?.data || error;
    }
  }
};

export default videoCallService;
