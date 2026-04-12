import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { publicUrl } from '../../utils/publicUrl';
import { useSocket } from '../../contexts/SocketContext';
import { listImportRuns, massImportUsers } from '../../services/users';

const emptySummary = { total: 0, created: 0, incomplete: 0, skipped: 0, errors: 0 };

const makeJobId = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export default function MassUploadModal({
  onClose,
  onSuccess,
  title = 'Import Users',
  defaultRole = '',
  entityType = 'users'
}) {
  const { socket } = useSocket();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [result, setResult] = useState(null);
  const [summary, setSummary] = useState(emptySummary);
  const [liveLogs, setLiveLogs] = useState([]);
  const [recentRuns, setRecentRuns] = useState([]);
  const [error, setError] = useState('');
  const [importJobId, setImportJobId] = useState('');
  const fileRef = useRef();
  const activeJobIdRef = useRef('');
  const sampleFileName = entityType === 'jobseekers' ? 'jobseeker-import-sample.csv' : 'user-import-sample.csv';

  const effectiveSummary = useMemo(() => {
    if (result?.summary) return result.summary;
    return summary;
  }, [result, summary]);

  const loadRecentRuns = async () => {
    try {
      const res = await listImportRuns({ limit: 5 });
      setRecentRuns(res?.runs || []);
    } catch (_) {
      setRecentRuns([]);
    }
  };

  useEffect(() => {
    loadRecentRuns();
  }, []);

  useEffect(() => {
    if (!socket) return undefined;

    const onStarted = (payload = {}) => {
      if (!activeJobIdRef.current || payload.jobId !== activeJobIdRef.current) return;
      setStreaming(true);
      setSummary((prev) => ({ ...prev, total: Number(payload.total || prev.total || 0) }));
    };

    const onRow = (payload = {}) => {
      if (!activeJobIdRef.current || payload.jobId !== activeJobIdRef.current) return;
      if (payload.row) {
        setLiveLogs((prev) => [...prev, payload.row]);
      }
      if (payload.summary) {
        setSummary((prev) => ({ ...prev, ...payload.summary, total: prev.total || Number(payload.progress?.total || 0) }));
      }
    };

    const onSummary = (payload = {}) => {
      if (!activeJobIdRef.current || payload.jobId !== activeJobIdRef.current) return;
      if (payload.summary) setSummary(payload.summary);
      setStreaming(false);
      loadRecentRuns();
    };

    const onFailed = (payload = {}) => {
      if (!activeJobIdRef.current || payload.jobId !== activeJobIdRef.current) return;
      setError(payload.message || 'Import failed');
      setStreaming(false);
    };

    socket.on('import-started', onStarted);
    socket.on('import-row', onRow);
    socket.on('import-summary', onSummary);
    socket.on('import-failed', onFailed);

    return () => {
      socket.off('import-started', onStarted);
      socket.off('import-row', onRow);
      socket.off('import-summary', onSummary);
      socket.off('import-failed', onFailed);
    };
  }, [socket]);

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
    setSummary(emptySummary);
    setLiveLogs([]);
  };

  const handleUpload = async () => {
    if (!file) { setError('Please select a file first.'); return; }
    const jobId = makeJobId();
    activeJobIdRef.current = jobId;
    setImportJobId(jobId);
    setSummary(emptySummary);
    setLiveLogs([]);
    setStreaming(true);
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('importJobId', jobId);
      formData.append('entityType', entityType);
      if (defaultRole) {
        formData.append('defaultRole', defaultRole);
      }
      const res = await massImportUsers(formData);
      setResult(res);
      setSummary(res.summary || emptySummary);
      if (Array.isArray(res.logs) && res.logs.length > 0) {
        setLiveLogs(res.logs);
      }
      if (onSuccess) onSuccess(res);
      loadRecentRuns();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Upload failed');
    } finally {
      setStreaming(false);
      setUploading(false);
    }
  };

  const modalContent = (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-users-title"
    >
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 600,
        maxHeight: '90vh', overflowY: 'auto', padding: 28,
        boxShadow: '0 8px 40px rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }} id="import-users-title">{title}</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#666' }} aria-label="Close import dialog">×</button>
        </div>

        <p style={{ color: '#555', marginBottom: 16 }}>
          Upload an Excel (XLS/XLSX) or CSV file to bulk-create users.
          Required: <strong>email, password, role</strong>, and either a single <strong>name</strong> column or <strong>First Name</strong> and <strong>Last Name</strong>.
          Optional: phone, city, state, country.
          Roles <strong>Recruiter</strong>, <strong>BoothAdmin</strong>, <strong>Support</strong>, or <strong>Interpreter</strong> can be imported without booth and will be marked <strong>Needs Info</strong> until completed.
          {defaultRole && (
            <> When role is missing in a row, default role <strong>{defaultRole}</strong> is used.</>
          )}
        </p>

        <p style={{ marginBottom: 16 }}>
          <a
            href={publicUrl(sampleFileName)}
            download={sampleFileName}
            style={{
              border: '1px solid #007bff',
              color: '#007bff',
              borderRadius: 6,
              padding: '8px 14px',
              fontSize: '0.85rem',
              textDecoration: 'none',
              display: 'inline-block',
              fontWeight: 600,
            }}
          >
            Download sample CSV
          </a>
        </p>

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

        {(uploading || streaming || liveLogs.length > 0 || result) && (
          <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Live Import Logs</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8, fontSize: '0.85rem' }}>
              <span>Created: <strong>{effectiveSummary.created || 0}</strong></span>
              <span>Needs Info: <strong>{effectiveSummary.incomplete || 0}</strong></span>
              <span>Skipped: <strong>{effectiveSummary.skipped || 0}</strong></span>
              <span>Errors: <strong>{effectiveSummary.errors || 0}</strong></span>
              {effectiveSummary.total > 0 && <span>Total: <strong>{effectiveSummary.total}</strong></span>}
            </div>
            {importJobId && (
              <div style={{ marginBottom: 8, fontSize: '0.8rem', color: '#64748b' }}>
                Job: {importJobId}
              </div>
            )}
            <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', padding: 8 }}>
              {liveLogs.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '0.82rem' }}>{uploading || streaming ? 'Waiting for row logs...' : 'No row logs yet.'}</div>
              ) : (
                liveLogs.map((log, idx) => (
                  <div key={`${log.row}-${idx}`} style={{ fontSize: '0.82rem', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    Row {log.row}: {log.status.toUpperCase()} {log.email ? `- ${log.email}` : ''} {log.message ? `- ${log.message}` : ''}
                  </div>
                ))
              )}
            </div>
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
            {uploading ? 'Uploading...' : 'Upload & Import'}
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
                {result.summary.incomplete > 0 && (
                  <span style={{ color: '#d97706' }}>! Needs Info: {result.summary.incomplete}</span>
                )}
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

        {recentRuns.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 8 }}>Recent Import Runs</h4>
            <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
              {recentRuns.map((run) => (
                <div key={run.jobId} style={{ fontSize: '0.82rem', color: '#334155', padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
                  {new Date(run.createdAt).toLocaleString()} - Created {run.summary?.created || 0}, Needs Info {run.summary?.incomplete || 0}, Skipped {run.summary?.skipped || 0}, Errors {run.summary?.errors || 0}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return ReactDOM.createPortal(modalContent, document.body);
  }
  return modalContent;
}
