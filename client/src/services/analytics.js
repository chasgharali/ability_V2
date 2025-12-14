import axios from 'axios';

function authHeaders() {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
}

export const analyticsAPI = {
    // Get analytics overview
    getOverview: async (filters = {}) => {
        const params = {};
        
        Object.keys(filters).forEach(key => {
            if (filters[key] !== '' && filters[key] !== null && filters[key] !== undefined) {
                params[key] = filters[key];
            }
        });

        const response = await axios.get('/api/analytics/overview', {
            params,
            headers: authHeaders()
        });
        return response.data;
    },

    // Get event analytics
    getEvents: async (filters = {}) => {
        const params = {};
        
        Object.keys(filters).forEach(key => {
            if (filters[key] !== '' && filters[key] !== null && filters[key] !== undefined) {
                params[key] = filters[key];
            }
        });

        const response = await axios.get('/api/analytics/events', {
            params,
            headers: authHeaders()
        });
        return response.data;
    },

    // Get booth analytics
    getBooths: async (filters = {}) => {
        const params = {};
        
        Object.keys(filters).forEach(key => {
            if (filters[key] !== '' && filters[key] !== null && filters[key] !== undefined) {
                params[key] = filters[key];
            }
        });

        const response = await axios.get('/api/analytics/booths', {
            params,
            headers: authHeaders()
        });
        return response.data;
    },

    // Get full event report
    getFullEventReport: async (eventId, filters = {}) => {
        const params = { eventId };
        
        Object.keys(filters).forEach(key => {
            if (filters[key] !== '' && filters[key] !== null && filters[key] !== undefined) {
                params[key] = filters[key];
            }
        });

        const response = await axios.get('/api/analytics/full-event-report', {
            params,
            headers: authHeaders()
        });
        return response.data;
    },

    // Export analytics as CSV
    exportCSV: async (type, filters = {}) => {
        const params = { type };
        
        Object.keys(filters).forEach(key => {
            if (filters[key] !== '' && filters[key] !== null && filters[key] !== undefined) {
                params[key] = filters[key];
            }
        });

        const response = await axios.get('/api/analytics/export/csv', {
            params,
            headers: authHeaders(),
            responseType: 'blob'
        });
        
        // Create download link
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `analytics-export-${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        
        return response.data;
    },

    // Live stats (online users, calls, queues)
    getLiveStats: async (filters = {}) => {
        const params = {};
        Object.keys(filters).forEach(key => {
            if (filters[key] !== '' && filters[key] !== null && filters[key] !== undefined) {
                params[key] = filters[key];
            }
        });

        const response = await axios.get('/api/analytics/live-stats', {
            params,
            headers: authHeaders()
        });
        return response.data;
    }
};

