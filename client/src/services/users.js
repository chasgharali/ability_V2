import axios from 'axios';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

export async function listUsers({ page = 1, limit = 50, search = '', role = '', isActive } = {}) {
  const params = { page, limit };
  if (search) params.search = search;
  if (role) params.role = role;
  if (typeof isActive === 'boolean') params.isActive = String(isActive);
  const res = await axios.get('/api/users', { params, headers: authHeaders() });
  return res.data;
}

export async function getUser(id) {
  const res = await axios.get(`/api/users/${id}`, { headers: authHeaders() });
  return res.data;
}

export async function updateUser(id, payload) {
  const res = await axios.put(`/api/users/${id}`, payload, { headers: authHeaders() });
  return res.data;
}

export async function deactivateUser(id) {
  const res = await axios.delete(`/api/users/${id}`, { headers: authHeaders() });
  return res.data;
}

export async function reactivateUser(id) {
  const res = await axios.post(`/api/users/${id}/reactivate`, {}, { headers: authHeaders() });
  return res.data;
}

// There is no POST /api/users; use auth/register to create new users
export async function createUser(payload) {
  const res = await axios.post('/api/auth/register', payload, { headers: authHeaders() });
  return res.data;
}

// Attempt a permanent delete (server may not support this; expect 404/400)
export async function deleteUserPermanently(id) {
  // Try a conventional permanent delete endpoint first
  try {
    const res = await axios.delete(`/api/users/${id}?permanent=true`, { headers: authHeaders() });
    return res.data;
  } catch (e) {
    // Re-throw to be handled by caller for user-friendly messaging
    throw e;
  }
}
