import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Auth.css';

export default function VerifyEmailSent() {
  const location = useLocation();
  const email = location.state?.email || '';

  return (
    <div className="auth-container" style={{ background: '#eef2f7' }}>
      <div
        className="auth-card register-card"
        style={{
          width: '60vw',
          maxWidth: 760,
          borderRadius: 16,
          boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
        }}
        role="region"
        aria-labelledby="verify-title"
      >
        <h2 id="verify-title" className="auth-title" style={{ marginBottom: '0.5rem', color: '#111827' }}>
          Welcome to ABILITY Job Fair Portal
        </h2>

        <div
          style={{
            background: '#e8f0fe',
            border: '1px solid #c7d2fe',
            color: '#1f2937',
            borderRadius: 10,
            padding: '14px 16px',
            margin: '0 auto 12px',
            lineHeight: 1.6,
            textAlign: 'center'
          }}
        >
          Please check your email{email ? ` (${email})` : ''} to confirm your account. If you do not receive a
          confirmation email, please check your spam folder. It may take several minutes to arrive. If you need
          assistance, contact job seeker support and let us know you did not receive the confirmation email.
        </div>

        <div style={{ textAlign: 'center', marginTop: 6 }}>
          <a
            href="https://abilityjobfair.org/job-seeker-support/"
            target="_blank"
            rel="noopener noreferrer"
            className="terms-link"
          >
            Contact Job Seeker Support
          </a>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
          <Link to="/login" className="submit-button" style={{ width: 'auto', padding: '0.6rem 1rem' }}>
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
