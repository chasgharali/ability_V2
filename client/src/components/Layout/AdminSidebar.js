import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { MdExpandMore, MdExpandLess, MdMenu, MdClose } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import { listUpcomingEvents, listRegisteredEvents } from '../../services/events';

/**
 * When pathname matches a known app route, use this key for `.sidebar-item.active`
 * so highlights stay correct even if a page passes the wrong `active` prop.
 * Returns undefined when the path should fall back to the `active` prop.
 */
function getSidebarKeyFromPath(pathname, role) {
  if (!pathname || !role) return undefined;

  if (/^\/booth-queue\//.test(pathname)) {
    return 'queue';
  }
  if (pathname.startsWith('/meeting-records')) {
    return 'meeting-records';
  }
  if (pathname === '/recruiter-ai-search' || pathname.startsWith('/recruiter-ai-search/')) {
    return 'ai-search';
  }
  if (pathname === '/jobseeker-interests' || pathname.startsWith('/jobseeker-interests/')) {
    if (role === 'Recruiter' || role === 'BoothAdmin') return 'interests';
    return 'jobseeker-interests';
  }
  if (pathname === '/analytics' || pathname.startsWith('/analytics/')) {
    return 'analytics';
  }
  if (pathname === '/recruiter-profile' || pathname.startsWith('/recruiter-profile/')) {
    return 'recruiter-profile';
  }
  if (pathname === '/troubleshooting') return 'troubleshooting';
  if (pathname === '/instructions') return 'instructions';

  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    if (role === 'JobSeeker') {
      if (pathname.startsWith('/dashboard/survey')) return 'survey';
      if (pathname.startsWith('/dashboard/delete-account')) return 'delete-account';
      if (pathname.startsWith('/dashboard/edit-profile')) return 'edit-profile';
      if (pathname.startsWith('/dashboard/view-profile')) return 'view-profile';
      if (pathname.startsWith('/dashboard/resume-builder')) return 'resume-builder';
      return 'my-account';
    }
    if (
      role === 'Interpreter' ||
      role === 'GlobalInterpreter' ||
      role === 'Support' ||
      role === 'GlobalSupport'
    ) {
      return 'dashboard';
    }
    return undefined;
  }

  if (pathname === '/eventmanagement' || pathname.startsWith('/eventmanagement/')) return 'events';
  if (pathname === '/boothmanagement' || pathname.startsWith('/boothmanagement')) return 'booths';
  if (pathname === '/usermanagement' || pathname.startsWith('/usermanagement/')) return 'users';
  if (pathname === '/jobseekermanagement' || pathname.startsWith('/jobseekermanagement/')) {
    return 'jobseekers';
  }
  if (pathname === '/jobseeker-survey' || pathname.startsWith('/jobseeker-survey/')) {
    return 'jobseeker-survey';
  }
  if (pathname === '/jobseeker-qualifications' || pathname.startsWith('/jobseeker-qualifications/')) {
    return 'jobseeker-qualifications';
  }
  if (pathname === '/interpreter-categories' || pathname.startsWith('/interpreter-categories/')) {
    return 'interpreter-categories';
  }
  if (pathname === '/branding' || pathname.startsWith('/branding/')) return 'branding';
  if (pathname.startsWith('/terms-conditions')) return 'terms-conditions';
  if (pathname.startsWith('/notes')) return 'notes';
  if (pathname === '/role-messages' || pathname.startsWith('/role-messages/')) return 'role-messages';
  if (pathname === '/organizations' || pathname.startsWith('/organizations/')) return 'organizations';
  if (pathname === '/org-users' || pathname.startsWith('/org-users/')) return 'org-users';
  if (pathname === '/ai-search' || pathname.startsWith('/ai-search/')) return 'ai-search';
  if (pathname.startsWith('/legal/terms-of-use/edit')) return 'legal-terms-of-use';
  if (pathname.startsWith('/legal/privacy-policy/edit')) return 'legal-privacy-policy';
  if (pathname === '/footer-text' || pathname.startsWith('/footer-text/')) return 'footer-text';
  if (pathname === '/resume-builder-limits' || pathname.startsWith('/resume-builder-limits/')) return 'resume-builder-limits';

  return undefined;
}

const JOBSEEKER_ACCOUNT_KEYS = new Set(['my-account', 'survey', 'delete-account', 'edit-profile', 'view-profile', 'resume-builder']);

export default function AdminSidebar({ active = 'booths' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const MENU_NAV_STATE_KEY = 'ability:menu-navigation-state';
  const menuNavHandledRef = useRef('');
  const [expanded, setExpanded] = useState({
    admin: true,
    profile: true,
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

  const pathSidebarKey = useMemo(
    () => getSidebarKeyFromPath(location.pathname, user?.role),
    [location.pathname, user?.role]
  );
  const effectiveActive = pathSidebarKey ?? active;
  const itemClass = (key) => `sidebar-item ${effectiveActive === key ? 'active' : ''}`;

  const markMenuNavigation = (path) => {
    const state = {
      source: 'sidebar-menu',
      path,
      timestamp: Date.now()
    };
    sessionStorage.setItem(MENU_NAV_STATE_KEY, JSON.stringify(state));
  };

  const handleItemClick = (path, event) => {
    markMenuNavigation(path);
    navigate(path);
    if (window.innerWidth <= 1024) {
      document.body.classList.remove('sidebar-open');
    }
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
        markMenuNavigation(`/booth-queue/${encodeURIComponent(slug)}/${encodeURIComponent(boothId)}/entry`);
        navigate(`/booth-queue/${encodeURIComponent(slug)}/${encodeURIComponent(boothId)}/entry`);
      } else {
        markMenuNavigation(`/event/${encodeURIComponent(slug)}`);
        navigate(`/event/${encodeURIComponent(slug)}`);
      }

      if (window.innerWidth <= 1024) {
        document.body.classList.remove('sidebar-open');
      }
    } catch (e) {
      markMenuNavigation('/event/demonstration');
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

  // Clean up the menu-navigation marker in sessionStorage after the route
  // has mounted. GlobalRouteObserver handles focus and title announcement for
  // all navigations (including menu-initiated), so no focus logic is needed here.
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

    sessionStorage.removeItem(MENU_NAV_STATE_KEY);
  }, [location.pathname, user?.role, upcomingEvents.length, myRegistrations.length]);

  /** Path-based active state for JobSeeker (active prop is only used for My Account sub-routes). */
  const jobSeekerPathActive = useMemo(() => {
    if (user?.role !== 'JobSeeker') return null;
    const path = location.pathname;
    const regDetailMatch = path.match(/^\/events\/registered\/([^/]+)$/);
    const eventMatch = path.match(/^\/event\/([^/]+)(?:\/register)?$/);
    return {
      myAccount: path === '/dashboard' || path === '/dashboard/my-account' || path === '/dashboard/my-account/',
      registeredList: path === '/events/registered',
      registeredSlug: regDetailMatch ? decodeURIComponent(regDetailMatch[1]) : null,
      upcomingList: path === '/events/upcoming',
      eventSlug: eventMatch ? decodeURIComponent(eventMatch[1]) : null,
      troubleshooting: path === '/troubleshooting',
      instructions: path === '/instructions'
    };
  }, [user?.role, location.pathname]);

  const upcomingSlugActive = (slugOrId) =>
    jobSeekerPathActive?.eventSlug &&
    (slugOrId === jobSeekerPathActive.eventSlug || String(slugOrId) === jobSeekerPathActive.eventSlug);

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
            <div className="sidebar-header-row">
              <button
                type="button"
                className={`sidebar-header ${(JOBSEEKER_ACCOUNT_KEYS.has(effectiveActive) || jobSeekerPathActive?.myAccount) ? 'active' : ''}`}
                onClick={(e) => { handleItemClick('/dashboard/my-account', e); closeMobileMenu(); }}
                aria-label="Go to My Account"
                aria-current={jobSeekerPathActive?.myAccount ? 'page' : undefined}
              >
                <span>My Account</span>
              </button>
              <button
                type="button"
                className={`icon-button ${(JOBSEEKER_ACCOUNT_KEYS.has(effectiveActive) || jobSeekerPathActive?.myAccount) ? 'active' : ''}`}
                onClick={() => toggleSection('my-account')}
                aria-label="My Account Menu"
                aria-expanded={expanded['my-account']}
              >
                {expanded['my-account'] ? <MdExpandLess /> : <MdExpandMore />}
              </button>
            </div>
            {expanded['my-account'] && (
              <div className="sidebar-items">
                <button type="button" className={itemClass('edit-profile')}
                  onClick={(e) => { handleItemClick('/dashboard/edit-profile', e); closeMobileMenu(); }}>Edit Profile & Resume</button>
                <button type="button" className={itemClass('view-profile')}
                  onClick={(e) => { handleItemClick('/dashboard/view-profile', e); closeMobileMenu(); }}>View My Profile</button>
                <button type="button" className={itemClass('resume-builder')}
                  onClick={(e) => { handleItemClick('/dashboard/resume-builder', e); closeMobileMenu(); }}>Resume Builder</button>
                <button type="button" className={itemClass('survey')}
                  onClick={(e) => { handleItemClick('/dashboard/survey', e); closeMobileMenu(); }}>Survey</button>
                <button type="button" className={itemClass('delete-account')}
                  onClick={(e) => { handleItemClick('/dashboard/delete-account', e); closeMobileMenu(); }}>Delete My Account</button>
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <div className="sidebar-header-row">
              <button
                type="button"
                className={`sidebar-header ${myRegistrations.length > 0 && jobSeekerPathActive && (jobSeekerPathActive.registeredList || jobSeekerPathActive.registeredSlug) ? 'active' : ''}`}
                onClick={(e) => { 
                  if (myRegistrations.length > 0) {
                    handleItemClick('/events/registered', e); 
                    closeMobileMenu(); 
                  }
                }}
                disabled={myRegistrations.length === 0}
                aria-label={myRegistrations.length === 0 ? "No current registrations available" : "Go to My Current Registrations"}
                aria-current={jobSeekerPathActive?.registeredList ? 'page' : undefined}
                title={myRegistrations.length === 0 ? "No current registrations available" : ""}
              >
                <span>Current Registrations</span>
              </button>
              <button
                type="button"
                className={`icon-button ${myRegistrations.length > 0 && jobSeekerPathActive && (jobSeekerPathActive.registeredList || jobSeekerPathActive.registeredSlug) ? 'active' : ''}`}
                onClick={() => toggleSection('registrations')}
                disabled={myRegistrations.length === 0}
                aria-label={myRegistrations.length === 0 ? "No current registrations available" : "Current Registrations Menu"}
                aria-expanded={myRegistrations.length === 0 ? undefined : expanded.registrations}
                title={myRegistrations.length === 0 ? "No current registrations available" : ""}
              >
                {expanded['registrations'] ? <MdExpandLess /> : <MdExpandMore />}
              </button>
            </div>
            {expanded['registrations'] && (
              <div className="sidebar-items">
                {myRegistrations.length === 0 && (
                  <div className="sidebar-empty">No registrations yet.</div>
                )}
                {myRegistrations.map((e) => {
                  const isActive = jobSeekerPathActive?.registeredSlug === e.slug;
                  return (
                    <button
                      key={e.slug}
                      type="button"
                      className={`sidebar-item ${isActive ? 'active' : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={(evt) => { handleItemClick(`/events/registered/${encodeURIComponent(e.slug)}`, evt); closeMobileMenu(); }}
                    >
                      {e.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <div className="sidebar-header-row">
              <button
                type="button"
                className={`sidebar-header ${upcomingEvents.length > 0 && jobSeekerPathActive && (jobSeekerPathActive.upcomingList || (jobSeekerPathActive.eventSlug && upcomingEvents.some((evt) => upcomingSlugActive(evt.slug || evt._id)))) ? 'active' : ''}`}
                onClick={(e) => { 
                  if (upcomingEvents.length > 0) {
                    handleItemClick('/events/upcoming', e); 
                    closeMobileMenu(); 
                  }
                }}
                disabled={upcomingEvents.length === 0}
                aria-label={upcomingEvents.length === 0 ? "No upcoming events available" : "Go to Upcoming Events"}
                aria-current={jobSeekerPathActive?.upcomingList ? 'page' : undefined}
                title={upcomingEvents.length === 0 ? "No upcoming events available" : ""}
              >
                <span>Upcoming Events</span>
              </button>
              <button
                type="button"
                className={`icon-button ${upcomingEvents.length > 0 && jobSeekerPathActive && (jobSeekerPathActive.upcomingList || (jobSeekerPathActive.eventSlug && upcomingEvents.some((evt) => upcomingSlugActive(evt.slug || evt._id)))) ? 'active' : ''}`}
                onClick={() => toggleSection('upcoming-events')}
                disabled={upcomingEvents.length === 0}
                aria-label={upcomingEvents.length === 0 ? "No upcoming events available" : "Upcoming Events Menu"}
                aria-expanded={upcomingEvents.length === 0 ? undefined : expanded['upcoming-events']}
                title={upcomingEvents.length === 0 ? "No upcoming events available" : ""}
              >
                {expanded['upcoming-events'] ? <MdExpandLess /> : <MdExpandMore />}
              </button>
            </div>
            {expanded['upcoming-events'] && (
              <div className="sidebar-items">
                {upcomingEvents.length === 0 && (
                  <div className="sidebar-empty">No upcoming events</div>
                )}
                {upcomingEvents.map((evt) => {
                  const slugOrId = evt.slug || evt._id;
                  const isActive = upcomingSlugActive(slugOrId);
                  return (
                    <button
                      key={evt.slug || evt._id}
                      type="button"
                      className={`sidebar-item ${isActive ? 'active' : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={(e) => { handleItemClick(`/event/${encodeURIComponent(slugOrId)}`, e); closeMobileMenu(); }}
                    >
                      {evt.name}
                    </button>
                  );
                })}
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
            <button
              type="button"
              className={`sidebar-item ${jobSeekerPathActive?.troubleshooting ? 'active' : ''}`}
              aria-current={jobSeekerPathActive?.troubleshooting ? 'page' : undefined}
              onClick={(e) => handleItemClick('/troubleshooting', e)}
            >
              Trouble Shooting
            </button>
            <button
              type="button"
              className={`sidebar-item ${jobSeekerPathActive?.instructions ? 'active' : ''}`}
              aria-current={jobSeekerPathActive?.instructions ? 'page' : undefined}
              onClick={(e) => handleItemClick('/instructions', e)}
            >
              Instructions
            </button>
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
              {expanded.admin ? <MdExpandLess aria-hidden="true" /> : <MdExpandMore aria-hidden="true" />}
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
            <button className="sidebar-header" onClick={() => setExpanded(s => ({ ...s, profile: !s.profile }))} aria-expanded={expanded.profile}>
              <span>Profile</span>
              {expanded.profile ? <MdExpandLess aria-hidden="true" /> : <MdExpandMore aria-hidden="true" />}
            </button>
            {expanded.profile && (
              <div className="sidebar-items">
                <button className={itemClass('recruiter-profile')} onClick={() => handleItemClick('/recruiter-profile')}>
                  Profile Editor
                </button>
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <button className="sidebar-header" onClick={() => setExpanded(s => ({ ...s, tools: !s.tools }))} aria-expanded={expanded.tools}>
              <span>Tools</span>
              {expanded.tools ? <MdExpandLess aria-hidden="true" /> : <MdExpandMore aria-hidden="true" />}
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
              {expanded.superadmin !== false ? <MdExpandLess aria-hidden="true" /> : <MdExpandMore aria-hidden="true" />}
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
                <button className={itemClass('ai-search')} onClick={() => handleItemClick('/ai-search')}>
                  AI Search
                </button>
                <button className={itemClass('jobseeker-survey')} onClick={() => handleItemClick('/jobseeker-survey')}>
                  JobSeeker Survey Data
                </button>
              </div>
            )}
          </div>
          <div className="sidebar-section">
            <button
              className="sidebar-header"
              onClick={() => setExpanded(s => ({ ...s, configuration: !s.configuration }))}
              aria-expanded={expanded.configuration}
            >
              <span>Configuration</span>
              {expanded.configuration ? <MdExpandLess aria-hidden="true" /> : <MdExpandMore aria-hidden="true" />}
            </button>
            {expanded.configuration && (
              <div className="sidebar-items">
                <button className={itemClass('branding')} onClick={() => handleItemClick('/branding')}>
                  Branding - Header Logo
                </button>
                <button className={itemClass('terms-conditions')} onClick={() => handleItemClick('/terms-conditions')}>
                  Terms & Conditions
                </button>
                <button className={itemClass('notes')} onClick={() => handleItemClick('/notes')}>
                  Notes Management
                </button>
                <button className={itemClass('role-messages')} onClick={() => handleItemClick('/role-messages')}>
                  Page Instructions
                </button>
                <button className={itemClass('resume-builder-limits')} onClick={() => handleItemClick('/resume-builder-limits')}>
                  Resume Builder Limits
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
              {expanded.footer !== false ? <MdExpandLess aria-hidden="true" /> : <MdExpandMore aria-hidden="true" />}
            </button>
            {expanded.footer !== false && (
              <div className="sidebar-items">
                <button className={itemClass('footer-text')} onClick={() => handleItemClick('/footer-text')}>
                  Copyright Text
                </button>
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
              {expanded.admin ? <MdExpandLess aria-hidden="true" /> : <MdExpandMore aria-hidden="true" />}
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
              {expanded.configuration ? <MdExpandLess aria-hidden="true" /> : <MdExpandMore aria-hidden="true" />}
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
              {expanded.tools ? <MdExpandLess aria-hidden="true" /> : <MdExpandMore aria-hidden="true" />}
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
      <nav id="primary-navigation" className={`dashboard-sidebar ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Main navigation">
        <button
          className="mobile-menu-toggle nav-landmark-toggle"
          onClick={toggleMobileMenu}
          aria-label="Toggle navigation menu"
          aria-expanded={mobileOpen}
          aria-controls="primary-navigation"
        >
          {mobileOpen ? <MdClose aria-hidden="true" /> : <MdMenu aria-hidden="true" />}
        </button>
        {renderSidebarContent()}
      </nav>
    </>
  );
}
