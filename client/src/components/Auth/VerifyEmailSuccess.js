import React from 'react';
import { Link } from 'react-router-dom';
import './Auth.css';

export default function VerifyEmailSuccess() {
  return (
    <div className="auth-container" style={{ background: '#f1f5f9' }}>
      <div className="auth-card register-card" style={{ maxWidth: 720, width: '60vw' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1f2937', marginBottom: '1rem' }}>
          Your account has been verified.
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Link to="/login" className="submit-button" style={{ width: '100%' }}>
            Go to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
