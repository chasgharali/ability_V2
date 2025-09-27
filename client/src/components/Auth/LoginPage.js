import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { MdEmail, MdLock, MdVisibility, MdVisibilityOff } from 'react-icons/md';
import './Auth.css';

const LoginPage = () => {
    const [userType, setUserType] = useState('jobseeker'); // 'jobseeker' or 'company'
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        rememberMe: false
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [validationErrors, setValidationErrors] = useState({});

    const { login } = useAuth();
    const navigate = useNavigate();
    const formRef = useRef(null);

    const validateForm = () => {
        const errors = {};

        // Email validation
        if (!formData.email.trim()) {
            errors.email = 'Email address is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            errors.email = 'Please enter a valid email address';
        }

        // Password validation
        if (!formData.password) {
            errors.password = 'Password is required';
        } else if (formData.password.length < 6) {
            errors.password = 'Password must be at least 6 characters long';
        }

        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // Validate form before submission
        if (!validateForm()) {
            return;
        }

        setIsLoading(true);

        try {
            const result = await login(formData.email, formData.password);
            if (result.success) {
                // Navigate to dashboard on successful login
                navigate('/dashboard');
            }
        } catch (err) {
            setError(err.message || 'Login failed. Please check your credentials.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUserTypeChange = (type) => {
        setUserType(type);
        setError(''); // Clear any existing errors when switching types
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
            <a href="#login-form" className="skip-link" onClick={handleSkipToForm}>
                Skip to login form
            </a>
            <div className="auth-card">
                {/* Back to Landing Link */}
                <Link to="/" className="back-link" aria-label="Back to landing page">
                    <span className="back-arrow">←</span>
                    Back to Landing
                </Link>

                {/* Role Toggle Tabs */}
                <div className="role-tabs" role="tablist" aria-label="Select user type">
                    <button
                        type="button"
                        className={`role-tab ${userType === 'jobseeker' ? 'active' : ''}`}
                        onClick={() => handleUserTypeChange('jobseeker')}
                        role="tab"
                        aria-selected={userType === 'jobseeker'}
                        aria-controls="jobseeker-panel"
                        id="jobseeker-tab"
                    >
                        Job Seeker
                    </button>
                    <button
                        type="button"
                        className={`role-tab ${userType === 'company' ? 'active' : ''}`}
                        onClick={() => handleUserTypeChange('company')}
                        role="tab"
                        aria-selected={userType === 'company'}
                        aria-controls="company-panel"
                        id="company-tab"
                    >
                        Company & Staff
                    </button>
                </div>

                {/* Login Form */}
                <div className="auth-form-container">
                    <h1 className="auth-title">
                        {userType === 'jobseeker' ? 'Job Seeker Login' : 'Company & Staff Login'}
                    </h1>

                    {error && (
                        <div className="error-message" role="alert" aria-live="polite">
                            {error}
                        </div>
                    )}

                    <form ref={formRef} id="login-form" onSubmit={handleSubmit} className="auth-form" noValidate>
                        {/* Email Field */}
                        <div className="form-group">
                            <label htmlFor="email" className="form-label">
                                Email
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
                                    aria-describedby={validationErrors.email ? "email-error" : (error ? "error-message" : undefined)}
                                />
                            </div>
                            {validationErrors.email && (
                                <div id="email-error" className="field-error" role="alert" aria-live="polite">
                                    {validationErrors.email}
                                </div>
                            )}
                        </div>

                        {/* Password Field */}
                        <div className="form-group">
                            <label htmlFor="password" className="form-label">
                                Password
                            </label>
                            <div className="input-container">
                                <MdLock className="input-icon" aria-hidden="true" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleInputChange}
                                    placeholder="Password"
                                    className={`form-input ${validationErrors.password ? 'error' : ''}`}
                                    required
                                    autoComplete="current-password"
                                    aria-describedby={validationErrors.password ? "password-error" : (error ? "error-message" : undefined)}
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    tabIndex="0"
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

                        {/* Remember Me and Forgot Password */}
                        <div className="form-options">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    name="rememberMe"
                                    checked={formData.rememberMe}
                                    onChange={handleInputChange}
                                    className="checkbox-input"
                                />
                                <span className="checkbox-text">Remember me on this device</span>
                            </label>
                            <Link to="/forgot-password" className="forgot-link">
                                Forgot password?
                            </Link>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            className="submit-button"
                            disabled={isLoading}
                            aria-describedby={isLoading ? "loading-message" : undefined}
                        >
                            {isLoading ? 'Signing in...' : `Sign in as ${userType === 'jobseeker' ? 'Job Seeker' : 'Company & Staff'}`}
                        </button>

                        {isLoading && (
                            <div id="loading-message" className="sr-only" aria-live="polite">
                                Signing in, please wait...
                            </div>
                        )}
                    </form>

                    {/* Registration Link - Only for Job Seekers */}
                    {userType === 'jobseeker' && (
                        <div className="register-link-container">
                            <p className="register-text">
                                Don't have an account? <Link to="/register" className="register-link">Register here</Link>
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Branding */}
            <div className="auth-branding">
                <p>powered by abilityCONNECT.online</p>
            </div>
        </div>
    );
};

export default LoginPage;
