import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRoleMessages } from '../../contexts/RoleMessagesContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { jobSeekerInterestsAPI } from '../../services/jobSeekerInterests';
import { listEvents } from '../../services/events';
import { listUsers } from '../../services/users';
import AdminHeader from '../Layout/AdminHeader';
import { useRecruiterBooth } from '../../hooks/useRecruiterBooth';
import AdminSidebar from '../Layout/AdminSidebar';
import { GridComponent, ColumnsDirective, ColumnDirective, Inject as GridInject, Page, Sort, Filter, Toolbar as GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu } from '@syncfusion/ej2-react-grids';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { Input } from '../UI/FormComponents';
import '../Dashboard/Dashboard.css';
import './JobSeekerInterests.css';

const JobSeekerInterests = () => {
    const { user, loading } = useAuth();
    const { getMessage } = useRoleMessages();
    const navigate = useNavigate();
    const location = useLocation();
    const isActiveRoute = location.pathname === '/jobseeker-interests';
    const { booth, event } = useRecruiterBooth();
    
    // Get role message from context
    const infoBannerMessage = getMessage('jobseeker-interests', 'info-banner') || '';

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
    const toastRef = useRef(null);
    const gridRef = useRef(null);
    const [filtersExpanded, setFiltersExpanded] = useState(false);
    const initialLoadDone = useRef(false);
    const fetchInProgress = useRef(false);
    // Prevent duplicate calls
    const lastFiltersKeyRef = useRef(null);

    // Filters
    const [filters, setFilters] = useState({
        recruiterId: '',
        eventId: '',
        boothId: '',
        page: 1,
        limit: 50,
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

    // Pagination state
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 0,
        totalInterests: 0,
        hasNext: false,
        hasPrev: false
    });

    // Syncfusion Toast
    const showToast = useCallback((message, type = 'Success', duration = 3000) => {
        if (toastRef.current) {
            toastRef.current.show({
                title: type,
                content: message,
                cssClass: `e-toast-${type.toLowerCase()}`,
                showProgressBar: true,
                timeOut: duration
            });
        }
    }, []);



    // Load all data when component mounts or filters change
    const fetchAllData = useCallback(async () => {
        if (!user || !isActiveRoute) return;

        // Only make request if user role is valid
        if (!['Admin', 'GlobalSupport', 'Recruiter'].includes(user.role)) {
            return;
        }

        // Create a unique key for the current filters to prevent duplicate calls
        const filterKey = JSON.stringify({
            page: filters.page,
            limit: filters.limit,
            eventId: filters.eventId,
            boothId: filters.boothId,
            recruiterId: filters.recruiterId,
            sortBy: filters.sortBy,
            sortOrder: filters.sortOrder
        });
        
        // Check if we're already loading the same filters - do this atomically
        if (lastFiltersKeyRef.current === filterKey && fetchInProgress.current) {
            return; // Already loading this exact data
        }

        // Set both atomically to prevent race conditions
        fetchInProgress.current = true;
        lastFiltersKeyRef.current = filterKey;
        
        try {
            // Only show loading if we don't have data yet (first load)
            // Check via ref to avoid dependency on interests state
            const hasData = interests.length > 0;
            if (!hasData) {
                setLoadingData(true);
            }
            
            // Load recruiters and events only on initial load
            if (!initialLoadDone.current) {
                if (user.role !== 'Recruiter') {
                    try {
                        const recruiterResponse = await listUsers({ role: 'Recruiter', limit: 1000 });
                        if (window.location.pathname === '/jobseeker-interests') {
                            setRecruiters(recruiterResponse.users || []);
                        }
                    } catch (error) {
                        console.error('Error loading recruiters:', error);
                    }
                }
                
                try {
                    const eventsResponse = await listEvents({ limit: 1000 });
                    if (window.location.pathname === '/jobseeker-interests') {
                        setEvents(eventsResponse.events || []);
                    }
                } catch (error) {
                    console.error('Error loading events:', error);
                }
                
                initialLoadDone.current = true;
            }
            
            // Load interests with current filters
            const response = await jobSeekerInterestsAPI.getInterests(filters);
            
            // Check route again after async call
            const currentLocation = window.location.pathname;
            if (currentLocation !== '/jobseeker-interests') {
                fetchInProgress.current = false;
                return;
            }

            const interestsData = response.interests || [];
            setInterests(interestsData);

            // Update pagination from API response
            if (response.pagination) {
                setPagination(response.pagination);
            }

            // Calculate stats - use totalInterests from pagination for accurate count
            const totalInterests = response.pagination?.totalInterests || interestsData.length;
            const uniqueJobSeekers = new Set(interestsData.map(i => i.jobSeeker?._id || i.legacyJobSeekerId).filter(Boolean)).size;
            const uniqueBooths = new Set(interestsData.map(i => i.booth?._id || i.legacyBoothId).filter(Boolean)).size;
            const avgInterests = uniqueJobSeekers > 0 ? (totalInterests / uniqueJobSeekers).toFixed(1) : 0;

            setStats({
                totalInterests: totalInterests,
                uniqueJobSeekers,
                uniqueBooths,
                averageInterestsPerJobSeeker: avgInterests
            });
        } catch (error) {
            console.error('Error loading data:', error);
            const currentLocation = window.location.pathname;
            if (currentLocation === '/jobseeker-interests') {
                showToast(`Failed to load job seeker interests: ${error.message}`, 'Error', 5000);
            }
        } finally {
            setLoadingData(false);
            fetchInProgress.current = false;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.role, filters.page, filters.limit, filters.eventId, filters.boothId, filters.recruiterId, filters.sortBy, filters.sortOrder, isActiveRoute, showToast]); // Use individual filter properties for stability

    useEffect(() => {
        if (isActiveRoute && user) {
            fetchAllData();
        } else if (!isActiveRoute) {
            // Reset refs when route becomes inactive to allow fresh load when returning
            fetchInProgress.current = false;
            lastFiltersKeyRef.current = null;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.role, filters.page, filters.limit, filters.eventId, filters.boothId, filters.recruiterId, filters.sortBy, filters.sortOrder, isActiveRoute]); // Only depend on actual filter values, not callbacks

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
            limit: 50,
            sortBy: 'createdAt',
            sortOrder: 'desc'
        });
    };

    const handlePageSizeChange = (newSize) => {
        if (!newSize || newSize === filters.limit) return;
        setFilters(prev => ({
            ...prev,
            limit: newSize,
            page: 1
        }));
    };

    const goToPage = (targetPage) => {
        if (!targetPage || targetPage === filters.page) return;
        if (targetPage < 1) return;
        if (pagination.totalPages && targetPage > pagination.totalPages) return;
        setFilters(prev => ({
            ...prev,
            page: targetPage
        }));
    };

    const formatDateTime = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString();
    };

    const formatInterestLevel = (level) => {
        if (!level) return 'N/A';
        return level.charAt(0).toUpperCase() + level.slice(1);
    };

    // Grid template functions for custom column renders
    const jobSeekerTemplate = (props) => {
        const row = props;
        const jobSeekerName = row.jobSeeker?.name || (row.legacyJobSeekerId ? 'Legacy User' : 'N/A');
        const jobSeekerEmail = row.jobSeeker?.email || (row.legacyJobSeekerId ? 'N/A' : 'N/A');
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                <div className="job-seeker-name">{jobSeekerName}</div>
                <div className="job-seeker-email">{jobSeekerEmail}</div>
            </div>
        );
    };

    const eventTemplate = (props) => {
        const row = props;
        const eventName = row.event?.name || (row.legacyEventId ? 'Legacy Event' : 'N/A');
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {eventName}
            </div>
        );
    };

    const boothTemplate = (props) => {
        const row = props;
        const boothName = row.booth?.name || row.company || (row.legacyBoothId ? 'Legacy Booth' : 'N/A');
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {boothName}
            </div>
        );
    };

    const locationTemplate = (props) => {
        const row = props;
        let locationText = 'N/A';
        if (row.jobSeeker?.city && row.jobSeeker?.state) {
            locationText = `${row.jobSeeker.city}, ${row.jobSeeker.state}`;
        } else if (row.jobSeeker?.city) {
            locationText = row.jobSeeker.city;
        } else if (row.jobSeeker?.state) {
            locationText = row.jobSeeker.state;
        }
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {locationText}
            </div>
        );
    };

    const interestLevelTemplate = (props) => {
        const row = props;
        return (
            <span className={`interest-level interest-level-${row.interestLevel}`}>
                {formatInterestLevel(row.interestLevel)}
            </span>
        );
    };

    const dateExpressedTemplate = (props) => {
        const row = props;
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {formatDateTime(row.createdAt)}
            </div>
        );
    };

    const notesTemplate = (props) => {
        const row = props;
        return (
            <div className="notes-cell" style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {row.notes ? (
                    <span title={row.notes}>
                        {row.notes.length > 50 ? `${row.notes.substring(0, 50)}...` : row.notes}
                    </span>
                ) : (
                    <span className="no-notes">No notes</span>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="dashboard">
                <AdminHeader
                    brandingLogo={event?.logoUrl || event?.logo || ''}
                    secondaryLogo={booth?.logoUrl || booth?.companyLogo || ''}
                />
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
            <AdminHeader
                brandingLogo={event?.logoUrl || event?.logo || ''}
                secondaryLogo={booth?.logoUrl || booth?.companyLogo || ''}
            />
            <div className="dashboard-layout">
                <AdminSidebar active={user?.role === 'Recruiter' ? 'interests' : 'jobseeker-interests'} />
                <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
                    <div className="dashboard-content">
                        <div className="jobseeker-interests-container">
                            {/* Page Header */}
                            <div className="page-header">
                                <h1>Job Seeker Interests</h1>
                                {infoBannerMessage && (
                                    <div className="info-banner" style={{ marginTop: '1rem', marginBottom: '1.5rem' }}>
                                        <span>{infoBannerMessage}</span>
                                    </div>
                                )}
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
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <label htmlFor="recruiter-filter-dropdown" style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827', marginBottom: '4px' }}>
                                                    Recruiter
                                                </label>
                                                <DropDownListComponent
                                                    id="recruiter-filter-dropdown"
                                                    dataSource={[{ value: '', text: 'All Recruiters' }, ...recruiters.map(r => ({ value: r._id, text: r.name }))]}
                                                    fields={{ value: 'value', text: 'text' }}
                                                    value={filters.recruiterId}
                                                    change={(e) => handleFilterChange('recruiterId', e.value || '')}
                                                    placeholder="Select Recruiter"
                                                    cssClass="filter-dropdown"
                                                    popupHeight="300px"
                                                    width="100%"
                                                />
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <label htmlFor="event-filter-dropdown" style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827', marginBottom: '4px' }}>
                                                Event
                                            </label>
                                            <DropDownListComponent
                                                id="event-filter-dropdown"
                                                dataSource={[{ value: '', text: 'All Events' }, ...events.map(e => ({ value: e._id, text: e.name }))]}
                                                fields={{ value: 'value', text: 'text' }}
                                                value={filters.eventId}
                                                change={(e) => handleFilterChange('eventId', e.value || '')}
                                                placeholder="Select Event"
                                                cssClass="filter-dropdown"
                                                popupHeight="300px"
                                                width="100%"
                                            />
                                        </div>
                                        {['Admin', 'GlobalSupport'].includes(user.role) && (
                                            <Input
                                                label="Booth ID"
                                                value={filters.boothId}
                                                onChange={(e) => handleFilterChange('boothId', e.target.value)}
                                                placeholder="Enter booth ID..."
                                            />
                                        )}
                                        <div className="filter-actions">
                                            <ButtonComponent
                                                cssClass="e-outline e-primary"
                                                onClick={clearFilters}
                                            >
                                                Clear Filters
                                            </ButtonComponent>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Data Grid */}
                            <div className="data-grid-container">
                                {loadingData && <div style={{ marginBottom: 12 }}>Loading…</div>}
                                <GridComponent
                                    ref={gridRef}
                                    dataSource={interests}
                                    allowPaging={false}
                                    allowSorting={true}
                                    allowFiltering={true}
                                    filterSettings={{ type: 'Menu' }}
                                    showColumnMenu={true}
                                    showColumnChooser={true}
                                    allowResizing={true}
                                    allowReordering={true}
                                    toolbar={['Search', 'ColumnChooser']}
                                    selectionSettings={{ type: 'None' }}
                                    enableHover={true}
                                    allowRowDragAndDrop={false}
                                >
                                    <ColumnsDirective>
                                        <ColumnDirective headerText='Job Seeker' width='220' clipMode='EllipsisWithTooltip' template={jobSeekerTemplate} allowSorting={false} />
                                        <ColumnDirective headerText='Event' width='180' clipMode='EllipsisWithTooltip' template={eventTemplate} allowSorting={false} />
                                        <ColumnDirective headerText='Booth' width='180' clipMode='EllipsisWithTooltip' template={boothTemplate} allowSorting={false} />
                                        <ColumnDirective headerText='Location' width='150' clipMode='EllipsisWithTooltip' template={locationTemplate} allowSorting={false} />
                                        <ColumnDirective headerText='Date Expressed' width='180' clipMode='EllipsisWithTooltip' template={dateExpressedTemplate} />
                                    </ColumnsDirective>
                                    <GridInject services={[Page, Sort, Filter, GridToolbar, Resize, Reorder, ColumnChooser, ColumnMenu]} />
                                </GridComponent>
                                
                                {/* Custom Pagination Footer */}
                                {(pagination.totalPages || 1) > 0 && (
                                    <div className="custom-pagination" style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '16px',
                                        backgroundColor: '#f9fafb',
                                        borderTop: '1px solid #e5e7eb',
                                        marginTop: '0'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ fontSize: '14px', color: '#374151' }}>
                                                Rows per page:
                                            </span>
                                            <select
                                                value={filters.limit}
                                                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #d1d5db',
                                                    fontSize: '14px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <option value={10}>10</option>
                                                <option value={20}>20</option>
                                                <option value={50}>50</option>
                                                <option value={100}>100</option>
                                                <option value={200}>200</option>
                                            </select>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '14px', color: '#374151' }}>
                                                Page {pagination.currentPage || filters.page} of {pagination.totalPages || 1} ({pagination.totalInterests || interests.length} total)
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button
                                                onClick={() => goToPage(1)}
                                                disabled={(pagination.currentPage || filters.page) <= 1 || loadingData}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #d1d5db',
                                                    backgroundColor: (pagination.currentPage || filters.page) <= 1 ? '#f3f4f6' : '#fff',
                                                    cursor: (pagination.currentPage || filters.page) <= 1 ? 'not-allowed' : 'pointer',
                                                    fontSize: '14px',
                                                    color: (pagination.currentPage || filters.page) <= 1 ? '#9ca3af' : '#374151'
                                                }}
                                                title="First Page"
                                            >
                                                ⟨⟨
                                            </button>
                                            <button
                                                onClick={() => goToPage((pagination.currentPage || filters.page) - 1)}
                                                disabled={(pagination.currentPage || filters.page) <= 1 || loadingData}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #d1d5db',
                                                    backgroundColor: (pagination.currentPage || filters.page) <= 1 ? '#f3f4f6' : '#fff',
                                                    cursor: (pagination.currentPage || filters.page) <= 1 ? 'not-allowed' : 'pointer',
                                                    fontSize: '14px',
                                                    color: (pagination.currentPage || filters.page) <= 1 ? '#9ca3af' : '#374151'
                                                }}
                                                title="Previous Page"
                                            >
                                                ⟨ Prev
                                            </button>
                                            
                                            <input
                                                type="number"
                                                min="1"
                                                max={pagination.totalPages || 1}
                                                value={pagination.currentPage || filters.page}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    if (val >= 1 && val <= (pagination.totalPages || 1)) {
                                                        goToPage(val);
                                                    }
                                                }}
                                                style={{
                                                    width: '60px',
                                                    padding: '6px 8px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #d1d5db',
                                                    fontSize: '14px',
                                                    textAlign: 'center'
                                                }}
                                            />
                                            
                                            <button
                                                onClick={() => goToPage((pagination.currentPage || filters.page) + 1)}
                                                disabled={(pagination.currentPage || filters.page) >= (pagination.totalPages || 1) || loadingData}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #d1d5db',
                                                    backgroundColor: (pagination.currentPage || filters.page) >= (pagination.totalPages || 1) ? '#f3f4f6' : '#fff',
                                                    cursor: (pagination.currentPage || filters.page) >= (pagination.totalPages || 1) ? 'not-allowed' : 'pointer',
                                                    fontSize: '14px',
                                                    color: (pagination.currentPage || filters.page) >= (pagination.totalPages || 1) ? '#9ca3af' : '#374151'
                                                }}
                                                title="Next Page"
                                            >
                                                Next ⟩
                                            </button>
                                            <button
                                                onClick={() => goToPage(pagination.totalPages || filters.page)}
                                                disabled={(pagination.currentPage || filters.page) >= (pagination.totalPages || 1) || loadingData}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #d1d5db',
                                                    backgroundColor: (pagination.currentPage || filters.page) >= (pagination.totalPages || 1) ? '#f3f4f6' : '#fff',
                                                    cursor: (pagination.currentPage || filters.page) >= (pagination.totalPages || 1) ? 'not-allowed' : 'pointer',
                                                    fontSize: '14px',
                                                    color: (pagination.currentPage || filters.page) >= (pagination.totalPages || 1) ? '#9ca3af' : '#374151'
                                                }}
                                                title="Last Page"
                                            >
                                                ⟩⟩
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            {/* Syncfusion ToastComponent */}
            <ToastComponent
                ref={(toast) => toastRef.current = toast}
                position={{ X: 'Right', Y: 'Bottom' }}
                showProgressBar={true}
                timeOut={3000}
                newestOnTop={true}
            />
        </div>
    );
};

export default JobSeekerInterests;