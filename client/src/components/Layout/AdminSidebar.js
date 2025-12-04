import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { MdExpandMore, MdExpandLess } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import { listUpcomingEvents, listRegisteredEvents } from '../../services/events';

export default function AdminSidebar({ active = 'booths' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState({
    admin: true,
    tools: true,
    configuration: true,
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

  // Load events for JobSeekers
  useEffect(() => {
    let cancelled = false;
    async function loadEvents() {
      if (user?.role !== 'JobSeeker') return;
      try {
        // Load both upcoming and registered events
        const [upcomingRes, registeredRes] = await Promise.all([
          listUpcomingEvents({ page: 1, limit: 50 }),
          listRegisteredEvents({ page: 1, limit: 50 })
        ]);

        if (!cancelled) {
          const registered = registeredRes?.events || [];
          const upcoming = upcomingRes?.events || [];

          // Filter out registered events from upcoming events
          const registeredSlugs = new Set(registered.map(e => e.slug));
          const filteredUpcoming = upcoming
            .filter(e => !registeredSlugs.has(e.slug))
            // Exclude the permanent demo event from the Upcoming Events list
            .filter(e => !(e?.isDemo || e?.slug === 'demonstration'));

          // Also hide the demo event from "Current Registrations"
          const filteredRegistrations = registered.filter(
            e => !(e?.isDemo || e?.slug === 'demonstration')
          );

          setMyRegistrations(filteredRegistrations);
          setUpcomingEvents(filteredUpcoming);
        }
      } catch (e) {
        if (!cancelled) {
          setUpcomingEvents([]);
          setMyRegistrations([]);
        }
      }
    }
    loadEvents();
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

  // Special handler for the permanent demo event: fetch its first booth and
  // send the job seeker directly into the queue entry flow.
  const handleDemoEventClick = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/events/slug/demonstration', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      const event = data.event || data.data || data;
      const slug = event?.slug || 'demonstration';

      // Safely extract the first booth id (can be an ObjectId string or a populated object)
      let firstBooth = Array.isArray(event?.booths) && event.booths.length > 0
        ? event.booths[0]
        : null;
      const boothId = typeof firstBooth === 'string' ? firstBooth : firstBooth?._id || null;

      if (slug && boothId) {
        navigate(`/booth-queue/${encodeURIComponent(slug)}/${encodeURIComponent(boothId)}/entry`);
      } else {
        // Fallback: just open the event detail page if queue info isn't available
        navigate(`/event/${encodeURIComponent(slug)}`);
      }

      if (window.innerWidth <= 1024) {
        document.body.classList.remove('sidebar-open');
      }
    } catch (e) {
      // On any error, fall back to the standard event page so the user isn't stuck
      navigate('/event/demonstration');
      if (window.innerWidth <= 1024) {
        document.body.classList.remove('sidebar-open');
      }
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
    if (user?.role === 'Interpreter' || user?.role === 'GlobalInterpreter') {
      // Interpreter view: Dashboard, Troubleshooting, and Instructions
      return (
        <>
          <div className="sidebar-section">
            <button
              className={itemClass('dashboard')}
              onClick={() => handleItemClick('/dashboard')}
            >
              Dashboard
            </button>
            <button
              className={itemClass('troubleshooting')}
              onClick={() => handleItemClick('/troubleshooting')}
            >
              Trouble Shooting
            </button>
            <button
              className={itemClass('instructions')}
              onClick={() => handleItemClick('/instructions')}
            >
              Instructions
            </button>
          </div>
        </>
      );
    } else if (user?.role === 'Support' || user?.role === 'GlobalSupport') {
      // Support view: Dashboard, Instructions, Analytics, Troubleshooting, and Chat
      return (
        <>
          <div className="sidebar-section">
            <button
              className={itemClass('dashboard')}
              onClick={() => handleItemClick('/dashboard')}
            >
              Dashboard
            </button>
            <button
              className={itemClass('analytics')}
              onClick={() => handleItemClick('/analytics')}
            >
              Analytics
            </button>
            <button
              className={itemClass('instructions')}
              onClick={() => handleItemClick('/instructions')}
            >
              Instructions
            </button>
            <button
              className={itemClass('troubleshooting')}
              onClick={() => handleItemClick('/troubleshooting')}
            >
              Troubleshooting
            </button>
          </div>
        </>
      );
    } else if (user?.role === 'JobSeeker') {
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
            <button
              className="sidebar-header"
              onClick={() => { handleItemClick('/events/registered'); closeMobileMenu(); }}
              aria-label="Go to My Current Registrations"
            >
              <span>Current Registrations</span>
              <span
                className="icon-button"
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); toggleSection('registrations'); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleSection('registrations'); } }}
                aria-label="Toggle registrations list"
              >
                {expanded['registrations'] ? <MdExpandLess /> : <MdExpandMore />}
              </span>
            </button>
            {expanded['registrations'] && (
              <div className="sidebar-items">
                {myRegistrations.length === 0 && (
                  <div className="sidebar-empty">No registrations yet.</div>
                )}
                {myRegistrations.map((e) => (
                  <button key={e.slug} className="sidebar-item" onClick={() => { handleItemClick(`/events/registered/${encodeURIComponent(e.slug)}`); closeMobileMenu(); }}>{e.name}</button>
                ))}
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <button
              className="sidebar-header"
              onClick={() => { handleItemClick('/events/upcoming'); closeMobileMenu(); }}
              aria-label="Go to Upcoming Events"
            >
              <span>Upcoming Events</span>
              <span
                className="icon-button"
                onClick={(e) => { e.stopPropagation(); toggleSection('upcoming-events'); }}
                aria-label={expanded['upcoming-events'] ? 'Collapse Upcoming Events menu' : 'Expand Upcoming Events menu'}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleSection('upcoming-events'); } }}
              >
                {expanded['upcoming-events'] ? <MdExpandLess /> : <MdExpandMore />}
              </span>
            </button>
            {expanded['upcoming-events'] && (
              <div className="sidebar-items">
                {upcomingEvents.length === 0 && (
                  <div className="sidebar-empty">No upcoming events</div>
                )}
                {upcomingEvents.map(evt => (
                  <button
                    key={evt.slug || evt._id}
                    className="sidebar-item"
                    onClick={() => { handleItemClick(`/event/${encodeURIComponent(evt.slug || evt._id)}`); closeMobileMenu(); }}
                  >
                    {evt.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <button
              className="sidebar-item"
              onClick={handleDemoEventClick}
            >
              Demonstration
            </button>
          </div>

          <div className="sidebar-section">
            <button className="sidebar-item" onClick={() => handleItemClick('/troubleshooting')}>Trouble Shooting</button>
            <button className="sidebar-item" onClick={() => handleItemClick('/instructions')}>Instructions</button>
          </div>
        </>
      );
    } else if (user?.role === 'Recruiter' || user?.role === 'BoothAdmin') {
      // Recruiter/Booth Admin view: queue management focused
      const assignedBoothId = user?.assignedBooth;
      return (
        <>
          <div className="sidebar-section">
            <button className="sidebar-header" onClick={() => setExpanded(s => ({ ...s, admin: !s.admin }))} aria-expanded={expanded.admin}>
              <span>Recruiter</span>
              {expanded.admin ? <MdExpandLess /> : <MdExpandMore />}
            </button>
            {expanded.admin && (
              <div className="sidebar-items">
                <button 
                  className={itemClass('queue')} 
                  onClick={() => {
                    if (assignedBoothId) {
                      handleItemClick(`/booth-queue/manage/${assignedBoothId}`);
                    } else {
                      // Show error message instead of redirecting to admin page
                      alert('No booth is assigned to your account. Please contact an administrator to assign a booth so you can manage your meeting queue.');
                    }
                  }}
                  disabled={!assignedBoothId}
                  title={!assignedBoothId ? 'No booth assigned. Please contact an administrator.' : ''}
                >
                  Meeting Queue
                </button>
                <button className={itemClass('meeting-records')} onClick={() => handleItemClick('/meeting-records')}>
                  Meeting Records
                </button>
                <button className={itemClass('interests')} onClick={() => handleItemClick('/jobseeker-interests')}>
                  JobSeeker Interests
                </button>
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
                <button className={itemClass('troubleshooting')} onClick={() => handleItemClick('/troubleshooting')}>Trouble Shooting</button>
                <button className={itemClass('instructions')} onClick={() => handleItemClick('/instructions')}>Instructions</button>
              </div>
            )}
          </div>
        </>
      );
    } else {
      // Admin and other elevated roles
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
                <button className={itemClass('users')} onClick={() => handleItemClick('/usermanagement')}>User Management</button>
                <button className={itemClass('jobseekers')} onClick={() => handleItemClick('/jobseekermanagement')}>Job Seeker Management</button>
                <button className={itemClass('meeting-records')} onClick={() => handleItemClick('/meeting-records')}>Meeting Records</button>
                <button className={itemClass('jobseeker-interests')} onClick={() => handleItemClick('/jobseeker-interests')}>JobSeeker Interests</button>
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <button className="sidebar-header" onClick={() => setExpanded(s => ({ ...s, configuration: !s.configuration }))} aria-expanded={expanded.configuration}>
              <span>Configuration</span>
              {expanded.configuration ? <MdExpandLess /> : <MdExpandMore />}
            </button>
            {expanded.configuration && (
              <div className="sidebar-items">
                <button className={itemClass('interpreter-categories')} onClick={() => handleItemClick('/interpreter-categories')}>Interpreter Categories</button>
                <button className={itemClass('branding')} onClick={() => handleItemClick('/branding')}>Branding – Header Logo</button>
                <button className={itemClass('terms-conditions')} onClick={() => handleItemClick('/terms-conditions')}>Terms & Conditions</button>
                <button className={itemClass('notes')} onClick={() => handleItemClick('/notes')}>Notes Management</button>
                <button className={itemClass('role-messages')} onClick={() => handleItemClick('/role-messages')}>Page Instructions</button>
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
                <button className={itemClass('analytics')} onClick={() => handleItemClick('/analytics')}>Analytics</button>
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <button className={itemClass('troubleshooting')} onClick={() => handleItemClick('/troubleshooting')}>Trouble Shooting</button>
            <button className={itemClass('instructions')} onClick={() => handleItemClick('/instructions')}>Instructions</button>
          </div>
        </>
      );
    }
  };

  return (
    <>
      {/* Mobile overlay - click to close sidebar */}
      <div
        className="mobile-overlay"
        onClick={closeMobileMenu}
        aria-hidden="true"
      />
      <nav className={`dashboard-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        {renderSidebarContent()}
      </nav>
    </>
  );
}
