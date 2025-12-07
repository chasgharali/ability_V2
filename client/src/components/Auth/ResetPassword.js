import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { MdLock, MdVisibility, MdVisibilityOff } from 'react-icons/md';
import './ResetPassword.css';

const ResetPassword = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const [formData, setFormData] = useState({
        password: '',
        confirmPassword: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [validationErrors, setValidationErrors] = useState({});
    const [tokenValid, setTokenValid] = useState(null); // null = checking, true = valid, false = invalid
    const navigate = useNavigate();
    const formRef = useRef(null);

    // Check if token is present
    useEffect(() => {
        if (!token) {
            setTokenValid(false);
            setError('Invalid or missing reset token. Please request a new password reset link.');
        } else {
            setTokenValid(true);
        }
    }, [token]);

    const togglePasswordVisibility = () => {
        setShowPassword(!showPassword);
    };

    const toggleConfirmPasswordVisibility = () => {
        setShowConfirmPassword(!showConfirmPassword);
    };

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

        // Password validation - only length check
        if (!formData.password) {
            errors.password = 'Password is required';
        } else if (formData.password.length < 8) {
            errors.password = 'Password must be at least 8 characters long';
        }

        // Confirm password validation
        if (!formData.confirmPassword) {
            errors.confirmPassword = 'Please confirm your password';
        } else if (formData.password !== formData.confirmPassword) {
            errors.confirmPassword = 'Passwords do not match';
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

        if (!token) {
            setError('Invalid reset token. Please request a new password reset link.');
            return;
        }

        setIsLoading(true);

        try {
            const response = await axios.post('/api/auth/reset-password', {
                token,
                password: formData.password
            });

            if (response.data.message) {
                setSuccess(true);
                // Redirect to login after 3 seconds
                setTimeout(() => {
                    navigate('/login');
                }, 3000);
            }
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.response?.data?.error || 'An error occurred. Please try again.';
            setError(errorMessage);
            if (err.response?.status === 400 || err.response?.status === 401) {
                // Token is invalid or expired
                setTokenValid(false);
            }
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

    if (tokenValid === null) {
        return (
            <div className="reset-password-container">
                <div className="reset-password-card">
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                        Loading...
                    </div>
                </div>
            </div>
        );
    }

    if (tokenValid === false && !token) {
        return (
            <div className="reset-password-container">
                <div className="reset-password-card">
                    <Link to="/login" className="reset-password-back-link" aria-label="Back to login page">
                        <span className="back-arrow">←</span>
                        Back to Login
                    </Link>
                    <div className="reset-password-form-container">
                        <h1 className="reset-password-title">Invalid Reset Link</h1>
                        <div className="reset-password-error-message" role="alert" aria-live="polite">
                            {error || 'Invalid or missing reset token. Please request a new password reset link.'}
                        </div>
                        <Link to="/forgot-password" className="reset-password-request-link">
                            Request New Reset Link
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="reset-password-container">
            <a href="#reset-password-form" className="skip-link" onClick={handleSkipToForm}>
                Skip to reset password form
            </a>
            <div className="reset-password-card">
                {/* Back to Login Link */}
                <Link to="/login" className="reset-password-back-link" aria-label="Back to login page">
                    <span className="back-arrow">←</span>
                    Back to Login
                </Link>

                <div className="reset-password-form-container">
                    <h1 className="reset-password-title">Reset Password</h1>
                    <p className="reset-password-subtitle">
                        Enter your new password below.
                    </p>

                    {error && (
                        <div className="reset-password-error-message" role="alert" aria-live="polite">
                            {error}
                        </div>
                    )}

                    {success ? (
                        <div className="reset-password-success-message" role="alert" aria-live="polite">
                            <p>Your password has been reset successfully!</p>
                            <p>Redirecting to login page...</p>
                        </div>
                    ) : (
                        <form ref={formRef} id="reset-password-form" onSubmit={handleSubmit} className="reset-password-form" noValidate>
                            {/* Password Field */}
                            <div className="reset-password-form-group">
                                <label htmlFor="password" className="reset-password-form-label">
                                    New Password
                                </label>
                                <div className="reset-password-input-container">
                                    <MdLock className="reset-password-input-icon" aria-hidden="true" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        id="password"
                                        name="password"
                                        value={formData.password}
                                        onChange={handleInputChange}
                                        placeholder="New Password"
                                        className={`reset-password-form-input ${validationErrors.password ? 'error' : ''}`}
                                        required
                                        autoComplete="new-password"
                                        aria-describedby={validationErrors.password ? "password-error" : (error ? "error-message" : undefined)}
                                    />
                                    <button
                                        type="button"
                                        className="reset-password-password-toggle"
                                        onClick={togglePasswordVisibility}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        tabIndex="0"
                                    >
                                        {showPassword ? <MdVisibilityOff /> : <MdVisibility />}
                                    </button>
                                </div>
                                {validationErrors.password && (
                                    <div id="password-error" className="reset-password-field-error" role="alert" aria-live="polite">
                                        {validationErrors.password}
                                    </div>
                                )}
                            </div>

                            {/* Confirm Password Field */}
                            <div className="reset-password-form-group">
                                <label htmlFor="confirmPassword" className="reset-password-form-label">
                                    Confirm Password
                                </label>
                                <div className="reset-password-input-container">
                                    <MdLock className="reset-password-input-icon" aria-hidden="true" />
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        id="confirmPassword"
                                        name="confirmPassword"
                                        value={formData.confirmPassword}
                                        onChange={handleInputChange}
                                        placeholder="Confirm Password"
                                        className={`reset-password-form-input ${validationErrors.confirmPassword ? 'error' : ''}`}
                                        required
                                        autoComplete="new-password"
                                        aria-describedby={validationErrors.confirmPassword ? "confirm-password-error" : undefined}
                                    />
                                    <button
                                        type="button"
                                        className="reset-password-password-toggle"
                                        onClick={toggleConfirmPasswordVisibility}
                                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                                        tabIndex="0"
                                    >
                                        {showConfirmPassword ? <MdVisibilityOff /> : <MdVisibility />}
                                    </button>
                                </div>
                                {validationErrors.confirmPassword && (
                                    <div id="confirm-password-error" className="reset-password-field-error" role="alert" aria-live="polite">
                                        {validationErrors.confirmPassword}
                                    </div>
                                )}
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                className="reset-password-submit-button"
                                disabled={isLoading || !tokenValid}
                                aria-describedby={isLoading ? "loading-message" : undefined}
                            >
                                {isLoading ? 'Resetting Password...' : 'Reset Password'}
                            </button>

                            {isLoading && (
                                <div id="loading-message" className="reset-password-sr-only" aria-live="polite">
                                    Resetting password, please wait...
                                </div>
                            )}
                        </form>
                    )}
                </div>
            </div>

            {/* Branding */}
            <div className="reset-password-branding">
                <p>powered by abilityCONNECT.online</p>
            </div>
        </div>
    );
};

export default ResetPassword;

