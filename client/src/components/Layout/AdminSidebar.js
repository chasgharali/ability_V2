import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '../Dashboard/Dashboard.css';

export default function AdminSidebar({ active = 'booths' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [expanded, setExpanded] = useState({ admin: true, tools: true });

  const itemClass = (key) => `sidebar-item ${active === key ? 'active' : ''}`;

  return (
    <nav className="dashboard-sidebar">
      <div className="sidebar-section">
        <button className="sidebar-header" onClick={() => setExpanded(s=>({...s, admin:!s.admin}))}>
          <span>Administration</span>
        </button>
        {expanded.admin && (
          <div className="sidebar-items">
            <button className={itemClass('events')} onClick={() => navigate('/dashboard')}>Event Management</button>
            <button className={itemClass('booths')} onClick={() => navigate('/boothmanagement')}>Booth Management</button>
            <button className={itemClass('jobseekers')} onClick={() => navigate('/dashboard')}>Job Seeker Management</button>
          </div>
        )}
      </div>

      <div className="sidebar-section">
        <button className="sidebar-header" onClick={() => setExpanded(s=>({...s, tools:!s.tools}))}><span>Tools</span></button>
        {expanded.tools && (
          <div className="sidebar-items">
            <button className={itemClass('users')} onClick={() => navigate('/dashboard')}>User Management</button>
            <button className={itemClass('analytics')} onClick={() => navigate('/dashboard')}>Analytics</button>
            <button className={itemClass('branding')} onClick={() => navigate('/branding')}>Branding – Header Logo</button>
          </div>
        )}
      </div>

      <div className="sidebar-section">
        <button className="sidebar-item">Trouble Shooting</button>
        <button className="sidebar-item">Instructions</button>
      </div>
    </nav>
  );
}
