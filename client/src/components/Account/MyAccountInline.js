import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './MyAccountInline.css';
import { countryCodes } from '../Auth/countryCodes';

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

// Helper function to extract country code from phone number
const extractCountryCode = (phoneNumber) => {
  if (!phoneNumber) return '+1';
  
  // Check if phone starts with a country code
  for (const country of countryCodes) {
    if (phoneNumber.startsWith(country.dialCode)) {
      return country.dialCode;
    }
  }
  
  // Default to US if no match found
  return '+1';
};

// Helper function to extract phone number without country code
const extractPhoneNumber = (phoneNumber, countryCode) => {
  if (!phoneNumber) return '';
  
  // Remove country code if present
  if (phoneNumber.startsWith(countryCode)) {
    return phoneNumber.substring(countryCode.length).trim();
  }
  
  // Remove leading + if present
  return phoneNumber.replace(/^\+/, '').trim();
};

export default function MyAccountInline({ user, onDone, updateProfile, changePassword }) {
  // Extract country code and phone number from existing phoneNumber
  const initialPhoneNumber = user?.phoneNumber || '';
  const initialCountryCode = extractCountryCode(initialPhoneNumber);
  const initialPhone = extractPhoneNumber(initialPhoneNumber, initialCountryCode);

  const [form, setForm] = useState({
    firstName: (user?.name || '').split(' ')[0] || '',
    lastName: (user?.name || '').split(' ').slice(1).join(' ') || '',
    email: user?.email || '',
    phone: initialPhone,
    phoneCountryCode: initialCountryCode,
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

  // Email change state
  const [emailForm, setEmailForm] = useState({
    newEmail: '',
  });
  const [emailError, setEmailError] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [pendingEmail, setPendingEmail] = useState(user?.pendingEmail || null);

  // Update pendingEmail when user prop changes
  useEffect(() => {
    setPendingEmail(user?.pendingEmail || null);
  }, [user?.pendingEmail]);

  // Password change state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const toggle = (key) => (e) => setA11y(prev => ({ ...prev, [key]: !!e.target.checked }));

  const onEmailChange = (e) => {
    const { name, value } = e.target;
    setEmailForm(prev => ({ ...prev, [name]: value }));
    setEmailError('');
  };

  const onPasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm(prev => ({ ...prev, [name]: value }));
  };

  const handleEmailUpdate = async (e) => {
    if (e) e.preventDefault();
    setEmailError('');
    setEmailMessage('');

    // Validate email
    if (!emailForm.newEmail) {
      setEmailError('New email address is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.newEmail)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    if (emailForm.newEmail.toLowerCase() === form.email.toLowerCase()) {
      setEmailError('New email address must be different from your current email');
      return;
    }

    setSavingEmail(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/users/me/change-email', 
        { newEmail: emailForm.newEmail },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.message) {
        setEmailMessage(response.data.message || 'Verification email sent to your new email address. Please check your inbox.');
        setPendingEmail(response.data.pendingEmail);
        setEmailForm({ newEmail: '' });
      } else {
        setEmailError('Failed to request email change');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Failed to request email change';
      setEmailError(errorMessage);
    } finally {
      setSavingEmail(false);
    }
  };

  const handlePasswordUpdate = async (e) => {
    if (e) e.preventDefault();
    setPasswordError('');
    setPasswordMessage('');

    // Validate passwords - only length check
    if (!passwordForm.currentPassword) {
      setPasswordError('Current password is required');
      return;
    }
    if (!passwordForm.newPassword) {
      setPasswordError('New password is required');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (!changePassword) {
      setPasswordError('Password change functionality is not available');
      return;
    }

    setSavingPassword(true);
    try {
      const result = await changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      if (result.success) {
        setPasswordMessage(result.message || 'Password changed successfully');
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setPasswordError(result.error || 'Failed to change password');
      }
    } catch (err) {
      setPasswordError('Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleNext = async (e) => {
    if (e) e.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      // Combine country code and phone number (phone field should not have country code)
      const phoneNumber = form.phone 
        ? `${form.phoneCountryCode}${form.phone.replace(/^\+/, '').trim()}`.trim()
        : undefined;

      const payload = {
        name: `${form.firstName} ${form.lastName}`.trim(),
        state: form.state || '',
        city: form.city || '',
        country: form.country || 'US',
        phoneNumber: phoneNumber || undefined,
        ...a11y,
      };
      await updateProfile(payload);
      setMessage('Saved');
      if (onDone) {
        // Pass the form data to onDone callback so validation can use it
        // The callback can ignore the parameter if it doesn't need it
        const formData = {
          city: form.city || '',
          state: form.state || '',
          country: form.country || 'US',
        };
        onDone(formData);
      }
    } catch (e) {
      setError('Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <div className="dashboard-content">
      <p className="section-note">An asterisk (*) indicates a required field.</p>

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
            {pendingEmail && (
              <div className="field-help" style={{ color: '#2563eb', marginTop: '4px' }}>
                Pending email change to: {pendingEmail}. Please check your inbox and verify the new email address.
              </div>
            )}
          </div>
          <div className="form-group phone-fields-group">
            <div className="phone-field-wrapper">
              <label htmlFor="phoneCountryCode">Country Code</label>
              <select
                id="phoneCountryCode"
                name="phoneCountryCode"
                value={form.phoneCountryCode}
                onChange={onChange}
              >
                {countryCodes.map(country => (
                  <option key={country.dialCode} value={country.dialCode}>
                    {country.flag} {country.dialCode}
                  </option>
                ))}
              </select>
            </div>
            <div className="phone-field-wrapper">
              <label htmlFor="phone">Phone</label>
              <input 
                id="phone" 
                name="phone" 
                value={form.phone} 
                onChange={onChange} 
                type="tel"
              />
            </div>
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

        <div className="form-actions" style={{ marginBottom: '3rem' }}>
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

      {/* Update Email Section */}
      {changePassword && (
        <div className="email-update-section" style={{ marginTop: '3rem' }}>
          <h3 className="section-title">Update Email Address</h3>
          
          {emailMessage && (
            <div className="alert-box" role="status" aria-live="polite">{emailMessage}</div>
          )}
          {emailError && (
            <div className="alert-box" style={{ background: '#fdecea', borderColor: '#f5c2c7' }} role="alert">{emailError}</div>
          )}

          <form onSubmit={handleEmailUpdate} className="account-form email-form">
            <div className="form-group">
              <label htmlFor="newEmail">New Email Address *</label>
              <input
                id="newEmail"
                name="newEmail"
                type="email"
                value={emailForm.newEmail}
                onChange={onEmailChange}
                placeholder="Enter new email address"
                required
                autoComplete="email"
                disabled={savingEmail || !!pendingEmail}
              />
              <div className="field-help">
                {pendingEmail 
                  ? 'Please verify your pending email change before requesting a new one.'
                  : 'A verification email will be sent to your new email address. You must verify it to complete the change.'}
              </div>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="ajf-btn ajf-btn-dark"
                disabled={savingEmail || !!pendingEmail}
                aria-label="Request email change"
              >
                {savingEmail ? 'Sending...' : 'Request Email Change'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Update Password Section */}
      {changePassword && (
        <div className="password-update-section" style={{ marginTop: '3rem' }}>
          <h3 className="section-title">Update Password</h3>
          
          {passwordMessage && (
            <div className="alert-box" role="status" aria-live="polite">{passwordMessage}</div>
          )}
          {passwordError && (
            <div className="alert-box" style={{ background: '#fdecea', borderColor: '#f5c2c7' }} role="alert">{passwordError}</div>
          )}

          <form onSubmit={handlePasswordUpdate} className="account-form password-form">
            <div className="form-group">
              <label htmlFor="currentPassword">Current Password *</label>
              <div className="password-input-wrapper">
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={passwordForm.currentPassword}
                  onChange={onPasswordChange}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                >
                  {showCurrentPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="newPassword">New Password *</label>
                <div className="password-input-wrapper">
                  <input
                    id="newPassword"
                    name="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    value={passwordForm.newPassword}
                    onChange={onPasswordChange}
                    required
                    autoComplete="new-password"
                    aria-describedby="password-requirements"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                  >
                    {showNewPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm New Password *</label>
                <div className="password-input-wrapper">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={passwordForm.confirmPassword}
                    onChange={onPasswordChange}
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>
            </div>

            <div id="password-requirements" className="field-help password-requirements">
              Password must be at least 8 characters long.
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="ajf-btn ajf-btn-dark"
                disabled={savingPassword}
                aria-label="Update password"
              >
                {savingPassword ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
