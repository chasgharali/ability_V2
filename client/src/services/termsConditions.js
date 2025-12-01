import axios from 'axios';

// Helper function to get auth headers
function authHeaders() {
  const token = sessionStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

export const termsConditionsAPI = {
    // Get all terms and conditions
    getAll: async (params = {}) => {
        const response = await axios.get('/api/terms-conditions', { params, headers: authHeaders() });
        return response.data;
    },

    // Get active terms and conditions
    getActive: async () => {
        const response = await axios.get('/api/terms-conditions/active', { headers: authHeaders() });
        return response.data;
    },

    // Get terms and conditions by ID
    getById: async (id) => {
        const response = await axios.get(`/api/terms-conditions/${id}`, { headers: authHeaders() });
        return response.data;
    },

    // Create new terms and conditions
    create: async (data) => {
        const response = await axios.post('/api/terms-conditions', data, { headers: authHeaders() });
        return response.data;
    },

    // Update terms and conditions
    update: async (id, data) => {
        const response = await axios.put(`/api/terms-conditions/${id}`, data, { headers: authHeaders() });
        return response.data;
    },

    // Delete terms and conditions
    delete: async (id) => {
        const response = await axios.delete(`/api/terms-conditions/${id}`, { headers: authHeaders() });
        return response.data;
    },

    // Activate terms and conditions
    activate: async (id) => {
        const response = await axios.put(`/api/terms-conditions/${id}/activate`, {}, { headers: authHeaders() });
        return response.data;
    },

    // Deactivate terms and conditions
    deactivate: async (id) => {
        const response = await axios.put(`/api/terms-conditions/${id}/deactivate`, {}, { headers: authHeaders() });
        return response.data;
    },
};

export default termsConditionsAPI;
