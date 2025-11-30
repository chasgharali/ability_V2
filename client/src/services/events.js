import axios from 'axios';

function authHeaders() {
  const token = sessionStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

export async function listEvents({ page = 1, limit = 20, status, upcoming, active } = {}) {
  const params = { page, limit };
  if (status) params.status = status;
  if (typeof upcoming === 'boolean') params.upcoming = String(upcoming);
  if (typeof active === 'boolean') params.active = String(active);
  const res = await axios.get('/api/events', { params, headers: authHeaders() });
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

export async function getEventBySlug(slug) {
  const res = await axios.get(`/api/events/slug/${encodeURIComponent(slug)}`, { headers: authHeaders() });
  return res.data;
}

export async function getEvent(idOrSlug) {
  const res = await axios.get(`/api/events/${encodeURIComponent(idOrSlug)}`, { headers: authHeaders() });
  return res.data;
}

export async function listUpcomingEvents({ page = 1, limit = 20 } = {}) {
  const params = { page, limit };
  const res = await axios.get('/api/events/upcoming', { params, headers: authHeaders() });
  return res.data;
}

export async function listRegisteredEvents({ page = 1, limit = 20 } = {}) {
  const params = { page, limit };
  const res = await axios.get('/api/events/registered', { params, headers: authHeaders() });
  return res.data;
}

export async function listMyEventRegistrations() {
  const res = await axios.get('/api/events/registrations/me', { headers: authHeaders() });
  return res.data;
}

export async function registerForEvent(idOrSlug) {
  const res = await axios.post(`/api/events/${encodeURIComponent(idOrSlug)}/register`, {}, { headers: authHeaders() });
  return res.data;
}

export async function getEventBooths(eventId) {
  const res = await axios.get(`/api/events/${encodeURIComponent(eventId)}/booths`, { headers: authHeaders() });
  return res.data;
}
