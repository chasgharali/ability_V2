import axios from 'axios';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

const settingsAPI = {
  // Get all settings
  async getAllSettings() {
    try {
      const response = await axios.get('/api/settings', { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error fetching all settings:', error);
      throw error;
    }
  },

  // Get a specific setting
  async getSetting(key) {
    try {
      const response = await axios.get(`/api/settings/${key}`, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error(`Error fetching setting ${key}:`, error);
      throw error;
    }
  },

  // Create or update a setting
  async setSetting(key, value, description = '') {
    try {
      const response = await axios.post('/api/settings', {
        key,
        value,
        description
      }, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error saving setting:', error);
      throw error;
    }
  },

  // Delete a setting
  async deleteSetting(key) {
    try {
      const response = await axios.delete(`/api/settings/${key}`, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error deleting setting:', error);
      throw error;
    }
  }
};

export default settingsAPI;
