import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { MdLogout, MdRefresh } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import './AdminHeader.css';
import settingsAPI from '../../services/settings';

export default function AdminHeader({ onLogout, brandingLogo: brandingLogoProp, brandingLogoAlt, secondaryLogo, secondaryLogoAlt, hideLogout = false }) {
  const { user, logout, stopImpersonation } = useAuth();
  const navigate = useNavigate();
  const [brandingLogoFromAPI, setBrandingLogoFromAPI] = useState('');
  const [brandingLogoAltFromAPI, setBrandingLogoAltFromAPI] = useState('');
  const [orgLogoFromAPI, setOrgLogoFromAPI] = useState('');
  const [orgLogoAltFromAPI, setOrgLogoAltFromAPI] = useState('');

  // For Admin users: fetch org logo from API (handles both post-login and page-load cases)
  useEffect(() => {
    if (user?.role !== 'Admin') return;

    // If organizationId is already populated with logoUrl, use it directly
    if (user?.organizationId?.logoUrl) {
      setOrgLogoFromAPI(user.organizationId.logoUrl);
      setOrgLogoAltFromAPI(user.organizationId.name || 'Organization logo');
      return;
    }

    // Otherwise fetch the org from the API (e.g. right after login when org isn't populated)
    const orgId = user?.organizationId?._id || user?.organizationId;
    if (!orgId) return;

    const fetchOrgLogo = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`/api/organizations/${orgId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const org = res.data?.organization || res.data;
        if (org?.logoUrl) {
          setOrgLogoFromAPI(org.logoUrl);
          setOrgLogoAltFromAPI(org.name || 'Organization logo');
        }
      } catch {
        // Org logo not available; fall through to global branding
      }
    };

    fetchOrgLogo();
  }, [user?.role, user?.organizationId]);

  // Fetch global branding logo from API if not provided as prop (for non-Admin roles)
  useEffect(() => {
    const fetchBrandingLogo = async () => {
      try {
        const logoResponse = await settingsAPI.getSetting('branding_logo');
        if (logoResponse.success && logoResponse.value) {
          setBrandingLogoFromAPI(logoResponse.value);
        }
        
        const altResponse = await settingsAPI.getSetting('branding_logo_alt');
        if (altResponse.success && altResponse.value) {
          setBrandingLogoAltFromAPI(altResponse.value);
        }
      } catch (error) {
        // Setting doesn't exist yet, that's okay
        console.log('No branding logo set');
      }
    };

    if (!brandingLogoProp) {
      fetchBrandingLogo();
    }
  }, [brandingLogoProp]);

  const brandingLogo = brandingLogoProp || orgLogoFromAPI || brandingLogoFromAPI;
  const finalBrandingLogoAlt = brandingLogoAlt || orgLogoAltFromAPI || brandingLogoAltFromAPI || 'Site logo';
  const finalSecondaryLogoAlt = secondaryLogoAlt || 'Event logo';


  const handleLogout = async () => {
    try {
      if (onLogout) onLogout();
      if (typeof document !== 'undefined') {
        document.body.classList.remove('sidebar-open');
      }
      await Promise.resolve(logout && logout());
    } finally {
      navigate('/login', { replace: true });
    }
  };

  const handleExitToSuperAdmin = async () => {
    const result = await stopImpersonation();
    if (!result?.success) {
      window.alert(result?.error || 'Failed to exit impersonation');
      return;
    }
    navigate('/organizations', { replace: true });
  };

  // Close sidebar on mount for small screens (fresh start on each page)
  useEffect(() => {
    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
      // Always start with sidebar closed on small screens
      if (window.innerWidth <= 1024) {
        document.body.classList.remove('sidebar-open');
      }
      
      // Handle window resize - close sidebar when switching to desktop
      const handleResize = () => {
        if (window.innerWidth > 1024) {
          document.body.classList.remove('sidebar-open');
        }
      };
      
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);
  
  const isBoothUser = ['Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support'].includes(user?.role);
  const isJobSeeker = user?.role === 'JobSeeker';
  const canExitToSuperAdmin = user?.isImpersonating && user?.impersonatorRole === 'SuperAdmin';

  // Add body class for booth users and jobseekers on mobile (for sidebar positioning)
  useEffect(() => {
    if (typeof document !== 'undefined' && (isBoothUser || isJobSeeker) && (brandingLogo || secondaryLogo)) {
      document.body.classList.add('has-mobile-logo-bar');
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('has-mobile-logo-bar');
      }
    };
  }, [isBoothUser, isJobSeeker, brandingLogo, secondaryLogo]);

  return (
    <header role="banner" className={`dashboard-header admin-header ${isJobSeeker ? 'admin-header-jobseeker' : ''}`}>
      {/* Mobile logo bar for booth users and jobseekers - shows on mobile/tablet only */}
      {(isBoothUser || isJobSeeker) && (brandingLogo || secondaryLogo) && (
        <div className="mobile-logo-bar">
          <div className="mobile-logo-container">
            {brandingLogo && brandingLogo.trim() !== '' && (
              <a href="/dashboard" className="mobile-logo-link" aria-label="Go to dashboard home">
                <img src={brandingLogo} alt={finalBrandingLogoAlt} className="mobile-event-logo" />
              </a>
            )}
            {secondaryLogo && secondaryLogo.trim() !== '' && (
              <a href="/dashboard" className="mobile-logo-link" aria-label="Go to dashboard home">
                <img src={secondaryLogo} alt={finalSecondaryLogoAlt} className="mobile-booth-logo" />
              </a>
            )}
          </div>
        </div>
      )}

      <div className="dashboard-header-content admin-header-content">
        <div className="header-left">
          {/* Logo link is first in DOM so it gets focus after the skip link (tab order: skip link → logo → logout) */}
          {brandingLogo && brandingLogo.trim() !== '' && (
            <a href="/dashboard" className={`header-logo-link ${(isBoothUser || isJobSeeker) ? 'hide-on-mobile-booth' : ''}`} aria-label="abilityCONNECT home">
              <img src={brandingLogo} alt="abilityCONNECT home" className="header-logo" />
            </a>
          )}
          {/* Secondary (booth) logo if provided - not on left for Recruiters/Interpreters/Support/JobSeekers */}
          {!isBoothUser && !isJobSeeker && secondaryLogo && secondaryLogo.trim() !== '' && (
            <img src={secondaryLogo} alt={finalSecondaryLogoAlt} className="header-logo" style={{ marginLeft: 8 }} />
          )}
          {/* Fallback text if no logos */}
          {(!brandingLogo || brandingLogo.trim() === '') && (!secondaryLogo || secondaryLogo.trim() === '') && (
            <a href="/dashboard" className="header-logo-link" aria-label="Go to dashboard home">
              <span className="header-text">ABILITY Job Fair</span>
            </a>
          )}
          {/* Menu toggle is rendered inside the sidebar nav landmark for accessibility */}
        </div>

        {/* Centered booth logo for Recruiter, Interpreter, Support, and JobSeekers - hide on mobile */}
        {(isBoothUser || isJobSeeker) && secondaryLogo && secondaryLogo.trim() !== '' && (
          <div className="header-center-logo hide-on-mobile-booth" aria-hidden="true">
            <img src={secondaryLogo} alt="" className="header-logo booth-centered" />
          </div>
        )}
        <div className="user-info admin-user-info">
          <span className="user-name admin-user-name">{user?.name || 'User'} / {user?.role || 'Guest'}</span>
          <div className="connection-status admin-connection" aria-label="Online status: Active">
            <MdRefresh className="refresh-icon" aria-hidden="true" />
            <span className="connection-text">Connection: Active</span>
            <span className="connection-text-mobile">Active</span>
            <div className="connection-dot" aria-hidden="true"></div>
          </div>
          {/* Exit to Super Admin must come before Logout in DOM so Logout is always last in tab order */}
          {canExitToSuperAdmin && (
            <button
              onClick={handleExitToSuperAdmin}
              className="exit-superadmin-button"
              aria-label="Exit to Super Admin"
            >
              Exit to Super Admin
            </button>
          )}
          {!hideLogout && (
            <button onClick={handleLogout} className="logout-button" aria-label="Logout">
              <MdLogout aria-hidden="true" />
              <span className="logout-button-text">Logout</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
