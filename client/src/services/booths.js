import axios from 'axios';

export async function listBooths({ page = 1, limit = 50, eventId } = {}) {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  const params = { page, limit };
  if (eventId) params.eventId = eventId;
  const res = await axios.get('/api/booths', { headers, params });
  return res.data;
}

// Create booths for one or more events
export async function createBooths(payload) {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  const res = await axios.post('/api/booths', payload, { headers });
  return res.data;
}

export async function updateBooth(id, payload) {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  const res = await axios.put(`/api/booths/${id}`, payload, { headers });
  return res.data;
}

export async function deleteBooth(id) {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  const res = await axios.delete(`/api/booths/${id}`, { headers });
  return res.data;
}

export async function updateBoothRichSections(id, sections) {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  const res = await axios.put(`/api/booths/${id}/rich-sections`, { sections }, { headers });
  return res.data;
}

// Resolve booth by invite slug for job seeker queue links
export async function resolveBoothInvite(slug) {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  const res = await axios.get(`/api/booths/invite/${encodeURIComponent(slug)}`, { headers });
  return res.data;
}
