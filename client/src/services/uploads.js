import axios from 'axios';

// Helper to request a presigned URL and upload a file to S3
// Returns: { key, downloadUrl }
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
