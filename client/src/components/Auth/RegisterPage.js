import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { MdEmail, MdLock, MdVisibility, MdVisibilityOff, MdPerson, MdPhone } from 'react-icons/md';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import '@syncfusion/ej2-base/styles/material.css';
import '@syncfusion/ej2-react-dropdowns/styles/material.css';
import { countryCodes } from './countryCodes';
import './RegisterPage.css';

const RegisterPage = () => {
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
        phone: '',
        phoneCountryCode: '+1',
        announcements: false,
        agreeToTerms: false
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [validationErrors, setValidationErrors] = useState({});
    const [eventName, setEventName] = useState(null);
    const [isLoadingEvent, setIsLoadingEvent] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [errorModalMessage, setErrorModalMessage] = useState('');

    const { register, user, loading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const formRef = useRef(null);
    const countryCodeDropdownRef = useRef(null);

    // Get redirect parameter from URL
    const urlParams = new URLSearchParams(location.search);
    const redirectPath = urlParams.get('redirect');

    // Extract event slug from redirect path (e.g., /event/101ability/register -> 101ability)
    const extractEventSlug = (path) => {
        if (!path) return null;
        const match = path.match(/\/event\/([^\/]+)\//);
        return match ? match[1] : null;
    };

    const eventSlug = extractEventSlug(redirectPath);

    // Fetch event name if we have a slug
    useEffect(() => {
        if (!eventSlug) return;

        const fetchEventName = async () => {
            setIsLoadingEvent(true);
            try {
                // Use public endpoint that doesn't require authentication
                const response = await fetch(`/api/events/public/slug/${encodeURIComponent(eventSlug)}`);

                if (response.ok) {
                    const data = await response.json();
                    if (data?.event?.name) {
                        setEventName(data.event.name);
                    }
                }
                // Silently fail if event not found - we'll just not show the event name
            } catch (err) {
                // Silently fail - event name is optional
                console.log('Could not fetch event name:', err);
            } finally {
                setIsLoadingEvent(false);
            }
        };

        fetchEventName();
    }, [eventSlug]);

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

    const handleCountryCodeChange = (args) => {
        setFormData(prev => ({
            ...prev,
            phoneCountryCode: args.value
        }));
        // Clear any validation errors for phone country code
        if (validationErrors.phoneCountryCode) {
            setValidationErrors(prev => ({
                ...prev,
                phoneCountryCode: ''
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
            // Combine country code and phone number
            const phoneNumber = formData.phone 
                ? `${formData.phoneCountryCode}${formData.phone.replace(/^\+/, '')}`.trim()
                : undefined;

            const userData = {
                name: `${formData.firstName} ${formData.lastName}`,
                email: formData.email,
                password: formData.password,
                role: 'JobSeeker',
                phoneNumber: phoneNumber,
                subscribeAnnouncements: !!formData.announcements
            };

            const result = await register(userData);
            
            // Check if registration was successful
            if (result && result.success) {
                // Only navigate if registration was successful
                if (redirectPath) {
                    sessionStorage.setItem('eventRegistrationRedirect', redirectPath);
                }
                // Store redirect path in state to use after email verification
                navigate('/verify-email-sent', {
                    state: {
                        email: formData.email,
                        redirectPath: redirectPath
                    }
                });
            } else {
                // Registration failed - get error message from result or use default
                const errorMessage = result?.error || 'Registration failed. Please try again.';
                
                // Show error modal
                setErrorModalMessage(errorMessage);
                setShowErrorModal(true);
                
                // If backend returns email-related error (409 status), show it on the email field
                // Check if the error message indicates email already exists
                if (errorMessage.includes('email') && errorMessage.includes('already exists')) {
                    setValidationErrors(prev => ({
                        ...prev,
                        email: errorMessage
                    }));
                    setError(''); // Clear general error since we're showing it on the field
                } else {
                    setError(errorMessage);
                    // Clear email field error if it's a different error
                    setValidationErrors(prev => {
                        const newErrors = { ...prev };
                        delete newErrors.email;
                        return newErrors;
                    });
                }
                // IMPORTANT: Do NOT navigate - stay on registration page to show the error
            }
        } catch (err) {
            // Fallback error handling in case register throws an error
            console.error('Registration error:', err);
            
            // Display the error message sent from the backend
            const errorMessage = err.response?.data?.message || err.message || 'Registration failed. Please try again.';
            
            // Show error modal
            setErrorModalMessage(errorMessage);
            setShowErrorModal(true);
            
            // If backend returns email-related error (409 status), show it on the email field
            if (err.response?.status === 409) {
                setValidationErrors(prev => ({
                    ...prev,
                    email: errorMessage
                }));
                setError(''); // Clear general error since we're showing it on the field
            } else {
                setError(errorMessage);
                // Clear email field error if it's a different error
                setValidationErrors(prev => {
                    const newErrors = { ...prev };
                    delete newErrors.email;
                    return newErrors;
                });
            }
            // IMPORTANT: Do NOT navigate - stay on registration page to show the error
            // The error will be displayed to the user on the registration form
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
                    {eventName && (
                        <div className="register-event-banner" role="status" aria-live="polite">
                            <p className="register-event-text">
                                Registering for: <strong>{eventName}</strong>
                            </p>
                        </div>
                    )}
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
                                    <div className="register-phone-container">
                                        <div className="register-phone-country-code-wrapper">
                                            <div className="register-input-container register-country-code-container">
                                                <DropDownListComponent
                                                    ref={countryCodeDropdownRef}
                                                    id="phoneCountryCode"
                                                    key={`country-code-${formData.phoneCountryCode}`}
                                                    dataSource={countryCodes}
                                                    fields={{ text: 'display', value: 'dialCode' }}
                                                    value={formData.phoneCountryCode}
                                                    change={handleCountryCodeChange}
                                                    placeholder="Code"
                                                    width="100%"
                                                    popupHeight="300px"
                                                    allowFiltering={true}
                                                    filterBarPlaceholder="Search..."
                                                    cssClass="register-country-code-dropdown"
                                                    itemTemplate={(data) => {
                                                        if (!data || typeof data !== 'object') return <span>Code</span>;
                                                        return (
                                                            <div className="register-country-code-item" style={{ color: 'inherit' }}>
                                                                <span className="register-country-flag" style={{ color: 'inherit' }}>{data.flag || ''}</span>
                                                                <span className="register-country-code-text" style={{ color: 'inherit' }}>{data.dialCode || ''}</span>
                                                            </div>
                                                        );
                                                    }}
                                                    valueTemplate={() => {
                                                        // Always use formData.phoneCountryCode to ensure it updates
                                                        const selectedCountry = countryCodes.find(c => c.dialCode === formData.phoneCountryCode);
                                                        if (selectedCountry) {
                                                            return (
                                                                <div className="register-country-code-value">
                                                                    <span className="register-country-flag">{selectedCountry.flag}</span>
                                                                    <span className="register-country-code-text">{selectedCountry.dialCode}</span>
                                                                </div>
                                                            );
                                                        }
                                                        return <span>Code</span>;
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className="register-phone-input-wrapper">
                                            <div className="register-input-container">
                                                <MdPhone className="register-input-icon" aria-hidden="true" />
                                                <input
                                                    type="tel"
                                                    id="phone"
                                                    name="phone"
                                                    value={formData.phone}
                                                    onChange={handleInputChange}
                                                    placeholder="Phone number"
                                                    className={`register-form-input register-phone-input ${validationErrors.phone ? 'error' : ''}`}
                                                    autoComplete="tel-national"
                                                    aria-describedby={validationErrors.phone ? "phone-error" : undefined}
                                                />
                                            </div>
                                        </div>
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

            {/* Error Modal */}
            {showErrorModal && (
                <div
                    className="register-error-modal-overlay"
                    onClick={() => setShowErrorModal(false)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape' || e.key === 'Enter') {
                            setShowErrorModal(false);
                        }
                    }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="error-modal-title"
                    tabIndex={-1}
                >
                    <div
                        className="register-error-modal-content"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                    >
                        <div className="register-error-modal-header">
                            <h3 id="error-modal-title">Registration Failed</h3>
                            <button
                                className="register-error-modal-close"
                                onClick={() => setShowErrorModal(false)}
                                aria-label="Close error dialog"
                                type="button"
                            >
                                ×
                            </button>
                        </div>
                        <div className="register-error-modal-body">
                            <p>{errorModalMessage}</p>
                        </div>
                        <div className="register-error-modal-footer">
                            <button
                                className="register-error-modal-button"
                                onClick={() => setShowErrorModal(false)}
                                type="button"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Branding */}
            <div className="register-branding">
                <p>powered by abilityCONNECT.online</p>
            </div>
        </div>
    );
};

export default RegisterPage;
