import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { MdLogout, MdRefresh, MdMenu, MdClose } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import './AdminHeader.css';
import settingsAPI from '../../services/settings';

export default function AdminHeader({ onLogout, brandingLogo: brandingLogoProp, secondaryLogo }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [brandingLogoFromAPI, setBrandingLogoFromAPI] = useState('');
  
  // Fetch branding logo from API if not provided as prop
  useEffect(() => {
    const fetchBrandingLogo = async () => {
      try {
        const response = await settingsAPI.getSetting('branding_logo');
        if (response.success && response.value) {
          setBrandingLogoFromAPI(response.value);
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

  const brandingLogo = brandingLogoProp || brandingLogoFromAPI;


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

  const [mobileOpen, setMobileOpen] = React.useState(false);
  const toggleMobile = () => {
    const next = !mobileOpen;
    setMobileOpen(next);
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('sidebar-open', next);
    }
  };

  const isBoothUser = ['Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support'].includes(user?.role);

  // Add body class for booth users on mobile (for sidebar positioning)
  useEffect(() => {
    if (typeof document !== 'undefined' && isBoothUser && (brandingLogo || secondaryLogo)) {
      document.body.classList.add('has-mobile-logo-bar');
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('has-mobile-logo-bar');
      }
    };
  }, [isBoothUser, brandingLogo, secondaryLogo]);

  return (
    <header className="dashboard-header admin-header">
      {/* Mobile logo bar for booth users - shows on mobile/tablet only */}
      {isBoothUser && (brandingLogo || secondaryLogo) && (
        <div className="mobile-logo-bar">
          <div className="mobile-logo-container">
            {brandingLogo && brandingLogo.trim() !== '' && (
              <img src={brandingLogo} alt="Event logo" className="mobile-event-logo" />
            )}
            {secondaryLogo && secondaryLogo.trim() !== '' && (
              <img src={secondaryLogo} alt="Booth logo" className="mobile-booth-logo" />
            )}
          </div>
        </div>
      )}

      <div className="dashboard-header-content admin-header-content">
        <div className="header-left">
          <button className="mobile-menu-toggle" onClick={toggleMobile} aria-label="Toggle navigation menu">
            {mobileOpen ? <MdClose /> : <MdMenu />}
          </button>
          {/* Primary (event) logo - hide on mobile for booth users */}
          {brandingLogo && brandingLogo.trim() !== '' && (
            <img src={brandingLogo} alt="Site logo" className={`header-logo ${isBoothUser ? 'hide-on-mobile-booth' : ''}`} />
          )}
          {/* Secondary (booth) logo if provided - not on left for Recruiters/Interpreters/Support */}
          {!isBoothUser && secondaryLogo && secondaryLogo.trim() !== '' && (
            <img src={secondaryLogo} alt="Booth logo" className="header-logo" style={{ marginLeft: 8 }} />
          )}
          {/* Fallback text if no logos */}
          {(!brandingLogo || brandingLogo.trim() === '') && (!secondaryLogo || secondaryLogo.trim() === '') && (
            <span className="header-text">ABILITY Job Fair</span>
          )}
        </div>

        {/* Centered booth logo for Recruiter, Interpreter, and Support - hide on mobile */}
        {isBoothUser && secondaryLogo && secondaryLogo.trim() !== '' && (
          <div className="header-center-logo hide-on-mobile-booth" aria-hidden="true">
            <img src={secondaryLogo} alt="" className="header-logo booth-centered" />
          </div>
        )}
        <div className="user-info admin-user-info">
          <span className="user-name admin-user-name">{user?.name || 'User'} / {user?.role || 'Guest'}</span>
          <div className="connection-status admin-connection">
            <MdRefresh className="refresh-icon" />
            <span className="connection-text">Connection: Active</span>
            <span className="connection-text-mobile">Active</span>
            <div className="connection-dot"></div>
          </div>
          <button onClick={handleLogout} className="logout-button" aria-label="Logout">
            <MdLogout />
          </button>
        </div>
      </div>
    </header>
  );
}
