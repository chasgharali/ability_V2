import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../Dashboard/Dashboard.css';
import './MeetingRecords.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import filterIcon from '../../assets/filter.png';
import { GridComponent, ColumnsDirective, ColumnDirective, Inject as GridInject, Sort, Filter, Toolbar as GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu } from '@syncfusion/ej2-react-grids';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { DateTimePickerComponent } from '@syncfusion/ej2-react-calendars';
import { Input } from '../UI/FormComponents';
import { useAuth } from '../../contexts/AuthContext';
import { useRoleMessages } from '../../contexts/RoleMessagesContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { meetingRecordsAPI } from '../../services/meetingRecords';
import { listUsers } from '../../services/users';
import { listEvents } from '../../services/events';
import { useRecruiterBooth } from '../../hooks/useRecruiterBooth';
import JobSeekerProfileModal from '../common/JobSeekerProfileModal';

export default function MeetingRecords() {
    const { user, loading } = useAuth();
    const { getMessage } = useRoleMessages();
    const navigate = useNavigate();
    const location = useLocation();
    const { booth, event } = useRecruiterBooth();
    
    // Get role message from context
    const infoBannerMessage = getMessage('meeting-records', 'info-banner') || '';
    
    useEffect(() => {
        if (!loading) {
            if (!user) {
                navigate('/login', { replace: true });
            } else if (!['Admin', 'GlobalSupport', 'Recruiter'].includes(user.role)) {
                navigate('/dashboard', { replace: true });
            }
        }
    }, [user, loading, navigate]);

    // Set CSS variable for filter icon and make it trigger column menu
    useEffect(() => {
        if (!gridRef.current) return;
        
        const filterIconUrl = `url(${filterIcon})`;
        
        // Set CSS variable on document root
        document.documentElement.style.setProperty('--filter-icon-url', filterIconUrl);
        
        const grid = gridRef.current;
        
        // Override filter icon click to open column menu instead
        const handleFilterIconClick = (e) => {
            const filterIcon = e.target.closest('.e-filtericon');
            if (!filterIcon) return;
            
            e.stopPropagation();
            e.preventDefault();
            
            const headerCell = filterIcon.closest('.e-headercell');
            if (!headerCell || !grid.columnMenuModule) return;
            
            // Get column field from header cell
            const columnIndex = Array.from(headerCell.parentElement.children).indexOf(headerCell);
            const column = grid.columns[columnIndex];
            
            if (column) {
                // Open column menu
                grid.columnMenuModule.openColumnMenu(headerCell, column, e);
            }
        };
        
        // Apply filter icon styling
        const applyFilterIcon = () => {
            const filterIcons = document.querySelectorAll('.e-grid .e-filtericon');
            filterIcons.forEach(icon => {
                icon.style.backgroundImage = filterIconUrl;
                icon.style.display = 'inline-block';
                icon.style.visibility = 'visible';
            });
        };
        
        // Attach event listener to grid container
        const gridElement = grid.element;
        if (gridElement) {
            gridElement.addEventListener('click', handleFilterIconClick, true);
        }
        
        // Apply filter icon styling
        applyFilterIcon();
        
        // Watch for new filter icons being added
        const observer = new MutationObserver(applyFilterIcon);
        observer.observe(document.body, { 
            childList: true, 
            subtree: true 
        });
        
        // Also apply after delays to catch grid render
        const timeoutId1 = setTimeout(applyFilterIcon, 500);
        const timeoutId2 = setTimeout(applyFilterIcon, 1000);
        
        return () => {
            document.documentElement.style.removeProperty('--filter-icon-url');
            if (gridElement) {
                gridElement.removeEventListener('click', handleFilterIconClick, true);
            }
            observer.disconnect();
            clearTimeout(timeoutId1);
            clearTimeout(timeoutId2);
        };
    }, []);

    const [meetingRecords, setMeetingRecords] = useState([]);
    const [recruiters, setRecruiters] = useState([]);
    const [events, setEvents] = useState([]);
    const [loadingData, setLoadingData] = useState(true);
    const toastRef = useRef(null);
    const gridRef = useRef(null);
    const [filtersExpanded, setFiltersExpanded] = useState(false);
    const [selectedRecords, setSelectedRecords] = useState([]);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectAllPages, setSelectAllPages] = useState(false);
    const [allRecordIds, setAllRecordIds] = useState([]);
    // Bulk delete confirmation dialog
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

    // Job Seeker Profile Modal state
    const [showJobSeekerModal, setShowJobSeekerModal] = useState(false);
    const [selectedJobSeekerForModal, setSelectedJobSeekerForModal] = useState(null);

    // Filters
    const [filters, setFilters] = useState({
        recruiterId: '',
        eventId: '',
        status: '',
        startDate: '',
        endDate: '',
        search: '',
        page: 1,
        limit: 10,
        sortBy: 'startTime',
        sortOrder: 'desc'
    });
    
    // Search query state for input field
    const [searchQuery, setSearchQuery] = useState('');

    // Pagination
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        totalRecords: 0,
        hasNext: false,
        hasPrev: false
    });

    // Sync header and content horizontal scrolling
    useEffect(() => {
        let scrollSyncActive = false;

        const syncScroll = () => {
            const grids = document.querySelectorAll('.meeting-records-container .e-grid, .data-grid-container .e-grid');
            grids.forEach(grid => {
                const header = grid.querySelector('.e-gridheader');
                const content = grid.querySelector('.e-content');
                if (!header || !content) return;

                // Force enable scrolling on header
                header.style.overflowX = 'scroll';
                header.style.overflowY = 'hidden';
                header.style.position = 'relative';
                header.style.display = 'block';
                header.style.width = '100%';

                // Match header table width to content table width for synchronized scrolling
                const matchTableWidths = () => {
                    const contentTable = content.querySelector('table');
                    const headerTable = header.querySelector('table');
                    const headerContent = header.querySelector('.e-headercontent');
                    
                    if (contentTable && headerTable) {
                        // Force layout recalculation
                        void contentTable.offsetWidth;
                        void headerTable.offsetWidth;
                        
                        // Get content table's full scroll width (includes all columns)
                        const contentScrollWidth = contentTable.scrollWidth || contentTable.offsetWidth;
                        const headerContainerWidth = header.offsetWidth || header.clientWidth;
                        
                        // Always set header table width to match content table exactly
                        if (contentScrollWidth > 0) {
                            headerTable.style.width = contentScrollWidth + 'px';
                            headerTable.style.minWidth = contentScrollWidth + 'px';
                            headerTable.style.maxWidth = 'none';
                            
                            if (headerContent) {
                                headerContent.style.width = contentScrollWidth + 'px';
                                headerContent.style.minWidth = contentScrollWidth + 'px';
                                headerContent.style.maxWidth = 'none';
                            }
                        }
                        
                        // Enable scrolling if content is scrollable
                        if (contentScrollWidth > headerContainerWidth) {
                            header.style.overflowX = 'auto';
                            header.style.overflowY = 'hidden';
                        }
                    }
                };
                
                // Match widths with multiple attempts to catch grid render timing
                matchTableWidths();
                setTimeout(matchTableWidths, 50);
                setTimeout(matchTableWidths, 200);
                setTimeout(matchTableWidths, 500);
                setTimeout(matchTableWidths, 1000);

                // Sync scroll positions
                const syncContentToHeader = () => {
                    if (!scrollSyncActive) {
                        scrollSyncActive = true;
                        header.scrollLeft = content.scrollLeft;
                        requestAnimationFrame(() => {
                            scrollSyncActive = false;
                        });
                    }
                };

                const syncHeaderToContent = () => {
                    if (!scrollSyncActive) {
                        scrollSyncActive = true;
                        content.scrollLeft = header.scrollLeft;
                        requestAnimationFrame(() => {
                            scrollSyncActive = false;
                        });
                    }
                };

                // Remove old listeners
                content.removeEventListener('scroll', syncContentToHeader);
                header.removeEventListener('scroll', syncHeaderToContent);

                // Add new listeners
                content.addEventListener('scroll', syncContentToHeader, { passive: true });
                header.addEventListener('scroll', syncHeaderToContent, { passive: true });

                // Initial sync
                setTimeout(() => {
                    header.scrollLeft = content.scrollLeft;
                }, 50);
            });
        };

        // Run immediately and after delays
        syncScroll();
        const timer1 = setTimeout(syncScroll, 100);
        const timer2 = setTimeout(syncScroll, 500);
        const timer3 = setTimeout(syncScroll, 1000);
        const timer4 = setTimeout(syncScroll, 2000);
        
        const observer = new MutationObserver(() => {
            setTimeout(syncScroll, 100);
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Also watch for window resize
        const handleResize = () => setTimeout(syncScroll, 100);
        window.addEventListener('resize', handleResize);

        return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
            clearTimeout(timer3);
            clearTimeout(timer4);
            observer.disconnect();
            window.removeEventListener('resize', handleResize);
        };
    }, [meetingRecords]);

    // Statistics
    const [stats, setStats] = useState({
        totalMeetings: 0,
        completedMeetings: 0,
        averageDuration: 0,
        averageRating: 0,
        totalWithRating: 0,
        totalWithInterpreter: 0
    });

    // Syncfusion Toast
    const showToast = (message, type = 'Success', duration = 3000) => {
        if (toastRef.current) {
            toastRef.current.show({
                title: type,
                content: message,
                cssClass: `e-toast-${type.toLowerCase()}`,
                showProgressBar: true,
                timeOut: duration
            });
        }
    };

    const loadMeetingRecords = useCallback(async () => {
        try {
            setLoadingData(true);
            console.log('📡 Loading meeting records with filters:', filters);
            const response = await meetingRecordsAPI.getMeetingRecords(filters);
            console.log('✅ Meeting records response:', response);
            
            // Ensure we have valid data structure
            if (response && response.meetingRecords) {
                console.log(`📊 Loaded ${response.meetingRecords.length} meeting records`);
                setMeetingRecords(response.meetingRecords || []);
                setPagination(response.pagination || {
                    currentPage: 1,
                    totalPages: 0,
                    totalRecords: 0,
                    hasNext: false,
                    hasPrev: false
                });
            } else {
                console.warn('⚠️ Invalid response structure:', response);
                setMeetingRecords([]);
                setPagination({
                    currentPage: 1,
                    totalPages: 0,
                    totalRecords: 0,
                    hasNext: false,
                    hasPrev: false
                });
            }
            // Reset select all pages when data changes
            setSelectAllPages(false);
        } catch (error) {
            console.error('❌ Error loading meeting records:', error);
            console.error('Error details:', {
                message: error.message,
                code: error.code,
                response: error.response?.data,
                status: error.response?.status,
                config: error.config?.url
            });
            
            // Check if it's a CORS error
            const isCorsError = error.code === 'ERR_NETWORK' || 
                               (error.message && error.message.includes('CORS')) ||
                               (error.message && error.message === 'Network Error');
            
            if (isCorsError) {
                showToast('CORS Error: Check server configuration or use proxy', 'Error');
            } else {
                showToast(error.response?.data?.message || 'Failed to load meeting records', 'Error');
            }
            
            // Set empty data on error to prevent UI crashes
            setMeetingRecords([]);
            setPagination({
                currentPage: 1,
                totalPages: 0,
                totalRecords: 0,
                hasNext: false,
                hasPrev: false
            });
        } finally {
            setLoadingData(false);
        }
    }, [filters]);

    const loadStats = useCallback(async () => {
        try {
            const statsData = await meetingRecordsAPI.getStats(filters);
            setStats(statsData);
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }, [filters]);

    const loadRecruiters = useCallback(async () => {
        try {
            if (['Admin', 'GlobalSupport'].includes(user?.role)) {
                const response = await listUsers({ role: 'Recruiter', limit: 1000 });
                setRecruiters(response.users || []);
            }
        } catch (error) {
            console.error('Error loading recruiters:', error);
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
            loadMeetingRecords();
            loadStats();
            loadRecruiters();
            loadEvents();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, filters, location.key]);

    const handleFilterChange = (field, value) => {
        setFilters(prev => ({
            ...prev,
            [field]: value,
            page: 1 // Reset to first page when filters change
        }));
    };

    const handlePageChange = (page) => {
        setFilters(prev => ({ ...prev, page }));
    };

    const handlePageSizeChange = (newSize) => {
        setFilters(prev => ({ ...prev, limit: newSize, page: 1 }));
    };

    const handleExport = async () => {
        try {
            const blob = await meetingRecordsAPI.exportCSV(filters);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'meeting-records.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            showToast('Meeting records exported successfully', 'Success');
        } catch (error) {
            console.error('Error exporting meeting records:', error);
            showToast('Failed to export meeting records', 'Error');
        }
    };

    const clearFilters = () => {
        setSearchQuery('');
        setFilters({
            recruiterId: '',
            eventId: '',
            status: '',
            startDate: '',
            endDate: '',
            search: '',
            page: 1,
            limit: 10,
            sortBy: 'startTime',
            sortOrder: 'desc'
        });
    };
    
    const handleSearch = () => {
        setFilters(prev => ({
            ...prev,
            search: searchQuery.trim(),
            page: 1 // Reset to first page when searching
        }));
    };
    
    const handleClearSearch = () => {
        setSearchQuery('');
        setFilters(prev => ({
            ...prev,
            search: '',
            page: 1
        }));
    };

    const formatDuration = (minutes) => {
        if (!minutes || minutes === 0 || isNaN(minutes)) return 'N/A';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}m`;
    };

    const formatDateTime = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString();
    };

    const renderStars = (rating) => {
        if (!rating) return 'No rating';
        return '★'.repeat(rating) + '☆'.repeat(5 - rating);
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            // Select all on current page
            const currentPageIds = meetingRecords.map(r => r._id);
            setSelectedRecords(prev => [...new Set([...prev, ...currentPageIds])]);
        } else {
            // Deselect all on current page
            const currentPageIds = meetingRecords.map(r => r._id);
            setSelectedRecords(prev => prev.filter(id => !currentPageIds.includes(id)));
            setSelectAllPages(false);
        }
    };

    const handleSelectAllPages = async () => {
        try {
            // Fetch all record IDs (without pagination)
            const allFilters = { ...filters, page: 1, limit: 99999 };
            const response = await meetingRecordsAPI.getMeetingRecords(allFilters);
            const allIds = response.meetingRecords.map(r => r._id);
            setAllRecordIds(allIds);
            setSelectedRecords(allIds);
            setSelectAllPages(true);
            showToast(`Selected all ${allIds.length} records across all pages`, 'Info');
        } catch (error) {
            console.error('Error fetching all records:', error);
            showToast('Failed to select all records', 'Error');
        }
    };

    const handleSelectRecord = (recordId) => {
        setSelectedRecords(prev => {
            if (prev.includes(recordId)) {
                return prev.filter(id => id !== recordId);
            } else {
                return [...prev, recordId];
            }
        });
    };

    const handleBulkDelete = () => {
        if (selectedRecords.length === 0) {
            showToast('Please select records to delete', 'Warning');
            return;
        }
        setConfirmDeleteOpen(true);
    };

    const confirmBulkDelete = async () => {
        try {
            setIsDeleting(true);
            const response = await meetingRecordsAPI.bulkDelete(selectedRecords);
            showToast(response.message || 'Records deleted successfully', 'Success');
            setSelectedRecords([]);
            setSelectAllPages(false);
            await loadMeetingRecords();
            await loadStats();
        } catch (error) {
            console.error('Error deleting records:', error);
            showToast(error.response?.data?.message || 'Failed to delete records', 'Error');
        } finally {
            setIsDeleting(false);
            setConfirmDeleteOpen(false);
        }
    };

    const cancelBulkDelete = () => {
        setConfirmDeleteOpen(false);
    };

    // Grid template functions for custom column renders - using Syncfusion ButtonComponent
    const eventTemplate = (props) => {
        const row = props;
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {row.eventId?.name || 'N/A'}
            </div>
        );
    };

    const boothTemplate = (props) => {
        const row = props;
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {row.boothId?.name || 'N/A'}
            </div>
        );
    };

    const recruiterTemplate = (props) => {
        const row = props;
        // For left_with_message records, show "All Recruiters in Booth" instead of specific recruiter
        if (row.status === 'left_with_message') {
            return (
                <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                    <span style={{ fontStyle: 'italic', color: '#6b7280' }}>All Recruiters in Booth</span>
                </div>
            );
        }
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {row.recruiterId?.name || 'N/A'}
            </div>
        );
    };

    const jobSeekerTemplate = (props) => {
        const row = props;
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {row.jobseekerId?.name || 'N/A'}
            </div>
        );
    };

    const locationTemplate = (props) => {
        const row = props;
        const jobSeeker = row.jobseekerId;
        let locationText = 'N/A';
        if (jobSeeker?.city && jobSeeker?.state) {
            locationText = `${jobSeeker.city}, ${jobSeeker.state}`;
        }
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {locationText}
            </div>
        );
    };

    const startTimeTemplate = (props) => {
        const row = props;
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {formatDateTime(row.startTime)}
            </div>
        );
    };

    const durationTemplate = (props) => {
        const row = props;
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'center' }}>
                {formatDuration(row.duration)}
            </div>
        );
    };

    const statusTemplate = (props) => {
        const row = props;
        const statusLabels = {
            'scheduled': 'Scheduled',
            'active': 'Active',
            'completed': 'Completed',
            'cancelled': 'Cancelled',
            'failed': 'Failed',
            'left_with_message': 'Left Message'
        };
        return (
            <span className={`status-badge status-${row.status}`}>
                {statusLabels[row.status] || row.status}
            </span>
        );
    };

    const ratingTemplate = (props) => {
        const row = props;
        return (
            <div className="rating-display">
                <span className="stars">{renderStars(row.recruiterRating)}</span>
                {row.recruiterRating && (
                    <span className="rating-number">({row.recruiterRating}/5)</span>
                )}
            </div>
        );
    };

    const messagesTemplate = (props) => {
        const row = props;
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'center' }}>
                {row.jobSeekerMessages?.length || 0}
            </div>
        );
    };

    const interpreterTemplate = (props) => {
        const row = props;
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {row.interpreterId?.name || 'None'}
            </div>
        );
    };

    const meetingNotesTemplate = (props) => {
        const row = props;
        const notes = row.recruiterFeedback || '';
        const truncatedNotes = notes.length > 100 ? notes.substring(0, 100) + '...' : notes;
        return (
            <div 
                style={{ 
                    wordWrap: 'break-word', 
                    whiteSpace: 'normal', 
                    padding: '8px 0',
                    maxWidth: '300px'
                }}
                title={notes || 'No notes'}
            >
                {notes ? truncatedNotes : 'N/A'}
            </div>
        );
    };

    const actionsTemplate = (props) => {
        const row = props;
        // Handle both populated jobseekerId object and jobseekerId string
        const jobSeekerData = row.jobseekerId || row.jobSeekerId;
        
        return (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <ButtonComponent 
                    cssClass="e-primary e-small" 
                    onClick={() => navigate(`/meeting-records/${row._id}`)}
                    aria-label="View meeting record details"
                >
                    View Details
                </ButtonComponent>
                {jobSeekerData && (
                    <ButtonComponent 
                        cssClass="e-outline e-primary e-small" 
                        onClick={() => {
                            // Handle both object (populated) and string (ID) cases
                            const jobSeeker = typeof jobSeekerData === 'object' ? jobSeekerData : { _id: jobSeekerData };
                            setSelectedJobSeekerForModal(jobSeeker);
                            setShowJobSeekerModal(true);
                        }}
                        aria-label="View job seeker details"
                    >
                        View Job Seeker Detail
                    </ButtonComponent>
                )}
            </div>
        );
    };

    if (loading || !user) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
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
                <AdminSidebar active="meeting-records" />
                <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
                    <div className="dashboard-content">
                        <div className="meeting-records-container">
                        <div className="page-header">
                            <h1>Meeting Records</h1>
                            {infoBannerMessage && (
                                <div className="info-banner" style={{ marginTop: '1rem', marginBottom: '1.5rem' }}>
                                    <span>{infoBannerMessage}</span>
                                </div>
                            )}
                            <div className="header-actions">
                                {['Admin', 'GlobalSupport'].includes(user?.role) && selectedRecords.length > 0 && (
                                    <ButtonComponent 
                                        cssClass="e-danger"
                                        onClick={handleBulkDelete}
                                        disabled={isDeleting}
                                    >
                                        {isDeleting ? 'Deleting...' : `Delete Selected (${selectedRecords.length})`}
                                    </ButtonComponent>
                                )}
                                <ButtonComponent 
                                    cssClass="e-primary"
                                    onClick={handleExport}
                                    disabled={loadingData}
                                >
                                    Export CSV
                                </ButtonComponent>
                            </div>
                        </div>

                        {/* Statistics Cards */}
                        <div className="stats-grid">
                            <div className="stat-card">
                                <h3>Total Meetings</h3>
                                <div className="stat-value">{stats.totalMeetings}</div>
                            </div>
                            <div className="stat-card">
                                <h3>Completed</h3>
                                <div className="stat-value">{stats.completedMeetings}</div>
                            </div>
                            <div className="stat-card">
                                <h3>Avg Duration</h3>
                                <div className="stat-value">{formatDuration(Math.round(stats.averageDuration))}</div>
                            </div>
                            <div className="stat-card">
                                <h3>Avg Rating</h3>
                                <div className="stat-value">
                                    {stats.averageRating ? `${stats.averageRating.toFixed(1)}/5` : 'N/A'}
                                </div>
                            </div>
                        </div>

                        {/* Search and Status Filter Row */}
                        <div className="mr-filters-row" style={{ marginBottom: 12, paddingLeft: '20px', paddingRight: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {/* Status Filter - Left */}
                            <div style={{ width: '200px', flexShrink: 0 }}>
                                <DropDownListComponent
                                    id="status-filter-dropdown-main"
                                    dataSource={[
                                        { value: '', text: 'All Statuses' },
                                        { value: 'scheduled', text: 'Scheduled' },
                                        { value: 'active', text: 'Active' },
                                        { value: 'completed', text: 'Completed' },
                                        { value: 'cancelled', text: 'Cancelled' },
                                        { value: 'failed', text: 'Failed' },
                                        { value: 'left_with_message', text: 'Left Message' }
                                    ]}
                                    fields={{ value: 'value', text: 'text' }}
                                    value={filters.status}
                                    change={(e) => handleFilterChange('status', e.value || '')}
                                    placeholder="Select Status"
                                    cssClass="status-filter-dropdown"
                                    popupHeight="300px"
                                    width="100%"
                                />
                            </div>
                            {/* Search Section - Right */}
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: 'auto' }}>
                                <div style={{ marginBottom: 0 }}>
                                    <Input
                                        id="meeting-records-search-input"
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleSearch();
                                            }
                                        }}
                                        placeholder="Search by name, email, or any field..."
                                        style={{ width: '300px', marginBottom: 0 }}
                                        className="mr-search-input-no-label"
                                    />
                                </div>
                                <ButtonComponent
                                    cssClass="e-primary e-small"
                                    onClick={handleSearch}
                                    disabled={loadingData}
                                    aria-label="Search meeting records"
                                    style={{ minWidth: '80px', height: '44px' }}
                                >
                                    Search
                                </ButtonComponent>
                                {(searchQuery || filters.search) && (
                                    <ButtonComponent
                                        cssClass="e-outline e-primary e-small"
                                        onClick={handleClearSearch}
                                        disabled={loadingData}
                                        aria-label="Clear search"
                                        style={{ minWidth: '70px', height: '44px' }}
                                    >
                                        Clear
                                    </ButtonComponent>
                                )}
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
                                    {(filters.recruiterId || filters.eventId || filters.startDate || filters.endDate) && (
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
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label htmlFor="status-filter-dropdown" style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827', marginBottom: '4px' }}>
                                        Status
                                    </label>
                                    <DropDownListComponent
                                        id="status-filter-dropdown"
                                        dataSource={[
                                            { value: '', text: 'All Statuses' },
                                            { value: 'scheduled', text: 'Scheduled' },
                                            { value: 'active', text: 'Active' },
                                            { value: 'completed', text: 'Completed' },
                                            { value: 'cancelled', text: 'Cancelled' },
                                            { value: 'failed', text: 'Failed' },
                                            { value: 'left_with_message', text: 'Left Message' }
                                        ]}
                                        fields={{ value: 'value', text: 'text' }}
                                        value={filters.status}
                                        change={(e) => handleFilterChange('status', e.value || '')}
                                        placeholder="Select Status"
                                        cssClass="filter-dropdown"
                                        popupHeight="300px"
                                        width="100%"
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label htmlFor="start-date-picker" style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827', marginBottom: '4px' }}>
                                        Start Date
                                    </label>
                                    <DateTimePickerComponent
                                        id="start-date-picker"
                                        value={filters.startDate ? new Date(filters.startDate) : null}
                                        change={(e) => handleFilterChange('startDate', e.value ? e.value.toISOString() : '')}
                                        placeholder="Select Start Date"
                                        width="100%"
                                        cssClass="filter-datetime"
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label htmlFor="end-date-picker" style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827', marginBottom: '4px' }}>
                                        End Date
                                    </label>
                                    <DateTimePickerComponent
                                        id="end-date-picker"
                                        value={filters.endDate ? new Date(filters.endDate) : null}
                                        change={(e) => handleFilterChange('endDate', e.value ? e.value.toISOString() : '')}
                                        placeholder="Select End Date"
                                        width="100%"
                                        cssClass="filter-datetime"
                                    />
                                </div>
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

                        {/* Select All Pages Banner */}
                        {selectedRecords.length === meetingRecords.length && meetingRecords.length > 0 && !selectAllPages && pagination.totalRecords > meetingRecords.length && (
                            <div style={{
                                background: '#e3f2fd',
                                padding: '12px 20px',
                                borderRadius: '8px',
                                marginBottom: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                border: '1px solid #90caf9'
                            }}>
                                <span style={{ color: '#1565c0', fontWeight: '500' }}>
                                    All {meetingRecords.length} records on this page are selected.
                                </span>
                                <ButtonComponent 
                                    cssClass="e-primary e-small"
                                    onClick={handleSelectAllPages}
                                >
                                    Select all {pagination.totalRecords} records
                                </ButtonComponent>
                            </div>
                        )}

                        {selectAllPages && (
                            <div style={{
                                background: '#c8e6c9',
                                padding: '12px 20px',
                                borderRadius: '8px',
                                marginBottom: '16px',
                                border: '1px solid #81c784'
                            }}>
                                <span style={{ color: '#2e7d32', fontWeight: '600' }}>
                                    ✓ All {selectedRecords.length} records across all pages are selected.
                                </span>
                            </div>
                        )}

                        {/* Data Grid */}
                        <div className="data-grid-container">
                            {loadingData && <div style={{ marginBottom: 12 }}>Loading…</div>}
                            <GridComponent
                                ref={gridRef}
                                dataSource={meetingRecords.map(r => {
                                    // Safely extract populated field values
                                    // Backend populates these fields, so they can be objects or null
                                    const getFieldName = (field) => {
                                        if (!field) return '';
                                        if (typeof field === 'string') return field;
                                        if (typeof field === 'object' && field.name) return field.name;
                                        return '';
                                    };
                                    
                                    const getFieldCity = (field) => {
                                        if (!field) return '';
                                        if (typeof field === 'object' && field.city) return field.city;
                                        return '';
                                    };
                                    
                                    return {
                                        ...r, 
                                        id: r._id || r.id,
                                        // Flatten nested fields for sorting and filtering
                                        eventName: getFieldName(r.eventId),
                                        boothName: getFieldName(r.boothId),
                                        recruiterName: getFieldName(r.recruiterId),
                                        jobSeekerName: getFieldName(r.jobseekerId),
                                        jobSeekerCity: getFieldCity(r.jobseekerId),
                                        interpreterName: r.interpreterId ? getFieldName(r.interpreterId) : 'None',
                                        messagesCount: Array.isArray(r.jobSeekerMessages) ? r.jobSeekerMessages.length : 0
                                    };
                                })}
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
                                showColumnMenu={true}
                                showColumnChooser={true}
                                allowResizing={true}
                                allowReordering={true}
                                toolbar={['ColumnChooser']}
                                selectionSettings={['Admin', 'GlobalSupport'].includes(user?.role) ? { 
                                    type: 'Multiple', 
                                    checkboxOnly: true,
                                    persistSelection: true,
                                    enableSimpleMultiRowSelection: true
                                } : { type: 'None' }}
                                enableHover={true}
                                allowRowDragAndDrop={false}
                                rowSelected={(args) => {
                                    if (['Admin', 'GlobalSupport'].includes(user?.role)) {
                                        const recordId = args.data._id || args.data.id;
                                        if (!selectedRecords.includes(recordId)) {
                                            handleSelectRecord(recordId);
                                        }
                                    }
                                }}
                                rowDeselected={(args) => {
                                    if (['Admin', 'GlobalSupport'].includes(user?.role)) {
                                        const recordId = args.data._id || args.data.id;
                                        if (selectedRecords.includes(recordId)) {
                                            handleSelectRecord(recordId);
                                        }
                                    }
                                }}
                            >
                                <ColumnsDirective>
                                    {['Admin', 'GlobalSupport'].includes(user?.role) && (
                                        <ColumnDirective 
                                            type='checkbox' 
                                            width='50' 
                                        />
                                    )}
                                    <ColumnDirective field='id' headerText='' width='0' isPrimaryKey={true} visible={false} showInColumnChooser={false} />
                                    <ColumnDirective field='eventName' headerText='Event' width='150' clipMode='EllipsisWithTooltip' template={eventTemplate} allowFiltering={true} />
                                    <ColumnDirective field='boothName' headerText='Booth' width='150' clipMode='EllipsisWithTooltip' template={boothTemplate} allowFiltering={true} />
                                    <ColumnDirective field='recruiterName' headerText='Recruiter' width='150' clipMode='EllipsisWithTooltip' template={recruiterTemplate} allowFiltering={true} />
                                    <ColumnDirective field='jobSeekerName' headerText='Job Seeker' width='180' clipMode='EllipsisWithTooltip' template={jobSeekerTemplate} allowFiltering={true} />
                                    <ColumnDirective field='jobSeekerCity' headerText='Location' width='150' clipMode='EllipsisWithTooltip' template={locationTemplate} allowFiltering={true} />
                                    <ColumnDirective field='startTime' headerText='Start Time' width='180' clipMode='EllipsisWithTooltip' template={startTimeTemplate} allowFiltering={true} />
                                    <ColumnDirective field='duration' headerText='Duration' width='120' textAlign='Center' template={durationTemplate} allowFiltering={true} />
                                    <ColumnDirective field='status' headerText='Status' width='130' textAlign='Center' template={statusTemplate} allowFiltering={true} />
                                    <ColumnDirective field='recruiterRating' headerText='Rating' width='150' textAlign='Center' template={ratingTemplate} allowFiltering={true} />
                                    <ColumnDirective field='recruiterFeedback' headerText='Meeting Notes' width='300' clipMode='EllipsisWithTooltip' template={meetingNotesTemplate} allowFiltering={true} type='string' />
                                    <ColumnDirective field='messagesCount' headerText='Messages' width='100' textAlign='Center' template={messagesTemplate} allowFiltering={true} />
                                    <ColumnDirective field='interpreterName' headerText='Interpreter' width='150' clipMode='EllipsisWithTooltip' template={interpreterTemplate} allowFiltering={true} />
                                    <ColumnDirective 
                                        headerText='Actions' 
                                        width='280' 
                                        allowSorting={false} 
                                        allowFiltering={false}
                                        template={actionsTemplate}
                                        showInColumnChooser={true}
                                        visible={true}
                                    />
                                </ColumnsDirective>
                                <GridInject services={[Sort, Filter, GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu]} />
                            </GridComponent>
                            
                            {/* Custom Pagination Footer */}
                            {pagination.totalPages > 0 && (
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
                                            onChange={(e) => {
                                                const newSize = parseInt(e.target.value);
                                                handlePageSizeChange(newSize);
                                            }}
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
                                            Page {pagination.currentPage} of {pagination.totalPages || 1} ({pagination.totalRecords || 0} total)
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <button
                                            onClick={() => {
                                                if (pagination.currentPage > 1) {
                                                    handlePageChange(1);
                                                }
                                            }}
                                            disabled={pagination.currentPage <= 1 || loadingData}
                                            style={{
                                                padding: '8px 12px',
                                                borderRadius: '6px',
                                                border: '1px solid #d1d5db',
                                                backgroundColor: pagination.currentPage <= 1 ? '#f3f4f6' : '#fff',
                                                cursor: pagination.currentPage <= 1 ? 'not-allowed' : 'pointer',
                                                fontSize: '14px',
                                                color: pagination.currentPage <= 1 ? '#9ca3af' : '#374151'
                                            }}
                                            title="First Page"
                                        >
                                            ⟨⟨
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (pagination.currentPage > 1) {
                                                    handlePageChange(pagination.currentPage - 1);
                                                }
                                            }}
                                            disabled={pagination.currentPage <= 1 || loadingData}
                                            style={{
                                                padding: '8px 12px',
                                                borderRadius: '6px',
                                                border: '1px solid #d1d5db',
                                                backgroundColor: pagination.currentPage <= 1 ? '#f3f4f6' : '#fff',
                                                cursor: pagination.currentPage <= 1 ? 'not-allowed' : 'pointer',
                                                fontSize: '14px',
                                                color: pagination.currentPage <= 1 ? '#9ca3af' : '#374151'
                                            }}
                                            title="Previous Page"
                                        >
                                            ⟨ Prev
                                        </button>
                                        
                                        <input
                                            type="number"
                                            min="1"
                                            max={pagination.totalPages || 1}
                                            value={pagination.currentPage}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                if (val >= 1 && val <= (pagination.totalPages || 1)) {
                                                    handlePageChange(val);
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
                                            onClick={() => {
                                                if (pagination.currentPage < (pagination.totalPages || 1)) {
                                                    handlePageChange(pagination.currentPage + 1);
                                                }
                                            }}
                                            disabled={pagination.currentPage >= (pagination.totalPages || 1) || loadingData}
                                            style={{
                                                padding: '8px 12px',
                                                borderRadius: '6px',
                                                border: '1px solid #d1d5db',
                                                backgroundColor: pagination.currentPage >= (pagination.totalPages || 1) ? '#f3f4f6' : '#fff',
                                                cursor: pagination.currentPage >= (pagination.totalPages || 1) ? 'not-allowed' : 'pointer',
                                                fontSize: '14px',
                                                color: pagination.currentPage >= (pagination.totalPages || 1) ? '#9ca3af' : '#374151'
                                            }}
                                            title="Next Page"
                                        >
                                            Next ⟩
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (pagination.currentPage < (pagination.totalPages || 1)) {
                                                    handlePageChange(pagination.totalPages || 1);
                                                }
                                            }}
                                            disabled={pagination.currentPage >= (pagination.totalPages || 1) || loadingData}
                                            style={{
                                                padding: '8px 12px',
                                                borderRadius: '6px',
                                                border: '1px solid #d1d5db',
                                                backgroundColor: pagination.currentPage >= (pagination.totalPages || 1) ? '#f3f4f6' : '#fff',
                                                cursor: pagination.currentPage >= (pagination.totalPages || 1) ? 'not-allowed' : 'pointer',
                                                fontSize: '14px',
                                                color: pagination.currentPage >= (pagination.totalPages || 1) ? '#9ca3af' : '#374151'
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

            {/* Bulk Delete Confirm Modal - Syncfusion DialogComponent */}
            <DialogComponent
                width="450px"
                isModal={true}
                showCloseIcon={true}
                visible={confirmDeleteOpen}
                header="Delete Meeting Records"
                closeOnEscape={true}
                close={cancelBulkDelete}
                buttons={[
                    {
                        buttonModel: {
                            content: 'Cancel',
                            isPrimary: false,
                            cssClass: 'e-outline e-primary'
                        },
                        click: () => {
                            cancelBulkDelete();
                        }
                    },
                    {
                        buttonModel: {
                            content: 'Delete',
                            isPrimary: true,
                            cssClass: 'e-danger'
                        },
                        click: () => {
                            confirmBulkDelete();
                        }
                    }
                ]}
            >
                <p style={{ margin: 0, lineHeight: '1.5' }}>
                    Are you sure you want to delete <strong>{selectedRecords.length}</strong> meeting record(s)? This action cannot be undone.
                </p>
            </DialogComponent>

            {/* Syncfusion ToastComponent */}
            <ToastComponent 
                ref={(toast) => toastRef.current = toast}
                position={{ X: 'Right', Y: 'Bottom' }}
                showProgressBar={true}
                timeOut={3000}
                newestOnTop={true}
            />

            {/* Job Seeker Profile Modal */}
            <JobSeekerProfileModal
                isOpen={showJobSeekerModal}
                onClose={() => {
                    setShowJobSeekerModal(false);
                    setSelectedJobSeekerForModal(null);
                }}
                jobSeeker={selectedJobSeekerForModal}
            />
        </div>
    );
}
