import axios from 'axios';

function authHeaders() {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
}

export const legalPagesAPI = {
    /**
     * Fetch a legal page by type ('terms-of-use' | 'privacy-policy').
     * No authentication required — used on the registration page and public footer.
     */
    getByType: async (type) => {
        const response = await axios.get(`/api/legal-pages/${type}`);
        return response.data;
    },

    /**
     * Save (create or update) a legal page. SuperAdmin only.
     */
    save: async (type, data) => {
        const response = await axios.put(`/api/legal-pages/${type}`, data, { headers: authHeaders() });
        return response.data;
    }
};

export default legalPagesAPI;
