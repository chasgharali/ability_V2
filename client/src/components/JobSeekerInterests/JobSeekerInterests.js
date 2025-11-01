import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { jobSeekerInterestsAPI } from '../../services/jobSeekerInterests';
import { listEvents } from '../../services/events';
import { listUsers } from '../../services/users';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import DataGrid from '../UI/DataGrid';
import { Select, Input } from '../UI/FormComponents';
import Toast from '../common/Toast';
import '../Dashboard/Dashboard.css';
import './JobSeekerInterests.css';

const JobSeekerInterests = () => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();

    // Redirect if not authenticated or not authorized
    useEffect(() => {
        if (!loading) {
            if (!user) {
                navigate('/login', { replace: true });
            } else if (!['Admin', 'GlobalSupport', 'Recruiter'].includes(user.role)) {
                navigate('/dashboard', { replace: true });
            }
        }
    }, [user, loading, navigate]);

    const [interests, setInterests] = useState([]);
    const [recruiters, setRecruiters] = useState([]);
    const [events, setEvents] = useState([]);
    const [loadingData, setLoadingData] = useState(true);
    const [toast, setToast] = useState(null);
    const [filtersExpanded, setFiltersExpanded] = useState(false);
    const toastTimer = useRef(null);

    // Filters
    const [filters, setFilters] = useState({
        recruiterId: '',
        eventId: '',
        boothId: '',
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc'
    });

    // Statistics
    const [stats, setStats] = useState({
        totalInterests: 0,
        uniqueJobSeekers: 0,
        uniqueBooths: 0,
        averageInterestsPerJobSeeker: 0
    });

    const showToast = useCallback((message, type = 'info') => {
        if (toastTimer.current) {
            clearTimeout(toastTimer.current);
        }
        
        setToast({ message, type });
        
        toastTimer.current = setTimeout(() => {
            setToast(null);
        }, 5000);
    }, []);

    const loadInterests = useCallback(async () => {
        try {
            setLoadingData(true);
            console.log('Loading interests with filters:', filters);
            const response = await jobSeekerInterestsAPI.getInterests(filters);
            console.log('API Response:', response);
            
            const interests = response.interests || [];
            setInterests(interests);
            
            // Calculate stats
            const uniqueJobSeekers = new Set(interests.map(i => i.jobSeeker?._id)).size;
            const uniqueBooths = new Set(interests.map(i => i.booth?._id)).size;
            const avgInterests = uniqueJobSeekers > 0 ? (interests.length / uniqueJobSeekers).toFixed(1) : 0;
            
            setStats({
                totalInterests: interests.length,
                uniqueJobSeekers,
                uniqueBooths,
                averageInterestsPerJobSeeker: avgInterests
            });

            if (interests.length === 0) {
                console.log('No interests found. This could be because:');
                console.log('1. No job seekers have expressed interest in booths yet');
                console.log('2. User role restrictions are filtering out data');
                console.log('3. Current filters are too restrictive');
            }
        } catch (error) {
            console.error('Error loading interests:', error);
            showToast(`Failed to load job seeker interests: ${error.message}`, 'error');
        } finally {
            setLoadingData(false);
        }
    }, [filters, showToast]);

    const loadRecruiters = useCallback(async () => {
        if (user?.role !== 'Recruiter') {
            try {
                const response = await listUsers({ role: 'Recruiter', limit: 1000 });
                setRecruiters(response.users || []);
            } catch (error) {
                console.error('Error loading recruiters:', error);
            }
        }
    }, [user?.role]);

    const loadEvents = useCallback(async () => {
        try {
            const response = await listEvents({ limit: 1000 });
            setEvents(response.events || []);
        } catch (error) {
            console.error('Error loading events:', error);
        }
    }, []);

    useEffect(() => {
        if (user) {
            loadInterests();
            loadRecruiters();
            loadEvents();
        }
    }, [user, loadInterests, loadRecruiters, loadEvents]);

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({
            ...prev,
            [key]: value,
            page: 1 // Reset to first page when filters change
        }));
    };

    const clearFilters = () => {
        setFilters({
            recruiterId: '',
            eventId: '',
            boothId: '',
            page: 1,
            limit: 10,
            sortBy: 'createdAt',
            sortOrder: 'desc'
        });
    };

    const formatDateTime = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString();
    };

    const formatInterestLevel = (level) => {
        if (!level) return 'N/A';
        return level.charAt(0).toUpperCase() + level.slice(1);
    };

    const columns = [
        {
            label: 'Job Seeker',
            render: (row) => (
                <div>
                    <div className="job-seeker-name">{row.jobSeeker?.name || 'N/A'}</div>
                    <div className="job-seeker-email">{row.jobSeeker?.email || 'N/A'}</div>
                </div>
            )
        },
        {
            label: 'Event',
            render: (row) => row.event?.name || 'N/A'
        },
        {
            label: 'Booth',
            render: (row) => row.booth?.name || 'N/A'
        },
        {
            label: 'Location',
            render: (row) => {
                if (row.jobSeeker?.city && row.jobSeeker?.state) {
                    return `${row.jobSeeker.city}, ${row.jobSeeker.state}`;
                }
                return 'N/A';
            }
        },
        {
            label: 'Interest Level',
            render: (row) => (
                <span className={`interest-level interest-level-${row.interestLevel}`}>
                    {formatInterestLevel(row.interestLevel)}
                </span>
            )
        },
        {
            label: 'Date Expressed',
            render: (row) => formatDateTime(row.createdAt)
        },
        {
            label: 'Notes',
            render: (row) => (
                <div className="notes-cell">
                    {row.notes ? (
                        <span title={row.notes}>
                            {row.notes.length > 50 ? `${row.notes.substring(0, 50)}...` : row.notes}
                        </span>
                    ) : (
                        <span className="no-notes">No notes</span>
                    )}
                </div>
            )
        }
    ];

    if (loading) {
        return (
            <div className="dashboard">
                <AdminHeader />
                <div className="dashboard-layout">
                    <AdminSidebar active={user?.role === 'Recruiter' ? 'interests' : 'jobseeker-interests'} />
                    <main className="dashboard-main">
                        <div className="loading-container">
                            <div className="loading-spinner"></div>
                            <p>Loading...</p>
                        </div>
                    </main>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard">
            <AdminHeader />
            <div className="dashboard-layout">
                <AdminSidebar active={user?.role === 'Recruiter' ? 'interests' : 'jobseeker-interests'} />
                <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
                    <div className="dashboard-content">
                        <div className="jobseeker-interests-container">
                            {/* Page Header */}
                            <div className="page-header">
                                <h1>Job Seeker Interests</h1>
                            </div>

                            {/* Statistics Cards */}
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <h3>Total Interests</h3>
                                    <div className="stat-value">{stats.totalInterests}</div>
                                </div>
                                <div className="stat-card">
                                    <h3>Unique Job Seekers</h3>
                                    <div className="stat-value">{stats.uniqueJobSeekers}</div>
                                </div>
                                <div className="stat-card">
                                    <h3>Unique Booths</h3>
                                    <div className="stat-value">{stats.uniqueBooths}</div>
                                </div>
                                <div className="stat-card">
                                    <h3>Avg Interests/Job Seeker</h3>
                                    <div className="stat-value">{stats.averageInterestsPerJobSeeker}</div>
                                </div>
                            </div>

                            {/* Filters */}
                            <div className="filters-section">
                                <div 
                                    className="filters-header" 
                                    onClick={() => setFiltersExpanded(!filtersExpanded)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            setFiltersExpanded(!filtersExpanded);
                                        }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    aria-expanded={filtersExpanded}
                                    aria-controls="filters-content"
                                >
                                    <h3>
                                        Filters
                                        {(filters.recruiterId || filters.eventId || (user?.role !== 'Recruiter' && filters.boothId)) && (
                                            <span className="active-filters-indicator">●</span>
                                        )}
                                    </h3>
                                    <span className={`filter-toggle ${filtersExpanded ? 'expanded' : ''}`}>
                                        {filtersExpanded ? '▼' : '▶'}
                                    </span>
                                </div>
                                {filtersExpanded && (
                                    <div id="filters-content" className="filters-grid">
                                        {['Admin', 'GlobalSupport'].includes(user.role) && (
                                            <Select
                                                label="Recruiter"
                                                value={filters.recruiterId}
                                                onChange={(e) => handleFilterChange('recruiterId', e.target.value)}
                                                options={[
                                                    { value: '', label: 'All Recruiters' },
                                                    ...recruiters.map(r => ({ value: r._id, label: r.name }))
                                                ]}
                                            />
                                        )}
                                        <Select
                                            label="Event"
                                            value={filters.eventId}
                                            onChange={(e) => handleFilterChange('eventId', e.target.value)}
                                            options={[
                                                { value: '', label: 'All Events' },
                                                ...events.map(e => ({ value: e._id, label: e.name }))
                                            ]}
                                        />
                                        {['Admin', 'GlobalSupport'].includes(user.role) && (
                                            <Input
                                                label="Booth ID"
                                                value={filters.boothId}
                                                onChange={(e) => handleFilterChange('boothId', e.target.value)}
                                                placeholder="Enter booth ID..."
                                            />
                                        )}
                                        <div className="filter-actions">
                                            <button 
                                                className="btn-clear-filters"
                                                onClick={clearFilters}
                                            >
                                                Clear Filters
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Data Grid */}
                            <div className="data-grid-container">
                                <DataGrid
                                    columns={columns}
                                    data={interests}
                                    loading={loadingData}
                                    emptyMessage={
                                        user?.role === 'Recruiter' 
                                            ? "No job seekers have expressed interest in your booths yet"
                                            : "No job seeker interests found. Job seekers need to express interest in booths first."
                                    }
                                />
                            </div>
                        </div>
                    </div>
                </main>
            </div>
            
            {/* Toast Notifications */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
        </div>
    );
};

export default JobSeekerInterests;
