import axios from 'axios';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

export async function listUsers({ page = 1, limit = 50, search, role, isActive, eventId } = {}) {
  const params = { page, limit };
  
  // Only add parameters if they have valid values (following pattern from analytics service)
  if (search !== undefined && search !== null && search !== '') {
    const searchStr = String(search).trim();
    if (searchStr) {
      params.search = searchStr;
    }
  }
  
  // Only add role if it's explicitly provided and not empty
  // When role is undefined (not passed), don't add it to params
  // Server will exclude JobSeekers by default when no role is provided
  if (role !== undefined && role !== null && role !== '') {
    const roleStr = String(role).trim();
    if (roleStr) {
      params.role = roleStr;
    }
  }
  
  // Handle isActive filter - accept both boolean and string ('true'/'false')
  if (isActive !== undefined && isActive !== null && isActive !== '') {
    if (typeof isActive === 'boolean') {
      params.isActive = String(isActive);
    } else if (typeof isActive === 'string') {
      // Accept string values 'true' or 'false'
      const isActiveStr = isActive.trim().toLowerCase();
      if (isActiveStr === 'true' || isActiveStr === 'false') {
        params.isActive = isActiveStr;
      }
    }
  }
  
  // Add eventId filter if provided
  if (eventId !== undefined && eventId !== null && eventId !== '') {
    const eventIdStr = String(eventId).trim();
    if (eventIdStr) {
      params.eventId = eventIdStr;
    }
  }
  
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

// Bulk delete users
export async function bulkDeleteUsers(userIds) {
  const res = await axios.delete('/api/users/bulk-delete', {
    headers: authHeaders(),
    data: { userIds }
  });
  return res.data;
}

// Bulk delete job seekers (uses same endpoint but specifically for JobSeeker role)
export async function bulkDeleteJobSeekers(jobSeekerIds) {
  const res = await axios.delete('/api/users/bulk-delete', {
    headers: authHeaders(),
    data: { userIds: jobSeekerIds }
  });
  return res.data;
}

// Admin manually verify user's email
export async function verifyUserEmail(id) {
  const res = await axios.post(`/api/users/${id}/verify-email`, {}, { headers: authHeaders() });
  return res.data;
}

// Bulk delete users (permanent delete for both active and inactive users)
export async function bulkDeleteUsers(userIds) {
  const res = await axios.post('/api/users/bulk-delete', { userIds }, { headers: authHeaders() });
  return res.data;
}

// Bulk delete job seekers (permanent delete)
export async function bulkDeleteJobSeekers(userIds) {
  const res = await axios.post('/api/users/bulk-delete', { userIds }, { headers: authHeaders() });
  return res.data;
}
