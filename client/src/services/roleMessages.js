import axios from 'axios';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

const roleMessagesAPI = {
  // Get all role messages (Admin only). SuperAdmin may scope by organization.
  async getAllMessages(organizationId) {
    try {
      const params = organizationId ? { organizationId } : {};
      const response = await axios.get('/api/role-messages', { headers: authHeaders(), params });
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
  async setMessage(role, screen, content, description = '', isPlatformDefault = false, organizationId = null) {
    try {
      const response = await axios.post('/api/role-messages', {
        role,
        screen,
        content,
        description,
        isPlatformDefault,
        ...(organizationId ? { organizationId } : {})
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
  },

  // Mark a page instruction as default template (SuperAdmin)
  async setDefaultMessage(id) {
    try {
      const response = await axios.post(`/api/role-messages/${id}/set-default`, {}, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error setting default role message:', error);
      throw error;
    }
  },

  // Remove page instruction from default template list (SuperAdmin)
  async unsetDefaultMessage(id) {
    try {
      const response = await axios.post(`/api/role-messages/${id}/unset-default`, {}, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error unsetting default role message:', error);
      throw error;
    }
  },

  // Copy page instruction template to a specific organization (SuperAdmin)
  async copyMessageToOrganization(id, targetOrganizationId, overwrite = false) {
    try {
      const response = await axios.post(`/api/role-messages/${id}/copy-to-organization`, { targetOrganizationId, overwrite }, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error copying role message to organization:', error);
      throw error;
    }
  },

  async syncDefaults(organizationId = null) {
    try {
      const payload = organizationId ? { organizationId } : {};
      const response = await axios.post('/api/role-messages/sync-defaults', payload, { headers: authHeaders() });
      return response.data;
    } catch (error) {
      console.error('Error syncing role message defaults:', error);
      throw error;
    }
  }
};

export default roleMessagesAPI;

