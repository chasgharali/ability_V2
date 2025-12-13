import React, { useEffect, useRef, useState } from 'react';
import './Dashboard.css';
import { MultiSelectComponent } from '@syncfusion/ej2-react-dropdowns';
import '@syncfusion/ej2-base/styles/material.css';
import '@syncfusion/ej2-buttons/styles/material.css';
import '@syncfusion/ej2-react-dropdowns/styles/material.css';
import { LANGUAGE_LIST, SECURITY_CLEARANCE_LIST, MILITARY_EXPERIENCE_LIST, EDUCATION_LEVEL_LIST, EXPERIENCE_LEVEL_LIST, JOB_CATEGORY_LIST, JOB_TYPE_LIST } from '../../constants/options';
import { useAuth } from '../../contexts/AuthContext';
import { useRoleMessages } from '../../contexts/RoleMessagesContext';

// Using centralized job categories for Primary Job Experience
// Using centralized EXPERIENCE_LEVEL_LIST for work levels
// Using centralized EDUCATION_LEVEL_LIST
// Use centralized JOB_TYPE_LIST for employment types
const VETERAN_STATUS = ['None', 'Veteran', 'Active Duty', 'Reservist', 'Military Spouse'];

export default function EditProfileResume({ onValidationChange, onFormDataChange, onDone, onPrev }) {
  const { user } = useAuth();
  const { getMessage } = useRoleMessages();
  const [form, setForm] = useState({
    headline: '',
    keywords: '',
    primaryExperience: [], // multi-select (max 2)
    workLevel: '',
    educationLevel: '',
    languages: [],
    employmentTypes: [], // multi-select
    clearance: '',
    veteranStatus: ''
  });
  const infoBannerMessage = getMessage('edit-profile', 'info-banner') || '';
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resumeFileName, setResumeFileName] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [resumeKey, setResumeKey] = useState('');
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');
  const [avatarKey, setAvatarKey] = useState('');
  const [pendingAvatarFile, setPendingAvatarFile] = useState(null);
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const resumeInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const topRef = useRef(null);
  const successMessageRef = useRef(null);

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
          primaryExperience: Array.isArray(prof.primaryExperience) ? prof.primaryExperience : [],
          workLevel: prof.workLevel || '',
          educationLevel: prof.educationLevel || '',
          languages: Array.isArray(prof.languages) ? prof.languages : [],
          employmentTypes: Array.isArray(prof.employmentTypes) ? prof.employmentTypes : [],
          clearance: prof.clearance || '',
          veteranStatus: prof.veteranStatus || ''
        }));

        const avatarUrl = data?.user?.avatarUrl;
        if (avatarUrl) {
          setAvatarPreviewUrl(avatarUrl);
          // Extract avatar key from URL if it's an S3 URL
          try {
            const u = new URL(avatarUrl);
            const path = decodeURIComponent(u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname);
            // path is the S3 key, e.g., "avatar/<userId>/<filename>"
            if (path && path.startsWith('avatar/')) {
              setAvatarKey(path);
            }
          } catch { }
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
        // Store the key for deletion later
        setAvatarKey(key);
        // Create local preview; avatarUrl in DB updated by server
        const url = URL.createObjectURL(file);
        setAvatarPreviewUrl(url);
        // Also update with the download URL from server
        const completedUrl = complete?.file?.downloadUrl || immediateDownload;
        if (completedUrl) {
          // Use server URL after a short delay to ensure it's updated
          setTimeout(() => {
            setAvatarPreviewUrl(completedUrl);
          }, 500);
        }
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
      // Open modal first; video element will mount, then we bind stream in an effect
      setCameraOpen(true);
    } catch (e) {
      showToast('Unable to access camera', 'error');
    }
  };

  const closeCamera = () => {
    try {
      const s = mediaStreamRef.current;
      if (s) s.getTracks().forEach(t => t.stop());
    } catch { }
    mediaStreamRef.current = null;
    setCameraOpen(false);
  };

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
        profile: {
          headline: form.headline,
          keywords: form.keywords,
          primaryExperience: form.primaryExperience,
          workLevel: form.workLevel,
          educationLevel: form.educationLevel,
          languages: form.languages,
          employmentTypes: form.employmentTypes,
          clearance: form.clearance,
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
      <h2>My Profile</h2>
      <p className="section-note">Edit the form below to update your profile information.</p>

        {infoBannerMessage && (
          <div className="info-banner">
            <span>{infoBannerMessage}</span>
          </div>
        )}

      <div className="upload-row">
        <div className="upload-card">
          <h4>Upload your resume (required)</h4>
          <p className="muted">Accepted file types: PDF and DOC (PDF preferred)</p>
          <div className="upload-actions">
            <label className="update-button" style={{ display: 'inline-block' }}>
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
              {uploading ? 'Uploading…' : 'Choose file to upload'}
            </label>
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
        </div>

        <div className="upload-card">
          <h4>Add a Profile Picture (Optional)</h4>
          <p className="muted">Accepted file types: JPG, PNG, GIF (max size: 2MB)</p>
          
          {/* Current Avatar Preview (already uploaded) */}
          {avatarPreviewUrl && !pendingAvatarPreview && (
            <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
              <div 
                className="avatar-preview" 
                style={{ 
                  width: '150px', 
                  height: '150px', 
                  borderRadius: '50%', 
                  backgroundImage: `url(${avatarPreviewUrl})`, 
                  backgroundSize: 'cover', 
                  backgroundPosition: 'center',
                  border: '2px solid #e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                aria-label="Profile picture preview"
              />
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
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  type="button" 
                  className="update-button" 
                  onClick={confirmAvatarUpload}
                  disabled={uploading}
                  style={{ padding: '0.5rem 1.5rem', whiteSpace: 'nowrap', minWidth: '140px', boxSizing: 'border-box' }}
                >
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
                <button 
                  type="button" 
                  className="dashboard-button" 
                  onClick={cancelAvatarUpload}
                  disabled={uploading}
                  style={{ padding: '0.5rem 1.5rem', whiteSpace: 'nowrap', minWidth: '100px', boxSizing: 'border-box' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Upload Controls */}
          {!pendingAvatarPreview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'row', gap: '0.5rem' }}>
                <label className="update-button" style={{ display: 'inline-block', textAlign: 'center', whiteSpace: 'nowrap', boxSizing: 'border-box', margin: 0 }}>
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
                  Choose Picture
                </label>
                {avatarPreviewUrl && (
                  <button 
                    type="button" 
                    className="update-button" 
                    onClick={deleteAvatar} 
                    style={{ whiteSpace: 'nowrap', boxSizing: 'border-box', margin: 0 }}
                  >
                    Remove Picture
                  </button>
                )}
              </div>
              <button type="button" className="dashboard-button" onClick={openCamera} disabled={uploading}>
                Take your Picture
              </button>
            </div>
          )}
        </div>
      </div>

      <form className="account-form" onSubmit={handleSubmit}>
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
          <label htmlFor="keywords">* Keywords</label>
          <input id="keywords" name="keywords" value={form.keywords} onChange={onChange} placeholder="Your skills, job titles, certifications, etc." />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="primaryExperience">* Primary Job Experience (maximum 2)</label>
            <MultiSelectComponent
              id="primaryExperience"
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
            <label htmlFor="employmentTypes">* Employment Types</label>
            <MultiSelectComponent
              id="employmentTypes"
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
          <label htmlFor="languages">* Language(s)</label>
          <MultiSelectComponent
            id="languages"
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
            <label htmlFor="clearance">Security Clearance</label>
            <select id="clearance" name="clearance" value={form.clearance} onChange={onChange}>
              <option value="">Select</option>
              {SECURITY_CLEARANCE_LIST.map(o => (
                <option key={o.value} value={o.value}>{o.name}</option>
              ))}
            </select>
          </div>
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
          <div style={{ background: '#fff', borderRadius: 8, padding: 16, width: 520, maxWidth: '95vw', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            <h4 style={{ marginTop: 0 }}>Take your picture</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, placeItems: 'center' }}>
              <video ref={videoRef} playsInline muted style={{ width: 480, height: 360, background: '#000', maxWidth: '100%' }} />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="update-button" onClick={capturePhoto} disabled={uploading}>{uploading ? 'Uploading…' : 'Capture & Use Photo'}</button>
              <button type="button" className="dashboard-button" onClick={closeCamera}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
