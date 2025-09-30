import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { MdExpandMore, MdExpandLess } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import { listUpcomingEvents, listRegisteredEvents } from '../../services/events';

export default function AdminSidebar({ active = 'booths' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState({
    admin: true,
    tools: true,
    'my-account': true,
    'registrations': true,
    'upcoming-events': true
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [myRegistrations, setMyRegistrations] = useState([]);

  // Handle mobile menu state from body class
  useEffect(() => {
    const handleBodyClassChange = () => {
      setMobileOpen(document.body.classList.contains('sidebar-open'));
    };

    // Check initial state
    handleBodyClassChange();

    // Listen for class changes
    const observer = new MutationObserver(handleBodyClassChange);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  // Load upcoming events for JobSeekers
  useEffect(() => {
    let cancelled = false;
    async function loadUpcoming() {
      if (user?.role !== 'JobSeeker') return;
      try {
        const res = await listUpcomingEvents({ page: 1, limit: 50 });
        if (!cancelled) setUpcomingEvents(res?.events || []);
      } catch (e) {
        if (!cancelled) setUpcomingEvents([]);
      }
    }
    loadUpcoming();
    return () => { cancelled = true; };
  }, [user?.role]);

  // Load current registrations from API
  useEffect(() => {
    let cancelled = false;
    async function loadRegs() {
      if (user?.role !== 'JobSeeker') return;
      try {
        const res = await listRegisteredEvents({ page: 1, limit: 50 });
        if (!cancelled) setMyRegistrations(res?.events || []);
      } catch {
        if (!cancelled) setMyRegistrations([]);
      }
    }
    loadRegs();
    return () => { cancelled = true; };
  }, [user?.role]);

  const itemClass = (key) => `sidebar-item ${active === key ? 'active' : ''}`;

  const handleItemClick = (path) => {
    navigate(path);
    // Close mobile menu when item is clicked
    if (window.innerWidth <= 1024) {
      document.body.classList.remove('sidebar-open');
    }
  };

  const toggleSection = (section) => {
    setExpanded(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const closeMobileMenu = () => {
    if (window.innerWidth <= 1024) {
      document.body.classList.remove('sidebar-open');
    }
  };

  // Render role-specific sidebar content
  const renderSidebarContent = () => {
    if (user?.role === 'JobSeeker') {
      return (
        <>
          <div className="sidebar-section">
            <button
              className="sidebar-header"
              onClick={() => { handleItemClick('/dashboard/my-account'); closeMobileMenu(); }}
              aria-label="Go to My Account"
            >
              <span>My Account</span>
              <span
                className="icon-button"
                onClick={(e) => { e.stopPropagation(); toggleSection('my-account'); }}
                aria-label={expanded['my-account'] ? 'Collapse My Account menu' : 'Expand My Account menu'}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleSection('my-account'); } }}
              >
                {expanded['my-account'] ? <MdExpandLess /> : <MdExpandMore />}
              </span>
            </button>
            {expanded['my-account'] && (
              <div className="sidebar-items">
                <button className={`sidebar-item ${active === 'survey' ? 'active' : ''}`}
                  onClick={() => { handleItemClick('/dashboard/survey'); closeMobileMenu(); }}>Survey</button>
                <button className={`sidebar-item ${active === 'delete-account' ? 'active' : ''}`}
                  onClick={() => { handleItemClick('/dashboard/delete-account'); closeMobileMenu(); }}>Delete My Account</button>
                <button className={`sidebar-item ${active === 'edit-profile' ? 'active' : ''}`}
                  onClick={() => { handleItemClick('/dashboard/edit-profile'); closeMobileMenu(); }}>Edit Profile & Resume</button>
                <button className={`sidebar-item ${active === 'view-profile' ? 'active' : ''}`}
                  onClick={() => { handleItemClick('/dashboard/view-profile'); closeMobileMenu(); }}>View My Profile</button>
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <button className="sidebar-header" onClick={() => toggleSection('registrations')}>
              <span>My Current Registrations</span>
              {expanded['registrations'] ? <MdExpandLess /> : <MdExpandMore />}
            </button>
            {expanded['registrations'] && (
              <div className="sidebar-items">
                {myRegistrations.length === 0 && (
                  <div className="sidebar-empty">No registrations yet.</div>
                )}
                {myRegistrations.map((e) => (
                  <button key={e.slug} className="sidebar-item" onClick={() => { handleItemClick(`/event/${encodeURIComponent(e.slug)}/register`); closeMobileMenu(); }}>{e.name}</button>
                ))}
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <button className="sidebar-header" onClick={() => toggleSection('upcoming-events')}>
              <span>Upcoming Events</span>
              {expanded['upcoming-events'] ? <MdExpandLess /> : <MdExpandMore />}
            </button>
            {expanded['upcoming-events'] && (
              <div className="sidebar-items">
                {upcomingEvents.length === 0 && (
                  <div className="sidebar-empty">No upcoming events</div>
                )}
                {upcomingEvents.map(evt => (
                  <button key={evt.slug || evt._id} className="sidebar-item" onClick={() => { handleItemClick(`/event/${encodeURIComponent(evt.slug || evt._id)}/register`); closeMobileMenu(); }}>{evt.name}</button>
                ))}
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <button className="sidebar-item" onClick={closeMobileMenu}>Trouble Shooting</button>
            <button className="sidebar-item" onClick={closeMobileMenu}>Instructions</button>
          </div>
        </>
      );
    } else {
      // Admin, Recruiter, and other roles
      return (
        <>
          <div className="sidebar-section">
            <button className="sidebar-header" onClick={() => setExpanded(s => ({ ...s, admin: !s.admin }))} aria-expanded={expanded.admin}>
              <span>Administration</span>
              {expanded.admin ? <MdExpandLess /> : <MdExpandMore />}
            </button>
            {expanded.admin && (
              <div className="sidebar-items">
                <button className={itemClass('events')} onClick={() => handleItemClick('/eventmanagement')}>Event Management</button>
                <button className={itemClass('booths')} onClick={() => handleItemClick('/boothmanagement')}>Booth Management</button>
                <button className={itemClass('users')} onClick={() => handleItemClick('/users')}>User Management</button>
                <button className={itemClass('jobseekers')} onClick={() => handleItemClick('/dashboard')}>Job Seeker Management</button>
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <button className="sidebar-header" onClick={() => setExpanded(s => ({ ...s, tools: !s.tools }))} aria-expanded={expanded.tools}>
              <span>Tools</span>
              {expanded.tools ? <MdExpandLess /> : <MdExpandMore />}
            </button>
            {expanded.tools && (
              <div className="sidebar-items">
                <button className={itemClass('analytics')} onClick={() => handleItemClick('/dashboard')}>Analytics</button>
                <button className={itemClass('branding')} onClick={() => handleItemClick('/branding')}>Branding – Header Logo</button>
                <button className={itemClass('terms-conditions')} onClick={() => handleItemClick('/terms-conditions')}>Terms & Conditions</button>
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <button className="sidebar-item" onClick={closeMobileMenu}>Trouble Shooting</button>
            <button className="sidebar-item" onClick={closeMobileMenu}>Instructions</button>
          </div>
        </>
      );
    }
  };

  return (
    <nav className={`dashboard-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      {renderSidebarContent()}
    </nav>
  );
}
