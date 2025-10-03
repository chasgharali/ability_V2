import React, { useState, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { MdEmail, MdLock, MdVisibility, MdVisibilityOff } from 'react-icons/md';
import './LoginPage.css';

const LoginPage = () => {
    const location = useLocation();
    const [userType, setUserType] = useState(location.state?.userType || 'jobseeker'); // 'jobseeker' or 'company'
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

    const togglePasswordVisibility = () => {
        setShowPassword(!showPassword);
    };

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
            const loginType = userType === 'jobseeker' ? 'jobseeker' : 'company';
            const result = await login(formData.email, formData.password, loginType);
            if (result.success) {
                // Navigate to dashboard on successful login
                navigate('/dashboard');
            } else {
                setError(result.error || 'Invalid email or password');
            }
        } catch (err) {
            setError(err.message || 'Invalid email or password');
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
        <div className="login-container">
            <a href="#login-form" className="skip-link" onClick={handleSkipToForm}>
                Skip to login form
            </a>
            <div className="login-card">
                {/* Back to Landing Link */}
                <Link to="/" className="login-back-link" aria-label="Back to landing page">
                    <span className="back-arrow">←</span>
                    Back to Landing
                </Link>

                {/* Role Toggle Tabs */}
                <div className="login-role-tabs" role="tablist" aria-label="Select user type">
                    <button
                        type="button"
                        className={`login-role-tab ${userType === 'jobseeker' ? 'active' : ''}`}
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
                        className={`login-role-tab ${userType === 'company' ? 'active' : ''}`}
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
                <div className="login-form-container">
                    <h1 className="login-title">
                        {userType === 'jobseeker' ? 'Job Seeker Login' : 'Company & Staff Login'}
                    </h1>

                    {error && (
                        <div className="login-error-message" role="alert" aria-live="polite">
                            {error}
                        </div>
                    )}

                    <form ref={formRef} id="login-form" onSubmit={handleSubmit} className="login-form" noValidate>
                        {/* Email Field */}
                        <div className="login-form-group">
                            <label htmlFor="email" className="login-form-label">
                                Email
                            </label>
                            <div className="login-input-container">
                                <MdEmail className="login-input-icon" aria-hidden="true" />
                                <input
                                    type="email"
                                    id="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    placeholder="Email"
                                    className={`login-form-input ${validationErrors.email ? 'error' : ''}`}
                                    required
                                    autoComplete="email"
                                    aria-describedby={validationErrors.email ? "email-error" : (error ? "error-message" : undefined)}
                                />
                            </div>
                            {validationErrors.email && (
                                <div id="email-error" className="login-field-error" role="alert" aria-live="polite">
                                    {validationErrors.email}
                                </div>
                            )}
                        </div>

                        {/* Password Field */}
                        <div className="login-form-group">
                            <label htmlFor="password" className="login-form-label">
                                Password
                            </label>
                            <div className="login-input-container">
                                <MdLock className="login-input-icon" aria-hidden="true" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleInputChange}
                                    placeholder="Password"
                                    className={`login-form-input ${validationErrors.password ? 'error' : ''}`}
                                    required
                                    autoComplete="current-password"
                                    aria-describedby={validationErrors.password ? "password-error" : (error ? "error-message" : undefined)}
                                />
                                <button
                                    type="button"
                                    className="login-password-toggle"
                                    onClick={togglePasswordVisibility}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    tabIndex="0"
                                >
                                    {showPassword ? <MdVisibilityOff /> : <MdVisibility />}
                                </button>
                            </div>
                            {validationErrors.password && (
                                <div id="password-error" className="login-field-error" role="alert" aria-live="polite">
                                    {validationErrors.password}
                                </div>
                            )}
                        </div>

                        {/* Remember Me and Forgot Password */}
                        <div className="login-form-options">
                            <label className="login-checkbox-label">
                                <input
                                    type="checkbox"
                                    name="rememberMe"
                                    checked={formData.rememberMe}
                                    onChange={handleInputChange}
                                    className="login-checkbox-input"
                                />
                                <span className="login-checkbox-text">Remember me</span>
                            </label>
                            <Link to="/forgot-password" className="login-forgot-link">
                                Forgot password?
                            </Link>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            className="login-submit-button"
                            disabled={isLoading}
                            aria-describedby={isLoading ? "loading-message" : undefined}
                        >
                            {isLoading ? 'Signing in...' : `Sign in as ${userType === 'jobseeker' ? 'Job Seeker' : 'Company & Staff'}`}
                        </button>

                        {isLoading && (
                            <div id="loading-message" className="login-sr-only" aria-live="polite">
                                Signing in, please wait...
                            </div>
                        )}
                    </form>

                    {/* Registration Link - Only for Job Seekers */}
                    {userType === 'jobseeker' && (
                        <div className="login-register-link-container">
                            <p className="login-register-text">
                                Don't have an account? <Link to="/register" className="login-register-link">Register here</Link>
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Branding */}
            <div className="login-branding">
                <p>powered by abilityCONNECT.online</p>
            </div>
        </div>
    );
};

export default LoginPage;
