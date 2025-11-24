import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { MdEmail } from 'react-icons/md';
import './ForgotPassword.css';

const ForgotPassword = () => {
    const [formData, setFormData] = useState({
        email: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [validationErrors, setValidationErrors] = useState({});
    const navigate = useNavigate();
    const formRef = useRef(null);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));

        // Clear validation error for this field when user starts typing
        if (validationErrors[name]) {
            setValidationErrors(prev => ({
                ...prev,
                [name]: ''
            }));
        }
        setError('');
    };

    const validateForm = () => {
        const errors = {};

        // Email validation
        if (!formData.email.trim()) {
            errors.email = 'Email address is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            errors.email = 'Please enter a valid email address';
        }

        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess(false);

        // Validate form before submission
        if (!validateForm()) {
            return;
        }

        setIsLoading(true);

        try {
            const response = await axios.post('/api/auth/forgot-password', {
                email: formData.email
            });

            if (response.data.message) {
                setSuccess(true);
            }
        } catch (err) {
            const errorMessage = err.response?.data?.message || 'An error occurred. Please try again.';
            setError(errorMessage);
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
        <div className="forgot-password-container">
            <a href="#forgot-password-form" className="skip-link" onClick={handleSkipToForm}>
                Skip to forgot password form
            </a>
            <div className="forgot-password-card">
                {/* Back to Login Link */}
                <Link to="/login" className="forgot-password-back-link" aria-label="Back to login page">
                    <span className="back-arrow">←</span>
                    Back to Login
                </Link>

                <div className="forgot-password-form-container">
                    <h1 className="forgot-password-title">Forgot Password</h1>
                    <p className="forgot-password-subtitle">
                        Enter your email address and we'll send you a link to reset your password.
                    </p>

                    {error && (
                        <div className="forgot-password-error-message" role="alert" aria-live="polite">
                            {error}
                        </div>
                    )}

                    {success ? (
                        <div className="forgot-password-success-message" role="alert" aria-live="polite">
                            <p>Password reset link has been sent to your email address.</p>
                            <p>Please check your inbox and click the link to reset your password.</p>
                            <p className="forgot-password-check-spam">If you don't see the email, please check your spam folder.</p>
                            <Link to="/login" className="forgot-password-back-to-login">
                                Back to Login
                            </Link>
                        </div>
                    ) : (
                        <form ref={formRef} id="forgot-password-form" onSubmit={handleSubmit} className="forgot-password-form" noValidate>
                            {/* Email Field */}
                            <div className="forgot-password-form-group">
                                <label htmlFor="email" className="forgot-password-form-label">
                                    Email
                                </label>
                                <div className="forgot-password-input-container">
                                    <MdEmail className="forgot-password-input-icon" aria-hidden="true" />
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleInputChange}
                                        placeholder="Email"
                                        className={`forgot-password-form-input ${validationErrors.email ? 'error' : ''}`}
                                        required
                                        autoComplete="email"
                                        aria-describedby={validationErrors.email ? "email-error" : (error ? "error-message" : undefined)}
                                    />
                                </div>
                                {validationErrors.email && (
                                    <div id="email-error" className="forgot-password-field-error" role="alert" aria-live="polite">
                                        {validationErrors.email}
                                    </div>
                                )}
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                className="forgot-password-submit-button"
                                disabled={isLoading}
                                aria-describedby={isLoading ? "loading-message" : undefined}
                            >
                                {isLoading ? 'Sending...' : 'Send Reset Link'}
                            </button>

                            {isLoading && (
                                <div id="loading-message" className="forgot-password-sr-only" aria-live="polite">
                                    Sending reset link, please wait...
                                </div>
                            )}
                        </form>
                    )}
                </div>
            </div>

            {/* Branding */}
            <div className="forgot-password-branding">
                <p>powered by abilityCONNECT.online</p>
            </div>
        </div>
    );
};

export default ForgotPassword;

