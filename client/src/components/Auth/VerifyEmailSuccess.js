import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Auth.css';

export default function VerifyEmailSuccess() {
  const location = useLocation();
  // Check for redirect parameter in URL or sessionStorage
  const urlParams = new URLSearchParams(location.search);
  const redirectPath = urlParams.get('redirect') || sessionStorage.getItem('eventRegistrationRedirect');

  // Announce success to screen readers
  useEffect(() => {
    // Set focus to the main heading for screen reader navigation
    const heading = document.getElementById('success-title');
    if (heading) {
      heading.focus();
    }

    // Announce success to screen readers
    const announcement = 'Email verification successful. Your account has been verified and you can now log in.';
    
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
  }, []);

  return (
    <div className="auth-container" style={{ background: '#f1f5f9' }}>
      {/* Skip to main content link for keyboard navigation */}
      <a 
        href="#success-title" 
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
          console.log('Skip link clicked');
          const titleElement = document.getElementById('success-title');
          console.log('Title element found:', titleElement);
          if (titleElement) {
            titleElement.focus();
            titleElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            console.log('Title focused and scrolled into view');
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            console.log('Skip link activated via keyboard');
            const titleElement = document.getElementById('success-title');
            if (titleElement) {
              titleElement.focus();
              titleElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        }}
      >
        Skip to main content
      </a>

      <main 
        id="main-content"
        className="auth-card register-card" 
        style={{ 
          maxWidth: 720, 
          width: '60vw',
          height: 'auto',
          minHeight: 'auto',
          padding: '2rem'
        }}
        role="main"
        aria-labelledby="success-title"
      >
        <h1 
          id="success-title"
          style={{ 
            fontSize: '1.25rem', 
            fontWeight: 600, 
            color: '#1f2937', 
            marginBottom: '1rem',
            textAlign: 'center'
          }}
          tabIndex="-1"
        >
          ✅ Email Verification Successful - ABILITY Job Fair Portal
        </h1>
        
        <div 
          role="status"
          aria-live="polite"
          style={{
            background: '#d1fae5',
            border: '1px solid #10b981',
            color: '#065f46',
            borderRadius: 8,
            padding: '12px 16px',
            margin: '0 0 1.5rem 0',
            textAlign: 'center',
            lineHeight: 1.5
          }}
        >
          <p style={{ margin: 0 }}>
            <strong>Success!</strong> Your account has been verified and is now active. 
            You can proceed to log in and access all features of the ABILITY Job Fair Portal.
          </p>
        </div>

        <nav 
          style={{ display: 'flex', justifyContent: 'center' }}
          aria-label="Continue to login"
        >
          <Link
            to={redirectPath ? `/login?redirect=${encodeURIComponent(redirectPath)}` : '/login'}
            className="submit-button"
            style={{ width: '100%' }}
            aria-label="Continue to login page"
          >
            Continue to Login
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
