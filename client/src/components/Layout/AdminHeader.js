import React, { useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { MdLogout, MdRefresh } from 'react-icons/md';
import '../Dashboard/Dashboard.css';

export default function AdminHeader({ onLogout }) {
  const { user, logout } = useAuth();
  const brandingLogo = useMemo(() => {
    try { return localStorage.getItem('ajf_branding_logo') || ''; } catch { return ''; }
  }, []);

  const handleLogout = () => {
    if (onLogout) onLogout();
    (logout || (()=>{}))();
  };

  return (
    <header className="dashboard-header">
      <div className="dashboard-header-content">
        <div className="header-left">
          <img src={brandingLogo} alt="Site logo" className="header-logo" />
        </div>
        <div className="user-info">
          <span className="user-name">{user?.name || 'User'} / {user?.role || 'Guest'}</span>
          <div className="connection-status">
            <MdRefresh className="refresh-icon" />
            <span className="connection-text">Connection: Active</span>
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
