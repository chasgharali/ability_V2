import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

// Create axios instance with default config
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add request interceptor to include auth token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add response interceptor to handle errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Token expired or invalid
            localStorage.removeItem('token');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export const notesAPI = {
    // Get all notes
    getAll: async (params = {}) => {
        const response = await api.get('/api/notes', { params });
        return response.data;
    },

    // Get notes by type for current user's role
    getByRole: async (type) => {
        const response = await api.get(`/api/notes/by-role/${type}`);
        return response.data;
    },

    // Get note by ID
    getById: async (id) => {
        const response = await api.get(`/api/notes/${id}`);
        return response.data;
    },

    // Create new note
    create: async (data) => {
        const response = await api.post('/api/notes', data);
        return response.data;
    },

    // Update note
    update: async (id, data) => {
        const response = await api.put(`/api/notes/${id}`, data);
        return response.data;
    },

    // Delete note
    delete: async (id) => {
        const response = await api.delete(`/api/notes/${id}`);
        return response.data;
    },
};

export default notesAPI;

