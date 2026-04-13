import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { MdExpandMore, MdExpandLess, MdMenu, MdClose } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import { listUpcomingEvents, listRegisteredEvents } from '../../services/events';

export default function AdminSidebar({ active = 'booths' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const MENU_NAV_STATE_KEY = 'ability:menu-navigation-state';
  const menuNavHandledRef = useRef('');
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

  const getSidebarFocusableElements = () => {
    const sidebar = document.querySelector('.dashboard-sidebar');
    if (!sidebar) return [];
    return Array.from(
      sidebar.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')
    ).filter((el) => el.offsetParent !== null);
  };

  const markMenuNavigation = (path, triggerElement) => {
    const focusableElements = getSidebarFocusableElements();
    const focusedIndex = focusableElements.indexOf(triggerElement);
    const nextIndex = focusedIndex >= 0
      ? Math.min(focusedIndex + 1, Math.max(focusableElements.length - 1, 0))
      : 0;

    const state = {
      source: 'sidebar-menu',
      path,
      timestamp: Date.now(),
      focusedIndex,
      nextIndex
    };
    sessionStorage.setItem(MENU_NAV_STATE_KEY, JSON.stringify(state));
  };

  const handleItemClick = (path, event) => {
    const triggerElement = event?.currentTarget || document.activeElement;
    if (triggerElement && triggerElement instanceof HTMLElement) {
      markMenuNavigation(path, triggerElement);
    }
    navigate(path);
    // Close mobile menu when item is clicked
    if (window.innerWidth <= 1024) {
      document.body.classList.remove('sidebar-open');
    }
    // Focus stays on the activated menu item so keyboard users can continue
    // tabbing through the menu. Use the skip link to jump to the page heading.
  };

  // Special handler for the permanent demo event: fetch its first booth and
  // send the job seeker directly into the queue entry flow.
  const handleDemoEventClick = async () => {
    try {
      const token = localStorage.getItem('token');
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
        const triggerElement = document.activeElement;
        if (triggerElement && triggerElement instanceof HTMLElement) {
          markMenuNavigation(`/booth-queue/${encodeURIComponent(slug)}/${encodeURIComponent(boothId)}/entry`, triggerElement);
        }
        navigate(`/booth-queue/${encodeURIComponent(slug)}/${encodeURIComponent(boothId)}/entry`);
      } else {
        // Fallback: just open the event detail page if queue info isn't available
        const triggerElement = document.activeElement;
        if (triggerElement && triggerElement instanceof HTMLElement) {
          markMenuNavigation(`/event/${encodeURIComponent(slug)}`, triggerElement);
        }
        navigate(`/event/${encodeURIComponent(slug)}`);
      }

      if (window.innerWidth <= 1024) {
        document.body.classList.remove('sidebar-open');
      }
    } catch (e) {
      // On any error, fall back to the standard event page so the user isn't stuck
      const triggerElement = document.activeElement;
      if (triggerElement && triggerElement instanceof HTMLElement) {
        markMenuNavigation('/event/demonstration', triggerElement);
      }
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

  const toggleMobileMenu = () => {
    if (typeof document === 'undefined') return;
    const isOpen = document.body.classList.contains('sidebar-open');
    if (isOpen) {
      document.body.classList.remove('sidebar-open');
    } else {
      document.body.classList.add('sidebar-open');
    }
  };

  useEffect(() => {
    const raw = sessionStorage.getItem(MENU_NAV_STATE_KEY);
    if (!raw) return;

    let state;
    try {
      state = JSON.parse(raw);
    } catch {
      sessionStorage.removeItem(MENU_NAV_STATE_KEY);
      return;
    }

    const isMatchingPath = state?.path === location.pathname;
    const isFresh = Date.now() - Number(state?.timestamp || 0) < 15000;
    if (!isMatchingPath || !isFresh) return;

    const handleKey = `${state.path}|${state.timestamp}`;
    if (menuNavHandledRef.current === handleKey) return;
    menuNavHandledRef.current = handleKey;

    let focusedElement = null;
    let onFirstTabFromMenu = null;
    let onSkipLinkTab = null;
    let cleanupSkipLinkListeners = null;

    const setup = () => {
      const focusableElements = getSidebarFocusableElements();
      if (!focusableElements.length) return;

      const focusedIndex = Number.isInteger(state.focusedIndex) ? state.focusedIndex : 0;
      const nextIndex = Number.isInteger(state.nextIndex) ? state.nextIndex : Math.min(focusedIndex + 1, focusableElements.length - 1);
      const safeFocusedIndex = Math.max(0, Math.min(focusedIndex, focusableElements.length - 1));
      const safeNextIndex = Math.max(0, Math.min(nextIndex, focusableElements.length - 1));
      focusedElement = focusableElements[safeFocusedIndex];
      const resumeIndex = safeNextIndex;

      if (!focusedElement) return;
      focusedElement.focus();

      onFirstTabFromMenu = (e) => {
        if (e.key !== 'Tab' || e.shiftKey) return;
        const skipLink = document.querySelector('.skip-link');
        if (!skipLink) return;

        e.preventDefault();
        focusedElement.removeEventListener('keydown', onFirstTabFromMenu);

        onSkipLinkTab = (evt) => {
          if (evt.key !== 'Tab' || evt.shiftKey) return;
          evt.preventDefault();
          const latestFocusable = getSidebarFocusableElements();
          const resumeTarget = latestFocusable[resumeIndex] || latestFocusable[0] || focusedElement;
          if (resumeTarget && typeof resumeTarget.focus === 'function') {
            resumeTarget.focus();
          }
          cleanupSkipLinkListeners?.();
        };

        const onSkipLinkActivate = () => cleanupSkipLinkListeners?.();

        cleanupSkipLinkListeners = () => {
          skipLink.removeEventListener('keydown', onSkipLinkTab);
          skipLink.removeEventListener('click', onSkipLinkActivate);
          cleanupSkipLinkListeners = null;
        };

        skipLink.addEventListener('keydown', onSkipLinkTab);
        skipLink.addEventListener('click', onSkipLinkActivate, { once: true });
        skipLink.focus();
      };

      focusedElement.addEventListener('keydown', onFirstTabFromMenu);
      sessionStorage.removeItem(MENU_NAV_STATE_KEY);
    };

    const timer = setTimeout(setup, 0);
    return () => {
      clearTimeout(timer);
      if (focusedElement && onFirstTabFromMenu) {
        focusedElement.removeEventListener('keydown', onFirstTabFromMenu);
      }
      cleanupSkipLinkListeners?.();
    };
  }, [location.pathname, user?.role, upcomingEvents.length, myRegistrations.length]);

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
              onClick={(e) => { handleItemClick('/dashboard/my-account', e); closeMobileMenu(); }}
              aria-label="Go to My Account"
            >
              <span>My Account</span>
              <span
                className="icon-button"
                onClick={(e) => { e.stopPropagation(); toggleSection('my-account'); }}
                aria-hidden="true"
              >
                {expanded['my-account'] ? <MdExpandLess /> : <MdExpandMore />}
              </span>
            </button>
            {expanded['my-account'] && (
              <div className="sidebar-items">
                <button className={`sidebar-item ${active === 'survey' ? 'active' : ''}`}
                  onClick={(e) => { handleItemClick('/dashboard/survey', e); closeMobileMenu(); }}>Survey</button>
                <button className={`sidebar-item ${active === 'delete-account' ? 'active' : ''}`}
                  onClick={(e) => { handleItemClick('/dashboard/delete-account', e); closeMobileMenu(); }}>Delete My Account</button>
                <button className={`sidebar-item ${active === 'edit-profile' ? 'active' : ''}`}
                  onClick={(e) => { handleItemClick('/dashboard/edit-profile', e); closeMobileMenu(); }}>Edit Profile & Resume</button>
                <button className={`sidebar-item ${active === 'view-profile' ? 'active' : ''}`}
                  onClick={(e) => { handleItemClick('/dashboard/view-profile', e); closeMobileMenu(); }}>View My Profile</button>
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <button
              className="sidebar-header"
              onClick={(e) => { 
                if (myRegistrations.length > 0) {
                  handleItemClick('/events/registered', e); 
                  closeMobileMenu(); 
                }
              }}
              disabled={myRegistrations.length === 0}
              aria-label={myRegistrations.length === 0 ? "No current registrations available" : "Go to My Current Registrations"}
              title={myRegistrations.length === 0 ? "No current registrations available" : ""}
            >
              <span>Current Registrations</span>
              <span
                className="icon-button"
                onClick={(e) => { 
                  e.stopPropagation(); 
                  if (myRegistrations.length > 0) {
                    toggleSection('registrations'); 
                  }
                }}
                aria-hidden="true"
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
                  <button key={e.slug} className="sidebar-item" onClick={(evt) => { handleItemClick(`/events/registered/${encodeURIComponent(e.slug)}`, evt); closeMobileMenu(); }}>{e.name}</button>
                ))}
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <button
              className="sidebar-header"
              onClick={(e) => { 
                if (upcomingEvents.length > 0) {
                  handleItemClick('/events/upcoming', e); 
                  closeMobileMenu(); 
                }
              }}
              disabled={upcomingEvents.length === 0}
              aria-label={upcomingEvents.length === 0 ? "No upcoming events available" : "Go to Upcoming Events"}
              title={upcomingEvents.length === 0 ? "No upcoming events available" : ""}
            >
              <span>Upcoming Events</span>
              <span
                className="icon-button"
                onClick={(e) => { 
                  e.stopPropagation(); 
                  if (upcomingEvents.length > 0) {
                    toggleSection('upcoming-events'); 
                  }
                }}
                aria-hidden="true"
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
                    onClick={(e) => { handleItemClick(`/event/${encodeURIComponent(evt.slug || evt._id)}`, e); closeMobileMenu(); }}
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
            <button className="sidebar-item" onClick={(e) => handleItemClick('/troubleshooting', e)}>Trouble Shooting</button>
            <button className="sidebar-item" onClick={(e) => handleItemClick('/instructions', e)}>Instructions</button>
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
                <button className={itemClass('analytics')} onClick={() => handleItemClick('/analytics')}>
                  Report
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
    } else if (user?.role === 'SuperAdmin') {
      // SuperAdmin: global platform management
      return (
        <>
          <div className="sidebar-section">
            <button
              className="sidebar-header"
              onClick={() => setExpanded(s => ({ ...s, superadmin: !s.superadmin }))}
              aria-expanded={expanded.superadmin !== false}
            >
              <span>Platform</span>
              {expanded.superadmin !== false ? <MdExpandLess /> : <MdExpandMore />}
            </button>
            {expanded.superadmin !== false && (
              <div className="sidebar-items">
                <button className={itemClass('organizations')} onClick={() => handleItemClick('/organizations')}>
                  Organizations
                </button>
                <button className={itemClass('jobseekers')} onClick={() => handleItemClick('/jobseekermanagement')}>
                  All Job Seekers
                </button>
                <button className={itemClass('users')} onClick={() => handleItemClick('/usermanagement')}>
                  All Users
                </button>
                <button className={itemClass('org-users')} onClick={() => handleItemClick('/org-users')}>
                  Assign Organization
                </button>
                <button className={itemClass('branding')} onClick={() => handleItemClick('/branding')}>
                  Branding - Header Logo
                </button>
              </div>
            )}
          </div>
          <div className="sidebar-section">
            <button
              className="sidebar-header"
              onClick={() => setExpanded(s => ({ ...s, footer: !s.footer }))}
              aria-expanded={expanded.footer !== false}
            >
              <span>Footer</span>
              {expanded.footer !== false ? <MdExpandLess /> : <MdExpandMore />}
            </button>
            {expanded.footer !== false && (
              <div className="sidebar-items">
                <button className={itemClass('legal-terms-of-use')} onClick={() => handleItemClick('/legal/terms-of-use/edit')}>
                  Terms of Use
                </button>
                <button className={itemClass('legal-privacy-policy')} onClick={() => handleItemClick('/legal/privacy-policy/edit')}>
                  Privacy Policy
                </button>
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
                <button className={itemClass('jobseekers')} onClick={() => handleItemClick('/jobseekermanagement')}>Registered Job Seekers</button>
                <button className={itemClass('meeting-records')} onClick={() => handleItemClick('/meeting-records')}>Meeting Records</button>
                <button className={itemClass('jobseeker-interests')} onClick={() => handleItemClick('/jobseeker-interests')}>JobSeeker Interests</button>
                <button className={itemClass('jobseeker-survey')} onClick={() => handleItemClick('/jobseeker-survey')}>JobSeeker Survey Data</button>
                <button className={itemClass('jobseeker-qualifications')} onClick={() => handleItemClick('/jobseeker-qualifications')}>JobSeeker Qualifications</button>
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
      <nav id="primary-navigation" className={`dashboard-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <button
          className="mobile-menu-toggle nav-landmark-toggle"
          onClick={toggleMobileMenu}
          aria-label="Toggle navigation menu"
          aria-expanded={mobileOpen}
          aria-controls="primary-navigation"
        >
          {mobileOpen ? <MdClose /> : <MdMenu />}
        </button>
        {renderSidebarContent()}
      </nav>
    </>
  );
}
