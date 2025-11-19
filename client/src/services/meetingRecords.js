import axios from 'axios';
import { getApiUrl } from '../utils/apiConfig';

const API_BASE_URL = process.env.REACT_APP_API_URL 
  ? `${process.env.REACT_APP_API_URL}/api` 
  : `${getApiUrl()}/api`;

function authHeaders() {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
}

export const meetingRecordsAPI = {
    // Get meeting records with filtering and pagination
    getMeetingRecords: async (filters = {}) => {
        const params = new URLSearchParams();
        
        Object.keys(filters).forEach(key => {
            if (filters[key] !== '' && filters[key] !== null && filters[key] !== undefined) {
                params.append(key, filters[key]);
            }
        });

        const response = await axios.get(`${API_BASE_URL}/meeting-records?${params.toString()}`, {
            headers: authHeaders()
        });
        return response.data;
    },

    // Get single meeting record
    getMeetingRecord: async (id) => {
        const response = await axios.get(`${API_BASE_URL}/meeting-records/${id}`, {
            headers: authHeaders()
        });
        return response.data;
    },

    // Create meeting record from video call
    createFromVideoCall: async (videoCallId) => {
        const response = await axios.post(`${API_BASE_URL}/meeting-records/create-from-call`, {
            videoCallId
        }, {
            headers: authHeaders()
        });
        return response.data;
    },

    // Submit recruiter rating and feedback
    submitRating: async (meetingId, rating, feedback) => {
        const response = await axios.post(`${API_BASE_URL}/meeting-records/${meetingId}/rating`, {
            rating,
            feedback
        }, {
            headers: authHeaders()
        });
        return response.data;
    },

    // Get meeting statistics
    getStats: async (filters = {}) => {
        const params = new URLSearchParams();
        
        Object.keys(filters).forEach(key => {
            if (filters[key] !== '' && filters[key] !== null && filters[key] !== undefined) {
                params.append(key, filters[key]);
            }
        });

        const response = await axios.get(`${API_BASE_URL}/meeting-records/stats/overview?${params.toString()}`, {
            headers: authHeaders()
        });
        return response.data;
    },

    // Export meeting records as CSV
    exportCSV: async (filters = {}) => {
        const params = new URLSearchParams();
        
        Object.keys(filters).forEach(key => {
            if (filters[key] !== '' && filters[key] !== null && filters[key] !== undefined) {
                params.append(key, filters[key]);
            }
        });

        const response = await axios.get(`${API_BASE_URL}/meeting-records/export/csv?${params.toString()}`, {
            headers: authHeaders(),
            responseType: 'blob'
        });
        return response.data;
    },

    // Bulk delete meeting records
    bulkDelete: async (recordIds) => {
        const response = await axios.delete(`${API_BASE_URL}/meeting-records/bulk-delete`, {
            headers: authHeaders(),
            data: { recordIds }
        });
        return response.data;
    }
};

export default meetingRecordsAPI;
