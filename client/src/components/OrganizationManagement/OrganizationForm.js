import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createOrganization, updateOrganization, uploadOrganizationLogo } from '../../services/organizations';

const DEFAULT_LIMITS = { maxEvents: 0, maxRecruiters: 0, maxJobSeekers: 0, maxBooths: 0 };

export default function OrganizationForm({ org, onSave, onCancel }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SuperAdmin';
  const isNew = !org;

  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    logoUrl: '',
    logoAltText: '',
    isActive: true,
    limits: DEFAULT_LIMITS
  });
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [selectedLogoFile, setSelectedLogoFile] = useState(null);
  const [selectedLogoPreviewUrl, setSelectedLogoPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('basic');

  useEffect(() => {
    if (org) {
      setForm({
        name: org.name || '',
        slug: org.slug || '',
        description: org.description || '',
        logoUrl: org.logoUrl || '',
        logoAltText: org.logoAltText || '',
        isActive: org.isActive !== false,
        limits: { ...DEFAULT_LIMITS, ...(org.limits || {}) }
      });
      setSelectedLogoFile(null);
      setSelectedLogoPreviewUrl('');
    }
  }, [org]);

  useEffect(() => {
    if (!selectedLogoFile) {
      setSelectedLogoPreviewUrl('');
      return;
    }
    const objectUrl = URL.createObjectURL(selectedLogoFile);
    setSelectedLogoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedLogoFile]);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const setLimit = (field, value) => setForm(prev => ({
    ...prev,
    limits: { ...prev.limits, [field]: parseInt(value) || 0 }
  }));

  const handleLogoFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file for organization logo.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo file size must be 2MB or less.');
      return;
    }
    setSelectedLogoFile(file);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Organization name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        logoUrl: form.logoUrl.trim() || null,
        logoAltText: form.logoAltText.trim()
      };
      if (isSuperAdmin) {
        payload.slug = form.slug.trim() || undefined;
        payload.isActive = form.isActive;
        payload.limits = form.limits;
      }
      let savedOrg;
      if (isNew) {
        const created = await createOrganization(payload);
        savedOrg = created?.organization;
      } else {
        const updated = await updateOrganization(org._id, payload);
        savedOrg = updated?.organization;
      }

      if (selectedLogoFile) {
        const targetOrgId = savedOrg?._id || org?._id;
        if (!targetOrgId) {
          throw new Error('Organization ID is not available for logo upload');
        }
        setLogoUploading(true);
        await uploadOrganizationLogo(targetOrgId, selectedLogoFile);
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save organization');
    } finally {
      setLogoUploading(false);
      setSaving(false);
    }
  };

  return (
    <div className="org-form">
      <div className="org-form-header">
        <h1>{isNew ? 'Create Organization' : `Edit: ${org.name}`}</h1>
      </div>

      {/* Tabs */}
      <div className="org-form-tabs" role="tablist">
        {['basic', 'limits'].map(tab => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            className={`org-tab ${activeTab === tab ? 'org-tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'basic' ? 'Basic Info' : 'Limits'}
          </button>
        ))}
      </div>

      {error && <div className="org-error" role="alert">{error}</div>}

      <form onSubmit={handleSubmit} noValidate>
        {activeTab === 'basic' && (
          <div className="org-form-section">
            <div className="form-group">
              <label htmlFor="org-name">Organization Name *</label>
              <input
                id="org-name"
                type="text"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                required
                maxLength={200}
                className="form-input"
              />
            </div>

            {isSuperAdmin && (
              <div className="form-group">
                <label htmlFor="org-slug">Slug (URL identifier)</label>
                <input
                  id="org-slug"
                  type="text"
                  value={form.slug}
                  onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="auto-generated from name"
                  className="form-input"
                />
                <small>lowercase letters, numbers, and hyphens only</small>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="org-description">Description</label>
              <textarea
                id="org-description"
                value={form.description}
                onChange={e => set('description', e.target.value)}
                rows={3}
                maxLength={2000}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="org-logo-upload">Logo Upload (S3)</label>
              <input
                id="org-logo-upload"
                type="file"
                accept="image/*"
                onChange={handleLogoFileChange}
                className="form-input"
              />
              <small>Upload a PNG/JPG/WebP image (max 2MB). The file will be stored in S3.</small>
              {(selectedLogoFile || form.logoUrl) && (
                <div className="org-logo-upload-preview">
                  <span>{selectedLogoFile ? `Selected: ${selectedLogoFile.name}` : 'Current logo:'}</span>
                  {selectedLogoPreviewUrl ? (
                    <img src={selectedLogoPreviewUrl} alt="Selected organization logo preview" className="org-logo-upload-preview-image" />
                  ) : form.logoUrl ? (
                    <img src={form.logoUrl} alt={form.logoAltText || 'Organization logo preview'} className="org-logo-upload-preview-image" />
                  ) : null}
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="org-logo-alt">Logo Alt Text</label>
              <input
                id="org-logo-alt"
                type="text"
                value={form.logoAltText}
                onChange={e => set('logoAltText', e.target.value)}
                maxLength={200}
                className="form-input"
              />
            </div>

            {isSuperAdmin && (
              <div className="form-group form-group--checkbox">
                <label className="org-active-toggle">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={e => set('isActive', e.target.checked)}
                  />
                  <span>Active</span>
                </label>
              </div>
            )}
          </div>
        )}

        {activeTab === 'limits' && isSuperAdmin && (
          <div className="org-form-section">
            <p className="org-form-hint">Set to 0 for unlimited.</p>

            <div className="form-group">
              <label htmlFor="limit-events">Maximum Events</label>
              <input
                id="limit-events"
                type="number"
                min={0}
                value={form.limits.maxEvents}
                onChange={e => setLimit('maxEvents', e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="limit-recruiters">Maximum Recruiters</label>
              <input
                id="limit-recruiters"
                type="number"
                min={0}
                value={form.limits.maxRecruiters}
                onChange={e => setLimit('maxRecruiters', e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="limit-js">Maximum Job Seekers</label>
              <input
                id="limit-js"
                type="number"
                min={0}
                value={form.limits.maxJobSeekers}
                onChange={e => setLimit('maxJobSeekers', e.target.value)}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="limit-booths">Maximum Booths</label>
              <input
                id="limit-booths"
                type="number"
                min={0}
                value={form.limits.maxBooths}
                onChange={e => setLimit('maxBooths', e.target.value)}
                className="form-input"
              />
            </div>
          </div>
        )}

        {activeTab === 'limits' && !isSuperAdmin && (
          <div className="org-form-section">
            <p>Limits are managed by the platform Super Admin.</p>
            <ul>
              <li>Max Events: {form.limits.maxEvents || 'Unlimited'}</li>
              <li>Max Recruiters: {form.limits.maxRecruiters || 'Unlimited'}</li>
              <li>Max Job Seekers: {form.limits.maxJobSeekers || 'Unlimited'}</li>
              <li>Max Booths: {form.limits.maxBooths || 'Unlimited'}</li>
            </ul>
          </div>
        )}

        <div className="org-form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || logoUploading}>
            {saving || logoUploading ? 'Saving...' : isNew ? 'Create Organization' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
