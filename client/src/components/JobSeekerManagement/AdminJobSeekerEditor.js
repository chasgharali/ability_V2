import React, { useCallback, useRef, useState } from 'react';
import axios from 'axios';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { MultiSelectComponent } from '@syncfusion/ej2-react-dropdowns';
import '@syncfusion/ej2-base/styles/material.css';
import '@syncfusion/ej2-buttons/styles/material.css';
import '@syncfusion/ej2-inputs/styles/material.css';
import '@syncfusion/ej2-react-dropdowns/styles/material.css';
import { Input } from '../UI/FormComponents';
import { updateUser } from '../../services/users';
import { useToast } from '../../contexts/ToastContext';
import { getSyncfusionMultiSelectA11yHandlers } from '../../utils/syncfusionMultiSelectA11y';
import {
  JOB_CATEGORY_LIST,
  LANGUAGE_LIST,
  JOB_TYPE_LIST,
  EXPERIENCE_LEVEL_LIST,
  EDUCATION_LEVEL_LIST,
  MILITARY_EXPERIENCE_LIST,
  COUNTRY_OF_ORIGIN_LIST
} from '../../constants/options';
import './JobSeekerManagement.css';

const getCountryCode = (countryValue) => {
  if (!countryValue) return '';
  if (countryValue.length === 2) return countryValue.toUpperCase();
  const country = COUNTRY_OF_ORIGIN_LIST.find(
    (c) =>
      c.name.toLowerCase() === countryValue.toLowerCase() ||
      c.value.toLowerCase() === countryValue.toLowerCase()
  );
  return country ? country.value : countryValue;
};

function resumeLabelFromUrl(url) {
  if (!url) return '';
  try {
    const parts = url.split('/');
    const fileName = parts[parts.length - 1].split('?')[0];
    return fileName || 'Resume uploaded';
  } catch {
    return 'Resume uploaded';
  }
}

function buildEditFormFromRow(row) {
  const metadata = row.metadata || {};
  const profile = metadata.profile || {};
  return {
    firstName: row.firstName || '',
    lastName: row.lastName || '',
    email: row.email || '',
    phone: row.phone || row.phoneNumber || '',
    city: row.city || '',
    state: row.state || '',
    country: getCountryCode(row.country || ''),
    password: '',
    confirmPassword: '',
    avatarUrl: row.avatarUrl || '',
    resumeUrl: row.resumeUrl || '',
    headline: profile.headline || metadata.professionalHeadline || metadata.headline || '',
    keywords: profile.keywords || metadata.skills || metadata.keywords || '',
    primaryExperience: Array.isArray(profile.primaryExperience)
      ? profile.primaryExperience
      : profile.primaryExperience
        ? [profile.primaryExperience]
        : metadata.primaryJobExperience
          ? [metadata.primaryJobExperience]
          : Array.isArray(metadata.primaryExperience)
            ? metadata.primaryExperience
            : [],
    employmentTypes: Array.isArray(profile.employmentTypes)
      ? profile.employmentTypes
      : profile.employmentTypes
        ? [profile.employmentTypes]
        : Array.isArray(metadata.employmentTypes)
          ? metadata.employmentTypes
          : metadata.employmentType
            ? [metadata.employmentType]
            : [],
    workLevel: profile.workLevel || metadata.experienceLevel || metadata.workLevel || '',
    educationLevel: profile.educationLevel || metadata.education || metadata.educationLevel || '',
    languages: Array.isArray(profile.languages)
      ? profile.languages
      : profile.languages
        ? [profile.languages]
        : Array.isArray(metadata.languages)
          ? metadata.languages
          : Array.isArray(row.languages)
            ? row.languages
            : [],
    workAuthorization: profile.workAuthorization || metadata.workAuthorization || metadata.workAuth || '',
    veteranStatus: profile.veteranStatus || metadata.veteranStatus || metadata.militaryStatus || '',
    usesScreenMagnifier: row.usesScreenMagnifier || false,
    usesScreenReader: row.usesScreenReader || false,
    needsASL: row.needsASL || false,
    needsCaptions: row.needsCaptions || false,
    needsOther: row.needsOther || false
  };
}

/**
 * Shared admin editor for a job seeker grid row (shape matches JobSeekerManagement mapped rows).
 * Parent should set key={row.id} so state resets when switching users.
 */
function toastType(syncfusionStyle) {
  const t = (syncfusionStyle || '').toLowerCase();
  if (t === 'success') return 'success';
  if (t === 'error') return 'error';
  if (t === 'warning') return 'warning';
  return 'info';
}

export default function AdminJobSeekerEditor({ row, onCancel, onSaved, idPrefix = 'jsm-admin-edit-' }) {
  const { show: pushToast } = useToast();
  const showToast = useCallback(
    (message, type = 'Success', duration = 3000) => {
      pushToast(message, { type: toastType(type), duration });
    },
    [pushToast]
  );
  const [editForm, setEditForm] = useState(() => buildEditFormFromRow(row));
  const [activeEditTab, setActiveEditTab] = useState(0);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingType, setUploadingType] = useState(null);
  const [resumeFileName, setResumeFileName] = useState(() => resumeLabelFromUrl(row.resumeUrl));
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(() => row.avatarUrl || '');
  const resumeInputRef = useRef(null);
  const avatarInputRef = useRef(null);

  const setEditField = useCallback((k, v) => setEditForm((prev) => ({ ...prev, [k]: v })), []);

  const uploadToS3 = async (file, fileType) => {
    setUploading(true);
    setUploadingType(fileType);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const presignRes = await axios.post(
        '/api/uploads/presign',
        {
          fileName: file.name,
          fileType,
          mimeType: file.type || (fileType === 'resume' ? 'application/pdf' : 'image/jpeg')
        },
        { headers }
      );

      const { upload, download } = presignRes.data;
      const { url, key } = upload;

      await axios.put(url, file, {
        headers: { 'Content-Type': file.type || 'application/octet-stream' }
      });

      const completeRes = await axios.post(
        '/api/uploads/complete',
        {
          fileKey: key,
          fileType,
          fileName: file.name,
          mimeType: file.type || (fileType === 'resume' ? 'application/pdf' : 'image/jpeg'),
          size: file.size
        },
        { headers }
      );

      const downloadUrl = completeRes?.data?.file?.downloadUrl || download?.url;

      if (fileType === 'resume') {
        setResumeFileName(file.name);
        setEditField('resumeUrl', downloadUrl);
        showToast('Resume uploaded successfully', 'Success');
        if (resumeInputRef.current) resumeInputRef.current.value = '';
      } else if (fileType === 'avatar') {
        setAvatarPreviewUrl(downloadUrl);
        setEditField('avatarUrl', downloadUrl);
        showToast('Profile picture uploaded successfully', 'Success');
        if (avatarInputRef.current) avatarInputRef.current.value = '';
      }

      return downloadUrl;
    } catch (e) {
      console.error('S3 upload error', e);
      const msg = e?.response?.data?.message || 'Upload failed';
      showToast(msg, 'Error', 5000);
      throw e;
    } finally {
      setUploading(false);
      setUploadingType(null);
    }
  };

  const handleResumeUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (!allowedTypes.includes(file.type)) {
      showToast('Please upload a PDF or Word document', 'Error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast('File size must be less than 10MB', 'Error');
      return;
    }

    try {
      await uploadToS3(file, 'resume');
    } catch {
      /* handled in uploadToS3 */
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file', 'Error');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast('Image size must be less than 2MB', 'Error');
      return;
    }

    try {
      await uploadToS3(file, 'avatar');
    } catch {
      /* handled in uploadToS3 */
    }
  };

  const handleSaveEdit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (!row?.id) return;

    if (editForm.password && editForm.password.trim()) {
      if (editForm.password.length < 8) {
        showToast('Password must be at least 8 characters long', 'Error');
        return;
      }
      if (!editForm.confirmPassword || !editForm.confirmPassword.trim()) {
        showToast('Please confirm your password', 'Error');
        return;
      }
      if (editForm.password !== editForm.confirmPassword) {
        showToast('Passwords do not match. Please enter the same password in both fields', 'Error');
        return;
      }
    } else if (editForm.confirmPassword && editForm.confirmPassword.trim() && !editForm.password) {
      showToast('Please enter a password', 'Error');
      return;
    }

    setSaving(true);
    try {
      const fullName = `${editForm.firstName} ${editForm.lastName}`.trim();
      const payload = {
        name: fullName || undefined,
        email: editForm.email || undefined,
        phoneNumber: editForm.phone || undefined,
        city: editForm.city || undefined,
        state: editForm.state || undefined,
        country: editForm.country || undefined,
        avatarUrl: editForm.avatarUrl || undefined,
        resumeUrl: editForm.resumeUrl || undefined,
        usesScreenMagnifier: editForm.usesScreenMagnifier,
        usesScreenReader: editForm.usesScreenReader,
        needsASL: editForm.needsASL,
        needsCaptions: editForm.needsCaptions,
        needsOther: editForm.needsOther,
        profile: {
          headline: editForm.headline || undefined,
          keywords: editForm.keywords || undefined,
          primaryExperience:
            editForm.primaryExperience && editForm.primaryExperience.length > 0
              ? editForm.primaryExperience
              : undefined,
          employmentTypes:
            editForm.employmentTypes && editForm.employmentTypes.length > 0
              ? editForm.employmentTypes
              : undefined,
          workLevel: editForm.workLevel || undefined,
          educationLevel: editForm.educationLevel || undefined,
          languages: editForm.languages && editForm.languages.length > 0 ? editForm.languages : undefined,
          workAuthorization: editForm.workAuthorization || undefined,
          veteranStatus: editForm.veteranStatus || undefined
        }
      };

      if (editForm.password && editForm.password.trim()) {
        payload.password = editForm.password;
      }

      await updateUser(row.id, payload);
      showToast('Job seeker updated successfully', 'Success');
      await onSaved();
    } catch (err) {
      console.error('Update failed', err);
      const msg = err?.response?.data?.message || 'Failed to update job seeker';
      showToast(msg, 'Error', 5000);
    } finally {
      setSaving(false);
    }
  };

  const avatarId = `${idPrefix}avatar-upload`;
  const resumeId = `${idPrefix}resume-upload`;

  return (
    <div className="dashboard-content">
      <div className="form-header">
        <ButtonComponent cssClass="e-outline e-primary" onClick={onCancel}>
          ← Back to List
        </ButtonComponent>
        <h2>
          Edit Job Seeker: {editForm.firstName} {editForm.lastName}
        </h2>
      </div>

      <div className="jsm-custom-tabs">
        <div className="jsm-tab-headers">
          {[
            'Basic Information',
            'Professional Summary',
            'Experience & Employment',
            'Education & Qualifications',
            'Additional Information',
            'Accessibility Needs'
          ].map((tab, index) => (
            <button
              key={tab}
              type="button"
              className={`jsm-tab-btn ${activeEditTab === index ? 'active' : ''}`}
              onClick={() => setActiveEditTab(index)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="jsm-tab-content">
          {activeEditTab === 0 && (
            <div className="jsm-tab-panel">
              <Input
                label="First Name"
                value={editForm.firstName}
                onChange={(e) => setEditField('firstName', e.target.value)}
                required
                placeholder="Enter first name"
              />
              <Input
                label="Last Name"
                value={editForm.lastName}
                onChange={(e) => setEditField('lastName', e.target.value)}
                required
                placeholder="Enter last name"
              />
              <Input
                label="Email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditField('email', e.target.value)}
                required
                placeholder="Enter email address"
              />
              <div className="password-field-container">
                <Input
                  label="New Password (leave blank to keep current)"
                  type={showPwd ? 'text' : 'password'}
                  value={editForm.password}
                  onChange={(e) => setEditField('password', e.target.value)}
                />
                <ButtonComponent
                  cssClass="e-outline e-primary e-small password-toggle-btn"
                  aria-pressed={showPwd}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPwd((s) => !s)}
                >
                  {showPwd ? 'Hide' : 'Show'}
                </ButtonComponent>
              </div>
              <div className="password-field-container">
                <Input
                  label="Confirm New Password (leave blank to keep current)"
                  type={showConfirmPwd ? 'text' : 'password'}
                  value={editForm.confirmPassword}
                  onChange={(e) => setEditField('confirmPassword', e.target.value)}
                />
                <ButtonComponent
                  cssClass="e-outline e-primary e-small password-toggle-btn"
                  aria-pressed={showConfirmPwd}
                  aria-label={showConfirmPwd ? 'Hide confirm password' : 'Show confirm password'}
                  onClick={() => setShowConfirmPwd((s) => !s)}
                >
                  {showConfirmPwd ? 'Hide' : 'Show'}
                </ButtonComponent>
              </div>
              <Input
                label="Phone"
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditField('phone', e.target.value)}
                placeholder="Enter phone number"
              />
              <Input
                label="City"
                value={editForm.city}
                onChange={(e) => setEditField('city', e.target.value)}
                placeholder="Enter city"
              />
              <Input
                label="State"
                value={editForm.state}
                onChange={(e) => setEditField('state', e.target.value)}
                placeholder="Enter state"
              />
              <div className="jsm-form-field-wrapper">
                <label className="jsm-field-label" htmlFor={`${idPrefix}country-select`}>
                  Country
                </label>
                <select
                  id={`${idPrefix}country-select`}
                  className="jsm-select"
                  value={editForm.country || ''}
                  onChange={(e) => setEditField('country', e.target.value)}
                >
                  <option value="">Select Country</option>
                  {COUNTRY_OF_ORIGIN_LIST.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="jsm-upload-field">
                <label className="jsm-field-label">Profile Image</label>
                <div className="jsm-upload-container">
                  {(avatarPreviewUrl || editForm.avatarUrl) && (
                    <div className="jsm-avatar-preview">
                      <img
                        src={avatarPreviewUrl || editForm.avatarUrl}
                        alt="Profile preview"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                      <button
                        type="button"
                        className="jsm-remove-avatar"
                        onClick={() => {
                          setAvatarPreviewUrl('');
                          setEditField('avatarUrl', '');
                          if (avatarInputRef.current) avatarInputRef.current.value = '';
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  <div className="jsm-upload-input-wrapper">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      disabled={uploading && uploadingType === 'avatar'}
                      className="jsm-file-input"
                      id={avatarId}
                    />
                    <label htmlFor={avatarId} className="jsm-file-label">
                      {uploading && uploadingType === 'avatar'
                        ? 'Uploading...'
                        : avatarPreviewUrl
                          ? 'Change Image'
                          : 'Upload Profile Image'}
                    </label>
                  </div>
                  <p className="jsm-upload-hint">Accepted formats: JPG, PNG, GIF, WebP (max 2MB)</p>
                </div>
              </div>

              <div className="jsm-upload-field">
                <label className="jsm-field-label">Resume</label>
                <div className="jsm-upload-container">
                  {(resumeFileName || editForm.resumeUrl) && (
                    <div className="jsm-resume-info">
                      <span className="jsm-resume-name">{resumeFileName || 'Resume uploaded'}</span>
                      {(editForm.resumeUrl || resumeFileName) && (
                        <a
                          href={editForm.resumeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="jsm-view-resume"
                        >
                          View Resume
                        </a>
                      )}
                      <button
                        type="button"
                        className="jsm-remove-resume"
                        onClick={() => {
                          setResumeFileName('');
                          setEditField('resumeUrl', '');
                          if (resumeInputRef.current) resumeInputRef.current.value = '';
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  <div className="jsm-upload-input-wrapper">
                    <input
                      ref={resumeInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={handleResumeUpload}
                      disabled={uploading && uploadingType === 'resume'}
                      className="jsm-file-input"
                      id={resumeId}
                    />
                    <label htmlFor={resumeId} className="jsm-file-label">
                      {uploading && uploadingType === 'resume'
                        ? 'Uploading...'
                        : resumeFileName
                          ? 'Change Resume'
                          : 'Upload Resume'}
                    </label>
                  </div>
                  <p className="jsm-upload-hint">Accepted formats: PDF, DOC, DOCX (max 10MB)</p>
                </div>
              </div>
            </div>
          )}

          {activeEditTab === 1 && (
            <div className="jsm-tab-panel">
              <Input
                label="Professional Headline"
                value={editForm.headline}
                onChange={(e) => setEditField('headline', e.target.value)}
                placeholder="Enter professional headline"
              />
              <Input
                label="Keywords & Skills"
                value={editForm.keywords}
                onChange={(e) => setEditField('keywords', e.target.value)}
                placeholder="Enter keywords and skills (comma-separated)"
              />
            </div>
          )}

          {activeEditTab === 2 && (
            <div className="jsm-tab-panel">
              <div className="jsm-form-field-wrapper">
                <label id={`${idPrefix}primaryExperience-label`} htmlFor={`${idPrefix}primaryExperience`} className="jsm-field-label">
                  Primary Job Experience (max 2)
                </label>
                <span id={`${idPrefix}primaryExperience-instructions`} className="sr-only">
                  Select one or two Primary Job Experience
                </span>
                <MultiSelectComponent
                  id={`${idPrefix}primaryExperience`}
                  aria-labelledby={`${idPrefix}primaryExperience-label`}
                  aria-describedby={`${idPrefix}primaryExperience-instructions`}
                  dataSource={JOB_CATEGORY_LIST}
                  fields={{ text: 'name', value: 'value' }}
                  value={editForm.primaryExperience}
                  mode="Box"
                  placeholder="Select up to 2"
                  enableSelectionOrder={false}
                  maximumSelectionLength={2}
                  cssClass="jsm-multiselect"
                  showDropDownIcon={true}
                  popupHeight="260px"
                  allowFiltering={false}
                  {...getSyncfusionMultiSelectA11yHandlers({
                    inputId: `${idPrefix}primaryExperience`,
                    labelId: `${idPrefix}primaryExperience-label`,
                    instructionsId: `${idPrefix}primaryExperience-instructions`,
                    listboxLabel: 'Primary Job Experience options',
                  })}
                  change={(args) => {
                    const values = Array.isArray(args?.value) ? args.value : [];
                    setEditField('primaryExperience', values.slice(0, 2));
                  }}
                />
              </div>
              <div className="jsm-form-field-wrapper">
                <label id={`${idPrefix}employmentTypes-label`} htmlFor={`${idPrefix}employmentTypes`} className="jsm-field-label">
                  Employment Types
                </label>
                <span id={`${idPrefix}employmentTypes-instructions`} className="sr-only">
                  Select one or more Employment Types
                </span>
                <MultiSelectComponent
                  id={`${idPrefix}employmentTypes`}
                  aria-labelledby={`${idPrefix}employmentTypes-label`}
                  aria-describedby={`${idPrefix}employmentTypes-instructions`}
                  dataSource={JOB_TYPE_LIST}
                  fields={{ text: 'name', value: 'value' }}
                  value={editForm.employmentTypes}
                  mode="Box"
                  placeholder="Select employment types"
                  enableSelectionOrder={false}
                  cssClass="jsm-multiselect"
                  showDropDownIcon={true}
                  popupHeight="260px"
                  allowFiltering={false}
                  {...getSyncfusionMultiSelectA11yHandlers({
                    inputId: `${idPrefix}employmentTypes`,
                    labelId: `${idPrefix}employmentTypes-label`,
                    instructionsId: `${idPrefix}employmentTypes-instructions`,
                    listboxLabel: 'Employment Types options',
                  })}
                  change={(args) => {
                    const values = Array.isArray(args?.value) ? args.value : [];
                    setEditField('employmentTypes', values);
                  }}
                />
              </div>
              <div className="jsm-form-field-wrapper">
                <label className="jsm-field-label" htmlFor={`${idPrefix}workLevel`}>
                  Experience Level
                </label>
                <select
                  id={`${idPrefix}workLevel`}
                  className="jsm-select"
                  value={editForm.workLevel || ''}
                  onChange={(e) => setEditField('workLevel', e.target.value)}
                >
                  <option value="">Select experience level</option>
                  {EXPERIENCE_LEVEL_LIST.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {activeEditTab === 3 && (
            <div className="jsm-tab-panel">
              <div className="jsm-form-field-wrapper">
                <label className="jsm-field-label" htmlFor={`${idPrefix}educationLevel`}>
                  Highest Education Level
                </label>
                <select
                  id={`${idPrefix}educationLevel`}
                  className="jsm-select"
                  value={editForm.educationLevel || ''}
                  onChange={(e) => setEditField('educationLevel', e.target.value)}
                >
                  <option value="">Select education level</option>
                  {EDUCATION_LEVEL_LIST.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {activeEditTab === 4 && (
            <div className="jsm-tab-panel">
              <div className="jsm-form-field-wrapper">
                <label id={`${idPrefix}languages-label`} htmlFor={`${idPrefix}languages`} className="jsm-field-label">
                  Languages
                </label>
                <span id={`${idPrefix}languages-instructions`} className="sr-only">
                  Select one or more Language(s)
                </span>
                <MultiSelectComponent
                  id={`${idPrefix}languages`}
                  aria-labelledby={`${idPrefix}languages-label`}
                  aria-describedby={`${idPrefix}languages-instructions`}
                  dataSource={LANGUAGE_LIST}
                  fields={{ text: 'name', value: 'value' }}
                  value={editForm.languages}
                  mode="Box"
                  placeholder="Select languages"
                  enableSelectionOrder={false}
                  cssClass="jsm-multiselect"
                  showDropDownIcon={true}
                  popupHeight="260px"
                  allowFiltering={false}
                  {...getSyncfusionMultiSelectA11yHandlers({
                    inputId: `${idPrefix}languages`,
                    labelId: `${idPrefix}languages-label`,
                    instructionsId: `${idPrefix}languages-instructions`,
                    listboxLabel: 'Language options',
                  })}
                  change={(args) => {
                    const values = Array.isArray(args?.value) ? args.value : [];
                    setEditField('languages', values);
                  }}
                />
              </div>
              <Input
                label="Work Authorization"
                value={editForm.workAuthorization}
                onChange={(e) => setEditField('workAuthorization', e.target.value)}
                placeholder="Enter work authorization"
              />
              <div className="jsm-form-field-wrapper">
                <label className="jsm-field-label" htmlFor={`${idPrefix}veteranStatus`}>
                  Veteran/Military Status
                </label>
                <select
                  id={`${idPrefix}veteranStatus`}
                  className="jsm-select"
                  value={editForm.veteranStatus || ''}
                  onChange={(e) => setEditField('veteranStatus', e.target.value)}
                >
                  <option value="">Select veteran status</option>
                  {MILITARY_EXPERIENCE_LIST.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {activeEditTab === 5 && (
            <div className="jsm-tab-panel">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <label className="jsm-checkbox-label">
                  <input
                    type="checkbox"
                    checked={editForm.usesScreenMagnifier}
                    onChange={(e) => setEditField('usesScreenMagnifier', e.target.checked)}
                  />
                  <span>Screen Magnifier</span>
                </label>
                <label className="jsm-checkbox-label">
                  <input
                    type="checkbox"
                    checked={editForm.usesScreenReader}
                    onChange={(e) => setEditField('usesScreenReader', e.target.checked)}
                  />
                  <span>Screen Reader</span>
                </label>
                <label className="jsm-checkbox-label">
                  <input
                    type="checkbox"
                    checked={editForm.needsASL}
                    onChange={(e) => setEditField('needsASL', e.target.checked)}
                  />
                  <span>Sign Language Interpreter</span>
                </label>
                <label className="jsm-checkbox-label">
                  <input
                    type="checkbox"
                    checked={editForm.needsCaptions}
                    onChange={(e) => setEditField('needsCaptions', e.target.checked)}
                  />
                  <span>Captions</span>
                </label>
                <label className="jsm-checkbox-label">
                  <input
                    type="checkbox"
                    checked={editForm.needsOther}
                    onChange={(e) => setEditField('needsOther', e.target.checked)}
                  />
                  <span>Other Accommodations</span>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="jsm-save-button-container">
          <ButtonComponent cssClass="e-primary" disabled={saving} isPrimary={true} onClick={handleSaveEdit}>
            {saving ? 'Saving…' : 'Save Changes'}
          </ButtonComponent>
        </div>
      </div>
    </div>
  );
}

/** Map a populated User job seeker document to the grid row shape expected by AdminJobSeekerEditor. */
export function mapJobSeekerUserToAdminEditRow(js) {
  if (!js || !js._id) return null;
  const parts = (js.name || '').trim().split(/\s+/);
  const firstName = js.firstName || parts[0] || '';
  const lastName = js.lastName || parts.slice(1).join(' ') || '';
  return {
    id: js._id,
    firstName,
    lastName,
    email: js.email,
    phone: js.phoneNumber || '',
    phoneNumber: js.phoneNumber || '',
    city: js.city || '',
    state: js.state || '',
    country: js.country || '',
    metadata: js.metadata || {},
    avatarUrl: js.avatarUrl,
    resumeUrl: js.resumeUrl,
    languages: js.languages,
    usesScreenMagnifier: js.usesScreenMagnifier,
    usesScreenReader: js.usesScreenReader,
    needsASL: js.needsASL,
    needsCaptions: js.needsCaptions,
    needsOther: js.needsOther
  };
}
