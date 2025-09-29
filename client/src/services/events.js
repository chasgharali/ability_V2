import axios from 'axios';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

export async function listEvents({ page = 1, limit = 20 } = {}) {
  const res = await axios.get('/api/events', { params: { page, limit }, headers: authHeaders() });
  return res.data;
}

export async function createEvent(payload) {
  const res = await axios.post('/api/events', payload, { headers: authHeaders() });
  return res.data;
}

export async function updateEvent(id, payload) {
  const res = await axios.put(`/api/events/${id}`, payload, { headers: authHeaders() });
  return res.data;
}

export async function deleteEvent(id) {
  const res = await axios.delete(`/api/events/${id}`, { headers: authHeaders() });
  return res.data;
}
