import axios from 'axios';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

const roleMessagesAPI = {
  // Get all role messages (Admin only)
  async getAllMessages() {
    try {
      const response = await axios.get('/api/role-messages', { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error fetching all role messages:', error);
      throw error;
    }
  },

  // Get messages for a specific role
  async getMessagesByRole(role, screen = null) {
    try {
      const url = screen ? `/api/role-messages/${role}/${screen}` : `/api/role-messages/${role}`;
      const response = await axios.get(url, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error(`Error fetching role messages for ${role}:`, error);
      throw error;
    }
  },

  // Get a specific message
  async getMessage(role, screen, messageKey) {
    try {
      const response = await axios.get(`/api/role-messages/${role}/${screen}/${messageKey}`, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error(`Error fetching message:`, error);
      throw error;
    }
  },

  // Create or update a role message
  async setMessage(role, screen, messageKey, content, description = '') {
    try {
      const response = await axios.post('/api/role-messages', {
        role,
        screen,
        messageKey,
        content,
        description
      }, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error saving role message:', error);
      throw error;
    }
  },

  // Update a role message
  async updateMessage(id, content, description = '') {
    try {
      const response = await axios.put(`/api/role-messages/${id}`, {
        content,
        description
      }, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error updating role message:', error);
      throw error;
    }
  },

  // Delete a role message
  async deleteMessage(id) {
    try {
      const response = await axios.delete(`/api/role-messages/${id}`, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error deleting role message:', error);
      throw error;
    }
  }
};

export default roleMessagesAPI;

