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

export const termsConditionsAPI = {
    // Get all terms and conditions
    getAll: async (params = {}) => {
        const response = await api.get('/api/terms-conditions', { params });
        return response.data;
    },

    // Get active terms and conditions
    getActive: async () => {
        const response = await api.get('/api/terms-conditions/active');
        return response.data;
    },

    // Get terms and conditions by ID
    getById: async (id) => {
        const response = await api.get(`/api/terms-conditions/${id}`);
        return response.data;
    },

    // Create new terms and conditions
    create: async (data) => {
        const response = await api.post('/api/terms-conditions', data);
        return response.data;
    },

    // Update terms and conditions
    update: async (id, data) => {
        const response = await api.put(`/api/terms-conditions/${id}`, data);
        return response.data;
    },

    // Delete terms and conditions
    delete: async (id) => {
        const response = await api.delete(`/api/terms-conditions/${id}`);
        return response.data;
    },

    // Activate terms and conditions
    activate: async (id) => {
        const response = await api.put(`/api/terms-conditions/${id}/activate`);
        return response.data;
    },

    // Deactivate terms and conditions
    deactivate: async (id) => {
        const response = await api.put(`/api/terms-conditions/${id}/deactivate`);
        return response.data;
    },
};

export default termsConditionsAPI;
