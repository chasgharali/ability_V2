import axios from 'axios';

// Helper function to get auth headers
function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

export const notesAPI = {
    // Get all notes
    getAll: async (params = {}) => {
        const response = await axios.get('/api/notes', { params, headers: authHeaders() });
        return response.data;
    },

    // Get notes by type for current user's role
    getByRole: async (type) => {
        const response = await axios.get(`/api/notes/by-role/${type}`, { headers: authHeaders() });
        return response.data;
    },

    // Get note by ID
    getById: async (id) => {
        const response = await axios.get(`/api/notes/${id}`, { headers: authHeaders() });
        return response.data;
    },

    // Create new note
    create: async (data) => {
        const response = await axios.post('/api/notes', data, { headers: authHeaders() });
        return response.data;
    },

    // Update note
    update: async (id, data) => {
        const response = await axios.put(`/api/notes/${id}`, data, { headers: authHeaders() });
        return response.data;
    },

    // Delete note
    delete: async (id) => {
        const response = await axios.delete(`/api/notes/${id}`, { headers: authHeaders() });
        return response.data;
    },
};

export default notesAPI;





