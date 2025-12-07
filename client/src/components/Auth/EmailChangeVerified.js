import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import './EmailChangeVerified.css';

const EmailChangeVerified = () => {
    const [searchParams] = useSearchParams();
    const error = searchParams.get('error');

    if (error) {
        return (
            <div className="email-change-verified-container">
                <div className="email-change-verified-card">
                    <div className="email-change-verified-content">
                        <h1 className="email-change-verified-title" style={{ color: '#dc2626' }}>
                            Email Change Verification Failed
                        </h1>
                        <div className="alert-box" style={{ background: '#fdecea', borderColor: '#f5c2c7', color: '#721c24', marginBottom: '1.5rem' }}>
                            <p style={{ margin: 0 }}>{error}</p>
                        </div>
                        <p className="email-change-verified-message">
                            The email change verification link you used is invalid or has expired. This could happen if:
                        </p>
                        <ul style={{ textAlign: 'left', margin: '1rem 0', paddingLeft: '1.5rem', color: '#6b7280' }}>
                            <li>The link has expired (links expire after 24 hours)</li>
                            <li>The link has already been used</li>
                            <li>The link is invalid or corrupted</li>
                        </ul>
                        <div className="email-change-verified-actions">
                            <Link to="/dashboard/my-account" className="email-change-verified-button">
                                Go to My Account
                            </Link>
                            <Link to="/dashboard" className="email-change-verified-link">
                                Go to Dashboard
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="email-change-verified-container">
            <div className="email-change-verified-card">
                <div className="email-change-verified-content">
                    <h1 className="email-change-verified-title">Email Address Changed Successfully</h1>
                    <p className="email-change-verified-message">
                        Your email address has been successfully updated. A verification email has been sent to your new email address.
                    </p>
                    <p className="email-change-verified-instruction">
                        Please check your new email inbox and click the verification link to verify your new email address.
                    </p>
                    <div className="email-change-verified-actions">
                        <Link to="/dashboard/my-account" className="email-change-verified-button">
                            Go to My Account
                        </Link>
                        <Link to="/dashboard" className="email-change-verified-link">
                            Go to Dashboard
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EmailChangeVerified;

