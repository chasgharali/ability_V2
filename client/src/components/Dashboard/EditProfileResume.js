import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import './Dashboard.css';
import { MultiSelectComponent } from '@syncfusion/ej2-react-dropdowns';
import '@syncfusion/ej2-base/styles/material.css';
import '@syncfusion/ej2-buttons/styles/material.css';
import '@syncfusion/ej2-inputs/styles/material.css';
import '@syncfusion/ej2-react-dropdowns/styles/material.css';
import { LANGUAGE_LIST, MILITARY_EXPERIENCE_LIST, EDUCATION_LEVEL_LIST, EXPERIENCE_LEVEL_LIST, JOB_CATEGORY_LIST, JOB_TYPE_LIST } from '../../constants/options';
import { useAuth } from '../../contexts/AuthContext';
import { useRoleMessages } from '../../contexts/RoleMessagesContext';
import { listResumes, setDefaultResume } from '../../services/resumes';

// Using centralized job categories for Primary Job Experience
// Using centralized EXPERIENCE_LEVEL_LIST for work levels
// Using centralized EDUCATION_LEVEL_LIST
// Use centralized JOB_TYPE_LIST for employment types
const VETERAN_STATUS = ['None', 'Veteran', 'Active Duty', 'Reservist', 'Military Spouse'];

const parseKeywordTags = (keywords) => (keywords ? keywords.split(',').map(s => s.trim()).filter(Boolean) : []);

function getNameInitials(displayName) {
  if (!displayName || !String(displayName).trim()) return '?';
  const parts = String(displayName).trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

export default function EditProfileResume({ onValidationChange, onFormDataChange, onDone, onPrev, embedded, resumeOptional, resumeTopSlot }) {
  // Standalone page uses h1 → h2; embedded wizard uses h3 → h4 (avoid skipped levels in either context)
  const ProfileSectionHeading = embedded ? 'h4' : 'h2';
  const CameraDialogHeading = embedded ? 'h4' : 'h2';
  const { user } = useAuth();
  const { getMessage } = useRoleMessages();
  const [form, setForm] = useState({
    headline: '',
    keywords: '',
    linkedInUrl: '',
    primaryExperience: [], // multi-select (max 2)
    workLevel: '',
    educationLevel: '',
    languages: [],
    employmentTypes: [], // multi-select
    veteranStatus: ''
  });
  const infoBannerMessage = getMessage('edit-profile', 'info-banner') || '';
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resumeFileName, setResumeFileName] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [resumeKey, setResumeKey] = useState('');
  const [resumeTab, setResumeTab] = useState(() => localStorage.getItem('resumeTabPref') || 'upload');
  const [builderResumes, setBuilderResumes] = useState([]);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [settingDefault, setSettingDefault] = useState(null);
  const [keywordAnnouncement, setKeywordAnnouncement] = useState('');
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');
  const [avatarKey, setAvatarKey] = useState('');
  const [pendingAvatarFile, setPendingAvatarFile] = useState(null);
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState(null);
  const [avatarImageError, setAvatarImageError] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const resumeInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const topRef = useRef(null);
  const successMessageRef = useRef(null);
  const cameraDialogRef = useRef(null);
  const cameraCaptureButtonRef = useRef(null);
  const cameraCancelButtonRef = useRef(null);
  const cameraTriggerRef = useRef(null);
  const returnFocusRef = useRef(null);

  const keywordTags = parseKeywordTags(form.keywords);

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast({ visible: false, message: '', type }), 2500);
  };

  const deleteResume = async () => {
    try {
      if (!resumeKey) {
        showToast('No resume found to delete', 'error');
        return;
      }
      await authFetch(`/api/uploads/${encodeURIComponent(resumeKey)}`, { method: 'DELETE' });
      setResumeFileName('');
      setResumeKey('');
      setResumeUrl('');
      showToast('Resume deleted', 'success');
      if (resumeInputRef.current) resumeInputRef.current.value = '';
    } catch (e) {
      showToast('Failed to delete resume', 'error');
    }
  };

  const deleteAvatar = async () => {
    try {
      if (avatarKey) {
        // Try to delete from S3 first if we have the key
        try {
          await authFetch(`/api/uploads/${encodeURIComponent(avatarKey)}`, { method: 'DELETE' });
        } catch (e) {
          // If S3 delete fails, fall back to just removing from user profile
          console.warn('S3 delete failed, removing from profile only:', e);
        }
      }
      // Always remove from user profile
      await authFetch('/api/users/me', {
        method: 'PUT',
        body: JSON.stringify({ avatarUrl: null })
      });
      setAvatarPreviewUrl('');
      setAvatarKey('');
      showToast('Profile picture removed', 'success');
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    } catch (e) {
      showToast('Failed to remove profile picture', 'error');
    }
  };

  const handleAvatarFileSelect = (file) => {
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      return;
    }
    
    // Validate file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      showToast('Image size must be less than 2MB', 'error');
      return;
    }
    
    // Create preview
    const previewUrl = URL.createObjectURL(file);
    setPendingAvatarFile(file);
    setPendingAvatarPreview(previewUrl);
  };

  const confirmAvatarUpload = async () => {
    if (!pendingAvatarFile) return;
    await uploadToS3(pendingAvatarFile, 'avatar');
    // Clean up pending state
    if (pendingAvatarPreview) {
      URL.revokeObjectURL(pendingAvatarPreview);
    }
    setPendingAvatarFile(null);
    setPendingAvatarPreview(null);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const cancelAvatarUpload = () => {
    if (pendingAvatarPreview) {
      URL.revokeObjectURL(pendingAvatarPreview);
    }
    setPendingAvatarFile(null);
    setPendingAvatarPreview(null);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  // Bind stream to video when modal is open and video is mounted
  useEffect(() => {
    const attach = async () => {
      if (!cameraOpen) return;
      const stream = mediaStreamRef.current;
      if (videoRef.current && stream) {
        try {
          videoRef.current.srcObject = stream;
          // Some browsers require canplay before play
          const playPromise = videoRef.current.play();
          if (playPromise && typeof playPromise.then === 'function') {
            await playPromise.catch(() => { });
          }
        } catch (_) { }
      }
    };
    attach();
    return () => {
      // no-op; stream is stopped on closeCamera
    };
  }, [cameraOpen]);

  // Always read latest token and provide an auth-fetch helper BEFORE any hooks use it
  const getToken = () => localStorage.getItem('token');
  const getRefreshToken = () => localStorage.getItem('refreshToken');

  const tryRefreshToken = async () => {
    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return false;
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });
      if (!res.ok) return false;
      const data = await res.json();
      const { accessToken, refreshToken: newRefresh } = data?.tokens || {};
      if (accessToken) localStorage.setItem('token', accessToken);
      if (newRefresh) localStorage.setItem('refreshToken', newRefresh);
      return !!accessToken;
    } catch {
      return false;
    }
  };

  const authFetch = async (url, options = {}, retry = true) => {
    const token = getToken();
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
        ...(options.headers || {})
      }
    });
    if (res.status === 401 && retry) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        return authFetch(url, options, false);
      }
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed: ${res.status}`);
    }
    return res.json();
  };

  // Notify parent of form data changes (including resume status)
  useEffect(() => {
    if (onFormDataChange) {
      onFormDataChange({
        ...form,
        resumeUrl: resumeUrl,
        hasResume: !!resumeUrl || !!resumeFileName
      });
    }
  }, [form, resumeUrl, resumeFileName, onFormDataChange]);

  const loadBuilderResumes = useCallback(async () => {
    setBuilderLoading(true);
    try {
      const data = await listResumes();
      setBuilderResumes(data?.resumes || data || []);
    } catch { /* non-fatal */ } finally {
      setBuilderLoading(false);
    }
  }, []);

  useEffect(() => { loadBuilderResumes(); }, [loadBuilderResumes]);

  const handleSetDefault = async (id) => {
    setSettingDefault(id);
    try {
      await setDefaultResume(id);
      await loadBuilderResumes();
      setResumeTab('builder');
      localStorage.setItem('resumeTabPref', 'builder');
      showToast('Resume set as profile resume');
    } catch {
      showToast('Failed to set resume', 'error');
    } finally {
      setSettingDefault(null);
    }
  };

  // Prefill from backend on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await authFetch('/api/users/me', { method: 'GET' });
        const prof = data?.profile || {};
        setForm(prev => ({
          ...prev,
          headline: prof.headline || '',
          keywords: prof.keywords || '',
          linkedInUrl: data?.user?.linkedInUrl || prof.linkedInUrl || '',
          primaryExperience: Array.isArray(prof.primaryExperience) ? prof.primaryExperience : [],
          workLevel: prof.workLevel || '',
          educationLevel: prof.educationLevel || '',
          languages: Array.isArray(prof.languages) ? prof.languages : [],
          employmentTypes: Array.isArray(prof.employmentTypes) ? prof.employmentTypes : [],
          veteranStatus: prof.veteranStatus || ''
        }));

        const avatarUrl = data?.user?.avatarUrl;
        if (avatarUrl) {
          setAvatarPreviewUrl(avatarUrl);
          try {
            const u = new URL(avatarUrl, window.location.origin);
            const pathname = u.pathname || '';
            if (pathname.startsWith('/api/uploads/public/')) {
              const key = decodeURIComponent(pathname.slice('/api/uploads/public/'.length));
              if (key.startsWith('avatar/')) setAvatarKey(key);
            } else {
              const path = decodeURIComponent(pathname.startsWith('/') ? pathname.slice(1) : pathname);
              if (path && path.startsWith('avatar/')) setAvatarKey(path);
            }
          } catch {
            try {
              const u = new URL(avatarUrl);
              const path = decodeURIComponent(u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname);
              if (path && path.startsWith('avatar/')) setAvatarKey(path);
            } catch {
              /* ignore */
            }
          }
        }

        const rUrl = data?.user?.resumeUrl;
        if (rUrl) {
          try {
            const u = new URL(rUrl);
            const path = decodeURIComponent(u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname);
            // path is the S3 key, e.g., "resume/<userId>/<uuid>.pdf"
            if (path) setResumeKey(path);
            const fname = path.split('/').pop();
            if (fname) setResumeFileName(fname);
            setResumeUrl(rUrl);
          } catch { }
        }
      } catch (e) {
        showToast('Failed to load profile', 'error');
      }
    };
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (pendingAvatarPreview) {
        URL.revokeObjectURL(pendingAvatarPreview);
      }
    };
  }, [pendingAvatarPreview]);

  useEffect(() => {
    setAvatarImageError(false);
  }, [avatarPreviewUrl]);

  // Auto-clear success message after 10 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage('');
      }, 10000); // Clear after 10 seconds
      return () => clearTimeout(timer);
    }
  }, [successMessage]);


  const onChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    // Trigger validation callback when form changes
    if (onValidationChange) {
      setTimeout(onValidationChange, 0); // Use setTimeout to ensure state is updated
    }
  };

  // languages handled by MultiSelect change below


  const presign = async (file, fileType) => {
    return authFetch('/api/uploads/presign', {
      method: 'POST',
      body: JSON.stringify({
        fileName: file.name,
        fileType,
        mimeType: file.type
      })
    });
  };

  const completeUpload = async (fileKey, fileType, file) => {
    return authFetch('/api/uploads/complete', {
      method: 'POST',
      body: JSON.stringify({
        fileKey,
        fileType,
        fileName: file.name,
        mimeType: file.type,
        size: file.size
      })
    });
  };

  const uploadToS3 = async (file, fileType) => {
    setUploading(true);
    try {
      const presigned = await presign(file, fileType);
      const uploadUrl = presigned?.upload?.url;
      const key = presigned?.upload?.key;
      const immediateDownload = presigned?.download?.url;
      if (!uploadUrl || !key) throw new Error('Invalid presign response');

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        mode: 'cors',
        headers: { 'Content-Type': file.type },
        body: file
      });
      if (!putRes.ok) throw new Error(`S3 upload failed: ${putRes.status}`);

      const complete = await completeUpload(key, fileType, file);

      if (fileType === 'resume') {
        setResumeFileName(file.name);
        setResumeKey(key);
        const completedUrl = complete?.file?.downloadUrl || immediateDownload;
        if (completedUrl) setResumeUrl(completedUrl);
        showToast('Resume uploaded');
        // Clear input so selecting the same file again triggers onChange
        if (resumeInputRef.current) resumeInputRef.current.value = '';
      } else if (fileType === 'avatar') {
        setAvatarKey(key);
        const displayUrl =
          complete?.file?.publicUrl || complete?.file?.downloadUrl || immediateDownload;
        if (!displayUrl) throw new Error('No URL returned after avatar upload');
        setAvatarPreviewUrl(displayUrl);
        showToast('Profile picture uploaded');
      }
    } catch (e) {
      // Surface likely CORS or network causes
      console.error('S3 upload error', e);
      const hint = e?.message?.includes('TypeError: Failed to fetch') ? ' (Check S3 CORS and origin http://localhost:3000)' : '';
      showToast((e.message || 'Upload failed') + hint, 'error');
    } finally {
      setUploading(false);
    }
  };

  // Camera controls
  const openCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Camera not supported', 'error');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
        audio: false
      });
      mediaStreamRef.current = stream;
      returnFocusRef.current = document.activeElement || cameraTriggerRef.current;
      // Open modal first; video element will mount, then we bind stream in an effect
      setCameraOpen(true);
    } catch (e) {
      showToast('Unable to access camera', 'error');
    }
  };

  const closeCamera = useCallback(() => {
    try {
      const s = mediaStreamRef.current;
      if (s) s.getTracks().forEach(t => t.stop());
    } catch { }
    mediaStreamRef.current = null;
    setCameraOpen(false);
    const returnTarget = returnFocusRef.current || cameraTriggerRef.current;
    returnFocusRef.current = null;
    if (returnTarget && typeof returnTarget.focus === 'function') {
      setTimeout(() => {
        if (document.contains(returnTarget)) {
          returnTarget.focus();
        }
      }, 0);
    }
  }, []);

  const getCameraFocusableElements = () => {
    if (!cameraDialogRef.current) return [];
    return Array.from(
      cameraDialogRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  };

  const handleCameraDialogKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeCamera();
      return;
    }
    if (e.key !== 'Tab') return;

    const focusableElements = getCameraFocusableElements();
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (e.shiftKey) {
      if (activeElement === firstElement || !cameraDialogRef.current?.contains(activeElement)) {
        e.preventDefault();
        lastElement.focus();
      }
      return;
    }

    if (activeElement === lastElement || !cameraDialogRef.current?.contains(activeElement)) {
      e.preventDefault();
      firstElement.focus();
    }
  };

  useEffect(() => {
    if (!cameraOpen) return;
    const focusTimer = setTimeout(() => {
      const preferredFocusTarget = !cameraCaptureButtonRef.current?.disabled
        ? cameraCaptureButtonRef.current
        : cameraCancelButtonRef.current;
      const firstFocusable = getCameraFocusableElements()[0];
      (preferredFocusTarget || firstFocusable)?.focus();
    }, 0);
    return () => clearTimeout(focusTimer);
  }, [cameraOpen]);

  const capturePhoto = async () => {
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      const w = video.videoWidth || 480;
      const h = video.videoHeight || 480;
      const size = Math.min(w, h);
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const sx = (w - size) / 2;
      const sy = (h - size) / 2;
      ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
        handleAvatarFileSelect(file);
        closeCamera();
      }, 'image/jpeg', 0.9);
    } catch (e) {
      showToast('Failed to capture photo', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage(''); // Clear any previous success message
    try {
      const payload = {
        linkedInUrl: (form.linkedInUrl || '').trim() || null,
        profile: {
          headline: form.headline,
          keywords: form.keywords,
          primaryExperience: form.primaryExperience,
          workLevel: form.workLevel,
          educationLevel: form.educationLevel,
          languages: form.languages,
          employmentTypes: form.employmentTypes,
          veteranStatus: form.veteranStatus
        }
      };
      await authFetch('/api/users/me', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      
      // Set success message and scroll to top
      setSuccessMessage('Profile updated successfully!');
      
      // Scroll to top smoothly
      setTimeout(() => {
        if (topRef.current) {
          topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Focus on success message for screen readers after scroll
          setTimeout(() => {
            if (successMessageRef.current) {
              successMessageRef.current.focus();
            }
          }, 300);
        } else {
          // Fallback: scroll window to top
          window.scrollTo({ top: 0, behavior: 'smooth' });
          setTimeout(() => {
            if (successMessageRef.current) {
              successMessageRef.current.focus();
            }
          }, 300);
        }
      }, 100);
      
      // Call onDone callback if provided (for wizard navigation)
      if (onDone) {
        onDone();
      }
    } catch (e) {
      showToast('Failed to save', 'error');
      setSuccessMessage(''); // Clear success message on error
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {!embedded && (
        <Helmet>
          <title>Edit Profile & Resume - abilityconnect</title>
        </Helmet>
      )}
      <div className="dashboard-content">
        <div ref={topRef} style={{ position: 'absolute', top: 0 }} aria-hidden="true" />
        {toast.visible && (
          <div className={`toast ${toast.type}`} role="status" aria-live="polite">{toast.message}</div>
        )}
      {successMessage && (
        <div 
          ref={successMessageRef}
          className="success-message" 
          role="alert" 
          aria-live="assertive"
          tabIndex={-1}
          style={{
            padding: '1rem',
            marginBottom: '1.5rem',
            backgroundColor: '#d1fae5',
            border: '2px solid #10b981',
            borderRadius: '8px',
            color: '#065f46',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>✓</span>
          <span>{successMessage}</span>
        </div>
      )}
      {!embedded && <h1>My Profile</h1>}
      {!embedded && <p className="section-note">Edit the form below to update your profile information.</p>}

        {infoBannerMessage && (
          <div className="info-banner">
            <span>{infoBannerMessage}</span>
          </div>
        )}

      <div className="upload-row">
        <div className="upload-card">
          <ProfileSectionHeading>Resume</ProfileSectionHeading>
          {resumeTopSlot}
          {/* Tab toggle — only in standalone (not embedded in wizard which has its own source selector) */}
          {!resumeOptional && !resumeTopSlot && (
            <div style={{ display: 'flex', gap: '0', marginBottom: '1rem', border: '1px solid #d1d5db', borderRadius: '6px', overflow: 'hidden', width: 'fit-content' }}>
              <button
                type="button"
                onClick={() => { setResumeTab('upload'); localStorage.setItem('resumeTabPref', 'upload'); }}
                style={{ padding: '6px 14px', fontSize: '13px', border: 'none', cursor: 'pointer', background: resumeTab === 'upload' ? '#1f2937' : '#f9fafb', color: resumeTab === 'upload' ? '#fff' : '#374151', fontWeight: resumeTab === 'upload' ? 600 : 400 }}
              >
                Upload File
              </button>
              <button
                type="button"
                onClick={() => { setResumeTab('builder'); localStorage.setItem('resumeTabPref', 'builder'); }}
                style={{ padding: '6px 14px', fontSize: '13px', border: 'none', borderLeft: '1px solid #d1d5db', cursor: 'pointer', background: resumeTab === 'builder' ? '#1f2937' : '#f9fafb', color: resumeTab === 'builder' ? '#fff' : '#374151', fontWeight: resumeTab === 'builder' ? 600 : 400 }}
              >
                From Resume Builder
              </button>
            </div>
          )}
          {/* Upload UI — shown when upload tab is active, or when embedded in wizard with resumeSource='upload' (resumeOptional=false) */}
          {!resumeOptional && (resumeTopSlot || resumeTab === 'upload') && (
            <>
              <p className="muted">Accepted file types: PDF and DOC (PDF preferred)</p>
              <div className="upload-actions">
                <input
                  ref={resumeInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadToS3(f, 'resume');
                  }}
                />
                <button
                  type="button"
                  className="update-button"
                  onClick={() => resumeInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading…' : 'Choose file to upload'}
                </button>
                <button type="button" className="update-button" onClick={deleteResume} disabled={!resumeKey}>Delete</button>
              </div>
              {resumeFileName && (
                <div className="muted" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span>File Attached: {resumeFileName}</span>
                  {resumeUrl && (
                    <a href={resumeUrl} target="_blank" rel="noreferrer" className="update-button" style={{ padding: '0.25rem 0.5rem' }}>View</a>
                  )}
                </div>
              )}
            </>
          )}
          {/* Builder list — only in standalone mode when builder tab is active */}
          {!resumeOptional && !resumeTopSlot && resumeTab === 'builder' && (
            <div>
              <p className="muted" style={{ marginBottom: '0.75rem' }}>Select a resume from your Resume Builder to use as your profile resume.</p>
              {builderLoading ? (
                <p className="muted">Loading resumes…</p>
              ) : builderResumes.length === 0 ? (
                <p className="muted">No resumes found. Create one in the <strong>Resume Builder</strong> section.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {builderResumes.map(r => (
                    <div key={r._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: `1px solid ${r.isDefault ? '#1f2937' : '#e5e7eb'}`, borderRadius: '6px', background: r.isDefault ? '#f3f4f6' : '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: r.isDefault ? 600 : 400, color: '#111827' }}>
                          {r.title || 'Untitled Resume'}
                        </span>
                        {r.isDefault && (
                          <span style={{ fontSize: '11px', background: '#1f2937', color: '#fff', borderRadius: '999px', padding: '1px 8px' }}>Profile Resume</span>
                        )}
                      </div>
                      {!r.isDefault && (
                        <button
                          type="button"
                          className="update-button"
                          style={{ padding: '4px 10px', fontSize: '12px' }}
                          disabled={settingDefault === r._id}
                          onClick={() => handleSetDefault(r._id)}
                        >
                          {settingDefault === r._id ? 'Setting…' : 'Use as Profile Resume'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="upload-card">
          <ProfileSectionHeading>Add a Profile Picture (Optional)</ProfileSectionHeading>
          <p className="muted">Accepted file types: JPG, PNG, GIF (max size: 2MB)</p>
          
          {/* Current Avatar Preview (already uploaded) */}
          {avatarPreviewUrl && !pendingAvatarPreview && (
            <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
              <div
                className="avatar-preview avatar-preview-saved"
                aria-label="Profile picture preview"
              >
                {!avatarImageError ? (
                  <img
                    src={avatarPreviewUrl}
                    alt=""
                    className="avatar-preview-saved-img"
                    onError={() => setAvatarImageError(true)}
                  />
                ) : (
                  <span className="avatar-preview-saved-initials" aria-hidden="true">
                    {getNameInitials(user?.name)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Pending Avatar Preview (before upload) */}
          {pendingAvatarPreview && (
            <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
              <div 
                className="avatar-preview" 
                style={{ 
                  width: '150px', 
                  height: '150px', 
                  borderRadius: '50%', 
                  border: '2px solid #e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden'
                }}
                aria-label="New profile picture preview"
              >
                <img 
                  src={pendingAvatarPreview} 
                  alt="Preview" 
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover', 
                    display: 'block'
                  }}
                  onError={(e) => {
                    console.error('Preview image failed to load');
                    e.target.style.display = 'none';
                  }}
                />
              </div>
              <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>Preview shown above. Click Upload to save.</p>
              <div className="avatar-pending-actions">
                <button 
                  type="button" 
                  className="update-button avatar-action-btn avatar-action-btn-primary" 
                  onClick={confirmAvatarUpload}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
                <button 
                  type="button" 
                  className="dashboard-button avatar-action-btn avatar-action-btn-secondary" 
                  onClick={cancelAvatarUpload}
                  disabled={uploading}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Upload Controls */}
          {!pendingAvatarPreview && (
            <div className="avatar-upload-controls">
              <div className="avatar-file-actions">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleAvatarFileSelect(f);
                  }}
                />
                <button
                  type="button"
                  className="update-button avatar-file-btn"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploading}
                >
                  Choose Picture
                </button>
                {avatarPreviewUrl && (
                  <button 
                    type="button" 
                    className="update-button avatar-file-btn" 
                    onClick={deleteAvatar} 
                  >
                    Remove Picture
                  </button>
                )}
              </div>
              <button
                type="button"
                className="dashboard-button avatar-camera-btn"
                onClick={openCamera}
                disabled={uploading}
                ref={cameraTriggerRef}
              >
                Take your Picture
              </button>
            </div>
          )}
        </div>
      </div>

      <form aria-label="Profile and resume form" className="account-form" onSubmit={handleSubmit}>
        <p className="section-note">An asterisk (*) indicates a required field.</p>

        <div className="form-group">
          <div className="label-with-counter">
            <label htmlFor="headline">* Your Headline</label>
            <span 
              className={`char-counter ${
                form.headline.length > 150 ? 'char-counter-over' :
                form.headline.length >= 145 ? 'char-counter-danger' :
                form.headline.length >= 140 ? 'char-counter-warning' :
                form.headline.length > 130 ? 'char-counter-caution' : ''
              }`}
              aria-live="polite"
              aria-atomic="true"
            >
              {form.headline.length}/150 characters
            </span>
          </div>
          <input 
            id="headline" 
            name="headline" 
            value={form.headline} 
            onChange={onChange} 
            placeholder="Make a brief statement about yourself" 
            maxLength={150}
            aria-describedby="headline-hint"
          />
          <span id="headline-hint" className="visually-hidden">
            Maximum 150 characters. Currently {form.headline.length} of 150 characters used.
          </span>
        </div>

        <div className="form-group">
          <label id="keyword-input-label" htmlFor="keywords">* Keywords</label>
          <div id="keyword-input-instructions" className="field-help">
            Add job skills, job titles, certifications, and tools. Type a keyword and press Enter to add it. Use arrow keys inside the keywords field to move between selected keywords.
          </div>
          <MultiSelectComponent
            id="keywords"
            aria-labelledby="keyword-input-label"
            aria-describedby="keyword-input-instructions keyword-input-status"
            dataSource={keywordTags}
            value={keywordTags}
            mode="Box"
            placeholder="Your skills, job titles, certifications, etc."
            cssClass="ajf-input"
            showDropDownIcon={true}
            popupHeight="220px"
            allowFiltering={true}
            allowCustomValue={true}
            addTagOnBlur={true}
            change={(args) => {
              const values = Array.isArray(args?.value)
                ? args.value.map((entry) => String(entry || '').trim()).filter(Boolean)
                : [];
              const uniqueKeywords = [...new Set(values)];
              setForm(prev => ({ ...prev, keywords: uniqueKeywords.join(', ') }));
              setKeywordAnnouncement(`${uniqueKeywords.length} keywords selected.`);
              if (onValidationChange) {
                setTimeout(onValidationChange, 0);
              }
            }}
          />
          <span id="keyword-input-status" className="sr-only" aria-live="polite" aria-atomic="true">
            {keywordAnnouncement || `${keywordTags.length} keywords selected.`}
          </span>
        </div>

        <div className="form-group">
          <label htmlFor="linkedInUrl">LinkedIn Profile URL (Optional)</label>
          <input
            id="linkedInUrl"
            name="linkedInUrl"
            type="url"
            value={form.linkedInUrl}
            onChange={onChange}
            placeholder="https://www.linkedin.com/in/your-profile"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label id="primaryExperience-label" htmlFor="primaryExperience">* Primary Job Experience (maximum 2)</label>
            <MultiSelectComponent
              id="primaryExperience"
              aria-labelledby="primaryExperience-label"
              dataSource={JOB_CATEGORY_LIST}
              fields={{ text: 'name', value: 'value' }}
              value={form.primaryExperience}
              mode="Box"
              placeholder="Select up to 2"
              maximumSelectionLength={2}
              cssClass="ajf-input"
              showDropDownIcon={true}
              popupHeight="260px"
              change={(args) => {
                const values = Array.isArray(args?.value) ? args.value : [];
                setForm(prev => ({ ...prev, primaryExperience: values.slice(0, 2) }));
                // Trigger validation callback when form changes
                if (onValidationChange) {
                  setTimeout(onValidationChange, 0);
                }
              }}
            />
          </div>
          <div className="form-group">
            <label htmlFor="workLevel">* Work Experience Level</label>
            <select id="workLevel" name="workLevel" value={form.workLevel} onChange={onChange}>
              <option value="">Select level</option>
              {EXPERIENCE_LEVEL_LIST.map(o => (
                <option key={o.value} value={o.value}>{o.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="educationLevel">* Highest Education Level</label>
            <select id="educationLevel" name="educationLevel" value={form.educationLevel} onChange={onChange}>
              <option value="">Select education</option>
              {EDUCATION_LEVEL_LIST.map(o => (
                <option key={o.value} value={o.value}>{o.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label id="employmentTypes-label" htmlFor="employmentTypes">* Employment Types</label>
            <MultiSelectComponent
              id="employmentTypes"
              aria-labelledby="employmentTypes-label"
              dataSource={JOB_TYPE_LIST}
              fields={{ text: 'name', value: 'value' }}
              value={form.employmentTypes}
              mode="Box"
              placeholder="Select employment types"
              cssClass="ajf-input"
              showDropDownIcon={true}
              popupHeight="260px"
              change={(args) => {
                const values = Array.isArray(args?.value) ? args.value : [];
                setForm(prev => ({ ...prev, employmentTypes: values }));
                // Trigger validation callback when form changes
                if (onValidationChange) {
                  setTimeout(onValidationChange, 0);
                }
              }}
            />
          </div>
        </div>

        <div className="form-group">
          <label id="languages-label" htmlFor="languages">* Language(s)</label>
          <MultiSelectComponent
            id="languages"
            aria-labelledby="languages-label"
            dataSource={LANGUAGE_LIST}
            fields={{ text: 'name', value: 'value' }}
            value={form.languages}
            mode="Box"
            placeholder="Select languages"
            cssClass="ajf-input"
            showDropDownIcon={true}
            popupHeight="260px"
            allowFiltering={true}
            change={(args) => {
              const values = Array.isArray(args?.value) ? args.value : [];
              setForm(prev => ({ ...prev, languages: values }));
              // Trigger validation callback when form changes
              if (onValidationChange) {
                setTimeout(onValidationChange, 0);
              }
            }}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="veteranStatus">Veteran/Military Status</label>
            <select id="veteranStatus" name="veteranStatus" value={form.veteranStatus} onChange={onChange}>
              <option value="">Select</option>
              {MILITARY_EXPERIENCE_LIST.map(o => (
                <option key={o.value} value={o.value}>{o.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-actions" style={{ display: 'flex', justifyContent: onPrev ? 'space-between' : 'flex-start', gap: '1rem', marginTop: '1.5rem', marginBottom: '3rem' }}>
          {onPrev && (
            <button type="button" className="ajf-btn ajf-btn-outline" onClick={onPrev} aria-label="Go to previous step">
              Previous
            </button>
          )}
          <button type="submit" className={onDone ? "ajf-btn ajf-btn-dark" : "update-button"} disabled={saving}>
            {saving ? 'Saving…' : (onDone ? 'Save and Next' : 'Submit')}
          </button>
        </div>
      </form>

      {cameraOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div
            ref={cameraDialogRef}
            className="camera-dialog-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="take-picture-dialog-title"
            onKeyDown={handleCameraDialogKeyDown}
            style={{ background: '#fff', borderRadius: 8, padding: 16, width: 520, maxWidth: '95vw', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}
          >
            <CameraDialogHeading id="take-picture-dialog-title" className="camera-dialog-title" style={{ marginTop: 0 }}>Take your picture</CameraDialogHeading>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, placeItems: 'center' }}>
              <video ref={videoRef} playsInline muted style={{ width: 480, height: 360, background: '#000', maxWidth: '100%' }} />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
            <div className="camera-modal-actions">
              <button
                ref={cameraCaptureButtonRef}
                type="button"
                className="dashboard-button camera-modal-btn camera-modal-btn-primary"
                onClick={capturePhoto}
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : 'Capture & Use Photo'}
              </button>
              <button
                ref={cameraCancelButtonRef}
                type="button"
                className="dashboard-button camera-modal-btn camera-modal-btn-secondary"
                onClick={closeCamera}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
