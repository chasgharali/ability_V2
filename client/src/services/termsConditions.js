import axios from 'axios';

// Helper function to get auth headers
function authHeaders() {
  const token = localStorage.getItem('token');
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

    // Mark terms as default template (SuperAdmin)
    setDefault: async (id) => {
        const response = await axios.post(`/api/terms-conditions/${id}/set-default`, {}, { headers: authHeaders() });
        return response.data;
    },

    // Remove terms from default template list (SuperAdmin)
    unsetDefault: async (id) => {
        const response = await axios.post(`/api/terms-conditions/${id}/unset-default`, {}, { headers: authHeaders() });
        return response.data;
    },

    // Copy terms template to a specific organization (SuperAdmin)
    copyToOrganization: async (id, targetOrganizationId, overwrite = false) => {
        const response = await axios.post(`/api/terms-conditions/${id}/copy-to-organization`, { targetOrganizationId, overwrite }, { headers: authHeaders() });
        return response.data;
    },

    // Sync missing default terms into an organization
    syncDefaults: async (organizationId = null) => {
        const payload = organizationId ? { organizationId } : {};
        const response = await axios.post('/api/terms-conditions/sync-defaults', payload, { headers: authHeaders() });
        return response.data;
    },
};

export default termsConditionsAPI;
