import axios from 'axios';

// Helper function to get auth headers
function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

export const jobSeekerSurveyAPI = {
    // Get all job seeker survey data with filtering (for admins)
    getSurveys: async (filters = {}) => {
        const params = new URLSearchParams();
        
        Object.keys(filters).forEach(key => {
            if (filters[key] !== undefined && filters[key] !== '') {
                params.append(key, filters[key]);
            }
        });

        const response = await axios.get(`/api/job-seeker-survey?${params.toString()}`, { headers: authHeaders() });
        return response.data;
    },

    // Export survey data as CSV
    exportCSV: async (filters = {}) => {
        const params = new URLSearchParams();
        
        Object.keys(filters).forEach(key => {
            if (filters[key] !== undefined && filters[key] !== '') {
                params.append(key, filters[key]);
            }
        });

        try {
            const url = Object.keys(filters).length > 0 
                ? `/api/job-seeker-survey/export/csv?${params.toString()}`
                : '/api/job-seeker-survey/export/csv';
            
            const response = await axios.get(url, {
                headers: authHeaders(),
                responseType: 'blob',
                validateStatus: function (status) {
                    return status >= 200 && status < 500;
                }
            });
            
            if (response.status >= 400) {
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
            if (error.message) {
                throw error;
            }
            throw new Error(error.response?.data?.message || error.message || 'Failed to export CSV');
        }
    },

    // Get survey statistics
    getStats: async () => {
        const response = await axios.get('/api/job-seeker-survey/stats', { headers: authHeaders() });
        return response.data;
    }
};

export default jobSeekerSurveyAPI;

