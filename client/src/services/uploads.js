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

  // 2) Upload the file to S3 directly using fetch (axios adds extra headers that break presigned URLs)
  const putRes = await fetch(url, {
    method: 'PUT',
    mode: 'cors',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file
  });
  if (!putRes.ok) throw new Error(`S3 upload failed: ${putRes.status}`);

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

export async function uploadAudioToS3(file, onProgress) {
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

  // 2) Upload the file to S3 directly using XMLHttpRequest for progress tracking
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percentComplete = (e.loaded / e.total) * 100;
        onProgress(percentComplete);
      }
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 upload failed: ${xhr.status}`));
      }
    });
    
    xhr.addEventListener('error', () => {
      reject(new Error('S3 upload failed'));
    });
    
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
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

  // Use stable stream endpoint for <audio> playback (redirects to fresh presigned URL)
  const streamUrl = `/api/uploads/stream?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token || '')}`;

  return {
    key,
    downloadUrl: streamUrl || completeRes?.data?.file?.streamUrl || completeRes?.data?.file?.downloadUrl || download?.url,
  };
}

const VIDEO_MIME_BY_EXT = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv',
};

function getVideoMimeType(file) {
  if (file.type && /^video\//.test(file.type)) return file.type;
  const ext = (file.name || '').toLowerCase().slice(file.name.lastIndexOf('.'));
  return VIDEO_MIME_BY_EXT[ext] || 'video/mp4';
}

export async function uploadVideoToS3(file, onProgress) {
  if (!file) throw new Error('No file provided');
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  const mimeType = getVideoMimeType(file);

  // 1) Ask backend for presigned URL
  const presignRes = await axios.post(
    '/api/uploads/presign',
    {
      fileName: file.name,
      fileType: 'video',
      mimeType,
    },
    { headers }
  );

  const { upload, download } = presignRes.data;
  const { url, key } = upload;

  // 2) Upload the file to S3 directly using XMLHttpRequest for progress tracking
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percentComplete = (e.loaded / e.total) * 100;
        onProgress(percentComplete);
      }
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 upload failed: ${xhr.status}`));
      }
    });
    
    xhr.addEventListener('error', () => {
      reject(new Error('S3 upload failed'));
    });
    
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', mimeType || 'application/octet-stream');
    xhr.send(file);
  });

  // 3) Confirm upload so server can return a long-lived download URL
  const completeRes = await axios.post(
    '/api/uploads/complete',
    {
      fileKey: key,
      fileType: 'video',
      fileName: file.name,
      mimeType,
      size: file.size,
    },
    { headers }
  );

  // Use stable stream endpoint for <video> playback (redirects to fresh presigned URL)
  // We include token as query param because media tags can't send Authorization headers.
  const streamUrl = `/api/uploads/stream?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token || '')}`;

  return {
    key,
    downloadUrl: streamUrl || completeRes?.data?.file?.streamUrl || completeRes?.data?.file?.downloadUrl || download?.url,
  };
}
