import axios from 'axios';

function authHeaders() {
  const token = sessionStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

export const interpreterCategoriesAPI = {
  // Get all interpreter categories with pagination and filtering
  async getAll({ page = 1, limit = 20, active, search } = {}) {
    const params = { page, limit };
    if (active !== undefined) params.active = active;
    if (search) params.search = search;
    
    const res = await axios.get('/api/interpreter-categories', { 
      params, 
      headers: authHeaders() 
    });
    return res.data;
  },

  // Get active interpreter categories (for dropdowns)
  async getActive() {
    const res = await axios.get('/api/interpreter-categories/active', { 
      headers: authHeaders() 
    });
    return res.data;
  },

  // Get single interpreter category by ID
  async getById(id) {
    const res = await axios.get(`/api/interpreter-categories/${id}`, { 
      headers: authHeaders() 
    });
    return res.data;
  },

  // Create new interpreter category
  async create(categoryData) {
    const res = await axios.post('/api/interpreter-categories', categoryData, { 
      headers: authHeaders() 
    });
    return res.data;
  },

  // Update interpreter category
  async update(id, categoryData) {
    const res = await axios.put(`/api/interpreter-categories/${id}`, categoryData, { 
      headers: authHeaders() 
    });
    return res.data;
  },

  // Toggle category active status
  async toggleStatus(id) {
    const res = await axios.patch(`/api/interpreter-categories/${id}/toggle-status`, {}, { 
      headers: authHeaders() 
    });
    return res.data;
  },

  // Delete interpreter category
  async delete(id) {
    const res = await axios.delete(`/api/interpreter-categories/${id}`, { 
      headers: authHeaders() 
    });
    return res.data;
  }
};
