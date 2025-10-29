import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Auth.css';

export default function VerifyEmailSent() {
  const location = useLocation();
  const email = location.state?.email || '';
  const redirectPath = location.state?.redirectPath;

  // Announce page load to screen readers
  useEffect(() => {
    // Set focus to the main heading for screen reader navigation
    const heading = document.getElementById('verify-title');
    if (heading) {
      heading.focus();
    }

    // Announce the page content to screen readers
    const announcement = `Email verification sent. Please check your email${email ? ` at ${email}` : ''} to confirm your account.`;
    
    // Create a live region announcement
    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.setAttribute('class', 'sr-only');
    liveRegion.textContent = announcement;
    document.body.appendChild(liveRegion);

    // Clean up the live region after announcement
    const cleanup = setTimeout(() => {
      if (document.body.contains(liveRegion)) {
        document.body.removeChild(liveRegion);
      }
    }, 3000);

    return () => {
      clearTimeout(cleanup);
      if (document.body.contains(liveRegion)) {
        document.body.removeChild(liveRegion);
      }
    };
  }, [email]);

  return (
    <div className="auth-container" style={{ background: '#eef2f7' }}>
      {/* Skip to main content link for keyboard navigation */}
      <a 
        href="#main-content" 
        className="sr-only sr-only-focusable"
        style={{
          position: 'absolute',
          left: '-9999px',
          top: '10px',
          zIndex: 999,
          padding: '8px 16px',
          background: '#000',
          color: '#fff',
          textDecoration: 'none',
          borderRadius: '4px'
        }}
        onFocus={(e) => {
          e.target.style.left = '10px';
          e.target.style.top = '10px';
        }}
        onBlur={(e) => {
          e.target.style.left = '-9999px';
        }}
        onClick={(e) => {
          e.preventDefault();
          const mainContent = document.getElementById('main-content');
          if (mainContent) {
            mainContent.focus();
            mainContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }}
      >
        Skip to main content
      </a>

      <main 
        id="main-content"
        className="auth-card register-card"
        style={{
          width: '60vw',
          maxWidth: 760,
          minHeight: 'auto',
          height: 'auto',
          borderRadius: 16,
          boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
          padding: '2rem'
        }}
        role="main"
        aria-labelledby="verify-title"
        aria-describedby="verify-instructions verify-support"
      >
        <h1 
          id="verify-title" 
          className="auth-title" 
          style={{ marginBottom: '0.5rem', color: '#111827' }}
          tabIndex="-1"
        >
          Email Verification Sent - ABILITY Job Fair Portal
        </h1>

        <div
          id="verify-instructions"
          role="status"
          aria-live="polite"
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
          <p style={{ margin: 0 }}>
            <strong>Next Step:</strong> Please check your email
            {email && (
              <span>
                {' '}at <span className="email-address" aria-label={`Email address: ${email}`}>{email}</span>
              </span>
            )} to confirm your account.
          </p>
          <p style={{ margin: '8px 0 0 0' }}>
            <strong>Important:</strong> If you do not receive a confirmation email, please check your spam or junk folder. 
            The email may take several minutes to arrive.
          </p>
        </div>

        <div 
          id="verify-support"
          style={{ textAlign: 'center', marginTop: 16 }}
          role="complementary"
          aria-labelledby="support-heading"
        >
          <h2 
            id="support-heading" 
            className="sr-only"
          >
            Need Help?
          </h2>
          <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#6b7280' }}>
            Need assistance? Contact our support team:
          </p>
          <a
            href="https://abilityjobfair.org/job-seeker-support/"
            target="_blank"
            rel="noopener noreferrer"
            className="terms-link"
            aria-label="Contact Job Seeker Support - Opens in new window"
          >
            Contact Job Seeker Support
            <span className="sr-only"> (opens in new window)</span>
          </a>
        </div>

        <nav 
          style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}
          aria-label="Navigation options"
        >
          <Link
            to={redirectPath ? `/login?redirect=${encodeURIComponent(redirectPath)}` : '/login'}
            className="submit-button"
            style={{ width: 'auto', padding: '0.6rem 1rem' }}
            aria-label="Return to login page"
          >
            Back to Login
          </Link>
        </nav>

        {/* Hidden live region for screen reader announcements */}
        <div 
          aria-live="polite" 
          aria-atomic="true" 
          className="sr-only"
          id="announcements"
        ></div>
      </main>
    </div>
  );
}
