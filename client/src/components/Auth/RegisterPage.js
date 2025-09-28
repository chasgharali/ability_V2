import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { MdEmail, MdLock, MdVisibility, MdVisibilityOff, MdPerson, MdPhone, MdLocationOn, MdWork, MdBuild } from 'react-icons/md';
import './Auth.css';

const RegisterPage = () => {
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
        phone: '',
        announcements: false,
        agreeToTerms: false
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [validationErrors, setValidationErrors] = useState({});

    const { register } = useAuth();
    const navigate = useNavigate();
    const formRef = useRef(null);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));

        // Clear validation error for this field when user starts typing
        if (validationErrors[name]) {
            setValidationErrors(prev => ({
                ...prev,
                [name]: ''
            }));
        }
    };

    const validateForm = () => {
        const errors = {};

        // First name validation
        if (!formData.firstName.trim()) {
            errors.firstName = 'First name is required';
        } else if (formData.firstName.trim().length < 2) {
            errors.firstName = 'First name must be at least 2 characters long';
        }

        // Last name validation
        if (!formData.lastName.trim()) {
            errors.lastName = 'Last name is required';
        } else if (formData.lastName.trim().length < 2) {
            errors.lastName = 'Last name must be at least 2 characters long';
        }

        // Email validation
        if (!formData.email.trim()) {
            errors.email = 'Email address is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            errors.email = 'Please enter a valid email address';
        }

        // Phone validation (optional but if provided, should be valid)
        if (formData.phone && !/^[\+]?[1-9][\d]{0,15}$/.test(formData.phone.replace(/[\s\-\(\)]/g, ''))) {
            errors.phone = 'Please enter a valid phone number';
        }

        // Password validation
        if (!formData.password) {
            errors.password = 'Password is required';
        } else if (formData.password.length < 8) {
            errors.password = 'Password must be at least 8 characters long';
        } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
            errors.password = 'Password must contain at least one uppercase letter, one lowercase letter, and one number';
        }

        // Confirm password validation
        if (!formData.confirmPassword) {
            errors.confirmPassword = 'Please confirm your password';
        } else if (formData.password !== formData.confirmPassword) {
            errors.confirmPassword = 'Passwords do not match';
        }

        // Terms agreement validation
        if (!formData.agreeToTerms) {
            errors.agreeToTerms = 'You must agree to the terms and conditions';
        }

        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // Validate form before submission
        if (!validateForm()) {
            return;
        }

        setIsLoading(true);

        try {
            const userData = {
                name: `${formData.firstName} ${formData.lastName}`,
                email: formData.email,
                password: formData.password,
                role: 'JobSeeker',
                phoneNumber: (formData.phone || '').trim(),
                // announcements is not part of /auth/register schema; we can persist it later via profile update
            };

            await register(userData);
            navigate('/verify-email-sent', { state: { email: formData.email } });
        } catch (err) {
            setError(err.message || 'Registration failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSkipToForm = (e) => {
        e.preventDefault();
        if (formRef.current) {
            const firstInput = formRef.current.querySelector('input');
            if (firstInput) {
                firstInput.focus();
            }
        }
    };

    return (
        <div className="auth-container">
            <a href="#register-form" className="skip-link" onClick={handleSkipToForm}>
                Skip to registration form
            </a>
            <div className="auth-card register-card">
                {/* Back to Landing Link */}
                <Link to="/" className="back-link" aria-label="Back to landing page">
                    <span className="back-arrow">←</span>
                    Back to Landing
                </Link>

                {/* Login Option */}
                <div className="login-option">
                    <Link to="/login" className="login-link">Already have an account? Login here</Link>
                </div>

                {/* Registration Form */}
                <div className="auth-form-container">
                    <h1 className="auth-title">Create your Job Seeker Account</h1>
                    <p className="auth-subtitle">Enter your information to create your account. Be sure to signup for announcements about future events.</p>

                    {error && (
                        <div className="error-message" role="alert" aria-live="polite">
                            {error}
                        </div>
                    )}

                    <form ref={formRef} id="register-form" onSubmit={handleSubmit} className="auth-form" noValidate>
                        {/* Enter your information section */}
                        <div className="form-section">
                            <h2 className="section-title">Enter your information</h2>
                            <p className="section-note">An asterisk (*) indicates a required field.</p>

                            <div className="form-row">
                                {/* First Name Field */}
                                <div className="form-group">
                                    <label htmlFor="firstName" className="form-label">
                                        First Name*
                                    </label>
                                    <div className="input-container">
                                        <MdPerson className="input-icon" aria-hidden="true" />
                                        <input
                                            type="text"
                                            id="firstName"
                                            name="firstName"
                                            value={formData.firstName}
                                            onChange={handleInputChange}
                                            placeholder="First Name"
                                            className={`form-input ${validationErrors.firstName ? 'error' : ''}`}
                                            required
                                            autoComplete="given-name"
                                            aria-describedby={validationErrors.firstName ? "firstName-error" : undefined}
                                        />
                                    </div>
                                    {validationErrors.firstName && (
                                        <div id="firstName-error" className="field-error" role="alert" aria-live="polite">
                                            {validationErrors.firstName}
                                        </div>
                                    )}
                                </div>

                                {/* Last Name Field */}
                                <div className="form-group">
                                    <label htmlFor="lastName" className="form-label">
                                        Last Name*
                                    </label>
                                    <div className="input-container">
                                        <MdPerson className="input-icon" aria-hidden="true" />
                                        <input
                                            type="text"
                                            id="lastName"
                                            name="lastName"
                                            value={formData.lastName}
                                            onChange={handleInputChange}
                                            placeholder="Last Name"
                                            className={`form-input ${validationErrors.lastName ? 'error' : ''}`}
                                            required
                                            autoComplete="family-name"
                                            aria-describedby={validationErrors.lastName ? "lastName-error" : undefined}
                                        />
                                    </div>
                                    {validationErrors.lastName && (
                                        <div id="lastName-error" className="field-error" role="alert" aria-live="polite">
                                            {validationErrors.lastName}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="form-row">
                                {/* Email Field */}
                                <div className="form-group">
                                    <label htmlFor="email" className="form-label">
                                        Email*
                                    </label>
                                    <div className="input-container">
                                        <MdEmail className="input-icon" aria-hidden="true" />
                                        <input
                                            type="email"
                                            id="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleInputChange}
                                            placeholder="Email"
                                            className={`form-input ${validationErrors.email ? 'error' : ''}`}
                                            required
                                            autoComplete="email"
                                            aria-describedby={validationErrors.email ? "email-error" : undefined}
                                        />
                                    </div>
                                    {validationErrors.email && (
                                        <div id="email-error" className="field-error" role="alert" aria-live="polite">
                                            {validationErrors.email}
                                        </div>
                                    )}
                                </div>

                                {/* Phone Field */}
                                <div className="form-group">
                                    <label htmlFor="phone" className="form-label">
                                        Phone
                                    </label>
                                    <div className="input-container">
                                        <MdPhone className="input-icon" aria-hidden="true" />
                                        <input
                                            type="tel"
                                            id="phone"
                                            name="phone"
                                            value={formData.phone}
                                            onChange={handleInputChange}
                                            placeholder="Phone"
                                            className={`form-input ${validationErrors.phone ? 'error' : ''}`}
                                            autoComplete="tel"
                                            aria-describedby={validationErrors.phone ? "phone-error" : undefined}
                                        />
                                    </div>
                                    {validationErrors.phone && (
                                        <div id="phone-error" className="field-error" role="alert" aria-live="polite">
                                            {validationErrors.phone}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="form-row">
                                {/* Password Field */}
                                <div className="form-group">
                                    <label htmlFor="password" className="form-label">
                                        New Password*
                                    </label>
                                    <div className="input-container">
                                        <MdLock className="input-icon" aria-hidden="true" />
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            id="password"
                                            name="password"
                                            value={formData.password}
                                            onChange={handleInputChange}
                                            placeholder="New Password"
                                            className={`form-input ${validationErrors.password ? 'error' : ''}`}
                                            required
                                            autoComplete="new-password"
                                            aria-describedby={validationErrors.password ? "password-error" : undefined}
                                        />
                                        <button
                                            type="button"
                                            className="password-toggle"
                                            onClick={() => setShowPassword(!showPassword)}
                                            aria-label={showPassword ? "Hide password" : "Show password"}
                                            tabIndex="-1"
                                        >
                                            {showPassword ? <MdVisibilityOff /> : <MdVisibility />}
                                        </button>
                                    </div>
                                    {validationErrors.password && (
                                        <div id="password-error" className="field-error" role="alert" aria-live="polite">
                                            {validationErrors.password}
                                        </div>
                                    )}
                                </div>

                                {/* Confirm Password Field */}
                                <div className="form-group">
                                    <label htmlFor="confirmPassword" className="form-label">
                                        Repeat Password*
                                    </label>
                                    <div className="input-container">
                                        <MdLock className="input-icon" aria-hidden="true" />
                                        <input
                                            type={showConfirmPassword ? "text" : "password"}
                                            id="confirmPassword"
                                            name="confirmPassword"
                                            value={formData.confirmPassword}
                                            onChange={handleInputChange}
                                            placeholder="Repeat Password"
                                            className={`form-input ${validationErrors.confirmPassword ? 'error' : ''}`}
                                            required
                                            autoComplete="new-password"
                                            aria-describedby={validationErrors.confirmPassword ? "confirmPassword-error" : undefined}
                                        />
                                        <button
                                            type="button"
                                            className="password-toggle"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                                            tabIndex="-1"
                                        >
                                            {showConfirmPassword ? <MdVisibilityOff /> : <MdVisibility />}
                                        </button>
                                    </div>
                                    {validationErrors.confirmPassword && (
                                        <div id="confirmPassword-error" className="field-error" role="alert" aria-live="polite">
                                            {validationErrors.confirmPassword}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Announcements Section */}
                        <div className="form-section">
                            <h2 className="section-title">Announcements</h2>
                            <div className="checkbox-group">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        name="announcements"
                                        checked={formData.announcements}
                                        onChange={handleInputChange}
                                        className="checkbox-input"
                                    />
                                    <span className="checkbox-text">
                                        Please keep me informed with announcements and reminders of upcoming career fairs and events.
                                    </span>
                                </label>
                            </div>
                        </div>

                        {/* Agree to Terms Section */}
                        <div className="form-section">
                            <h2 className="section-title">Agree to Terms</h2>
                            <div className="checkbox-group">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        name="agreeToTerms"
                                        checked={formData.agreeToTerms}
                                        onChange={handleInputChange}
                                        className="checkbox-input"
                                        required
                                        aria-describedby={validationErrors.agreeToTerms ? "terms-error" : undefined}
                                    />
                                    <span className="checkbox-text">
                                        I agree to ABILITY Job Fair's <a href="https://abilityjobfair.org/terms-of-use/" target="_blank" rel="noopener noreferrer" className="terms-link">Terms of Use</a> and <a href="https://abilityjobfair.org/privacy-policy/" target="_blank" rel="noopener noreferrer" className="terms-link">Privacy Policy</a>.
                                    </span>
                                </label>
                                {validationErrors.agreeToTerms && (
                                    <div id="terms-error" className="field-error" role="alert" aria-live="polite">
                                        {validationErrors.agreeToTerms}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            className="submit-button"
                            disabled={isLoading}
                            aria-describedby={isLoading ? "loading-message" : undefined}
                        >
                            {isLoading ? 'Creating Account...' : 'Submit to create your account'}
                        </button>

                        {isLoading && (
                            <div id="loading-message" className="sr-only" aria-live="polite">
                                Creating your account, please wait...
                            </div>
                        )}
                    </form>
                </div>
            </div>

            {/* Branding */}
            <div className="auth-branding">
                <p>powered by abilityCONNECT.online</p>
            </div>
        </div>
    );
};

export default RegisterPage;
