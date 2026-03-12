import React, { useState, useRef } from 'react';
import axios from 'axios';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

// Generate a sample XLS template as a data URL for download
function downloadTemplate() {
  const headers = ['name', 'email', 'password', 'role', 'phone', 'city', 'state', 'country'];
  const sample = ['John Smith', 'john@example.com', 'Password123!', 'Recruiter', '555-0100', 'New York', 'NY', 'US'];
  const rows = [headers, sample];
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'user-upload-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function MassUploadModal({ onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowed = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel', 'text/csv', 'application/csv'];
    if (!allowed.includes(f.type) && !f.name.match(/\.(xlsx?|csv)$/i)) {
      setError('Please select an XLS, XLSX, or CSV file.');
      return;
    }
    setFile(f);
    setError('');
    setResult(null);
  };

  const handleUpload = async () => {
    if (!file) { setError('Please select a file first.'); return; }
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await axios.post('/api/users/mass-upload', formData, {
        headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
        timeout: 60000
      });
      setResult(res.data);
      if (onSuccess) onSuccess(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Mass Upload Users"
    >
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 600,
        maxHeight: '90vh', overflowY: 'auto', padding: 28,
        boxShadow: '0 8px 40px rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>Mass Upload Users</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#666' }}>×</button>
        </div>

        <p style={{ color: '#555', marginBottom: 16 }}>
          Upload an Excel (XLS/XLSX) or CSV file to bulk-create users.
          Required columns: <strong>name, email, password, role</strong>.
          Optional: phone, city, state, country.
        </p>

        <button
          onClick={downloadTemplate}
          style={{
            background: 'none', border: '1px solid #007bff', color: '#007bff',
            borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: '0.85rem',
            marginBottom: 16
          }}
        >
          Download Template (CSV)
        </button>

        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="mass-upload-file"
            style={{
              display: 'block', padding: '14px 20px', border: '2px dashed #ccc',
              borderRadius: 8, textAlign: 'center', cursor: 'pointer',
              background: file ? '#f0f9ff' : '#fafafa', transition: 'background 0.2s'
            }}
          >
            {file ? (
              <span style={{ color: '#007bff', fontWeight: 600 }}>{file.name}</span>
            ) : (
              <span style={{ color: '#888' }}>Click to select XLS, XLSX, or CSV file</span>
            )}
            <input
              ref={fileRef}
              id="mass-upload-file"
              type="file"
              accept=".xls,.xlsx,.csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {error && (
          <div style={{ background: '#fee', color: '#c00', padding: '10px 14px', borderRadius: 6, marginBottom: 14 }} role="alert">
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            style={{
              flex: 1, padding: '10px 20px', background: '#007bff', color: '#fff',
              border: 'none', borderRadius: 6, cursor: !file || uploading ? 'not-allowed' : 'pointer',
              fontWeight: 600, opacity: !file || uploading ? 0.6 : 1
            }}
          >
            {uploading ? 'Uploading...' : 'Upload & Create Users'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px', background: '#6c757d', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600
            }}
          >
            Cancel
          </button>
        </div>

        {result && (
          <div>
            <div style={{
              background: result.summary.errors > 0 ? '#fff8e8' : '#eff',
              border: '1px solid',
              borderColor: result.summary.errors > 0 ? '#ffcc00' : '#080',
              borderRadius: 8, padding: 16, marginBottom: 14
            }}>
              <strong>Upload Complete</strong>
              <div style={{ marginTop: 8, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <span style={{ color: '#080' }}>✓ Created: {result.summary.created}</span>
                <span style={{ color: '#888' }}>Skipped: {result.summary.skipped}</span>
                {result.summary.errors > 0 && (
                  <span style={{ color: '#c00' }}>✗ Errors: {result.summary.errors}</span>
                )}
              </div>
            </div>

            {result.errors?.length > 0 && (
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 8 }}>Errors</h4>
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: '0.82rem', color: '#c00', padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
                      Row {e.row}: {e.email && `${e.email} — `}{e.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.skipped?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 8 }}>Skipped (already exist)</h4>
                <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
                  {result.skipped.map((s, i) => (
                    <div key={i} style={{ fontSize: '0.82rem', color: '#888', padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
                      Row {s.row}: {s.email} — {s.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
