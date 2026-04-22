import axios from 'axios';

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export async function listResumes() {
  const res = await axios.get('/api/resumes', { headers: authHeaders() });
  return res.data;
}

export async function createResume(payload) {
  const res = await axios.post('/api/resumes', payload, { headers: authHeaders() });
  return res.data;
}

export async function getResume(id) {
  const res = await axios.get(`/api/resumes/${id}`, { headers: authHeaders() });
  return res.data;
}

export async function getAdminResume(id) {
  const res = await axios.get(`/api/resumes/admin/${id}`, { headers: authHeaders() });
  return res.data;
}

export async function getAdminResumeFileUrl(s3Url) {
  const res = await axios.get('/api/uploads/admin/resume-url', {
    params: { url: s3Url },
    headers: authHeaders()
  });
  return res.data.url;
}

export async function updateResume(id, payload) {
  const res = await axios.put(`/api/resumes/${id}`, payload, { headers: authHeaders() });
  return res.data;
}

export async function deleteResume(id) {
  const res = await axios.delete(`/api/resumes/${id}`, { headers: authHeaders() });
  return res.data;
}

export async function setDefaultResume(id) {
  const res = await axios.post(`/api/resumes/${id}/set-default`, {}, { headers: authHeaders() });
  return res.data;
}

export async function generateResumeFromProfile(id) {
  const res = await axios.post(`/api/resumes/${id}/generate`, {}, { headers: authHeaders() });
  return res.data;
}

export async function suggestResumeContent(id, section, currentContent, context) {
  const res = await axios.post(
    `/api/resumes/${id}/suggest`,
    { section, currentContent, context },
    { headers: authHeaders() }
  );
  return res.data;
}

export async function parseResumeFromFile(file, title) {
  const formData = new FormData();
  formData.append('resume', file);
  if (title) formData.append('title', title);
  const res = await axios.post('/api/resumes/parse-upload', formData, {
    headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' }
  });
  return res.data;
}

export async function parseResumeFromUrl(url, title) {
  const res = await axios.post('/api/resumes/parse-from-url', { url, title }, { headers: authHeaders() });
  return res.data;
}
