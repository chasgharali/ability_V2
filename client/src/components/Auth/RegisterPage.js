import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { MdEmail, MdLock, MdVisibility, MdVisibilityOff, MdPerson, MdPhone, MdLocationOn, MdWork, MdBuild } from 'react-icons/md';
import './RegisterPage.css';

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

    const { register, user, loading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const formRef = useRef(null);

    // Get redirect parameter from URL
    const urlParams = new URLSearchParams(location.search);
    const redirectPath = urlParams.get('redirect');

    // Redirect already authenticated users to their intended destination
    useEffect(() => {
        if (!loading && user && redirectPath) {
            // User is already logged in and has a redirect path, navigate directly
            navigate(decodeURIComponent(redirectPath), { replace: true });
        }
    }, [user, loading, redirectPath, navigate]);

    const togglePasswordVisibility = () => setShowPassword(!showPassword);
    const toggleConfirmPasswordVisibility = () => setShowConfirmPassword(!showConfirmPassword);

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

        // Phone validation has been removed to make the field optional.

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
                subscribeAnnouncements: formData.announcements || false
            };

            await register(userData);
            // Store redirect path in localStorage for persistence through email verification
            if (redirectPath) {
                localStorage.setItem('eventRegistrationRedirect', redirectPath);
            }
            // Store redirect path in state to use after email verification
            navigate('/verify-email-sent', {
                state: {
                    email: formData.email,
                    redirectPath: redirectPath
                }
            });
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

    // Show loading while checking authentication
    if (loading) {
        return (
            <div className="register-container">
                <div className="register-card">
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                        Loading...
                    </div>
                </div>
            </div>
        );
    }

    // If user is authenticated and has redirect, don't show the form
    if (user && redirectPath) {
        return null; // The useEffect will handle the redirect
    }

    return (
        <div className="register-container">
            <a href="#register-form" className="skip-link" onClick={handleSkipToForm}>
                Skip to registration form
            </a>
            <div className="register-card">
                {/* Back to Landing Link */}
                <Link to="/" className="register-back-link" aria-label="Back to landing page">
                    <span className="back-arrow">←</span>
                    Back to Landing
                </Link>

                {/* Login Option */}
                <div className="register-login-option">
                    <Link
                        to={redirectPath ? `/login?redirect=${encodeURIComponent(redirectPath)}` : '/login'}
                        className="register-login-link"
                    >
                        Already have an account? Login here
                    </Link>
                </div>

                {/* Registration Form */}
                <div className="register-form-container">
                    <h1 className="register-title">Create your Job Seeker Account</h1>
                    <p className="register-subtitle">Enter your information to create your account. Be sure to signup for announcements about future events.</p>

                    {error && (
                        <div className="register-error-message" role="alert" aria-live="polite">
                            {error}
                        </div>
                    )}

                    <form ref={formRef} id="register-form" onSubmit={handleSubmit} className="register-form" noValidate>
                        {/* Enter your information section */}
                        <div className="register-form-section">
                            <h2 className="register-section-title">Enter your information</h2>
                            <p className="register-section-note">An asterisk (*) indicates a required field.</p>

                            <div className="register-form-row">
                                {/* First Name Field */}
                                <div className="register-form-group">
                                    <label htmlFor="firstName" className="register-form-label">
                                        First Name*
                                    </label>
                                    <div className="register-input-container">
                                        <MdPerson className="register-input-icon" aria-hidden="true" />
                                        <input
                                            type="text"
                                            id="firstName"
                                            name="firstName"
                                            value={formData.firstName}
                                            onChange={handleInputChange}
                                            placeholder="First Name"
                                            className={`register-form-input ${validationErrors.firstName ? 'error' : ''}`}
                                            required
                                            autoComplete="given-name"
                                            aria-describedby={validationErrors.firstName ? "firstName-error" : undefined}
                                        />
                                    </div>
                                    {validationErrors.firstName && (
                                        <div id="firstName-error" className="register-field-error" role="alert" aria-live="polite">
                                            {validationErrors.firstName}
                                        </div>
                                    )}
                                </div>

                                {/* Last Name Field */}
                                <div className="register-form-group">
                                    <label htmlFor="lastName" className="register-form-label">
                                        Last Name*
                                    </label>
                                    <div className="register-input-container">
                                        <MdPerson className="register-input-icon" aria-hidden="true" />
                                        <input
                                            type="text"
                                            id="lastName"
                                            name="lastName"
                                            value={formData.lastName}
                                            onChange={handleInputChange}
                                            placeholder="Last Name"
                                            className={`register-form-input ${validationErrors.lastName ? 'error' : ''}`}
                                            required
                                            autoComplete="family-name"
                                            aria-describedby={validationErrors.lastName ? "lastName-error" : undefined}
                                        />
                                    </div>
                                    {validationErrors.lastName && (
                                        <div id="lastName-error" className="register-field-error" role="alert" aria-live="polite">
                                            {validationErrors.lastName}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="register-form-row">
                                {/* Email Field */}
                                <div className="register-form-group">
                                    <label htmlFor="email" className="register-form-label">
                                        Email*
                                    </label>
                                    <div className="register-input-container">
                                        <MdEmail className="register-input-icon" aria-hidden="true" />
                                        <input
                                            type="email"
                                            id="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleInputChange}
                                            placeholder="Email"
                                            className={`register-form-input ${validationErrors.email ? 'error' : ''}`}
                                            required
                                            autoComplete="email"
                                            aria-describedby={validationErrors.email ? "email-error" : undefined}
                                        />
                                    </div>
                                    {validationErrors.email && (
                                        <div id="email-error" className="register-field-error" role="alert" aria-live="polite">
                                            {validationErrors.email}
                                        </div>
                                    )}
                                </div>

                                {/* Phone Field */}
                                <div className="register-form-group">
                                    <label htmlFor="phone" className="register-form-label">
                                        Phone
                                    </label>
                                    <div className="register-input-container">
                                        <MdPhone className="register-input-icon" aria-hidden="true" />
                                        <input
                                            type="tel"
                                            id="phone"
                                            name="phone"
                                            value={formData.phone}
                                            onChange={handleInputChange}
                                            placeholder="Phone"
                                            className={`register-form-input ${validationErrors.phone ? 'error' : ''}`}
                                            autoComplete="tel"
                                            aria-describedby={validationErrors.phone ? "phone-error" : undefined}
                                        />
                                    </div>
                                    {validationErrors.phone && (
                                        <div id="phone-error" className="register-field-error" role="alert" aria-live="polite">
                                            {validationErrors.phone}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="register-form-row">
                                {/* Password Field */}
                                <div className="register-form-group">
                                    <label htmlFor="password" className="register-form-label">
                                        New Password*
                                    </label>
                                    <div className="register-input-container">
                                        <MdLock className="register-input-icon" aria-hidden="true" />
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            id="password"
                                            name="password"
                                            value={formData.password}
                                            onChange={handleInputChange}
                                            placeholder="New Password"
                                            className={`register-form-input ${validationErrors.password ? 'error' : ''}`}
                                            required
                                            autoComplete="new-password"
                                            aria-describedby={validationErrors.password ? "password-error" : undefined}
                                        />
                                        <button
                                            type="button"
                                            className="register-password-toggle"
                                            onClick={togglePasswordVisibility}
                                            aria-label={showPassword ? "Hide password" : "Show password"}
                                            tabIndex="-1"
                                        >
                                            {showPassword ? <MdVisibilityOff /> : <MdVisibility />}
                                        </button>
                                    </div>
                                    {validationErrors.password && (
                                        <div id="password-error" className="register-field-error" role="alert" aria-live="polite">
                                            {validationErrors.password}
                                        </div>
                                    )}
                                </div>

                                {/* Confirm Password Field */}
                                <div className="register-form-group">
                                    <label htmlFor="confirmPassword" className="register-form-label">
                                        Repeat Password*
                                    </label>
                                    <div className="register-input-container">
                                        <MdLock className="register-input-icon" aria-hidden="true" />
                                        <input
                                            type={showConfirmPassword ? "text" : "password"}
                                            id="confirmPassword"
                                            name="confirmPassword"
                                            value={formData.confirmPassword}
                                            onChange={handleInputChange}
                                            placeholder="Repeat Password"
                                            className={`register-form-input ${validationErrors.confirmPassword ? 'error' : ''}`}
                                            required
                                            autoComplete="new-password"
                                            aria-describedby={validationErrors.confirmPassword ? "confirmPassword-error" : undefined}
                                        />
                                        <button
                                            type="button"
                                            className="register-password-toggle"
                                            onClick={toggleConfirmPasswordVisibility}
                                            aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                                            tabIndex="-1"
                                        >
                                            {showConfirmPassword ? <MdVisibilityOff /> : <MdVisibility />}
                                        </button>
                                    </div>
                                    {validationErrors.confirmPassword && (
                                        <div id="confirmPassword-error" className="register-field-error" role="alert" aria-live="polite">
                                            {validationErrors.confirmPassword}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Announcements Section */}
                        <div className="register-form-section">
                            <h2 className="register-section-title">Announcements</h2>
                            <div className="register-checkbox-group">
                                <label className="register-checkbox-label">
                                    <input
                                        type="checkbox"
                                        name="announcements"
                                        checked={formData.announcements}
                                        onChange={handleInputChange}
                                        className="register-checkbox-input"
                                    />
                                    <span className="register-checkbox-text">
                                        Please keep me informed with announcements and reminders of upcoming career fairs and events.
                                    </span>
                                </label>
                            </div>
                        </div>

                        {/* Agree to Terms Section */}
                        <div className="register-form-section">
                            <h2 className="register-section-title">Agree to Terms</h2>
                            <div className="register-checkbox-group">
                                <label className="register-checkbox-label">
                                    <input
                                        type="checkbox"
                                        name="agreeToTerms"
                                        checked={formData.agreeToTerms}
                                        onChange={handleInputChange}
                                        className="register-checkbox-input"
                                        required
                                        aria-describedby={validationErrors.agreeToTerms ? "terms-error" : undefined}
                                    />
                                    <span className="register-checkbox-text">
                                        I agree to ABILITY Job Fair's <a href="https://abilityjobfair.org/terms-of-use/" target="_blank" rel="noopener noreferrer" className="register-terms-link">Terms of Use</a> and <a href="https://abilityjobfair.org/privacy-policy/" target="_blank" rel="noopener noreferrer" className="register-terms-link">Privacy Policy</a>.
                                    </span>
                                </label>
                                {validationErrors.agreeToTerms && (
                                    <div id="terms-error" className="register-field-error" role="alert" aria-live="polite">
                                        {validationErrors.agreeToTerms}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            className="register-submit-button"
                            disabled={isLoading}
                            aria-describedby={isLoading ? "loading-message" : undefined}
                        >
                            {isLoading ? 'Creating Account...' : 'Submit to create your account'}
                        </button>

                        {isLoading && (
                            <div id="loading-message" className="register-sr-only" aria-live="polite">
                                Creating your account, please wait...
                            </div>
                        )}
                    </form>
                </div>
            </div>

            {/* Branding */}
            <div className="register-branding">
                <p>powered by abilityCONNECT.online</p>
            </div>
        </div>
    );
};

export default RegisterPage;
