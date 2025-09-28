import React, { useEffect, useState } from 'react';
import './Dashboard.css';
import {
  JOB_CATEGORY_LIST,
  JOB_TYPE_LIST,
  EXPERIENCE_LEVEL_LIST,
  EDUCATION_LEVEL_LIST,
  LANGUAGE_LIST,
  SECURITY_CLEARANCE_LIST,
  MILITARY_EXPERIENCE_LIST
} from '../../constants/options';

export default function ViewProfile() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const getToken = () => localStorage.getItem('token');

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/users/me', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`
          }
        });
        if (!res.ok) throw new Error('Failed to load profile');
        const data = await res.json();
        setUser(data?.user || null);
        setProfile(data?.profile || null);
      } catch (e) {
        setError(e.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"/>
        <p>Loading profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-content">
        <div className="alert-box" style={{ background: '#ffe8e8' }}>{error}</div>
      </div>
    );
  }

  const avatarUrl = user?.avatarUrl || '';
  const name = user?.name || '';
  const email = user?.email || '';
  const phone = user?.phoneNumber || '';
  const location = [user?.city, user?.state].filter(Boolean).join(', ');
  const country = user?.country || '';
  const resumeUrl = user?.resumeUrl || '';

  const headline = profile?.headline || '';
  const keywords = profile?.keywords || '';
  const primaryExperience = Array.isArray(profile?.primaryExperience) ? profile.primaryExperience : [];
  const employmentTypes = Array.isArray(profile?.employmentTypes) ? profile.employmentTypes : [];
  const workLevel = profile?.workLevel || '';
  const educationLevel = profile?.educationLevel || '';
  const languages = Array.isArray(profile?.languages) ? profile.languages : [];
  const clearance = profile?.clearance || '';
  const veteranStatus = profile?.veteranStatus || '';

  // Build value->name maps from centralized options
  const toMap = (list) => Object.fromEntries((list || []).map(o => [o.value, o.name]));
  const JOB_CATEGORY_MAP = toMap(JOB_CATEGORY_LIST);
  const JOB_TYPE_MAP = toMap(JOB_TYPE_LIST);
  const EXP_MAP = toMap(EXPERIENCE_LEVEL_LIST);
  const EDU_MAP = toMap(EDUCATION_LEVEL_LIST);
  const LANG_MAP = toMap(LANGUAGE_LIST);
  const CLEAR_MAP = toMap(SECURITY_CLEARANCE_LIST);
  const VET_MAP = toMap(MILITARY_EXPERIENCE_LIST);

  const mapValue = (val, map) => map[val] || val || '—';
  const mapArray = (vals, map) => {
    if (!Array.isArray(vals) || vals.length === 0) return [];
    return vals.map(v => map[v] || v).filter(Boolean);
  };

  // Pretty chips for arrays
  const Chips = ({ items }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {items.map((t, i) => (
        <span key={`${t}-${i}`} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: 999, fontSize: 12 }}>{t}</span>
      ))}
    </div>
  );

  const primaryExperienceNames = mapArray(primaryExperience, JOB_CATEGORY_MAP);
  const employmentTypeNames = mapArray(employmentTypes, JOB_TYPE_MAP);
  const languageNames = mapArray(languages, LANG_MAP);

  return (
    <div className="dashboard-content">
      <h2>Job Seeker Profile</h2>
      <div className="alert-box">
        <p>This is the profile that recruiters will see. It will only be shared with companies you show interest in and the booths you visit.</p>
      </div>

      {/* Header card */}
      <div style={{ display: 'grid', placeItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <div style={{ width: 120, height: 120, borderRadius: '50%', background: '#f2f2f2', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}>
          <div className="avatar-preview" style={{ width: '100%', height: '100%', borderRadius: 0, backgroundImage: avatarUrl ? `url(${avatarUrl})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }} />
        </div>
        <div style={{ textAlign: 'center', lineHeight: 1.35 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{name || '—'}</div>
          <div style={{ color: '#475569' }}>{email || '—'}</div>
          {phone ? <div style={{ color: '#475569' }}>{phone}</div> : null}
          <div style={{ color: '#475569' }}>{[location, country].filter(Boolean).join(', ') || '—'}</div>
        </div>
        {resumeUrl ? (
          <a href={resumeUrl} target="_blank" rel="noreferrer" className="dashboard-button" style={{ minWidth: 240, textAlign: 'center' }}>
            View Complete Resume
          </a>
        ) : null}
      </div>

      {/* Details grid */}
      <div className="account-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        <div className="account-section" style={{ gridColumn: '1 / -1' }}>
          <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="form-group">
              <label>Headline</label>
              <div className="readonly-field">{headline || '—'}</div>
            </div>
            <div className="form-group">
              <label>Keywords</label>
              <div className="readonly-field">{keywords || '—'}</div>
            </div>
            <div className="form-group">
              <label>Primary Job Experience</label>
              <div className="readonly-field">{primaryExperienceNames.length ? <Chips items={primaryExperienceNames} /> : '—'}</div>
            </div>
            <div className="form-group">
              <label>Employment Types</label>
              <div className="readonly-field">{employmentTypeNames.length ? <Chips items={employmentTypeNames} /> : '—'}</div>
            </div>
            <div className="form-group">
              <label>Work Experience Level</label>
              <div className="readonly-field">{mapValue(workLevel, EXP_MAP)}</div>
            </div>
            <div className="form-group">
              <label>Highest Education Level</label>
              <div className="readonly-field">{mapValue(educationLevel, EDU_MAP)}</div>
            </div>
            <div className="form-group">
              <label>Language(s)</label>
              <div className="readonly-field">{languageNames.length ? <Chips items={languageNames} /> : '—'}</div>
            </div>
            <div className="form-group">
              <label>Security Clearance</label>
              <div className="readonly-field">{mapValue(clearance, CLEAR_MAP)}</div>
            </div>
            <div className="form-group">
              <label>Veteran/Military Status</label>
              <div className="readonly-field">{mapValue(veteranStatus, VET_MAP)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
