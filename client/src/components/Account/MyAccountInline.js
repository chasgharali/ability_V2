import React, { useState } from 'react';
import './MyAccountInline.css';

// Comprehensive list of countries
const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AF', name: 'Afghanistan' },
  { code: 'AL', name: 'Albania' },
  { code: 'DZ', name: 'Algeria' },
  { code: 'AD', name: 'Andorra' },
  { code: 'AO', name: 'Angola' },
  { code: 'AG', name: 'Antigua and Barbuda' },
  { code: 'AR', name: 'Argentina' },
  { code: 'AM', name: 'Armenia' },
  { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' },
  { code: 'AZ', name: 'Azerbaijan' },
  { code: 'BS', name: 'Bahamas' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'BB', name: 'Barbados' },
  { code: 'BY', name: 'Belarus' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BZ', name: 'Belize' },
  { code: 'BJ', name: 'Benin' },
  { code: 'BT', name: 'Bhutan' },
  { code: 'BO', name: 'Bolivia' },
  { code: 'BA', name: 'Bosnia and Herzegovina' },
  { code: 'BW', name: 'Botswana' },
  { code: 'BR', name: 'Brazil' },
  { code: 'BN', name: 'Brunei' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'BF', name: 'Burkina Faso' },
  { code: 'BI', name: 'Burundi' },
  { code: 'KH', name: 'Cambodia' },
  { code: 'CM', name: 'Cameroon' },
  { code: 'CV', name: 'Cape Verde' },
  { code: 'CF', name: 'Central African Republic' },
  { code: 'TD', name: 'Chad' },
  { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },
  { code: 'CO', name: 'Colombia' },
  { code: 'KM', name: 'Comoros' },
  { code: 'CG', name: 'Congo' },
  { code: 'CR', name: 'Costa Rica' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CU', name: 'Cuba' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'DK', name: 'Denmark' },
  { code: 'DJ', name: 'Djibouti' },
  { code: 'DM', name: 'Dominica' },
  { code: 'DO', name: 'Dominican Republic' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'EG', name: 'Egypt' },
  { code: 'SV', name: 'El Salvador' },
  { code: 'GQ', name: 'Equatorial Guinea' },
  { code: 'ER', name: 'Eritrea' },
  { code: 'EE', name: 'Estonia' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'FJ', name: 'Fiji' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'GA', name: 'Gabon' },
  { code: 'GM', name: 'Gambia' },
  { code: 'GE', name: 'Georgia' },
  { code: 'DE', name: 'Germany' },
  { code: 'GH', name: 'Ghana' },
  { code: 'GR', name: 'Greece' },
  { code: 'GD', name: 'Grenada' },
  { code: 'GT', name: 'Guatemala' },
  { code: 'GN', name: 'Guinea' },
  { code: 'GW', name: 'Guinea-Bissau' },
  { code: 'GY', name: 'Guyana' },
  { code: 'HT', name: 'Haiti' },
  { code: 'HN', name: 'Honduras' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IS', name: 'Iceland' },
  { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IR', name: 'Iran' },
  { code: 'IQ', name: 'Iraq' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IL', name: 'Israel' },
  { code: 'IT', name: 'Italy' },
  { code: 'JM', name: 'Jamaica' },
  { code: 'JP', name: 'Japan' },
  { code: 'JO', name: 'Jordan' },
  { code: 'KZ', name: 'Kazakhstan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'KI', name: 'Kiribati' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'KG', name: 'Kyrgyzstan' },
  { code: 'LA', name: 'Laos' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LB', name: 'Lebanon' },
  { code: 'LS', name: 'Lesotho' },
  { code: 'LR', name: 'Liberia' },
  { code: 'LY', name: 'Libya' },
  { code: 'LI', name: 'Liechtenstein' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MK', name: 'Macedonia' },
  { code: 'MG', name: 'Madagascar' },
  { code: 'MW', name: 'Malawi' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'MV', name: 'Maldives' },
  { code: 'ML', name: 'Mali' },
  { code: 'MT', name: 'Malta' },
  { code: 'MH', name: 'Marshall Islands' },
  { code: 'MR', name: 'Mauritania' },
  { code: 'MU', name: 'Mauritius' },
  { code: 'MX', name: 'Mexico' },
  { code: 'FM', name: 'Micronesia' },
  { code: 'MD', name: 'Moldova' },
  { code: 'MC', name: 'Monaco' },
  { code: 'MN', name: 'Mongolia' },
  { code: 'ME', name: 'Montenegro' },
  { code: 'MA', name: 'Morocco' },
  { code: 'MZ', name: 'Mozambique' },
  { code: 'MM', name: 'Myanmar' },
  { code: 'NA', name: 'Namibia' },
  { code: 'NR', name: 'Nauru' },
  { code: 'NP', name: 'Nepal' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'NI', name: 'Nicaragua' },
  { code: 'NE', name: 'Niger' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'KP', name: 'North Korea' },
  { code: 'NO', name: 'Norway' },
  { code: 'OM', name: 'Oman' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'PW', name: 'Palau' },
  { code: 'PA', name: 'Panama' },
  { code: 'PG', name: 'Papua New Guinea' },
  { code: 'PY', name: 'Paraguay' },
  { code: 'PE', name: 'Peru' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'QA', name: 'Qatar' },
  { code: 'RO', name: 'Romania' },
  { code: 'RU', name: 'Russia' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'KN', name: 'Saint Kitts and Nevis' },
  { code: 'LC', name: 'Saint Lucia' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines' },
  { code: 'WS', name: 'Samoa' },
  { code: 'SM', name: 'San Marino' },
  { code: 'ST', name: 'Sao Tome and Principe' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SN', name: 'Senegal' },
  { code: 'RS', name: 'Serbia' },
  { code: 'SC', name: 'Seychelles' },
  { code: 'SL', name: 'Sierra Leone' },
  { code: 'SG', name: 'Singapore' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'SB', name: 'Solomon Islands' },
  { code: 'SO', name: 'Somalia' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'KR', name: 'South Korea' },
  { code: 'SS', name: 'South Sudan' },
  { code: 'ES', name: 'Spain' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'SD', name: 'Sudan' },
  { code: 'SR', name: 'Suriname' },
  { code: 'SZ', name: 'Swaziland' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'SY', name: 'Syria' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TJ', name: 'Tajikistan' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TL', name: 'Timor-Leste' },
  { code: 'TG', name: 'Togo' },
  { code: 'TO', name: 'Tonga' },
  { code: 'TT', name: 'Trinidad and Tobago' },
  { code: 'TN', name: 'Tunisia' },
  { code: 'TR', name: 'Turkey' },
  { code: 'TM', name: 'Turkmenistan' },
  { code: 'TV', name: 'Tuvalu' },
  { code: 'UG', name: 'Uganda' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'UZ', name: 'Uzbekistan' },
  { code: 'VU', name: 'Vanuatu' },
  { code: 'VA', name: 'Vatican City' },
  { code: 'VE', name: 'Venezuela' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'YE', name: 'Yemen' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'ZW', name: 'Zimbabwe' }
];

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
    <section className="account-section">
      <div className="section-header">
        <p className="section-note">An asterisk (*) indicates a required field.</p>
      </div>

      {message && <div className="alert-box" role="status" aria-live="polite">{message}</div>}
      {error && <div className="alert-box" style={{ background: '#fdecea', borderColor: '#f5c2c7' }} role="alert">{error}</div>}

      <form onSubmit={handleNext} className="account-form" aria-describedby="acc-help">
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
            <label htmlFor="state">State *</label>
            <input
              id="state"
              name="state"
              value={form.state}
              onChange={onChange}
              required
              aria-describedby="state-help"
              aria-invalid={!form.state}
            />
            <div id="state-help" className="field-help">State is required for event registration</div>
          </div>
          <div className="form-group">
            <label htmlFor="city">City *</label>
            <input
              id="city"
              name="city"
              value={form.city}
              onChange={onChange}
              required
              aria-describedby="city-help"
              aria-invalid={!form.city}
            />
            <div id="city-help" className="field-help">City is required for event registration</div>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="country">Country *</label>
          <select
            id="country"
            name="country"
            value={form.country}
            onChange={onChange}
            required
            aria-describedby="country-help"
            aria-invalid={!form.country}
          >
            <option value="">Select Country</option>
            {COUNTRIES.map(country => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
          <div id="country-help" className="field-help">Country is required for event registration</div>
        </div>

        <fieldset className="accessibility-fieldset">
          <legend>Accessibility Options</legend>
          <p className="fieldset-description">Select any accessibility accommodations you need during the event.</p>
          <div className="accessibility-grid">
            <div className="accessibility-option">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={a11y.usesScreenMagnifier}
                  onChange={toggle('usesScreenMagnifier')}
                  className="checkbox-input"
                />
                <span className="checkbox-custom"></span>
                <span className="checkbox-text">
                  <strong>Screen Magnifier</strong>
                  <small>Enlarged text and interface elements</small>
                </span>
              </label>
            </div>
            <div className="accessibility-option">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={a11y.usesScreenReader}
                  onChange={toggle('usesScreenReader')}
                  className="checkbox-input"
                />
                <span className="checkbox-custom"></span>
                <span className="checkbox-text">
                  <strong>Screen Reader</strong>
                  <small>Compatible with assistive technology</small>
                </span>
              </label>
            </div>
            <div className="accessibility-option">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={a11y.needsASL}
                  onChange={toggle('needsASL')}
                  className="checkbox-input"
                />
                <span className="checkbox-custom"></span>
                <span className="checkbox-text">
                  <strong>American Sign Language (ASL)</strong>
                  <small>Sign language interpretation services</small>
                </span>
              </label>
            </div>
            <div className="accessibility-option">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={a11y.needsCaptions}
                  onChange={toggle('needsCaptions')}
                  className="checkbox-input"
                />
                <span className="checkbox-custom"></span>
                <span className="checkbox-text">
                  <strong>Captions</strong>
                  <small>Closed captions for audio content</small>
                </span>
              </label>
            </div>
            <div className="accessibility-option">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={a11y.needsOther}
                  onChange={toggle('needsOther')}
                  className="checkbox-input"
                />
                <span className="checkbox-custom"></span>
                <span className="checkbox-text">
                  <strong>Other Accommodations</strong>
                  <small>Additional accessibility needs</small>
                </span>
              </label>
            </div>
          </div>
        </fieldset>

        <fieldset className="notifications-fieldset">
          <legend>Communication Preferences</legend>
          <div className="accessibility-option">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={a11y.subscribeAnnouncements}
                onChange={toggle('subscribeAnnouncements')}
                className="checkbox-input"
              />
              <span className="checkbox-custom"></span>
              <span className="checkbox-text">
                <strong>Subscribe to Job Seeker Announcements</strong>
                <small>Receive updates about upcoming events and opportunities</small>
              </span>
            </label>
          </div>
        </fieldset>

        <div className="form-actions">
          <button 
            type="submit" 
            className="ajf-btn ajf-btn-dark" 
            disabled={saving} 
            aria-label={onDone ? "Save account information and continue" : "Save account information"}
          >
            {saving ? 'Saving…' : (onDone ? 'Save and Next' : 'Save')}
          </button>
        </div>
      </form>
    </section>
  );
}
