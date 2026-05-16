import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { MdVisibility, MdVisibilityOff } from 'react-icons/md';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../../contexts/AuthContext';
import { useRecruiterBooth } from '../../hooks/useRecruiterBooth';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import '../Dashboard/Dashboard.css';

export default function RecruiterProfileEditor() {
  const { user, loading, updateProfile, changePassword } = useAuth();
  const { booth, event } = useRecruiterBooth();
  const navigate = useNavigate();

  const fullName = user?.name || '';
  const firstNameFromUser = useMemo(() => fullName.split(' ')[0] || '', [fullName]);
  const lastNameFromUser = useMemo(() => fullName.split(' ').slice(1).join(' ') || '', [fullName]);

  const [profileForm, setProfileForm] = useState({
    firstName: firstNameFromUser,
    lastName: lastNameFromUser
  });
  const [emailForm, setEmailForm] = useState({ newEmail: '' });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [pendingEmail, setPendingEmail] = useState(user?.pendingEmail || '');

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    next: false,
    confirm: false
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { replace: true });
      return;
    }
    if (!loading && user && !['Recruiter', 'BoothAdmin'].includes(user.role)) {
      navigate('/dashboard', { replace: true });
    }
  }, [loading, navigate, user]);

  useEffect(() => {
    setProfileForm({
      firstName: firstNameFromUser,
      lastName: lastNameFromUser
    });
    setPendingEmail(user?.pendingEmail || '');
  }, [firstNameFromUser, lastNameFromUser, user?.pendingEmail]);

  const handleProfileChange = (eventObj) => {
    const { name, value } = eventObj.target;
    setProfileForm(prev => ({ ...prev, [name]: value }));
  };

  const handleEmailChange = (eventObj) => {
    const { value } = eventObj.target;
    setEmailForm({ newEmail: value });
    setEmailError('');
  };

  const handlePasswordFieldChange = (eventObj) => {
    const { name, value } = eventObj.target;
    setPasswordForm(prev => ({ ...prev, [name]: value }));
    setPasswordError('');
  };

  const handleSaveProfile = async (eventObj) => {
    eventObj.preventDefault();
    setProfileMessage('');
    setProfileError('');

    const name = `${profileForm.firstName} ${profileForm.lastName}`.trim();
    if (!name) {
      setProfileError('Name is required.');
      return;
    }

    setSavingProfile(true);
    try {
      const result = await updateProfile({ name });
      if (result.success) {
        setProfileMessage('Name updated successfully.');
      } else {
        setProfileError(result.error || 'Failed to update name.');
      }
    } catch (error) {
      setProfileError('Failed to update name.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveEmail = async (eventObj) => {
    eventObj.preventDefault();
    setEmailMessage('');
    setEmailError('');

    const email = (emailForm.newEmail || '').trim();
    if (!email) {
      setEmailError('New email is required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    if (email.toLowerCase() === (user?.email || '').toLowerCase()) {
      setEmailError('New email must be different from current email.');
      return;
    }

    setSavingEmail(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        '/api/users/me/change-email',
        { newEmail: email },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );

      setPendingEmail(response.data?.pendingEmail || email);
      setEmailMessage(
        response.data?.message ||
          'Verification email sent. Please verify your new email address to complete the change.'
      );
      setEmailForm({ newEmail: '' });
    } catch (error) {
      setEmailError(error.response?.data?.message || 'Failed to request email change.');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSavePassword = async (eventObj) => {
    eventObj.preventDefault();
    setPasswordMessage('');
    setPasswordError('');

    if (!passwordForm.currentPassword) {
      setPasswordError('Current password is required.');
      return;
    }
    if (!passwordForm.newPassword) {
      setPasswordError('New password is required.');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      const result = await changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      if (result.success) {
        setPasswordMessage(result.message || 'Password updated successfully.');
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setPasswordError(result.error || 'Failed to update password.');
      }
    } catch (error) {
      setPasswordError('Failed to update password.');
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading || !user) return null;

  return (
    <>
      <Helmet>
        <title>Recruiter Profile Editor - abilityconnect</title>
      </Helmet>
      <div className="dashboard">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <AdminHeader
          brandingLogo={event?.logoUrl || event?.logo || ''}
          brandingLogoAlt={event?.logoAltText || ''}
          secondaryLogo={booth?.logoUrl || booth?.companyLogo || ''}
          secondaryLogoAlt={booth?.logoAltText || ''}
        />
        <div className="dashboard-layout">
          <AdminSidebar active="recruiter-profile" />
          <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
            <div className="dashboard-content">
              <h1>Profile Editor</h1>
              <p className="section-note">Update your name, email, and password.</p>

              <section className="dashboard-card" style={{ marginBottom: '1rem' }}>
                <h3>Name</h3>
                {profileMessage && <div className="alert-box" role="status">{profileMessage}</div>}
                {profileError && <div className="alert-box" style={{ background: '#fdecea', borderColor: '#f5c2c7' }} role="alert">{profileError}</div>}
                <form className="account-form" onSubmit={handleSaveProfile}>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="firstName">First Name *</label>
                      <input id="firstName" name="firstName" value={profileForm.firstName} onChange={handleProfileChange} required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="lastName">Last Name *</label>
                      <input id="lastName" name="lastName" value={profileForm.lastName} onChange={handleProfileChange} required />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button className="dashboard-button" type="submit" disabled={savingProfile}>
                      {savingProfile ? 'Saving...' : 'Save Name'}
                    </button>
                  </div>
                </form>
              </section>

              <section className="dashboard-card" style={{ marginBottom: '1rem' }}>
                <h3>Email</h3>
                {emailMessage && <div className="alert-box" role="status">{emailMessage}</div>}
                {emailError && <div className="alert-box" style={{ background: '#fdecea', borderColor: '#f5c2c7' }} role="alert">{emailError}</div>}
                <form className="account-form" onSubmit={handleSaveEmail}>
                  <div className="form-group">
                    <label htmlFor="currentEmail">Current Email</label>
                    <input id="currentEmail" value={user.email || ''} readOnly aria-readonly="true" />
                  </div>
                  {pendingEmail && (
                    <div className="field-help" style={{ marginBottom: '0.75rem', color: '#1d4ed8' }}>
                      Pending verification for: {pendingEmail}
                    </div>
                  )}
                  <div className="form-group">
                    <label htmlFor="newEmail">New Email *</label>
                    <input
                      id="newEmail"
                      type="email"
                      value={emailForm.newEmail}
                      onChange={handleEmailChange}
                      placeholder="name@example.com"
                      autoComplete="email"
                      disabled={!!pendingEmail}
                    />
                  </div>
                  <div className="form-actions">
                    <button className="dashboard-button" type="submit" disabled={savingEmail || !!pendingEmail}>
                      {savingEmail ? 'Sending...' : 'Change Email'}
                    </button>
                  </div>
                </form>
              </section>

              <section className="dashboard-card">
                <h3>Password</h3>
                {passwordMessage && <div className="alert-box" role="status">{passwordMessage}</div>}
                {passwordError && <div className="alert-box" style={{ background: '#fdecea', borderColor: '#f5c2c7' }} role="alert">{passwordError}</div>}
                <form className="account-form" onSubmit={handleSavePassword}>
                  <div className="form-group">
                    <label htmlFor="currentPassword">Current Password *</label>
                    <div className="password-input-wrapper">
                      <input
                        id="currentPassword"
                        name="currentPassword"
                        type={showPasswords.current ? 'text' : 'password'}
                        value={passwordForm.currentPassword}
                        onChange={handlePasswordFieldChange}
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                        aria-label={showPasswords.current ? 'Hide current password' : 'Show current password'}
                        aria-pressed={showPasswords.current}
                      >
                        {showPasswords.current ? <MdVisibilityOff aria-hidden="true" /> : <MdVisibility aria-hidden="true" />}
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
                          type={showPasswords.next ? 'text' : 'password'}
                          value={passwordForm.newPassword}
                          onChange={handlePasswordFieldChange}
                          autoComplete="new-password"
                          required
                        />
                        <button
                          type="button"
                          className="password-toggle-btn"
                          onClick={() => setShowPasswords(prev => ({ ...prev, next: !prev.next }))}
                          aria-label={showPasswords.next ? 'Hide new password' : 'Show new password'}
                          aria-pressed={showPasswords.next}
                        >
                          {showPasswords.next ? <MdVisibilityOff aria-hidden="true" /> : <MdVisibility aria-hidden="true" />}
                        </button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="confirmPassword">Confirm New Password *</label>
                      <div className="password-input-wrapper">
                        <input
                          id="confirmPassword"
                          name="confirmPassword"
                          type={showPasswords.confirm ? 'text' : 'password'}
                          value={passwordForm.confirmPassword}
                          onChange={handlePasswordFieldChange}
                          autoComplete="new-password"
                          required
                        />
                        <button
                          type="button"
                          className="password-toggle-btn"
                          onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                          aria-label={showPasswords.confirm ? 'Hide confirm password' : 'Show confirm password'}
                          aria-pressed={showPasswords.confirm}
                        >
                          {showPasswords.confirm ? <MdVisibilityOff aria-hidden="true" /> : <MdVisibility aria-hidden="true" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="field-help">Password must be at least 8 characters long.</div>
                  <div className="form-actions">
                    <button className="dashboard-button" type="submit" disabled={savingPassword}>
                      {savingPassword ? 'Updating...' : 'Update Password'}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
