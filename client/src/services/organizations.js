import axios from 'axios';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

// List all organizations (SuperAdmin) or own org (Admin)
export async function listOrganizations(params = {}) {
  const res = await axios.get('/api/organizations', {
    params,
    headers: authHeaders(),
    timeout: 30000
  });
  return res.data;
}

// Get single organization with stats
export async function getOrganization(id) {
  const res = await axios.get(`/api/organizations/${id}`, {
    headers: authHeaders(),
    timeout: 30000
  });
  return res.data;
}

// Create organization (SuperAdmin only)
export async function createOrganization(data) {
  const res = await axios.post('/api/organizations', data, {
    headers: authHeaders(),
    timeout: 30000
  });
  return res.data;
}

// Update organization
export async function updateOrganization(id, data) {
  const res = await axios.put(`/api/organizations/${id}`, data, {
    headers: authHeaders(),
    timeout: 30000
  });
  return res.data;
}

// Delete organization (SuperAdmin only)
export async function deleteOrganization(id) {
  const res = await axios.delete(`/api/organizations/${id}`, {
    headers: authHeaders(),
    timeout: 30000
  });
  return res.data;
}

// Get org dashboard stats
export async function getOrgDashboardStats(id) {
  const res = await axios.get(`/api/organizations/${id}/dashboard-stats`, {
    headers: authHeaders(),
    timeout: 30000
  });
  return res.data;
}

// List users in an organization
export async function listOrgUsers(orgId, params = {}) {
  const res = await axios.get(`/api/organizations/${orgId}/users`, {
    params,
    headers: authHeaders(),
    timeout: 30000
  });
  return res.data;
}

// List registered job seekers for an organization
export async function listRegisteredJobSeekers(orgId, params = {}) {
  const res = await axios.get(`/api/organizations/${orgId}/job-seekers`, {
    params,
    headers: authHeaders(),
    timeout: 30000
  });
  return res.data;
}

// Assign a user to an organization
export async function assignUserToOrg(orgId, userId) {
  const res = await axios.post(`/api/organizations/${orgId}/assign-user`, { userId }, {
    headers: authHeaders(),
    timeout: 30000
  });
  return res.data;
}

// Remove a user from an organization
export async function removeUserFromOrg(orgId, userId) {
  const res = await axios.post(`/api/organizations/${orgId}/remove-user`, { userId }, {
    headers: authHeaders(),
    timeout: 30000
  });
  return res.data;
}

// Upload organization logo image to S3 via dedicated org endpoint
export async function uploadOrganizationLogo(orgId, file) {
  const formData = new FormData();
  formData.append('logo', file);
  const res = await axios.post(`/api/organizations/${orgId}/logo-upload`, formData, {
    headers: {
      ...authHeaders(),
      'Content-Type': 'multipart/form-data'
    },
    timeout: 60000
  });
  return res.data;
}
