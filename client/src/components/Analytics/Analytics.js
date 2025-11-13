import React, { useState, useEffect, useCallback } from 'react';
import '../Dashboard/Dashboard.css';
import './Analytics.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';
import { analyticsAPI } from '../../services/analytics';
import { listEvents } from '../../services/events';
import { listBooths } from '../../services/booths';
import { Select } from '../UI/FormComponents';
import { useRecruiterBooth } from '../../hooks/useRecruiterBooth';

export default function Analytics() {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();
    const { booth: assignedBooth, event: assignedEvent, loading: assignedBoothLoading } = useRecruiterBooth();

    useEffect(() => {
        if (!loading) {
            if (!user) {
                navigate('/login', { replace: true });
            } else if (!['Admin', 'GlobalSupport', 'Support'].includes(user.role)) {
                navigate('/dashboard', { replace: true });
            }
        }
    }, [user, loading, navigate]);

    const [activeTab, setActiveTab] = useState('overview');
    const [loadingData, setLoadingData] = useState(true);
    const [events, setEvents] = useState([]);
    const [boothOptions, setBoothOptions] = useState([]);
    const [filtersCollapsed, setFiltersCollapsed] = useState(false);

    // Overview data
    const [overview, setOverview] = useState(null);

    // Event report data
    const [eventReport, setEventReport] = useState(null);

    // Booth report data
    const [boothReport, setBoothReport] = useState(null);

    // Live stats
    const [liveStats, setLiveStats] = useState(null);
    const [liveStatsLoading, setLiveStatsLoading] = useState(false);

    // Filters
    const [filters, setFilters] = useState({
        eventId: '',
        boothId: '',
        startDate: '',
        endDate: ''
    });

    const isSupportRole = user?.role === 'Support';
    const canFilterBooth = ['Admin', 'GlobalSupport'].includes(user?.role);

    const showToast = useCallback((message, type = 'info') => {
        toast.show(message, { type, duration: 3000 });
    }, [toast]);

    // Load events for filter dropdown
    useEffect(() => {
        const loadEvents = async () => {
            try {
                const response = await listEvents({ page: 1, limit: 100 });
                setEvents(response.events || []);
            } catch (error) {
                console.error('Error loading events:', error);
            }
        };
        loadEvents();
    }, []);

    // Load booths for admin/global support filters
    useEffect(() => {
        if (!canFilterBooth) {
            return;
        }
        const loadBoothsOptions = async () => {
            try {
                const response = await listBooths({
                    page: 1,
                    limit: 200,
                    eventId: filters.eventId || undefined
                });
                setBoothOptions(response.booths || []);
            } catch (error) {
                console.error('Error loading booths:', error);
                setBoothOptions([]);
            }
        };
        loadBoothsOptions();
    }, [canFilterBooth, filters.eventId]);

    // Support role: lock filters to assigned booth/event
    useEffect(() => {
        if (!isSupportRole || assignedBoothLoading || !assignedBooth || !assignedBooth._id) {
            return;
        }

        setBoothOptions([assignedBooth]);

        setFilters(prev => {
            let updated = false;
            const next = { ...prev };

            if (!prev.boothId && assignedBooth._id) {
                next.boothId = assignedBooth._id;
                updated = true;
            }

            if (assignedEvent?._id && prev.eventId !== assignedEvent._id) {
                next.eventId = assignedEvent._id;
                updated = true;
            }

            return updated ? next : prev;
        });

    }, [isSupportRole, assignedBoothLoading, assignedBooth, assignedEvent]);

    // Load overview data
    const loadOverview = useCallback(async () => {
        try {
            setLoadingData(true);
            const data = await analyticsAPI.getOverview(filters);
            setOverview(data);
        } catch (error) {
            console.error('Error loading overview:', error);
            showToast('Failed to load analytics overview', 'error');
        } finally {
            setLoadingData(false);
        }
    }, [filters, showToast]);

    // Load event report
    const loadEventReport = useCallback(async () => {
        if (!filters.eventId) {
            setEventReport(null);
            return;
        }
        try {
            setLoadingData(true);
            const data = await analyticsAPI.getFullEventReport(filters.eventId, filters);
            setEventReport(data);
        } catch (error) {
            console.error('Error loading event report:', error);
            showToast('Failed to load event report', 'error');
        } finally {
            setLoadingData(false);
        }
    }, [filters, showToast]);

    // Load booth report
    const loadBoothReport = useCallback(async () => {
        try {
            setLoadingData(true);
            const data = await analyticsAPI.getBooths(filters);
            setBoothReport(data);
        } catch (error) {
            console.error('Error loading booth report:', error);
            showToast('Failed to load booth report', 'error');
        } finally {
            setLoadingData(false);
        }
    }, [filters, showToast]);

    const loadLiveStats = useCallback(async (showSpinner = false) => {
        try {
            if (showSpinner) {
                setLiveStatsLoading(true);
            }
            const data = await analyticsAPI.getLiveStats({
                eventId: filters.eventId,
                boothId: filters.boothId
            });
            setLiveStats(data);
        } catch (error) {
            console.error('Error loading live stats:', error);
            showToast('Failed to load live stats', 'error');
        } finally {
            if (showSpinner) {
                setLiveStatsLoading(false);
            }
        }
    }, [filters.eventId, filters.boothId, showToast]);

    // Load data based on active tab
    useEffect(() => {
        if (activeTab === 'overview') {
            loadOverview();
        } else if (activeTab === 'event-report') {
            loadEventReport();
        } else if (activeTab === 'booth-report') {
            loadBoothReport();
        } else if (activeTab === 'live-stats') {
            loadLiveStats(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, filters]);

    useEffect(() => {
        if (activeTab !== 'live-stats') {
            return undefined;
        }

        const intervalId = setInterval(() => {
            loadLiveStats();
        }, 10000);

        return () => {
            clearInterval(intervalId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, filters.eventId, filters.boothId]);

    const handleFilterChange = (key, value) => {
        setFilters(prev => {
            if (key === 'eventId') {
                if (prev.eventId === value) {
                    return prev;
                }
                const next = { ...prev, eventId: value };
                if (canFilterBooth) {
                    next.boothId = '';
                }
                return next;
            }

            if (prev[key] === value) {
                return prev;
            }

            return { ...prev, [key]: value };
        });
    };

    const handleExport = async () => {
        try {
            if (activeTab === 'event-report' && filters.eventId) {
                await analyticsAPI.exportCSV('full-event', {
                    eventId: filters.eventId,
                    ...filters
                });
                showToast('Export started', 'success');
            } else if (activeTab === 'booth-report') {
                await analyticsAPI.exportCSV('booths', filters);
                showToast('Export started', 'success');
            }
        } catch (error) {
            console.error('Error exporting:', error);
            showToast('Failed to export data', 'error');
        }
    };

    const formatDuration = (minutes) => {
        if (!minutes || minutes === 0) return '0 sec';
        const hours = Math.floor(minutes / 60);
        const mins = Math.floor(minutes % 60);
        const secs = Math.floor((minutes % 1) * 60);

        if (hours > 0) {
            return `${hours} min ${mins} sec`;
        } else if (mins > 0) {
            return `${mins} min ${secs} sec`;
        } else {
            return `${secs} sec`;
        }
    };

    const formatDateTime = (value) => {
        if (!value) return '—';
        try {
            return new Date(value).toLocaleString();
        } catch (error) {
            return '—';
        }
    };

    if (loading) {
        return <div className="dashboard-loading">Loading...</div>;
    }

    return (
        <div className="dashboard">
            <AdminHeader />
            <div className="dashboard-layout">
                <AdminSidebar active="analytics" />
                <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
                    <div className="dashboard-content">
                        <div className="analytics-container">
                            {/* Page Header 
                            <div className="page-header">
                                <h1>Analytics & Reports</h1>
                                {user?.role === 'Support' && (
                                    <p className="page-subtitle">Viewing data for your assigned booth</p>
                                )}
                            </div>
                            */}

                            {/* Tabs */}
                            <div className="analytics-tabs">
                                <button
                                    className={`analytics-tab ${activeTab === 'overview' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('overview')}
                                >
                                    Overview
                                </button>
                                <button
                                    className={`analytics-tab ${activeTab === 'event-report' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('event-report')}
                                >
                                    Event Report
                                </button>
                                <button
                                    className={`analytics-tab ${activeTab === 'booth-report' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('booth-report')}
                                >
                                    Booth Report
                                </button>
                                <button
                                    className={`analytics-tab ${activeTab === 'live-stats' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('live-stats')}
                                >
                                    Live Stats
                                </button>
                            </div>

                            {/* Filters */}
                            <div className="analytics-filters">
                                <div
                                    className="filters-header"
                                    onClick={() => setFiltersCollapsed(!filtersCollapsed)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            setFiltersCollapsed(!filtersCollapsed);
                                        }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                >
                                    <h3>Filters</h3>
                                    <span className="filters-toggle">
                                        {filtersCollapsed ? '▼' : '▲'}
                                    </span>
                                </div>
                                {!filtersCollapsed && (
                                    <>
                                        <div className="filters-row top-row">
                                            <div className="filter-group">
                                                <label htmlFor="event-filter">Filter by Event:</label>
                                                <Select
                                                    id="event-filter"
                                                    value={filters.eventId}
                                                    onChange={(e) => handleFilterChange('eventId', e.target.value)}
                                                    options={[
                                                        { value: '', label: 'All Events' },
                                                        ...events.map(e => ({ value: e._id, label: e.name }))
                                                    ]}
                                                />
                                            </div>
                                            {canFilterBooth && (
                                                <div className="filter-group">
                                                    <label htmlFor="booth-filter">Filter by Booth:</label>
                                                    <Select
                                                        id="booth-filter"
                                                        value={filters.boothId}
                                                        onChange={(e) => handleFilterChange('boothId', e.target.value)}
                                                        options={[
                                                            { value: '', label: 'All Booths' },
                                                            ...boothOptions.map(booth => ({
                                                                value: booth._id || booth.id,
                                                                label: booth.name
                                                            }))
                                                        ]}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <div className={`filters-row bottom-row ${activeTab === 'event-report' || activeTab === 'booth-report' ? 'with-button' : ''}`}>
                                            <div className="filter-group">
                                                <label htmlFor="start-date">Start Date:</label>
                                                <input
                                                    id="start-date"
                                                    type="date"
                                                    value={filters.startDate}
                                                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
                                                />
                                            </div>
                                            <div className="filter-group">
                                                <label htmlFor="end-date">End Date:</label>
                                                <input
                                                    id="end-date"
                                                    type="date"
                                                    value={filters.endDate}
                                                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                                                />
                                            </div>
                                            {(activeTab === 'event-report' || activeTab === 'booth-report') && (
                                                <button className="btn-export" onClick={handleExport} disabled={loadingData}>
                                                    Export Filtered Results
                                                </button>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Content */}
                            {loadingData ? (
                                <div className="analytics-loading">Loading analytics data...</div>
                            ) : (
                                <>
                                    {/* Overview Tab */}
                                    {activeTab === 'overview' && overview && (
                                        <div className="analytics-overview">
                                            <div className="stats-grid">
                                                <div className="stat-card">
                                                    <h3>Total Meetings</h3>
                                                    <div className="stat-value">{overview.meetings?.total || 0}</div>
                                                </div>
                                                <div className="stat-card">
                                                    <h3>Completed Meetings</h3>
                                                    <div className="stat-value">{overview.meetings?.completed || 0}</div>
                                                </div>
                                                <div className="stat-card">
                                                    <h3>Dropped Meetings</h3>
                                                    <div className="stat-value">{overview.meetings?.dropped || 0}</div>
                                                </div>
                                                <div className="stat-card">
                                                    <h3>Avg Duration</h3>
                                                    <div className="stat-value">
                                                        {formatDuration(overview.meetings?.averageDuration || 0)}
                                                    </div>
                                                </div>
                                                <div className="stat-card">
                                                    <h3>Meetings &gt; 3 Min</h3>
                                                    <div className="stat-value">{overview.meetings?.meetingsOver3Min || 0}</div>
                                                </div>
                                                <div className="stat-card">
                                                    <h3>With Interpreter</h3>
                                                    <div className="stat-value">{overview.meetings?.totalWithInterpreter || 0}</div>
                                                </div>
                                                <div className="stat-card">
                                                    <h3>Total Queue Visits</h3>
                                                    <div className="stat-value">{overview.queue?.totalVisits || 0}</div>
                                                </div>
                                                <div className="stat-card">
                                                    <h3>Unique Queue Visits</h3>
                                                    <div className="stat-value">{overview.queue?.uniqueVisits || 0}</div>
                                                </div>
                                            </div>

                                            {overview.users && ['Admin', 'GlobalSupport'].includes(user?.role) && (
                                                <div className="users-stats-section">
                                                    <h2>User Statistics</h2>
                                                    <div className="stats-grid">
                                                        <div className="stat-card">
                                                            <h3>Total Users</h3>
                                                            <div className="stat-value">{overview.users.totalUsers || 0}</div>
                                                        </div>
                                                        <div className="stat-card">
                                                            <h3>Active Users</h3>
                                                            <div className="stat-value">{overview.users.activeUsers || 0}</div>
                                                        </div>
                                                    </div>
                                                    {overview.users.byRole && (
                                                        <div className="role-breakdown">
                                                            <h3>Users by Role</h3>
                                                            <table className="data-table">
                                                                <thead>
                                                                    <tr>
                                                                        <th>Role</th>
                                                                        <th>Total</th>
                                                                        <th>Active</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {Object.entries(overview.users.byRole).map(([role, stats]) => (
                                                                        <tr key={role}>
                                                                            <td>{role}</td>
                                                                            <td>{stats.total}</td>
                                                                            <td>{stats.active}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Event Report Tab */}
                                    {activeTab === 'event-report' && (
                                        <div className="analytics-event-report">
                                            {!filters.eventId ? (
                                                <div className="analytics-empty-state">
                                                    <p>Please select an event to view the report</p>
                                                </div>
                                            ) : eventReport ? (
                                                <div className="event-report-table">
                                                    <h2>Full Event Report</h2>
                                                    <table className="data-table">
                                                        <thead>
                                                            <tr>
                                                                <th>Booth</th>
                                                                <th>Job Seeker Interest</th>
                                                                <th>Unique Queue Visits</th>
                                                                <th>Total Queue Visits</th>
                                                                <th>Unique Meetings</th>
                                                                <th>Total Job Seeker Meetings</th>
                                                                <th># Dropped Meetings</th>
                                                                <th>Meetings &gt; 3 Min</th>
                                                                <th>Average Meeting Time</th>
                                                                <th>Avg Meetings per Recruiter</th>
                                                                <th>Interpreter Meetings</th>
                                                                <th>Interpreter Time</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {eventReport.booths?.map((booth, index) => (
                                                                <tr key={booth.boothId || index}>
                                                                    <td>{booth.boothName}</td>
                                                                    <td>{booth.jobSeekerInterest || 0}</td>
                                                                    <td>{booth.uniqueQueueVisits || 0}</td>
                                                                    <td>{booth.totalQueueVisits || 0}</td>
                                                                    <td>{booth.uniqueMeetings || 0}</td>
                                                                    <td>{booth.totalJobSeekerMeetings || 0}</td>
                                                                    <td>{booth.droppedMeetings || 0}</td>
                                                                    <td>{booth.meetingsOver3Min || 0}</td>
                                                                    <td>{formatDuration(booth.averageMeetingTime || 0)}</td>
                                                                    <td>{booth.avgMeetingsPerRecruiter?.toFixed(2) || '0.00'}</td>
                                                                    <td>{booth.interpreterMeetings || 0}</td>
                                                                    <td>{formatDuration(booth.interpreterTime || 0)}</td>
                                                                </tr>
                                                            ))}
                                                            {eventReport.eventTotal && (
                                                                <tr className="event-total-row">
                                                                    <td><strong>Event Total</strong></td>
                                                                    <td><strong>{eventReport.eventTotal.jobSeekerInterest || 0}</strong></td>
                                                                    <td><strong>{eventReport.eventTotal.uniqueQueueVisits || 0}</strong></td>
                                                                    <td><strong>{eventReport.eventTotal.totalQueueVisits || 0}</strong></td>
                                                                    <td><strong>{eventReport.eventTotal.uniqueMeetings || 0}</strong></td>
                                                                    <td><strong>{eventReport.eventTotal.totalJobSeekerMeetings || 0}</strong></td>
                                                                    <td><strong>{eventReport.eventTotal.droppedMeetings || 0}</strong></td>
                                                                    <td><strong>{eventReport.eventTotal.meetingsOver3Min || 0}</strong></td>
                                                                    <td><strong>{formatDuration(eventReport.eventTotal.averageMeetingTime || 0)}</strong></td>
                                                                    <td><strong>{eventReport.eventTotal.avgMeetingsPerRecruiter?.toFixed(2) || '0.00'}</strong></td>
                                                                    <td><strong>{eventReport.eventTotal.interpreterMeetings || 0}</strong></td>
                                                                    <td><strong>{formatDuration(eventReport.eventTotal.interpreterTime || 0)}</strong></td>
                                                                </tr>
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : (
                                                <div className="analytics-empty-state">
                                                    <p>No data available for this event</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Booth Report Tab */}
                                    {activeTab === 'booth-report' && (
                                        <div className="analytics-booth-report">
                                            {boothReport?.booths && boothReport.booths.length > 0 ? (
                                                <div className="booth-report-table">
                                                    <h2>Booth Report</h2>
                                                    <table className="data-table">
                                                        <thead>
                                                            <tr>
                                                                <th>Booth</th>
                                                                <th>Event</th>
                                                                <th>Job Seeker Interest</th>
                                                                <th>Unique Queue Visits</th>
                                                                <th>Total Queue Visits</th>
                                                                <th>Unique Meetings</th>
                                                                <th>Total Job Seeker Meetings</th>
                                                                <th># Dropped Meetings</th>
                                                                <th>Meetings &gt; 3 Min</th>
                                                                <th>Average Meeting Time</th>
                                                                <th>Avg Meetings per Recruiter</th>
                                                                <th>Interpreter Meetings</th>
                                                                <th>Interpreter Time</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {boothReport.booths.map((booth, index) => (
                                                                <tr key={booth._id || index}>
                                                                    <td>{booth.name}</td>
                                                                    <td>{booth.eventName || 'N/A'}</td>
                                                                    <td>{booth.jobSeekerInterest || 0}</td>
                                                                    <td>{booth.uniqueQueueVisits || 0}</td>
                                                                    <td>{booth.totalQueueVisits || 0}</td>
                                                                    <td>{booth.uniqueMeetings || 0}</td>
                                                                    <td>{booth.totalJobSeekerMeetings || 0}</td>
                                                                    <td>{booth.droppedMeetings || 0}</td>
                                                                    <td>{booth.meetingsOver3Min || 0}</td>
                                                                    <td>{formatDuration(booth.averageMeetingTime || 0)}</td>
                                                                    <td>{booth.avgMeetingsPerRecruiter?.toFixed(2) || '0.00'}</td>
                                                                    <td>{booth.interpreterMeetings || 0}</td>
                                                                    <td>{formatDuration(booth.interpreterTime || 0)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : (
                                                <div className="analytics-empty-state">
                                                    <p>No booth data available</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Live Stats Tab */}
                                    {activeTab === 'live-stats' && (
                                        liveStatsLoading ? (
                                            <div className="analytics-loading">Loading live stats...</div>
                                        ) : liveStats ? (
                                            <div className="analytics-live-stats">
                                                <div className="stats-grid">
                                                    <div className="stat-card">
                                                        <h3>Total Users Online</h3>
                                                        <div className="stat-value">{liveStats.onlineUsers?.total || 0}</div>
                                                    </div>
                                                    <div className="stat-card">
                                                        <h3>Users in Calls</h3>
                                                        <div className="stat-value">{liveStats.calls?.totalParticipants || 0}</div>
                                                    </div>
                                                    <div className="stat-card">
                                                        <h3>Active Sessions</h3>
                                                        <div className="stat-value">{liveStats.calls?.totalSessions || 0}</div>
                                                    </div>
                                                    <div className="stat-card">
                                                        <h3>Job Seekers in Queue</h3>
                                                        <div className="stat-value">{liveStats.queue?.totalWaiting || 0}</div>
                                                    </div>
                                                </div>

                                                <div className="live-stats-section">
                                                    <h2>Online Users</h2>
                                                    {liveStats.onlineUsers?.users?.length ? (
                                                        <table className="data-table live-stats-table">
                                                            <thead>
                                                                <tr>
                                                                    <th>Name</th>
                                                                    <th>Role</th>
                                                                    <th>Booth</th>
                                                                    <th>Last Online</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {liveStats.onlineUsers.users.map(user => (
                                                                    <tr key={user.userId}>
                                                                        <td>{user.name || 'Unknown'}</td>
                                                                        <td>{user.role}</td>
                                                                        <td>{user.boothName || '—'}</td>
                                                                        <td>{formatDateTime(user.lastOnline || user.connectedAt)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    ) : (
                                                        <div className="analytics-empty-state">
                                                            <p>No users are currently online.</p>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="live-stats-section">
                                                    <h2>Users in Calls</h2>
                                                    {liveStats.calls?.participants?.length ? (
                                                        <table className="data-table live-stats-table">
                                                            <thead>
                                                                <tr>
                                                                    <th>Name</th>
                                                                    <th>Role</th>
                                                                    <th>Booth</th>
                                                                    <th>Joined</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {liveStats.calls.participants.map(participant => (
                                                                    <tr key={`${participant.sessionId}-${participant.userId}`}>
                                                                        <td>{participant.name || 'Unknown'}</td>
                                                                        <td>{participant.role}</td>
                                                                        <td>{participant.boothName || '—'}</td>
                                                                        <td>{formatDateTime(participant.joinedAt)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    ) : (
                                                        <div className="analytics-empty-state">
                                                            <p>No active call participants.</p>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="live-stats-section">
                                                    <h2>Job Seekers Waiting</h2>
                                                    {liveStats.queue?.entries?.length ? (
                                                        <table className="data-table live-stats-table">
                                                            <thead>
                                                                <tr>
                                                                    <th>Job Seeker</th>
                                                                    <th>Booth</th>
                                                                    <th>Event</th>
                                                                    <th>Status</th>
                                                                    <th>Joined</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {liveStats.queue.entries.map(entry => (
                                                                    <tr key={entry.id}>
                                                                        <td>{entry.jobSeeker?.name || 'Unknown'}</td>
                                                                        <td>{entry.boothName || '—'}</td>
                                                                        <td>{entry.eventName || '—'}</td>
                                                                        <td>{entry.status}</td>
                                                                        <td>{formatDateTime(entry.joinedAt)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    ) : (
                                                        <div className="analytics-empty-state">
                                                            <p>No job seekers currently waiting in queue.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="analytics-empty-state">
                                                <p>Live stats are not available.</p>
                                            </div>
                                        )
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}

