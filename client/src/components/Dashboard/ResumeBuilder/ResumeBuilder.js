import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import {
  listResumes,
  createResume,
  updateResume,
  deleteResume,
  setDefaultResume,
  generateResumeFromProfile,
  suggestResumeContent
} from '../../../services/resumes';
import './ResumeBuilder.css';

const EMPTY_EXPERIENCE = () => ({
  company: '', title: '', location: '', startDate: '', endDate: '', current: false, bullets: ['']
});

const EMPTY_EDUCATION = () => ({
  institution: '', degree: '', field: '', graduationDate: '', gpa: ''
});

const EMPTY_CERT = () => ({ name: '', issuer: '', date: '' });
const EMPTY_CUSTOM = () => ({ title: '', content: '' });

function emptyContent(user) {
  const profile = user?.metadata?.profile || {};
  return {
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phoneNumber || '',
    location: [user?.city, user?.state, user?.country].filter(Boolean).join(', '),
    linkedIn: user?.linkedInUrl || '',
    website: '',
    summary: profile.headline || '',
    skills: profile.keywords
      ? profile.keywords.split(/[,\n]+/).map(s => s.trim()).filter(Boolean)
      : [],
    languages: profile.languages || [],
    experience: [],
    education: [],
    certifications: [],
    awards: [],
    customSections: []
  };
}

export default function ResumeBuilder() {
  const { user } = useAuth();
  const { show: showToast } = useToast();
  const location = useLocation();
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'edit' | 'preview'
  const [editing, setEditing] = useState(null); // resume object being edited
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(''); // which AI operation is running
  const [activeTab, setActiveTab] = useState('personal');
  const [skillInput, setSkillInput] = useState('');
  const [awardInput, setAwardInput] = useState('');
  const [langInput, setLangInput] = useState('');
  const printRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listResumes();
      setResumes(data.resumes || []);
    } catch {
      showToast('Failed to load resumes', { type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const openResumeId = location.state?.openResumeId;
  useEffect(() => {
    if (!openResumeId || loading || !resumes.length) return;
    const target = resumes.find(r => r._id === openResumeId);
    if (target) {
      setEditing(JSON.parse(JSON.stringify(target)));
      setView('preview');
    }
  }, [openResumeId, resumes, loading]);

  const handleCreate = async () => {
    try {
      const content = emptyContent(user);
      const data = await createResume({
        title: `Resume ${resumes.length + 1}`,
        content,
        fromProfile: false
      });
      setEditing({ ...data.resume });
      setActiveTab('personal');
      setView('edit');
      await load();
    } catch {
      showToast('Failed to create resume', { type: 'error' });
    }
  };

  const handleEdit = (resume) => {
    setEditing(JSON.parse(JSON.stringify(resume)));
    setActiveTab('personal');
    setView('edit');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this resume?')) return;
    try {
      await deleteResume(id);
      showToast('Resume deleted', { type: 'success' });
      await load();
      if (editing?._id === id) { setEditing(null); setView('list'); }
    } catch {
      showToast('Failed to delete resume', { type: 'error' });
    }
  };

  const handleSetDefault = async (id) => {
    try {
      await setDefaultResume(id);
      showToast('Default resume updated', { type: 'success' });
      await load();
    } catch {
      showToast('Failed to set default resume', { type: 'error' });
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await updateResume(editing._id, { title: editing.title, content: editing.content });
      showToast('Resume saved', { type: 'success' });
      await load();
    } catch {
      showToast('Failed to save resume', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateFromProfile = async () => {
    if (!editing) return;
    setAiLoading('generate');
    try {
      const data = await generateResumeFromProfile(editing._id);
      setEditing(prev => ({ ...prev, content: data.resume.content }));
      showToast('Resume filled from your profile', { type: 'success' });
    } catch (e) {
      showToast(e?.response?.data?.error || 'AI generation failed', { type: 'error' });
    } finally {
      setAiLoading('');
    }
  };

  const handleAiSuggest = async (section, currentContent, context) => {
    if (!editing) return null;
    setAiLoading(section);
    try {
      const data = await suggestResumeContent(editing._id, section, currentContent, context);
      return data.suggestion;
    } catch (e) {
      showToast(e?.response?.data?.error || 'AI suggestion failed', { type: 'error' });
      return null;
    } finally {
      setAiLoading('');
    }
  };

  const setContent = (patch) => {
    setEditing(prev => ({
      ...prev,
      content: { ...prev.content, ...patch }
    }));
  };

  const handlePrint = () => {
    window.print();
  };

  // ——— Helpers for dynamic arrays ———
  const setExperience = (idx, patch) => {
    const arr = [...(editing.content.experience || [])];
    arr[idx] = { ...arr[idx], ...patch };
    setContent({ experience: arr });
  };
  const setBullet = (expIdx, bIdx, val) => {
    const arr = [...(editing.content.experience || [])];
    const bullets = [...(arr[expIdx].bullets || [])];
    bullets[bIdx] = val;
    arr[expIdx] = { ...arr[expIdx], bullets };
    setContent({ experience: arr });
  };
  const addBullet = (expIdx) => {
    const arr = [...(editing.content.experience || [])];
    arr[expIdx] = { ...arr[expIdx], bullets: [...(arr[expIdx].bullets || []), ''] };
    setContent({ experience: arr });
  };
  const removeBullet = (expIdx, bIdx) => {
    const arr = [...(editing.content.experience || [])];
    const bullets = (arr[expIdx].bullets || []).filter((_, i) => i !== bIdx);
    arr[expIdx] = { ...arr[expIdx], bullets };
    setContent({ experience: arr });
  };
  const setEducation = (idx, patch) => {
    const arr = [...(editing.content.education || [])];
    arr[idx] = { ...arr[idx], ...patch };
    setContent({ education: arr });
  };
  const setCert = (idx, patch) => {
    const arr = [...(editing.content.certifications || [])];
    arr[idx] = { ...arr[idx], ...patch };
    setContent({ certifications: arr });
  };
  const setCustom = (idx, patch) => {
    const arr = [...(editing.content.customSections || [])];
    arr[idx] = { ...arr[idx], ...patch };
    setContent({ customSections: arr });
  };

  const addSkill = () => {
    const val = skillInput.trim();
    if (!val) return;
    const skills = [...(editing.content.skills || [])];
    if (!skills.includes(val)) skills.push(val);
    setContent({ skills });
    setSkillInput('');
  };
  const removeSkill = (s) => setContent({ skills: (editing.content.skills || []).filter(x => x !== s) });

  const addLang = () => {
    const val = langInput.trim();
    if (!val) return;
    const languages = [...(editing.content.languages || [])];
    if (!languages.includes(val)) languages.push(val);
    setContent({ languages });
    setLangInput('');
  };
  const removeLang = (l) => setContent({ languages: (editing.content.languages || []).filter(x => x !== l) });

  const addAward = () => {
    const val = awardInput.trim();
    if (!val) return;
    setContent({ awards: [...(editing.content.awards || []), val] });
    setAwardInput('');
  };
  const removeAward = (i) => setContent({ awards: (editing.content.awards || []).filter((_, idx) => idx !== i) });

  // ——— Preview mode ———
  if (view === 'preview' && editing) {
    const c = editing.content || {};
    return (
      <div className="resume-builder">
        <div className="rb-preview-toolbar no-print">
          <button className="ajf-btn ajf-btn-outline" onClick={() => setView('edit')}>Back to Editor</button>
          <button className="ajf-btn ajf-btn-dark" onClick={handlePrint}>Print / Save as PDF</button>
        </div>
        <div className="rb-print-area" ref={printRef}>
          <div className="rb-resume-doc">
            <header className="rb-doc-header">
              <h1>{c.name || 'Your Name'}</h1>
              <div className="rb-doc-contact">
                {c.email && <span>{c.email}</span>}
                {c.phone && <span>{c.phone}</span>}
                {c.location && <span>{c.location}</span>}
                {c.linkedIn && <span>{c.linkedIn}</span>}
                {c.website && <span>{c.website}</span>}
              </div>
            </header>

            {c.summary && (
              <section className="rb-doc-section">
                <h2>Professional Summary</h2>
                <p>{c.summary}</p>
              </section>
            )}

            {c.experience?.length > 0 && (
              <section className="rb-doc-section">
                <h2>Experience</h2>
                {c.experience.map((exp, i) => (
                  <div key={i} className="rb-doc-entry">
                    <div className="rb-doc-entry-header">
                      <strong>{exp.title}</strong>
                      <span>{exp.company}{exp.location ? ` — ${exp.location}` : ''}</span>
                      <span className="rb-doc-dates">
                        {exp.startDate}{exp.startDate && (exp.endDate || exp.current) ? ' – ' : ''}
                        {exp.current ? 'Present' : exp.endDate}
                      </span>
                    </div>
                    {exp.bullets?.filter(Boolean).length > 0 && (
                      <ul>
                        {exp.bullets.filter(Boolean).map((b, j) => <li key={j}>{b}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </section>
            )}

            {c.education?.length > 0 && (
              <section className="rb-doc-section">
                <h2>Education</h2>
                {c.education.map((edu, i) => (
                  <div key={i} className="rb-doc-entry">
                    <div className="rb-doc-entry-header">
                      <strong>{edu.degree}{edu.field ? ` in ${edu.field}` : ''}</strong>
                      <span>{edu.institution}</span>
                      <span className="rb-doc-dates">{edu.graduationDate}</span>
                    </div>
                    {edu.gpa && <p>GPA: {edu.gpa}</p>}
                  </div>
                ))}
              </section>
            )}

            {c.skills?.filter(Boolean).length > 0 && (
              <section className="rb-doc-section">
                <h2>Skills</h2>
                <p>{c.skills.filter(Boolean).join(' · ')}</p>
              </section>
            )}

            {c.languages?.filter(Boolean).length > 0 && (
              <section className="rb-doc-section">
                <h2>Languages</h2>
                <p>{c.languages.filter(Boolean).join(' · ')}</p>
              </section>
            )}

            {c.certifications?.filter(x => x.name).length > 0 && (
              <section className="rb-doc-section">
                <h2>Certifications</h2>
                {c.certifications.filter(x => x.name).map((cert, i) => (
                  <div key={i} className="rb-doc-entry">
                    <strong>{cert.name}</strong>
                    {cert.issuer && <span> — {cert.issuer}</span>}
                    {cert.date && <span className="rb-doc-dates"> {cert.date}</span>}
                  </div>
                ))}
              </section>
            )}

            {c.awards?.filter(Boolean).length > 0 && (
              <section className="rb-doc-section">
                <h2>Awards & Honors</h2>
                <ul>
                  {c.awards.filter(Boolean).map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </section>
            )}

            {c.customSections?.filter(s => s.title).map((sec, i) => (
              <section key={i} className="rb-doc-section">
                <h2>{sec.title}</h2>
                <p style={{ whiteSpace: 'pre-wrap' }}>{sec.content}</p>
              </section>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ——— Editor mode ———
  if (view === 'edit' && editing) {
    const c = editing.content || {};
    const tabs = [
      { key: 'personal', label: 'Personal' },
      { key: 'summary', label: 'Summary' },
      { key: 'experience', label: 'Experience' },
      { key: 'education', label: 'Education' },
      { key: 'skills', label: 'Skills' },
      { key: 'more', label: 'More' }
    ];

    return (
      <div className="resume-builder">
        <div className="rb-editor-topbar">
          <button className="ajf-btn ajf-btn-outline" onClick={() => setView('list')}>← All Resumes</button>
          <input
            className="rb-title-input"
            value={editing.title || ''}
            onChange={(e) => setEditing(prev => ({ ...prev, title: e.target.value }))}
            aria-label="Resume title"
            maxLength={100}
          />
          <div className="rb-topbar-actions">
            <button
              className="ajf-btn ajf-btn-outline"
              onClick={handleGenerateFromProfile}
              disabled={aiLoading === 'generate'}
              title="Fill resume sections using AI based on your profile"
            >
              {aiLoading === 'generate' ? 'Generating…' : '✨ Generate from Profile'}
            </button>
            <button className="ajf-btn ajf-btn-outline" onClick={() => setView('preview')}>Preview & Print</button>
            <button className="ajf-btn ajf-btn-dark" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <div className="rb-editor-layout">
          <nav className="rb-tabs" aria-label="Resume sections">
            {tabs.map(t => (
              <button
                key={t.key}
                className={`rb-tab ${activeTab === t.key ? 'active' : ''}`}
                onClick={() => setActiveTab(t.key)}
                aria-current={activeTab === t.key ? 'true' : undefined}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="rb-tab-content">

            {activeTab === 'personal' && (
              <fieldset className="rb-fieldset">
                <legend>Personal Information</legend>
                <div className="rb-form-row">
                  <div className="rb-field">
                    <label htmlFor="rb-name">Full Name</label>
                    <input id="rb-name" value={c.name || ''} onChange={e => setContent({ name: e.target.value })} />
                  </div>
                  <div className="rb-field">
                    <label htmlFor="rb-email">Email</label>
                    <input id="rb-email" type="email" value={c.email || ''} onChange={e => setContent({ email: e.target.value })} />
                  </div>
                </div>
                <div className="rb-form-row">
                  <div className="rb-field">
                    <label htmlFor="rb-phone">Phone</label>
                    <input id="rb-phone" value={c.phone || ''} onChange={e => setContent({ phone: e.target.value })} />
                  </div>
                  <div className="rb-field">
                    <label htmlFor="rb-location">Location</label>
                    <input id="rb-location" value={c.location || ''} onChange={e => setContent({ location: e.target.value })} />
                  </div>
                </div>
                <div className="rb-form-row">
                  <div className="rb-field">
                    <label htmlFor="rb-linkedin">LinkedIn URL</label>
                    <input id="rb-linkedin" value={c.linkedIn || ''} onChange={e => setContent({ linkedIn: e.target.value })} />
                  </div>
                  <div className="rb-field">
                    <label htmlFor="rb-website">Website / Portfolio</label>
                    <input id="rb-website" value={c.website || ''} onChange={e => setContent({ website: e.target.value })} />
                  </div>
                </div>
              </fieldset>
            )}

            {activeTab === 'summary' && (
              <fieldset className="rb-fieldset">
                <legend>Professional Summary</legend>
                <div className="rb-ai-row">
                  <label htmlFor="rb-summary">Summary</label>
                  <button
                    type="button"
                    className="rb-ai-btn"
                    disabled={!!aiLoading}
                    onClick={async () => {
                      const result = await handleAiSuggest('summary', c.summary, `Headline: ${user?.metadata?.profile?.headline || ''}`);
                      if (result?.suggestion) setContent({ summary: result.suggestion });
                    }}
                  >
                    {aiLoading === 'summary' ? '…' : '✨ AI Improve'}
                  </button>
                </div>
                <textarea
                  id="rb-summary"
                  className="rb-textarea"
                  rows={5}
                  value={c.summary || ''}
                  onChange={e => setContent({ summary: e.target.value })}
                  placeholder="Write a compelling 2-3 sentence professional summary…"
                />
              </fieldset>
            )}

            {activeTab === 'experience' && (
              <fieldset className="rb-fieldset">
                <legend>Work Experience</legend>
                {(c.experience || []).map((exp, idx) => (
                  <div key={idx} className="rb-list-item">
                    <div className="rb-list-item-header">
                      <span>Experience {idx + 1}</span>
                      <button
                        type="button"
                        className="rb-remove-btn"
                        onClick={() => setContent({ experience: c.experience.filter((_, i) => i !== idx) })}
                        aria-label={`Remove experience ${idx + 1}`}
                      >Remove</button>
                    </div>
                    <div className="rb-form-row">
                      <div className="rb-field">
                        <label>Job Title</label>
                        <input value={exp.title || ''} onChange={e => setExperience(idx, { title: e.target.value })} />
                      </div>
                      <div className="rb-field">
                        <label>Company</label>
                        <input value={exp.company || ''} onChange={e => setExperience(idx, { company: e.target.value })} />
                      </div>
                    </div>
                    <div className="rb-form-row">
                      <div className="rb-field">
                        <label>Location</label>
                        <input value={exp.location || ''} onChange={e => setExperience(idx, { location: e.target.value })} />
                      </div>
                      <div className="rb-field">
                        <label>Start Date (MM/YYYY)</label>
                        <input value={exp.startDate || ''} onChange={e => setExperience(idx, { startDate: e.target.value })} placeholder="01/2022" />
                      </div>
                    </div>
                    <div className="rb-form-row">
                      <div className="rb-field">
                        <label>End Date</label>
                        <input value={exp.endDate || ''} disabled={exp.current} onChange={e => setExperience(idx, { endDate: e.target.value })} placeholder="01/2024" />
                      </div>
                      <div className="rb-field rb-field-check">
                        <label>
                          <input type="checkbox" checked={!!exp.current} onChange={e => setExperience(idx, { current: e.target.checked, endDate: e.target.checked ? '' : exp.endDate })} />
                          {' '}Current position
                        </label>
                      </div>
                    </div>
                    <div className="rb-bullets-section">
                      <div className="rb-ai-row">
                        <label>Bullet Points</label>
                        <button
                          type="button"
                          className="rb-ai-btn"
                          disabled={!!aiLoading}
                          onClick={async () => {
                            const result = await handleAiSuggest(
                              'experience_bullets',
                              exp.bullets,
                              `${exp.title} at ${exp.company}`
                            );
                            if (result?.bullets) setExperience(idx, { bullets: result.bullets });
                          }}
                        >
                          {aiLoading === 'experience_bullets' ? '…' : '✨ AI Improve'}
                        </button>
                      </div>
                      {(exp.bullets || ['']).map((b, bIdx) => (
                        <div key={bIdx} className="rb-bullet-row">
                          <input
                            value={b}
                            onChange={e => setBullet(idx, bIdx, e.target.value)}
                            placeholder="Describe an achievement or responsibility…"
                          />
                          <button type="button" className="rb-icon-btn" onClick={() => removeBullet(idx, bIdx)} aria-label="Remove bullet">×</button>
                        </div>
                      ))}
                      <button type="button" className="rb-add-btn" onClick={() => addBullet(idx)}>+ Add bullet</button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="ajf-btn ajf-btn-outline"
                  onClick={() => setContent({ experience: [...(c.experience || []), EMPTY_EXPERIENCE()] })}
                >
                  + Add Experience
                </button>
              </fieldset>
            )}

            {activeTab === 'education' && (
              <fieldset className="rb-fieldset">
                <legend>Education</legend>
                {(c.education || []).map((edu, idx) => (
                  <div key={idx} className="rb-list-item">
                    <div className="rb-list-item-header">
                      <span>Education {idx + 1}</span>
                      <button type="button" className="rb-remove-btn" onClick={() => setContent({ education: c.education.filter((_, i) => i !== idx) })}>Remove</button>
                    </div>
                    <div className="rb-form-row">
                      <div className="rb-field">
                        <label>Institution</label>
                        <input value={edu.institution || ''} onChange={e => setEducation(idx, { institution: e.target.value })} />
                      </div>
                      <div className="rb-field">
                        <label>Degree</label>
                        <input value={edu.degree || ''} onChange={e => setEducation(idx, { degree: e.target.value })} placeholder="B.S., M.S., Associate, etc." />
                      </div>
                    </div>
                    <div className="rb-form-row">
                      <div className="rb-field">
                        <label>Field of Study</label>
                        <input value={edu.field || ''} onChange={e => setEducation(idx, { field: e.target.value })} />
                      </div>
                      <div className="rb-field">
                        <label>Graduation Date</label>
                        <input value={edu.graduationDate || ''} onChange={e => setEducation(idx, { graduationDate: e.target.value })} placeholder="2020" />
                      </div>
                    </div>
                    <div className="rb-field">
                      <label>GPA (optional)</label>
                      <input value={edu.gpa || ''} onChange={e => setEducation(idx, { gpa: e.target.value })} style={{ maxWidth: 120 }} />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="ajf-btn ajf-btn-outline"
                  onClick={() => setContent({ education: [...(c.education || []), EMPTY_EDUCATION()] })}
                >
                  + Add Education
                </button>
              </fieldset>
            )}

            {activeTab === 'skills' && (
              <fieldset className="rb-fieldset">
                <legend>Skills</legend>
                <div className="rb-ai-row" style={{ marginBottom: 8 }}>
                  <span>Current skills</span>
                  <button
                    type="button"
                    className="rb-ai-btn"
                    disabled={!!aiLoading}
                    onClick={async () => {
                      const result = await handleAiSuggest(
                        'skills',
                        c.skills,
                        user?.metadata?.profile?.headline || ''
                      );
                      if (result?.suggestedSkills) {
                        const merged = [...new Set([...(c.skills || []), ...result.suggestedSkills])];
                        setContent({ skills: merged });
                        showToast(`Added ${result.suggestedSkills.length} suggested skills`, { type: 'success' });
                      }
                    }}
                  >
                    {aiLoading === 'skills' ? '…' : '✨ AI Suggest Skills'}
                  </button>
                </div>
                <div className="rb-tags">
                  {(c.skills || []).map((s, i) => (
                    <span key={i} className="rb-tag">
                      {s}
                      <button type="button" className="rb-tag-remove" onClick={() => removeSkill(s)} aria-label={`Remove skill ${s}`}>×</button>
                    </span>
                  ))}
                </div>
                <div className="rb-tag-input-row">
                  <input
                    value={skillInput}
                    onChange={e => setSkillInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                    placeholder="Type a skill and press Enter…"
                  />
                  <button type="button" className="ajf-btn ajf-btn-outline" onClick={addSkill}>Add</button>
                </div>
              </fieldset>
            )}

            {activeTab === 'more' && (
              <div>
                {/* Languages */}
                <fieldset className="rb-fieldset">
                  <legend>Languages</legend>
                  <div className="rb-tags">
                    {(c.languages || []).map((l, i) => (
                      <span key={i} className="rb-tag">
                        {l}
                        <button type="button" className="rb-tag-remove" onClick={() => removeLang(l)} aria-label={`Remove language ${l}`}>×</button>
                      </span>
                    ))}
                  </div>
                  <div className="rb-tag-input-row">
                    <input
                      value={langInput}
                      onChange={e => setLangInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addLang())}
                      placeholder="Add a language…"
                    />
                    <button type="button" className="ajf-btn ajf-btn-outline" onClick={addLang}>Add</button>
                  </div>
                </fieldset>

                {/* Certifications */}
                <fieldset className="rb-fieldset">
                  <legend>Certifications</legend>
                  {(c.certifications || []).map((cert, idx) => (
                    <div key={idx} className="rb-list-item">
                      <div className="rb-list-item-header">
                        <span>Certification {idx + 1}</span>
                        <button type="button" className="rb-remove-btn" onClick={() => setContent({ certifications: c.certifications.filter((_, i) => i !== idx) })}>Remove</button>
                      </div>
                      <div className="rb-form-row">
                        <div className="rb-field">
                          <label>Name</label>
                          <input value={cert.name || ''} onChange={e => setCert(idx, { name: e.target.value })} />
                        </div>
                        <div className="rb-field">
                          <label>Issuer</label>
                          <input value={cert.issuer || ''} onChange={e => setCert(idx, { issuer: e.target.value })} />
                        </div>
                        <div className="rb-field">
                          <label>Date</label>
                          <input value={cert.date || ''} onChange={e => setCert(idx, { date: e.target.value })} placeholder="MM/YYYY" style={{ maxWidth: 120 }} />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button type="button" className="ajf-btn ajf-btn-outline" onClick={() => setContent({ certifications: [...(c.certifications || []), EMPTY_CERT()] })}>+ Add Certification</button>
                </fieldset>

                {/* Awards */}
                <fieldset className="rb-fieldset">
                  <legend>Awards &amp; Honors</legend>
                  {(c.awards || []).map((a, i) => (
                    <div key={i} className="rb-bullet-row">
                      <input value={a} onChange={e => {
                        const arr = [...(c.awards || [])];
                        arr[i] = e.target.value;
                        setContent({ awards: arr });
                      }} />
                      <button type="button" className="rb-icon-btn" onClick={() => removeAward(i)} aria-label="Remove award">×</button>
                    </div>
                  ))}
                  <div className="rb-tag-input-row">
                    <input value={awardInput} onChange={e => setAwardInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAward())} placeholder="Add an award…" />
                    <button type="button" className="ajf-btn ajf-btn-outline" onClick={addAward}>Add</button>
                  </div>
                </fieldset>

                {/* Custom Sections */}
                <fieldset className="rb-fieldset">
                  <legend>Custom Sections</legend>
                  {(c.customSections || []).map((sec, idx) => (
                    <div key={idx} className="rb-list-item">
                      <div className="rb-list-item-header">
                        <span>Section {idx + 1}</span>
                        <button type="button" className="rb-remove-btn" onClick={() => setContent({ customSections: c.customSections.filter((_, i) => i !== idx) })}>Remove</button>
                      </div>
                      <div className="rb-field">
                        <label>Section Title</label>
                        <input value={sec.title || ''} onChange={e => setCustom(idx, { title: e.target.value })} placeholder="e.g. Volunteer Work, Publications…" />
                      </div>
                      <div className="rb-field">
                        <label>Content</label>
                        <textarea className="rb-textarea" rows={4} value={sec.content || ''} onChange={e => setCustom(idx, { content: e.target.value })} />
                      </div>
                    </div>
                  ))}
                  <button type="button" className="ajf-btn ajf-btn-outline" onClick={() => setContent({ customSections: [...(c.customSections || []), EMPTY_CUSTOM()] })}>+ Add Section</button>
                </fieldset>
              </div>
            )}

          </div>
        </div>

        <div className="rb-editor-footer">
          <button className="ajf-btn ajf-btn-dark" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Resume'}
          </button>
          <button className="ajf-btn ajf-btn-outline" onClick={() => setView('preview')}>Preview & Print</button>
        </div>
      </div>
    );
  }

  // ——— List view ———
  return (
    <div className="resume-builder">
      <div className="dashboard-content">
        <h1>Resume Builder</h1>
        <p className="rb-subtitle">Create multiple AI-powered resumes. Select one during event registration.</p>

        <div className="rb-list-toolbar">
          <button className="ajf-btn ajf-btn-dark" onClick={handleCreate}>+ New Resume</button>
        </div>

        {loading && <div className="rb-loading">Loading resumes…</div>}

        {!loading && resumes.length === 0 && (
          <div className="rb-empty">
            <p>No resumes yet. Create your first resume to get started.</p>
          </div>
        )}

        <div className="rb-resume-grid">
          {resumes.map(r => (
            <div key={r._id} className={`rb-resume-card ${r.isDefault ? 'rb-default' : ''}`}>
              {r.isDefault && <span className="rb-default-badge">Default</span>}
              <div className="rb-card-title">{r.title || 'Untitled Resume'}</div>
              <div className="rb-card-meta">
                Updated {new Date(r.updatedAt).toLocaleDateString()}
                {r.lastAiGenerated && (
                  <span className="rb-ai-badge"> · AI-generated</span>
                )}
              </div>
              <div className="rb-card-preview">
                {r.content?.name && <div>{r.content.name}</div>}
                {r.content?.summary && <div className="rb-card-summary">{r.content.summary.substring(0, 100)}{r.content.summary.length > 100 ? '…' : ''}</div>}
              </div>
              <div className="rb-card-actions">
                <button className="ajf-btn ajf-btn-dark" onClick={() => handleEdit(r)}>Edit</button>
                {!r.isDefault && (
                  <button className="ajf-btn ajf-btn-outline" onClick={() => handleSetDefault(r._id)}>Set Default</button>
                )}
                <button
                  className="ajf-btn ajf-btn-outline"
                  onClick={() => { setEditing(JSON.parse(JSON.stringify(r))); setView('preview'); }}
                >Preview</button>
                <button className="ajf-btn ajf-btn-outline rb-delete-btn" onClick={() => handleDelete(r._id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
