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

export const jobSeekerInterestsAPI = {
    // Create or update interest in a booth
    createOrUpdateInterest: async (data) => {
        const response = await api.post('/api/job-seeker-interests', data);
        return response.data;
    },

    // Get job seeker's interests for a specific event
    getMyInterests: async (eventId) => {
        const response = await api.get(`/api/job-seeker-interests/my-interests/${eventId}`);
        return response.data;
    },

    // Get all job seekers interested in a specific booth (for recruiters/admins)
    getBoothInterests: async (boothId) => {
        const response = await api.get(`/api/job-seeker-interests/booth/${boothId}`);
        return response.data;
    },

    // Remove interest
    removeInterest: async (interestId) => {
        const response = await api.delete(`/api/job-seeker-interests/${interestId}`);
        return response.data;
    },

    // Toggle interest status
    toggleInterest: async (interestId) => {
        const response = await api.put(`/api/job-seeker-interests/${interestId}/toggle`);
        return response.data;
    },
};

export default jobSeekerInterestsAPI;
