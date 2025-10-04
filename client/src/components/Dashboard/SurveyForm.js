import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Dashboard.css';
import { registerLicense } from '@syncfusion/ej2-base';
import { MultiSelectComponent } from '@syncfusion/ej2-react-dropdowns';
// Syncfusion styles
import '@syncfusion/ej2-base/styles/material.css';
import '@syncfusion/ej2-buttons/styles/material.css';
import '@syncfusion/ej2-react-dropdowns/styles/material.css';

// Register Syncfusion license from env if provided
if (process.env.REACT_APP_SYNCFUSION_LICENSE) {
  try { registerLicense(process.env.REACT_APP_SYNCFUSION_LICENSE); } catch (_) { }
}

// Race categories aligned to reference UI
const RACE_OPTIONS = [
  'American Indian, Alaska Native or Indigenous',
  'Hispanic or Latino, Latina or Latine',
  'Native Hawaiian or Other Pacific Islander',
  'South Asian',
  'Southeast Asian',
  'East Asian',
  'West Asian',
  'Black or African American',
  'White/Caucasian',
  'Prefer not to answer'
];

const AGE_GROUPS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];

const DISABILITY_OPTIONS = [
  'ADHD', 'Arthritis', 'Autoimmune', 'Blindness / Vision Loss', 'Blood Related', 'Cancer', 'Cardiovascular', 'Cerebral Palsy',
  'Chronic Pain/Migraine', 'Cognitive', 'Deafness', 'Depression', 'Diabetes', 'Digestive', 'Down Syndrome', 'Dyslexia',
  'Endocrine', 'Hearing Loss', 'Limb Diff / Amputee', 'Mental Health', 'Multiple Sclerosis', 'Musculoskeletal', 'Neurodivergent', 'Neurological',
  'Paralysis', 'Post Traumatic Stress', 'Respiratory', 'Skin', 'Speech', 'Traumatic Brain Injury'
];

// Comprehensive country list (display names)
const COUNTRIES_RAW = [
  'United States', 'Canada', 'United Kingdom', 'Australia', 'New Zealand', 'Ireland', 'France', 'Germany', 'Italy', 'Spain', 'Portugal', 'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Iceland', 'Poland', 'Czech Republic', 'Hungary', 'Romania', 'Bulgaria', 'Croatia', 'Slovenia', 'Slovakia', 'Estonia', 'Latvia', 'Lithuania', 'Greece', 'Turkey', 'Cyprus', 'Russia', 'Ukraine', 'Belarus', 'Moldova', 'Georgia', 'Armenia', 'Azerbaijan', 'Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Tajikistan', 'Kyrgyzstan', 'China', 'Hong Kong', 'Taiwan', 'Japan', 'South Korea', 'Mongolia', 'India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Bhutan', 'Maldives', 'Myanmar', 'Thailand', 'Laos', 'Cambodia', 'Vietnam', 'Malaysia', 'Singapore', 'Indonesia', 'Philippines', 'Brunei', 'East Timor', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Bahrain', 'Kuwait', 'Oman', 'Yemen', 'Iran', 'Iraq', 'Jordan', 'Lebanon', 'Israel', 'Palestine', 'Syria', 'Egypt', 'Morocco', 'Algeria', 'Tunisia', 'Libya', 'Sudan', 'South Sudan', 'Ethiopia', 'Eritrea', 'Djibouti', 'Somalia', 'Kenya', 'Uganda', 'Tanzania', 'Rwanda', 'Burundi', 'DR Congo', 'Republic of the Congo', 'Gabon', 'Equatorial Guinea', 'Cameroon', 'Nigeria', 'Ghana', 'Benin', 'Togo', 'Burkina Faso', 'Mali', 'Niger', 'Chad', 'Central African Republic', 'Guinea', 'Guinea-Bissau', 'Sierra Leone', 'Liberia', 'Côte d\'Ivoire', 'Cape Verde', 'Senegal', 'Gambia', 'Mauritania', 'Western Sahara', 'Ecuador', 'Colombia', 'Venezuela', 'Guyana', 'Suriname', 'Brazil', 'Peru', 'Bolivia', 'Paraguay', 'Uruguay', 'Argentina', 'Chile', 'Mexico', 'Guatemala', 'Belize', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama', 'Cuba', 'Jamaica', 'Haiti', 'Dominican Republic', 'Trinidad and Tobago', 'Barbados', 'Bahamas', 'Antigua and Barbuda', 'Dominica', 'Grenada', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Saint Kitts and Nevis', 'Greenland', 'Iraq', 'Iran', 'Afghanistan', 'Fiji', 'Papua New Guinea', 'Solomon Islands', 'Vanuatu', 'Samoa', 'Tonga', 'Kiribati', 'Tuvalu', 'Nauru', 'Palau', 'Marshall Islands', 'Micronesia', 'French Polynesia', 'New Caledonia', 'Réunion', 'Seychelles', 'Mauritius', 'Madagascar', 'Mozambique', 'Zimbabwe', 'Zambia', 'Malawi', 'Botswana', 'Namibia', 'Angola', 'Lesotho', 'Eswatini', 'Qatar', 'Bahrain', 'Malta', 'Luxembourg', 'Monaco', 'Liechtenstein', 'Andorra', 'San Marino', 'Vatican City', 'Other'
];
// Remove duplicates and sort alphabetically
const COUNTRIES = Array.from(new Set(COUNTRIES_RAW)).sort((a, b) => a.localeCompare(b));

export default function SurveyForm({ onValidationChange }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const [form, setForm] = useState({
    race: [],
    genderIdentity: '',
    ageGroup: '',
    countryOfOrigin: 'United States',
    disabilities: [],
    otherDisability: ''
  });

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast({ visible: false, message: '', type }), 2500);
  };

  // Always read the latest token from storage
  const getToken = () => localStorage.getItem('token');
  const getRefreshToken = () => localStorage.getItem('refreshToken');

  const tryRefreshToken = async () => {
    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return false;
      const res = await axios.post('/api/auth/refresh', { refreshToken });
      const { accessToken, refreshToken: newRefresh } = res.data?.tokens || {};
      if (accessToken) localStorage.setItem('token', accessToken);
      if (newRefresh) localStorage.setItem('refreshToken', newRefresh);
      return !!accessToken;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const fetchSurvey = async () => {
      try {
        const res = await axios.get('/api/auth/survey', {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
        if (res.data?.survey) {
          setForm({
            race: res.data.survey.race || [],
            genderIdentity: res.data.survey.genderIdentity || '',
            ageGroup: res.data.survey.ageGroup || '',
            countryOfOrigin: res.data.survey.countryOfOrigin || 'United States',
            disabilities: res.data.survey.disabilities || [],
            otherDisability: res.data.survey.otherDisability || ''
          });
        }
      } catch (e) {
        if (e?.response?.status === 401) {
          const refreshed = await tryRefreshToken();
          if (refreshed) {
            // retry once
            try {
              const res2 = await axios.get('/api/auth/survey', {
                headers: { Authorization: `Bearer ${getToken()}` }
              });
              if (res2.data?.survey) {
                setForm({
                  race: res2.data.survey.race || [],
                  genderIdentity: res2.data.survey.genderIdentity || '',
                  ageGroup: res2.data.survey.ageGroup || '',
                  countryOfOrigin: res2.data.survey.countryOfOrigin || 'United States',
                  disabilities: res2.data.survey.disabilities || [],
                  otherDisability: res2.data.survey.otherDisability || ''
                });
              }
              return;
            } catch (_) { }
          }
        }
        showToast('Failed to load survey', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchSurvey();
  }, []);

  const persistPartial = async (partial) => {
    try {
      await axios.put('/api/auth/survey', partial, { headers: { Authorization: `Bearer ${getToken()}` } });
      showToast('Saved', 'success');
      return true;
    } catch (e) {
      if (e?.response?.status === 401) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
          try {
            await axios.put('/api/auth/survey', partial, { headers: { Authorization: `Bearer ${getToken()}` } });
            showToast('Saved', 'success');
            return true;
          } catch (_) { }
        }
      }
      showToast('Failed to save', 'error');
      return false;
    }
  };

  const onToggleArray = async (key, value) => {
    if (key === 'disabilities') {
      // Compute next list from current state to avoid relying on async updater timing
      const current = Array.isArray(form.disabilities) ? form.disabilities : [];
      const set = new Set(current);
      if (set.has(value)) set.delete(value); else set.add(value);
      const nextList = Array.from(set);
      // optimistic update
      setForm(prev => ({ ...prev, disabilities: nextList }));
      const ok = await persistPartial({ disabilities: nextList });
      if (!ok) {
        // revert to previous
        setForm(prev => ({ ...prev, disabilities: current }));
      }
      return;
    }

    // Generic array toggle for other keys if needed in future
    setForm(prev => {
      const arr = new Set(prev[key] || []);
      if (arr.has(value)) arr.delete(value); else arr.add(value);
      return { ...prev, [key]: Array.from(arr) };
    });
  };

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    // Trigger validation callback when form changes
    if (onValidationChange) {
      setTimeout(onValidationChange, 0);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put('/api/auth/survey', form, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      showToast('Survey saved', 'success');
    } catch (e) {
      if (e?.response?.status === 401) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
          try {
            await axios.put('/api/auth/survey', form, {
              headers: { Authorization: `Bearer ${getToken()}` }
            });
            showToast('Survey saved', 'success');
            setSaving(false);
            return;
          } catch (_) { }
        }
      }
      showToast('Failed to save survey', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner" />
        <p>Loading survey...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-content">
      {toast.visible && (
        <div className={`toast ${toast.type}`} role="status" aria-live="polite">{toast.message}</div>
      )}
      <h2>Survey – Tell us about yourself</h2>
      <p className="section-note">This survey helps us learn about and better support all job seekers with disabilities. We may share summary group data analytics, but we will never share individual survey information.</p>

      <form className="account-form survey-form" onSubmit={handleSubmit}>
        <div className="form-row form-row-3">
          <div className="form-group">
            <label>Race (check all that apply) *</label>
            <MultiSelectComponent
              dataSource={RACE_OPTIONS}
              value={form.race}
              mode="Box"
              placeholder="Select race"
              enableSelectionOrder={false}
              cssClass="ajf-input"
              showDropDownIcon={true}
              popupHeight="260px"
              allowFiltering={false}
              change={(args) => {
                const values = Array.isArray(args?.value) ? args.value : [];
                setForm(prev => ({ ...prev, race: values }));
                // Trigger validation callback when form changes
                if (onValidationChange) {
                  setTimeout(onValidationChange, 0);
                }
              }}
            />
            <div className="field-help">Race selection is required</div>
          </div>
          <div className="form-group">
            <label htmlFor="genderIdentity">I identify my gender as *</label>
            <select
              id="genderIdentity"
              name="genderIdentity"
              value={form.genderIdentity}
              onChange={onChange}
              required
              aria-describedby="gender-help"
            >
              <option value="">Select gender</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Non-binary">Non-binary</option>
              <option value="Prefer not to say">Prefer not to say</option>
              <option value="Other">Other</option>
            </select>
            <div id="gender-help" className="field-help">Gender identity is required</div>
          </div>
          <div className="form-group">
            <label htmlFor="ageGroup">Age Group *</label>
            <select
              id="ageGroup"
              name="ageGroup"
              value={form.ageGroup}
              onChange={onChange}
              required
              aria-describedby="age-help"
            >
              <option value="">Select age group</option>
              {AGE_GROUPS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <div id="age-help" className="field-help">Age group is required</div>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="countryOfOrigin">Country of Origin *</label>
            <select
              id="countryOfOrigin"
              name="countryOfOrigin"
              value={form.countryOfOrigin}
              onChange={onChange}
              required
              aria-describedby="country-origin-help"
            >
              {COUNTRIES.map((c, idx) => (
                <option key={`${c}-${idx}`} value={c}>{c}</option>
              ))}
            </select>
            <div id="country-origin-help" className="field-help">Country of origin is required</div>
          </div>
        </div>

        <h3>Disability Information</h3>
        <p className="section-note">Indicate current disability(ies) Check all that apply. If these choices don't apply, use the "other" space below.</p>
        <div style={{ display: 'flex', gap: '0.5rem', margin: '0.25rem 0 0.75rem 0' }}>
          <button type="button" className="update-button" onClick={async () => {
            const prev = form.disabilities;
            setForm(p => ({ ...p, disabilities: [] }));
            const ok = await persistPartial({ disabilities: [] });
            if (!ok) setForm(p => ({ ...p, disabilities: prev }));
          }}>Clear All</button>
        </div>

        {(() => {
          const cols = 4;
          const columns = Array.from({ length: cols }, (_, c) => DISABILITY_OPTIONS.filter((_, i) => i % cols === c));
          return (
            <div className="checkbox-columns">
              {columns.map((list, ci) => (
                <div className="checkbox-col" key={ci}>
                  {list.map(opt => (
                    <label key={opt} className="checkbox-label">
                      <input type="checkbox" checked={form.disabilities.includes(opt)} onChange={() => onToggleArray('disabilities', opt)} />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          );
        })()}

        <div className="form-group">
          <label htmlFor="otherDisability">Other disability</label>
          <input id="otherDisability" name="otherDisability" type="text" value={form.otherDisability} onChange={onChange} />
        </div>

        <button type="submit" className="update-button" disabled={saving}>
          {saving ? 'Saving…' : 'Save Survey'}
        </button>
      </form>
    </div>
  );
}
