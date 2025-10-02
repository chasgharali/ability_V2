import React, { useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { MdLogout, MdRefresh, MdMenu, MdClose } from 'react-icons/md';
import '../Dashboard/Dashboard.css';

export default function AdminHeader({ onLogout, brandingLogo: brandingLogoProp, secondaryLogo }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const brandingLogo = useMemo(() => {
    if (brandingLogoProp) return brandingLogoProp;
    try { return localStorage.getItem('ajf_branding_logo') || ''; } catch { return ''; }
  }, [brandingLogoProp]);


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

  return (
    <header className="dashboard-header">
      <div className="dashboard-header-content">
        <div className="header-left">
          <button className="mobile-menu-toggle" onClick={toggleMobile} aria-label="Toggle navigation menu">
            {mobileOpen ? <MdClose /> : <MdMenu />}
          </button>
          {/* Primary (event) logo */}
          {brandingLogo && brandingLogo.trim() !== '' && (
            <img src={brandingLogo} alt="Site logo" className="header-logo" />
          )}
          {/* Secondary (booth) logo if provided - not on left for Recruiters */}
          {user?.role !== 'Recruiter' && secondaryLogo && secondaryLogo.trim() !== '' && (
            <img src={secondaryLogo} alt="Booth logo" className="header-logo" style={{ marginLeft: 8 }} />
          )}
          {/* Fallback text if no logos */}
          {(!brandingLogo || brandingLogo.trim() === '') && (!secondaryLogo || secondaryLogo.trim() === '') && (
            <span className="header-text">ABILITY Job Fair</span>
          )}
        </div>

        {/* Centered booth logo for Recruiter */}
        {user?.role === 'Recruiter' && secondaryLogo && secondaryLogo.trim() !== '' && (
          <div className="header-center-logo" aria-hidden="true">
            <img src={secondaryLogo} alt="" className="header-logo booth-centered" />
          </div>
        )}
        <div className="user-info">
          <span className="user-name">{user?.name || 'User'} / {user?.role || 'Guest'}</span>
          <div className="connection-status">
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
