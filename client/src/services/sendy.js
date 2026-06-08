import axios from 'axios';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

export async function getSendyLists() {
  const res = await axios.get('/api/sendy/lists', { headers: authHeaders() });
  return res.data;
}
