import axios from 'axios';

const API_BASE_URL = '/api/chats';

// Get auth token from sessionStorage
const getAuthToken = () => {
    const token = sessionStorage.getItem('token');
    return token ? `Bearer ${token}` : '';
};

// Axios instance with auth header
const axiosInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Add token to every request
axiosInstance.interceptors.request.use((config) => {
    const token = getAuthToken();
    if (token) {
        config.headers.Authorization = token;
    }
    return config;
});

// Get all chats for current user
export const getChats = async () => {
    try {
        const response = await axiosInstance.get('/');
        return response.data;
    } catch (error) {
        throw error.response?.data || error;
    }
};

// Get available participants
export const getParticipants = async () => {
    try {
        const response = await axiosInstance.get('/participants');
        return response.data;
    } catch (error) {
        throw error.response?.data || error;
    }
};

// Create or get direct chat
export const createDirectChat = async (participantId) => {
    try {
        const response = await axiosInstance.post('/direct', { participantId });
        return response.data;
    } catch (error) {
        throw error.response?.data || error;
    }
};

// Create group chat
export const createGroupChat = async (name, participantIds, boothId = null, eventId = null) => {
    try {
        const response = await axiosInstance.post('/group', {
            name,
            participantIds,
            boothId,
            eventId
        });
        return response.data;
    } catch (error) {
        throw error.response?.data || error;
    }
};

// Get messages for a chat
export const getMessages = async (chatId, limit = 50, skip = 0) => {
    try {
        const response = await axiosInstance.get(`/${chatId}/messages`, {
            params: { limit, skip }
        });
        return response.data;
    } catch (error) {
        throw error.response?.data || error;
    }
};

// Send message
export const sendMessage = async (chatId, content, type = 'text', fileUrl = null, fileName = null, fileSize = null) => {
    try {
        const response = await axiosInstance.post(`/${chatId}/messages`, {
            content,
            type,
            fileUrl,
            fileName,
            fileSize
        });
        return response.data;
    } catch (error) {
        throw error.response?.data || error;
    }
};

// Mark message as read
export const markAsRead = async (messageId) => {
    try {
        const response = await axiosInstance.put(`/messages/${messageId}/read`);
        return response.data;
    } catch (error) {
        throw error.response?.data || error;
    }
};

// Edit message
export const editMessage = async (messageId, content) => {
    try {
        const response = await axiosInstance.put(`/messages/${messageId}`, { content });
        return response.data;
    } catch (error) {
        throw error.response?.data || error;
    }
};

// Delete message
export const deleteMessage = async (messageId) => {
    try {
        const response = await axiosInstance.delete(`/messages/${messageId}`);
        return response.data;
    } catch (error) {
        throw error.response?.data || error;
    }
};
