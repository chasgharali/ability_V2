import React, { useEffect, useState } from 'react';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import settingsAPI from '../../services/settings';
import '../Dashboard/Dashboard.css';

const SETTING_MAX_RESUMES = 'resume_builder_max_resumes';
const SETTING_MAX_UPDATES = 'resume_builder_max_updates';
const DEFAULT_MAX_RESUMES = 1;
const DEFAULT_MAX_UPDATES = 3;

function parseLimit(value, defaultValue) {
  if (value === null || value === undefined) return defaultValue;
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) return defaultValue;
  return n;
}

export default function ResumeBuilderLimitsEditor() {
  const [maxResumes, setMaxResumes] = useState(String(DEFAULT_MAX_RESUMES));
  const [maxUpdates, setMaxUpdates] = useState(String(DEFAULT_MAX_UPDATES));
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadLimits();
  }, []);

  const loadLimits = async () => {
    try {
      setLoading(true);
      const [resumesRes, updatesRes] = await Promise.all([
        settingsAPI.getSetting(SETTING_MAX_RESUMES).catch(() => null),
        settingsAPI.getSetting(SETTING_MAX_UPDATES).catch(() => null)
      ]);
      setMaxResumes(String(parseLimit(resumesRes?.value, DEFAULT_MAX_RESUMES)));
      setMaxUpdates(String(parseLimit(updatesRes?.value, DEFAULT_MAX_UPDATES)));
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  };

  const validateInput = (label, raw) => {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n) || n < 0) {
      showMessage(`${label} must be a non-negative number (0 = unlimited).`);
      return null;
    }
    return n;
  };

  const handleSave = async () => {
    const resumes = validateInput('Max resumes', maxResumes);
    const updates = validateInput('Max updates', maxUpdates);
    if (resumes === null || updates === null) return;

    try {
      setSaving(true);
      await Promise.all([
        settingsAPI.setSetting(
          SETTING_MAX_RESUMES,
          resumes,
          'Maximum resumes each job seeker can create in Resume Builder (0 = unlimited)'
        ),
        settingsAPI.setSetting(
          SETTING_MAX_UPDATES,
          updates,
          'Maximum saves/AI generations each job seeker can make (0 = unlimited)'
        )
      ]);
      setMaxResumes(String(resumes));
      setMaxUpdates(String(updates));
      showMessage('Resume Builder limits saved.');
    } catch (error) {
      console.error('Failed to save resume builder limits:', error);
      showMessage(error.response?.data?.error || 'Failed to save limits.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setSaving(true);
      await Promise.all([
        settingsAPI.deleteSetting(SETTING_MAX_RESUMES).catch(() => {}),
        settingsAPI.deleteSetting(SETTING_MAX_UPDATES).catch(() => {})
      ]);
      setMaxResumes(String(DEFAULT_MAX_RESUMES));
      setMaxUpdates(String(DEFAULT_MAX_UPDATES));
      showMessage('Limits reset to defaults (1 resume, 3 updates).');
    } catch (error) {
      console.error('Failed to reset resume builder limits:', error);
      showMessage('Failed to reset limits.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="resume-builder-limits" />
        <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
          <div className="dashboard-content">
            <h1>Resume Builder Limits</h1>
            {message && (
              <div
                className="alert-box"
                role="status"
                aria-live="polite"
                style={{ background: '#f3f4f6', borderColor: '#e5e7eb', color: '#111827' }}
              >
                {message}
              </div>
            )}
            <div
              className="alert-box"
              style={{ background: '#f3f4f6', borderColor: '#e5e7eb', color: '#111827' }}
            >
              <p>
                Control how many resumes each job seeker can create and how many times they can save
                or run AI generation. Set a value to <strong>0</strong> for unlimited.
                Defaults when not configured: <strong>1 resume</strong> and <strong>3 updates</strong>.
              </p>
            </div>
            <div className="upload-card" style={{ maxWidth: 480 }}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label htmlFor="maxResumes" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                  Max resumes per job seeker
                </label>
                <input
                  id="maxResumes"
                  type="number"
                  min={0}
                  className="dashboard-input"
                  value={maxResumes}
                  onChange={(e) => setMaxResumes(e.target.value)}
                  disabled={loading || saving}
                  style={{ width: '100%' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="maxUpdates" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                  Max updates per job seeker
                </label>
                <input
                  id="maxUpdates"
                  type="number"
                  min={0}
                  className="dashboard-input"
                  value={maxUpdates}
                  onChange={(e) => setMaxUpdates(e.target.value)}
                  disabled={loading || saving}
                  style={{ width: '100%' }}
                />
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                  Each save or &quot;Fill from profile&quot; AI action counts as one update.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="dashboard-button"
                  style={{ width: 'auto' }}
                  onClick={handleSave}
                  disabled={loading || saving}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  className="dashboard-button"
                  style={{ width: 'auto', background: '#fff', color: '#374151', border: '1px solid #d1d5db' }}
                  onClick={handleReset}
                  disabled={loading || saving}
                >
                  Reset to defaults
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}