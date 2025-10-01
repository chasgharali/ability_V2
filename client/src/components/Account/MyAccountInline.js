import React, { useState } from 'react';

export default function MyAccountInline({ user, onDone, updateProfile }) {
  const [form, setForm] = useState({
    firstName: (user?.name || '').split(' ')[0] || '',
    lastName: (user?.name || '').split(' ').slice(1).join(' ') || '',
    email: user?.email || '',
    phone: user?.phoneNumber || '',
    state: user?.state || '',
    city: user?.city || '',
    country: user?.country || 'US',
  });
  const [a11y, setA11y] = useState({
    usesScreenMagnifier: !!user?.usesScreenMagnifier,
    usesScreenReader: !!user?.usesScreenReader,
    needsASL: !!user?.needsASL,
    needsCaptions: !!user?.needsCaptions,
    needsOther: !!user?.needsOther,
    subscribeAnnouncements: !!user?.subscribeAnnouncements,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const toggle = (key) => (e) => setA11y(prev => ({ ...prev, [key]: !!e.target.checked }));

  const handleNext = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      const payload = {
        name: `${form.firstName} ${form.lastName}`.trim(),
        state: form.state || '',
        city: form.city || '',
        country: form.country || 'US',
        phoneNumber: (form.phone || '').trim() || undefined,
        ...a11y,
      };
      await updateProfile(payload);
      setMessage('Saved');
      onDone?.();
    } catch (e) {
      setError('Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <section aria-labelledby="acc-h" style={{ maxWidth: 860 }}>
      <h3 id="acc-h">My Account</h3>
      <p className="section-note">An asterisk (*) indicates a required field.</p>

      {message && <div className="alert-box" role="status" aria-live="polite">{message}</div>}
      {error && <div className="alert-box" style={{ background:'#fdecea', borderColor:'#f5c2c7' }} role="alert">{error}</div>}

      <form onSubmit={(e)=>{e.preventDefault(); handleNext();}} className="account-form" aria-describedby="acc-help">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="firstName">First Name *</label>
            <input id="firstName" name="firstName" value={form.firstName} onChange={onChange} required />
          </div>
          <div className="form-group">
            <label htmlFor="lastName">Last Name *</label>
            <input id="lastName" name="lastName" value={form.lastName} onChange={onChange} required />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="email">Email *</label>
            <input id="email" name="email" value={form.email} readOnly aria-readonly="true" />
          </div>
          <div className="form-group">
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" value={form.phone} onChange={onChange} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="state">State</label>
            <input id="state" name="state" value={form.state} onChange={onChange} />
          </div>
          <div className="form-group">
            <label htmlFor="city">City</label>
            <input id="city" name="city" value={form.city} onChange={onChange} />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="country">Country *</label>
          <select id="country" name="country" value={form.country} onChange={onChange} required>
            <option value="US">United States</option>
            <option value="CA">Canada</option>
            <option value="GB">United Kingdom</option>
            <option value="IE">Ireland</option>
            <option value="AU">Australia</option>
            <option value="NZ">New Zealand</option>
          </select>
        </div>

        <fieldset style={{ marginTop: 12 }}>
          <legend>Accessibility Options</legend>
          <div className="form-row">
            <label><input type="checkbox" checked={a11y.usesScreenMagnifier} onChange={toggle('usesScreenMagnifier')} /> Screen Magnifier</label>
            <label><input type="checkbox" checked={a11y.usesScreenReader} onChange={toggle('usesScreenReader')} /> Screen Reader</label>
            <label><input type="checkbox" checked={a11y.needsASL} onChange={toggle('needsASL')} /> American Sign Language (ASL)</label>
            <label><input type="checkbox" checked={a11y.needsCaptions} onChange={toggle('needsCaptions')} /> Captions</label>
            <label><input type="checkbox" checked={a11y.needsOther} onChange={toggle('needsOther')} /> Others</label>
            <label><input type="checkbox" checked={a11y.subscribeAnnouncements} onChange={toggle('subscribeAnnouncements')} /> Subscribe to Job Seeker Announcements</label>
          </div>
        </fieldset>

        <div style={{ marginTop: '1rem' }}>
          <button type="submit" className="ajf-btn ajf-btn-dark" disabled={saving} aria-label="Save and go to next step">{saving ? 'Saving…' : 'Next'}</button>
        </div>
      </form>
    </section>
  );
}
