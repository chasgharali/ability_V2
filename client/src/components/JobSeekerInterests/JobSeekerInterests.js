import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRoleMessages } from '../../contexts/RoleMessagesContext';
import { useNavigate } from 'react-router-dom';
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
import filterIcon from '../../assets/filter.png';
import '../Dashboard/Dashboard.css';
import './JobSeekerInterests.css';

const JobSeekerInterests = () => {
    const { user, loading } = useAuth();
    const { getMessage } = useRoleMessages();
    const navigate = useNavigate();
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

    // Set CSS variable for filter icon
    useEffect(() => {
        const filterIconUrl = `url(${filterIcon})`;
        
        // Set CSS variable on document root
        document.documentElement.style.setProperty('--filter-icon-url', filterIconUrl);
        
        // Apply directly to filter icons when grid is ready
        const applyFilterIcon = () => {
            const filterIcons = document.querySelectorAll('.e-grid .e-filtericon');
            filterIcons.forEach(icon => {
                icon.style.backgroundImage = filterIconUrl;
                icon.style.display = 'inline-block';
                icon.style.visibility = 'visible';
            });
        };
        
        // Apply immediately
        applyFilterIcon();
        
        // Watch for new filter icons being added
        const observer = new MutationObserver(applyFilterIcon);
        observer.observe(document.body, { 
            childList: true, 
            subtree: true 
        });
        
        // Also apply after a delay to catch grid render
        const timeoutId = setTimeout(applyFilterIcon, 500);
        
        return () => {
            document.documentElement.style.removeProperty('--filter-icon-url');
            observer.disconnect();
            clearTimeout(timeoutId);
        };
    }, []);

    const [interests, setInterests] = useState([]);
    const [recruiters, setRecruiters] = useState([]);
    const [events, setEvents] = useState([]);
    const [loadingData, setLoadingData] = useState(true);
    const toastRef = useRef(null);
    const gridRef = useRef(null);
    const [filtersExpanded, setFiltersExpanded] = useState(false);
    const initialLoadDone = useRef(false);
    const fetchInProgress = useRef(false);

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
    useEffect(() => {
        if (!user) return;

        // Only make request if user role is valid
        if (!['Admin', 'GlobalSupport', 'Recruiter'].includes(user.role)) {
            return;
        }

        // Prevent duplicate requests
        if (fetchInProgress.current) {
            console.log('Fetch already in progress, skipping...');
            return;
        }

        let cancelled = false;

        const fetchAllData = async () => {
            fetchInProgress.current = true;
            
            try {
                setLoadingData(true);
                
                // Load recruiters and events only on initial load
                if (!initialLoadDone.current) {
                    if (user.role !== 'Recruiter') {
                        try {
                            const recruiterResponse = await listUsers({ role: 'Recruiter', limit: 1000 });
                            if (!cancelled) {
                                setRecruiters(recruiterResponse.users || []);
                            }
                        } catch (error) {
                            console.error('Error loading recruiters:', error);
                        }
                    }
                    
                    try {
                        const eventsResponse = await listEvents({ limit: 1000 });
                        if (!cancelled) {
                            setEvents(eventsResponse.events || []);
                        }
                    } catch (error) {
                        console.error('Error loading events:', error);
                    }
                    
                    initialLoadDone.current = true;
                }
                
                // Load interests with current filters
                console.log('Loading interests with filters:', filters);
                const response = await jobSeekerInterestsAPI.getInterests(filters);

                if (cancelled) return;

                console.log('API Response:', response);

                const interests = response.interests || [];
                setInterests(interests);

                // Update pagination from API response
                if (response.pagination) {
                    console.log('Setting pagination:', response.pagination);
                    setPagination(response.pagination);
                }

                // Calculate stats - use totalInterests from pagination for accurate count
                const totalInterests = response.pagination?.totalInterests || interests.length;
                const uniqueJobSeekers = new Set(interests.map(i => i.jobSeeker?._id || i.legacyJobSeekerId).filter(Boolean)).size;
                const uniqueBooths = new Set(interests.map(i => i.booth?._id || i.legacyBoothId).filter(Boolean)).size;
                const avgInterests = uniqueJobSeekers > 0 ? (totalInterests / uniqueJobSeekers).toFixed(1) : 0;

                setStats({
                    totalInterests: totalInterests,
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
                if (cancelled) return;
                console.error('Error loading data:', error);
                showToast(`Failed to load job seeker interests: ${error.message}`, 'Error', 5000);
            } finally {
                if (!cancelled) {
                    setLoadingData(false);
                    fetchInProgress.current = false;
                }
            }
        };

        fetchAllData();

        return () => {
            cancelled = true;
            fetchInProgress.current = false;
        };
    }, [user, filters.page, filters.limit, filters.eventId, filters.boothId, filters.recruiterId, showToast]);

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
                                    dataSource={interests.map(r => ({ 
                                        ...r, 
                                        id: r._id,
                                        // Flatten nested fields for sorting
                                        jobSeekerName: r.jobSeeker?.name || (r.legacyJobSeekerId ? 'Legacy User' : ''),
                                        jobSeekerEmail: r.jobSeeker?.email || '',
                                        eventName: r.event?.name || (r.legacyEventId ? 'Legacy Event' : ''),
                                        boothName: r.booth?.name || r.company || (r.legacyBoothId ? 'Legacy Booth' : ''),
                                        jobSeekerCity: r.jobSeeker?.city || '',
                                        jobSeekerState: r.jobSeeker?.state || ''
                                    }))}
                                    allowPaging={false}
                                    allowSorting={true}
                                    allowFiltering={true}
                                    filterSettings={{ 
                                        type: 'Menu',
                                        showFilterBarStatus: true,
                                        immediateModeDelay: 0,
                                        showFilterBarOperator: true,
                                        enableCaseSensitivity: false
                                    }}
                                    showColumnMenu={false}
                                    showColumnChooser={true}
                                    allowResizing={true}
                                    allowReordering={true}
                                    toolbar={['Search', 'ColumnChooser']}
                                    selectionSettings={{ type: 'None' }}
                                    enableHover={true}
                                    allowRowDragAndDrop={false}
                                >
                                    <ColumnsDirective>
                                        <ColumnDirective field='id' headerText='' width='0' isPrimaryKey={true} visible={false} />
                                        <ColumnDirective field='jobSeekerName' headerText='Job Seeker' width='220' clipMode='EllipsisWithTooltip' template={jobSeekerTemplate} allowFiltering={true} />
                                        <ColumnDirective field='eventName' headerText='Event' width='180' clipMode='EllipsisWithTooltip' template={eventTemplate} allowFiltering={true} />
                                        <ColumnDirective field='boothName' headerText='Booth' width='180' clipMode='EllipsisWithTooltip' template={boothTemplate} allowFiltering={true} />
                                        <ColumnDirective field='jobSeekerCity' headerText='Location' width='150' clipMode='EllipsisWithTooltip' template={locationTemplate} allowFiltering={true} />
                                        <ColumnDirective field='createdAt' headerText='Date Expressed' width='180' clipMode='EllipsisWithTooltip' template={dateExpressedTemplate} allowFiltering={true} />
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