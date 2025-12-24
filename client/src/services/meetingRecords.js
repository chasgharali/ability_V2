import axios from 'axios';

function authHeaders() {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
}

export const meetingRecordsAPI = {
    // Get meeting records with filtering and pagination
    getMeetingRecords: async (filters = {}) => {
        const params = {};
        
        // Only add parameters if they have valid values (following pattern from other services)
        Object.keys(filters).forEach(key => {
            if (filters[key] !== '' && filters[key] !== null && filters[key] !== undefined) {
                params[key] = filters[key];
            }
        });

        const response = await axios.get('/api/meeting-records', {
            params,
            headers: authHeaders()
        });
        return response.data;
    },

    // Get single meeting record
    getMeetingRecord: async (id) => {
        const response = await axios.get(`/api/meeting-records/${id}`, {
            headers: authHeaders()
        });
        return response.data;
    },

    // Create meeting record from video call
    createFromVideoCall: async (videoCallId) => {
        const response = await axios.post('/api/meeting-records/create-from-call', {
            videoCallId
        }, {
            headers: authHeaders()
        });
        return response.data;
    },

    // Submit recruiter rating and feedback
    submitRating: async (meetingId, rating, feedback) => {
        const response = await axios.post(`/api/meeting-records/${meetingId}/rating`, {
            rating,
            feedback
        }, {
            headers: authHeaders()
        });
        return response.data;
    },

    // Get meeting statistics
    getStats: async (filters = {}) => {
        const params = {};
        
        // Only add parameters if they have valid values
        Object.keys(filters).forEach(key => {
            if (filters[key] !== '' && filters[key] !== null && filters[key] !== undefined) {
                params[key] = filters[key];
            }
        });

        const response = await axios.get('/api/meeting-records/stats/overview', {
            params,
            headers: authHeaders()
        });
        return response.data;
    },

    // Export meeting records as CSV
    exportCSV: async (filters = {}) => {
        const params = {};
        
        // Only add parameters if they have valid values
        Object.keys(filters).forEach(key => {
            if (filters[key] !== '' && filters[key] !== null && filters[key] !== undefined) {
                params[key] = filters[key];
            }
        });

        const response = await axios.get('/api/meeting-records/export/csv', {
            params,
            headers: authHeaders(),
            responseType: 'blob'
        });
        return response.data;
    },

    // Bulk delete meeting records
    bulkDelete: async (recordIds) => {
        const response = await axios.delete('/api/meeting-records/bulk-delete', {
            headers: authHeaders(),
            data: { recordIds }
        });
        return response.data;
    },

    // Get job seekers for resume export with proper filtering
    getJobSeekersForResumeExport: async (filters = {}, selectedIds = null) => {
        const params = {};
        
        // If specific IDs are provided, ONLY use those (ignore filters)
        if (selectedIds && selectedIds.length > 0) {
            params.selectedIds = selectedIds.join(',');
        } else {
            // No selection - apply filters
            Object.keys(filters).forEach(key => {
                // Exclude pagination and search params for export
                if (key !== 'page' && key !== 'limit' && key !== 'search' && key !== 'sortBy' && key !== 'sortOrder' &&
                    filters[key] !== '' && filters[key] !== null && filters[key] !== undefined) {
                    params[key] = filters[key];
                }
            });
        }

        const response = await axios.get('/api/meeting-records/export/resumes', {
            params,
            headers: authHeaders()
        });
        return response.data;
    }
};

export default meetingRecordsAPI;
