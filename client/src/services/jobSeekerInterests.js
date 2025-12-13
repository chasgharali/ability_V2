import axios from 'axios';

// Helper function to get auth headers
function authHeaders() {
  const token = localStorage.getItem('token');
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
};

export default jobSeekerInterestsAPI;
