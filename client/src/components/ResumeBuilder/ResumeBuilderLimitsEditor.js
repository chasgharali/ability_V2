import React, { useEffect, useState } from 'react';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import settingsAPI from '../../services/settings';
import '../Dashboard/Dashboard.css';

const SETTING_MAX_RESUMES = 'resume_builder_max_resumes';
const SETTING_MAX_UPDATES = 'resume_builder_max_updates';
const SETTING_AI_ENABLED = 'resume_builder_ai_enabled';
const DEFAULT_MAX_RESUMES = 2;
const DEFAULT_MAX_UPDATES = 3;
const DEFAULT_AI_ENABLED = false;

function parseLimit(value, defaultValue) {
  if (value === null || value === undefined) return defaultValue;
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) return defaultValue;
  return n;
}

function parseBoolean(value, defaultValue) {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return defaultValue;
}

export default function ResumeBuilderLimitsEditor() {
  const [maxResumes, setMaxResumes] = useState(String(DEFAULT_MAX_RESUMES));
  const [maxUpdates, setMaxUpdates] = useState(String(DEFAULT_MAX_UPDATES));
  const [aiEnabled, setAiEnabled] = useState(DEFAULT_AI_ENABLED);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadLimits();
  }, []);

  const loadLimits = async () => {
    try {
      setLoading(true);
      const [resumesRes, updatesRes, aiEnabledRes] = await Promise.all([
        settingsAPI.getSetting(SETTING_MAX_RESUMES).catch(() => null),
        settingsAPI.getSetting(SETTING_MAX_UPDATES).catch(() => null),
        settingsAPI.getSetting(SETTING_AI_ENABLED).catch(() => null)
      ]);
      setMaxResumes(String(parseLimit(resumesRes?.value, DEFAULT_MAX_RESUMES)));
      setMaxUpdates(String(parseLimit(updatesRes?.value, DEFAULT_MAX_UPDATES)));
      setAiEnabled(parseBoolean(aiEnabledRes?.value, DEFAULT_AI_ENABLED));
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
        ),
        settingsAPI.setSetting(
          SETTING_AI_ENABLED,
          aiEnabled,
          'Enable or disable Resume Builder AI features for all job seekers'
        )
      ]);
      setMaxResumes(String(resumes));
      setMaxUpdates(String(updates));
      showMessage('Resume Builder settings saved.');
    } catch (error) {
      console.error('Failed to save resume builder limits:', error);
      showMessage(error.response?.data?.error || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setSaving(true);
      await Promise.all([
        settingsAPI.deleteSetting(SETTING_MAX_RESUMES).catch(() => {}),
        settingsAPI.deleteSetting(SETTING_MAX_UPDATES).catch(() => {}),
        settingsAPI.deleteSetting(SETTING_AI_ENABLED).catch(() => {})
      ]);
      setMaxResumes(String(DEFAULT_MAX_RESUMES));
      setMaxUpdates(String(DEFAULT_MAX_UPDATES));
      setAiEnabled(DEFAULT_AI_ENABLED);
      showMessage('Settings reset to defaults (2 resumes, 3 updates, AI off).');
    } catch (error) {
      console.error('Failed to reset resume builder limits:', error);
      showMessage('Failed to reset settings.');
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
            <h1>Resume Builder Settings</h1>
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
                their resume. You can also enable or disable Resume Builder AI features globally.
                Set a value to <strong>0</strong> for unlimited.
                Defaults when not configured: <strong>2 resumes</strong>, <strong>3 updates</strong>, and <strong>AI off</strong>.
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
                  Each save or &quot;Generate from Profile&quot; action counts as one update.
                </p>
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label
                  htmlFor="resumeBuilderAiEnabled"
                  className="rb-settings-ai-toggle"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', fontWeight: 500, cursor: loading || saving ? 'default' : 'pointer' }}
                >
                  <input
                    id="resumeBuilderAiEnabled"
                    type="checkbox"
                    checked={aiEnabled}
                    onChange={(e) => setAiEnabled(e.target.checked)}
                    disabled={loading || saving}
                  />
                  Enable Resume Builder AI features
                </label>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                  Controls AI generation, AI suggestions, and AI resume parsing in Resume Builder.
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