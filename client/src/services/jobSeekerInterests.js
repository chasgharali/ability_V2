import axios from 'axios';

// Helper function to get auth headers
function authHeaders() {
  const token = sessionStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

export const jobSeekerInterestsAPI = {
    // Get all job seeker interests with filtering (for admins/recruiters)
    getInterests: async (filters = {}) => {
        const params = new URLSearchParams();
        
        Object.keys(filters).forEach(key => {
            if (filters[key] !== undefined && filters[key] !== '') {
                params.append(key, filters[key]);
            }
        });

        const response = await axios.get(`/api/job-seeker-interests?${params.toString()}`, { headers: authHeaders() });
        return response.data;
    },

    // Create or update interest in a booth
    createOrUpdateInterest: async (data) => {
        const response = await axios.post('/api/job-seeker-interests', data, { headers: authHeaders() });
        return response.data;
    },

    // Get job seeker's interests for a specific event
    getMyInterests: async (eventId) => {
        const response = await axios.get(`/api/job-seeker-interests/my-interests/${eventId}`, { headers: authHeaders() });
        return response.data;
    },

    // Get all job seekers interested in a specific booth (for recruiters/admins)
    getBoothInterests: async (boothId) => {
        const response = await axios.get(`/api/job-seeker-interests/booth/${boothId}`, { headers: authHeaders() });
        return response.data;
    },

    // Remove interest
    removeInterest: async (interestId) => {
        const response = await axios.delete(`/api/job-seeker-interests/${interestId}`, { headers: authHeaders() });
        return response.data;
    },

    // Toggle interest status
    toggleInterest: async (interestId) => {
        const response = await axios.put(`/api/job-seeker-interests/${interestId}/toggle`, {}, { headers: authHeaders() });
        return response.data;
    },

    // Export interests as CSV
    exportCSV: async (filters = {}) => {
        const params = new URLSearchParams();
        
        Object.keys(filters).forEach(key => {
            if (filters[key] !== undefined && filters[key] !== '') {
                params.append(key, filters[key]);
            }
        });

        try {
            // Build URL - if no params, just use base URL (will export all)
            const url = Object.keys(filters).length > 0 
                ? `/api/job-seeker-interests/export/csv?${params.toString()}`
                : '/api/job-seeker-interests/export/csv';
            
            console.log('🌐 Export URL:', url);
            
            const response = await axios.get(url, {
                headers: authHeaders(),
                responseType: 'blob',
                validateStatus: function (status) {
                    // Accept both success and error status codes
                    return status >= 200 && status < 500;
                }
            });
            
            // Check if response is an error (status >= 400)
            if (response.status >= 400) {
                // Try to parse error message from blob
                const text = await response.data.text();
                let errorData;
                try {
                    errorData = JSON.parse(text);
                } catch {
                    errorData = { message: `Server error: ${response.status}` };
                }
                throw new Error(errorData.message || errorData.error || 'Export failed');
            }
            
            return response.data;
        } catch (error) {
            // If it's already an Error with message, re-throw it
            if (error.message) {
                throw error;
            }
            // Otherwise, wrap axios errors
            throw new Error(error.response?.data?.message || error.message || 'Failed to export CSV');
        }
    },
};

export default jobSeekerInterestsAPI;
