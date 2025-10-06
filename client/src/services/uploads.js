import axios from 'axios';

// Helper to request a presigned URL and upload a file to S3
// Returns: { key, downloadUrl }

// Upload booth logo to S3 under 'booth-logo/<userId>/<filename>'
// Returns: { key, downloadUrl }
export async function uploadBoothLogoToS3(file) {
  if (!file) throw new Error('No file provided');
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  // Request presigned URL for booth-logo
  const presignRes = await axios.post(
    '/api/uploads/presign',
    {
      fileName: file.name,
      fileType: 'booth-logo',
      mimeType: file.type || 'image/jpeg',
    },
    { headers }
  );

  const { upload, download } = presignRes.data;
  const { url, key } = upload;

  // Upload to S3
  await axios.put(url, file, {
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });

  // Confirm upload
  const completeRes = await axios.post(
    '/api/uploads/complete',
    {
      fileKey: key,
      fileType: 'booth-logo',
      fileName: file.name,
      mimeType: file.type || 'image/jpeg',
      size: file.size,
    },
    { headers }
  );

  return {
    key,
    downloadUrl: completeRes?.data?.file?.downloadUrl || download?.url,
  };
}
export async function uploadImageToS3(file) {
  if (!file) throw new Error('No file provided');
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  // 1) Ask backend for presigned URL
  const presignRes = await axios.post(
    '/api/uploads/presign',
    {
      fileName: file.name,
      fileType: 'image',
      mimeType: file.type || 'image/jpeg',
    },
    { headers }
  );

  const { upload, download } = presignRes.data;
  const { url, key } = upload;

  // 2) Upload the file to S3 directly
  await axios.put(url, file, {
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });

  // 3) Confirm upload so server can return a long-lived download URL
  const completeRes = await axios.post(
    '/api/uploads/complete',
    {
      fileKey: key,
      fileType: 'image',
      fileName: file.name,
      mimeType: file.type || 'image/jpeg',
      size: file.size,
    },
    { headers }
  );

  return {
    key,
    downloadUrl: completeRes?.data?.file?.downloadUrl || download?.url,
  };
}

export async function uploadAudioToS3(file) {
  if (!file) throw new Error('No file provided');
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  // 1) Ask backend for presigned URL
  const presignRes = await axios.post(
    '/api/uploads/presign',
    {
      fileName: file.name,
      fileType: 'audio',
      mimeType: file.type || 'audio/webm',
    },
    { headers }
  );

  const { upload, download } = presignRes.data;
  const { url, key } = upload;

  // 2) Upload the file to S3 directly
  await axios.put(url, file, {
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });

  // 3) Confirm upload so server can return a long-lived download URL
  const completeRes = await axios.post(
    '/api/uploads/complete',
    {
      fileKey: key,
      fileType: 'audio',
      fileName: file.name,
      mimeType: file.type || 'audio/webm',
      size: file.size,
    },
    { headers }
  );

  return {
    key,
    downloadUrl: completeRes?.data?.file?.downloadUrl || download?.url,
  };
}

export async function uploadVideoToS3(file) {
  if (!file) throw new Error('No file provided');
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  // 1) Ask backend for presigned URL
  const presignRes = await axios.post(
    '/api/uploads/presign',
    {
      fileName: file.name,
      fileType: 'video',
      mimeType: file.type || 'video/webm',
    },
    { headers }
  );

  const { upload, download } = presignRes.data;
  const { url, key } = upload;

  // 2) Upload the file to S3 directly
  await axios.put(url, file, {
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });

  // 3) Confirm upload so server can return a long-lived download URL
  const completeRes = await axios.post(
    '/api/uploads/complete',
    {
      fileKey: key,
      fileType: 'video',
      fileName: file.name,
      mimeType: file.type || 'video/webm',
      size: file.size,
    },
    { headers }
  );

  return {
    key,
    downloadUrl: completeRes?.data?.file?.downloadUrl || download?.url,
  };
}
