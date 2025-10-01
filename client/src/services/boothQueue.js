import axios from 'axios';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

export const boothQueueAPI = {
  // Join a booth queue
  async joinQueue(queueData) {
    const res = await axios.post('/api/booth-queue/join', queueData, { 
      headers: authHeaders() 
    });
    return res.data;
  },

  // Leave a booth queue
  async leaveQueue(boothId) {
    const res = await axios.post('/api/booth-queue/leave', { boothId }, { 
      headers: authHeaders() 
    });
    return res.data;
  },

  // Get current queue status for a booth
  async getQueueStatus(boothId) {
    const res = await axios.get(`/api/booth-queue/status/${boothId}`, { 
      headers: authHeaders() 
    });
    return res.data;
  },

  // Get queue for a specific booth (recruiter view)
  async getBoothQueue(boothId) {
    const res = await axios.get(`/api/booth-queue/booth/${boothId}`, { 
      headers: authHeaders() 
    });
    return res.data;
  },

  // Invite a job seeker to meeting (recruiter action)
  async inviteToMeeting(queueId, meetingData) {
    const res = await axios.post(`/api/booth-queue/invite/${queueId}`, meetingData, { 
      headers: authHeaders() 
    });
    return res.data;
  },

  // Send message to recruiter while in queue
  async sendMessage(messageData) {
    const res = await axios.post('/api/booth-queue/message', messageData, { 
      headers: authHeaders() 
    });
    return res.data;
  },

  // Get messages for a queue entry (recruiter view)
  async getQueueMessages(queueId) {
    const res = await axios.get(`/api/booth-queue/messages/${queueId}`, { 
      headers: authHeaders() 
    });
    return res.data;
  },

  // Update queue serving number (recruiter action)
  async updateServingNumber(boothId, servingNumber) {
    const res = await axios.patch(`/api/booth-queue/serving/${boothId}`, 
      { servingNumber }, 
      { headers: authHeaders() }
    );
    return res.data;
  },

  // Remove job seeker from queue (recruiter action)
  async removeFromQueue(queueId) {
    const res = await axios.delete(`/api/booth-queue/remove/${queueId}`, { 
      headers: authHeaders() 
    });
    return res.data;
  }
};
