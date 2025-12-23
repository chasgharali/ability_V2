// @refresh reset
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { useAuth } from '../../contexts/AuthContext';
import { useRoleMessages } from '../../contexts/RoleMessagesContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { meetingRecordsAPI } from '../../services/meetingRecords';
import { listUsers } from '../../services/users';
import { listEvents } from '../../services/events';
import { listBooths } from '../../services/booths';
import { useRecruiterBooth } from '../../hooks/useRecruiterBooth';
import JobSeekerProfileModal from '../common/JobSeekerProfileModal';
import JSZip from 'jszip';

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
    const [booths, setBooths] = useState([]);
    const [loadingData, setLoadingData] = useState(true);
    const toastRef = useRef(null);
    const gridRef = useRef(null);
    const loadingMeetingRecordsRef = useRef(false);
    const loadingStatsRef = useRef(false);
    const loadingRecruitersRef = useRef(false);
    const loadingEventsRef = useRef(false);
    const loadingBoothsRef = useRef(false);
    const [selectedRecords, setSelectedRecords] = useState([]);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectAllPages, setSelectAllPages] = useState(false);
    const [allRecordIds, setAllRecordIds] = useState([]);
    // Bulk delete confirmation dialog
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

    // Job Seeker Profile Modal state
    const [showJobSeekerModal, setShowJobSeekerModal] = useState(false);
    const [selectedJobSeekerForModal, setSelectedJobSeekerForModal] = useState(null);

    // Resume export state
    const [isExportingResumes, setIsExportingResumes] = useState(false);

    // Load search query from sessionStorage on mount (per-table persistence for search)
    const loadSearchQueryFromSession = () => {
        try {
            const saved = sessionStorage.getItem('meetingRecords_searchQuery');
            if (saved) {
                return saved;
            }
        } catch (error) {
            console.error('Error loading Meeting Records search query from sessionStorage:', error);
        }
        return '';
    };

    // Load filters from sessionStorage on mount
    const loadFiltersFromSession = () => {
        try {
            const savedFilters = sessionStorage.getItem('meetingRecords_filters');
            const savedSearchQuery = loadSearchQueryFromSession();
            if (savedFilters) {
                const parsed = JSON.parse(savedFilters);
                return {
                    recruiterId: parsed.recruiterId || '',
                    eventId: parsed.eventId || '',
                    boothId: parsed.boothId || '',
                    status: parsed.status || '',
                    startDate: parsed.startDate || '',
                    endDate: parsed.endDate || '',
                    search: savedSearchQuery,
                    page: 1,
                    limit: 50,
                    sortBy: parsed.sortBy || 'startTime',
                    sortOrder: parsed.sortOrder || 'desc'
                };
            }
        } catch (error) {
            console.error('Error loading filters from sessionStorage:', error);
        }
        const savedSearchQuery = loadSearchQueryFromSession();
        return {
            recruiterId: '',
            eventId: '',
            boothId: '',
            status: '',
            startDate: '',
            endDate: '',
            search: savedSearchQuery,
            page: 1,
            limit: 50,
            sortBy: 'startTime',
            sortOrder: 'desc'
        };
    };

    // Filters
    const [filters, setFilters] = useState(loadFiltersFromSession);
    
    // Search input ref (uncontrolled to avoid live filtering on typing)
    const searchInputRef = useRef(null);

    // Set search input value from sessionStorage on mount
    useEffect(() => {
        const savedSearchQuery = loadSearchQueryFromSession();
        if (searchInputRef.current && savedSearchQuery) {
            searchInputRef.current.value = savedSearchQuery;
        }
    }, []);

    // Persist search query in sessionStorage so it survives navigation within the session
    useEffect(() => {
        try {
            if (filters.search && filters.search.trim()) {
                sessionStorage.setItem('meetingRecords_searchQuery', filters.search.trim());
                // Also update the input field if it exists
                if (searchInputRef.current) {
                    searchInputRef.current.value = filters.search.trim();
                }
            } else {
                sessionStorage.removeItem('meetingRecords_searchQuery');
                // Also clear the input field if it exists
                if (searchInputRef.current) {
                    searchInputRef.current.value = '';
                }
            }
        } catch (error) {
            console.error('Error saving Meeting Records search query to sessionStorage:', error);
        }
    }, [filters.search]);

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

    // Use ref to store latest filters to avoid recreating callback
    const filtersRef = useRef(filters);
    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);

    const loadMeetingRecords = useCallback(async () => {
        // Prevent multiple simultaneous fetches
        if (loadingMeetingRecordsRef.current) return;
        
        try {
            loadingMeetingRecordsRef.current = true;
            setLoadingData(true);
            const currentFilters = filtersRef.current;
            console.log('📡 Loading meeting records with filters:', currentFilters);
            const response = await meetingRecordsAPI.getMeetingRecords(currentFilters);
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
            loadingMeetingRecordsRef.current = false;
            setLoadingData(false);
        }
    }, []); // No dependencies - uses ref for filters

    const loadStats = useCallback(async () => {
        // Prevent multiple simultaneous fetches
        if (loadingStatsRef.current) return;
        
        try {
            loadingStatsRef.current = true;
            const currentFilters = filtersRef.current;
            console.log('📊 Loading stats with filters:', currentFilters);
            const statsData = await meetingRecordsAPI.getStats(currentFilters);
            console.log('✅ Stats data received:', statsData);
            setStats({
                totalMeetings: statsData.totalMeetings || 0,
                completedMeetings: statsData.completedMeetings || 0,
                averageDuration: statsData.averageDuration || null,
                averageRating: statsData.averageRating || null,
                totalWithRating: statsData.totalWithRating || 0,
                totalWithInterpreter: statsData.totalWithInterpreter || 0
            });
        } catch (error) {
            console.error('❌ Error loading stats:', error);
            console.error('Error details:', error.response?.data || error.message);
            // Set default stats on error
            setStats({
                totalMeetings: 0,
                completedMeetings: 0,
                averageDuration: null,
                averageRating: null,
                totalWithRating: 0,
                totalWithInterpreter: 0
            });
        } finally {
            loadingStatsRef.current = false;
        }
    }, []); // No dependencies - uses ref for filters

    const loadRecruiters = useCallback(async () => {
        // Prevent multiple simultaneous fetches
        if (loadingRecruitersRef.current) return;
        
        try {
            loadingRecruitersRef.current = true;
            if (['Admin', 'GlobalSupport'].includes(user?.role)) {
                const response = await listUsers({ role: 'Recruiter', limit: 1000 });
                setRecruiters(response.users || []);
            }
        } catch (error) {
            console.error('Error loading recruiters:', error);
        } finally {
            loadingRecruitersRef.current = false;
        }
    }, [user?.role]);

    const loadEvents = useCallback(async () => {
        // Prevent multiple simultaneous fetches
        if (loadingEventsRef.current) return;
        
        try {
            loadingEventsRef.current = true;
            const response = await listEvents({ limit: 1000 });
            setEvents(response.events || []);
        } catch (error) {
            console.error('Error loading events:', error);
        } finally {
            loadingEventsRef.current = false;
        }
    }, []);

    const loadBooths = useCallback(async () => {
        // Prevent multiple simultaneous fetches
        if (loadingBoothsRef.current) return;
        
        try {
            loadingBoothsRef.current = true;
            const response = await listBooths({ limit: 1000 });
            setBooths(response.booths || []);
        } catch (error) {
            console.error('Error loading booths:', error);
        } finally {
            loadingBoothsRef.current = false;
        }
    }, []);

    // Load data when user is available or filters change
    useEffect(() => {
        if (user) {
            loadMeetingRecords();
            loadStats();
            loadRecruiters();
            loadEvents();
            loadBooths();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, location.key]);

    // Reload meeting records when filters change
    useEffect(() => {
        if (user) {
            loadMeetingRecords();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, filters.eventId, filters.boothId, filters.recruiterId, filters.status, filters.startDate, filters.endDate, filters.search, filters.page, filters.limit]);

    // Reload stats when filters change (excluding page and limit which don't affect stats)
    useEffect(() => {
        if (user) {
            loadStats();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, filters.eventId, filters.boothId, filters.recruiterId, filters.status, filters.startDate, filters.endDate, filters.search]);

    const handleFilterChange = (field, value) => {
        setFilters(prev => {
            const newFilters = {
                ...prev,
                [field]: value,
                page: 1 // Reset to first page when filters change
            };
            // Save filters to sessionStorage (excluding page, search, limit)
            try {
                const filtersToSave = {
                    recruiterId: newFilters.recruiterId,
                    eventId: newFilters.eventId,
                    boothId: newFilters.boothId,
                    status: newFilters.status,
                    startDate: newFilters.startDate,
                    endDate: newFilters.endDate,
                    sortBy: newFilters.sortBy,
                    sortOrder: newFilters.sortOrder
                };
                sessionStorage.setItem('meetingRecords_filters', JSON.stringify(filtersToSave));
            } catch (error) {
                console.error('Error saving filters to sessionStorage:', error);
            }
            return newFilters;
        });
    };

    const handlePageChange = (page) => {
        setFilters(prev => ({ ...prev, page }));
    };

    const handlePageSizeChange = (newSize) => {
        setFilters(prev => ({ ...prev, limit: newSize, page: 1 }));
    };

    // Helper function to escape CSV fields
    const escapeCSV = (value) => {
        if (value === null || value === undefined || value === '') {
            return '';
        }
        const stringValue = String(value);
        // If value contains comma, quote, or newline, wrap in quotes and escape quotes
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
    };

    // Helper function to format date consistently
    const formatDateForCSV = (date) => {
        if (!date) return '';
        try {
            const d = new Date(date);
            if (isNaN(d.getTime())) return '';
            // Format: YYYY-MM-DD HH:MM:SS
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const seconds = String(d.getSeconds()).padStart(2, '0');
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        } catch (e) {
            return '';
        }
    };

    // Helper function to format duration
    const formatDurationForCSV = (duration, startTime, endTime) => {
        if (duration !== null && duration !== undefined && duration !== '') {
            return String(duration);
        }
        if (startTime && endTime) {
            try {
                const start = new Date(startTime);
                const end = new Date(endTime);
                if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
                    return String(Math.round((end - start) / (1000 * 60)));
                }
            } catch (e) {
                // Ignore
            }
        }
        return '';
    };

    const handleExport = async () => {
        try {
            setLoadingData(true);
            
            // Check if there are column filters applied in the grid
            let hasColumnFilters = false;
            if (gridRef.current) {
                try {
                    // Check if grid has any active column filters
                    const gridInstance = gridRef.current;
                    if (gridInstance.filterSettings && gridInstance.filterSettings.columns && gridInstance.filterSettings.columns.length > 0) {
                        hasColumnFilters = true;
                        console.log('📊 Column filters detected in grid');
                    }
                } catch (e) {
                    console.warn('Could not check grid filters:', e);
                }
            }
            
            // If column filters are applied, we need to fetch all data and filter client-side
            // Otherwise, use server-side export API which is more efficient
            if (hasColumnFilters) {
                // Fetch ALL records matching current server-side filters (not paginated)
                const exportFilters = {
                    ...filters,
                    page: 1,
                    limit: 100000 // Large limit to get all records
                };
                
                console.log('📡 Fetching ALL records for export with server-side filters:', exportFilters);
                const response = await meetingRecordsAPI.getMeetingRecords(exportFilters);
                let allRecords = response.meetingRecords || [];
                
                console.log(`📊 Fetched ${allRecords.length} total records from server`);
                
                // Map records to match grid dataSource structure
                const mappedRecords = allRecords.map(r => {
                    const getFieldName = (field) => {
                        if (!field) return '';
                        if (typeof field === 'string') return field;
                        if (typeof field === 'object' && field.name) return field.name;
                        return '';
                    };
                    
                    const getFieldEmail = (field) => {
                        if (!field) return '';
                        if (typeof field === 'object' && field.email) return field.email;
                        return '';
                    };
                    
                    const getFieldResumeUrl = (field) => {
                        if (!field) return '';
                        if (typeof field === 'object' && field.resumeUrl) return field.resumeUrl;
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
                        eventName: getFieldName(r.eventId),
                        boothName: getFieldName(r.boothId),
                        recruiterName: getFieldName(r.recruiterId),
                        jobSeekerName: getFieldName(r.jobseekerId),
                        jobSeekerEmail: getFieldEmail(r.jobseekerId),
                        jobSeekerResumeUrl: getFieldResumeUrl(r.jobseekerId),
                        jobSeekerCity: getFieldCity(r.jobseekerId),
                        interpreterName: r.interpreterId ? getFieldName(r.interpreterId) : 'None',
                        messagesCount: Array.isArray(r.jobSeekerMessages) ? r.jobSeekerMessages.length : 0
                    };
                });
                
                // Apply column filters by temporarily updating grid dataSource
                let recordsToExport = mappedRecords;
                try {
                    // Save current state
                    const originalDataSource = gridRef.current.dataSource;
                    const originalPageSettings = gridRef.current.pageSettings;
                    
                    // Temporarily set all records and disable paging
                    gridRef.current.dataSource = mappedRecords;
                    gridRef.current.pageSettings = { pageSize: mappedRecords.length };
                    gridRef.current.refresh();
                    
                    // Wait for grid to process
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    // Get filtered records
                    const filteredRows = gridRef.current.getFilteredRecords();
                    
                    // Restore original state
                    gridRef.current.dataSource = originalDataSource;
                    gridRef.current.pageSettings = originalPageSettings;
                    gridRef.current.refresh();
                    
                    if (filteredRows && filteredRows.length > 0) {
                        const filteredIds = new Set(filteredRows.map(row => (row._id || row.id)));
                        recordsToExport = mappedRecords.filter(r => filteredIds.has(r._id || r.id));
                        console.log(`📊 Applied column filters: ${recordsToExport.length} records (from ${mappedRecords.length} total)`);
                    }
                } catch (gridError) {
                    console.warn('⚠️ Could not apply column filters, exporting all:', gridError);
                }
                
                // Export using client-side CSV generation
                exportToCSVClientSide(recordsToExport);
            } else {
                // No column filters - use efficient server-side export
                console.log('📡 Using server-side export API (no column filters)');
                const exportFilters = {
                    ...filters
                    // Remove pagination params for export
                };
                delete exportFilters.page;
                delete exportFilters.limit;
                
                const blob = await meetingRecordsAPI.exportCSV(exportFilters);
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = 'meeting-records.csv';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                showToast('Meeting records exported successfully', 'Success');
            }
        } catch (error) {
            console.error('Error exporting meeting records:', error);
            showToast('Failed to export meeting records', 'Error');
        } finally {
            setLoadingData(false);
        }
    };
    
    // Helper function for client-side CSV export
    const exportToCSVClientSide = (recordsToExport) => {
        // CSV Headers
        const csvHeaders = [
            'Event Name',
            'Booth',
            'Recruiter Name',
            'Recruiter Email',
            'Job Seeker First Name',
            'Job Seeker Last Name',
            'Job Seeker Email',
            'Job Seeker Phone',
            'Job Seeker Location',
            'Job Seeker Headline',
            'Job Seeker Keywords',
            'Work Experience Level',
            'Highest Education Level',
            'Employment Types',
            'Language(s)',
            'Security Clearance',
            'Veteran/Military Status',
            'Job Seeker Resume Link',
            'Interpreter',
            'Start Time',
            'End Time',
            'Duration (minutes)',
            'Status',
            'Rating',
            'Feedback',
            'Messages Count'
        ];

        // Format status labels
        const statusLabels = {
                'scheduled': 'Scheduled',
                'active': 'Active',
                'completed': 'Completed',
                'cancelled': 'Cancelled',
                'failed': 'Failed',
                'left_with_message': 'Left Message'
        };

        // Convert records to CSV rows
        const csvRows = recordsToExport.map(record => {
                // Helper functions to extract data
                const getFieldName = (field) => {
                    if (!field) return '';
                    if (typeof field === 'string') return field;
                    if (typeof field === 'object' && field.name) return field.name;
                    return '';
                };
                
                const getFieldEmail = (field) => {
                    if (!field) return '';
                    if (typeof field === 'string') return field;
                    if (typeof field === 'object' && field.email) return String(field.email).trim();
                    return '';
                };
                
                const getFieldResumeUrl = (field) => {
                    if (!field) return '';
                    // Check if already extracted (from mapping above)
                    if (typeof field === 'string' && field.startsWith('http')) return field;
                    if (typeof field === 'object' && field.resumeUrl) return String(field.resumeUrl).trim();
                    // Also check the original nested structure
                    if (record.jobseekerId && typeof record.jobseekerId === 'object') {
                        if (record.jobseekerId.resumeUrl) return String(record.jobseekerId.resumeUrl).trim();
                    }
                    return '';
                };
                
                const getFieldCity = (field) => {
                    if (!field) return '';
                    if (typeof field === 'string') return field;
                    if (typeof field === 'object' && field.city) return String(field.city).trim();
                    return '';
                };
                
                const getFieldState = (field) => {
                    if (!field) return '';
                    if (typeof field === 'string') return field;
                    if (typeof field === 'object' && field.state) return String(field.state).trim();
                    return '';
                };

                // Extract values - use mapped fields if available, otherwise extract from nested objects
                const eventName = record.eventName || getFieldName(record.eventId);
                const boothName = record.boothName || getFieldName(record.boothId);
                const recruiterName = record.recruiterName || getFieldName(record.recruiterId);
                const recruiterEmail = getFieldEmail(record.recruiterId);
                const jobSeekerName = record.jobSeekerName || getFieldName(record.jobseekerId);
                
                // Split name into first and last name
                const nameParts = jobSeekerName ? jobSeekerName.split(/\s+/) : [];
                const jobSeekerFirstName = nameParts[0] || '';
                const jobSeekerLastName = nameParts.slice(1).join(' ') || '';
                
                const jobSeekerEmail = record.jobSeekerEmail || getFieldEmail(record.jobseekerId);
                
                // Extract phone number
                const jobSeekerPhone = (record.jobseekerId && typeof record.jobseekerId === 'object' && record.jobseekerId.phoneNumber) 
                    ? String(record.jobseekerId.phoneNumber).trim() 
                    : '';
                
                const jobSeekerResumeUrl = record.jobSeekerResumeUrl || getFieldResumeUrl(record.jobseekerId);
                const jobSeekerCity = record.jobSeekerCity || getFieldCity(record.jobseekerId);
                const jobSeekerState = getFieldState(record.jobseekerId);
                
                let location = '';
                if (jobSeekerCity && jobSeekerState) {
                    location = `${jobSeekerCity}, ${jobSeekerState}`;
                } else if (jobSeekerCity) {
                    location = jobSeekerCity;
                } else if (jobSeekerState) {
                    location = jobSeekerState;
                }
                
                // Extract profile data from metadata
                const jobSeeker = record.jobseekerId;
                const profile = (jobSeeker && jobSeeker.metadata && jobSeeker.metadata.profile) ? jobSeeker.metadata.profile : null;
                const headline = profile && profile.headline ? String(profile.headline).trim() : '';
                const keywords = profile && profile.keywords ? String(profile.keywords).trim() : '';
                const workLevel = profile && profile.workLevel ? String(profile.workLevel).trim() : '';
                const educationLevel = profile && profile.educationLevel ? String(profile.educationLevel).trim() : '';
                const employmentTypes = (profile && Array.isArray(profile.employmentTypes)) 
                    ? profile.employmentTypes.filter(Boolean).join(', ') 
                    : '';
                const languages = (profile && Array.isArray(profile.languages)) 
                    ? profile.languages.filter(Boolean).join(', ') 
                    : '';
                const clearance = profile && profile.clearance ? String(profile.clearance).trim() : '';
                const veteranStatus = profile && profile.veteranStatus ? String(profile.veteranStatus).trim() : '';
                
                const interpreterName = (record.interpreterId && typeof record.interpreterId === 'object' && record.interpreterId.name) 
                    ? record.interpreterId.name 
                    : 'None';
                
                const duration = formatDurationForCSV(record.duration, record.startTime, record.endTime);
                const status = statusLabels[record.status] || record.status || '';
                const rating = (record.recruiterRating !== null && record.recruiterRating !== undefined && record.recruiterRating !== '') 
                    ? String(record.recruiterRating) 
                    : '';
                const feedback = (record.recruiterFeedback !== null && record.recruiterFeedback !== undefined) 
                    ? String(record.recruiterFeedback).trim() 
                    : '';
                const messagesCount = Array.isArray(record.jobSeekerMessages) 
                    ? String(record.jobSeekerMessages.length) 
                    : '0';

                return [
                    escapeCSV(eventName),
                    escapeCSV(boothName),
                    escapeCSV(recruiterName),
                    escapeCSV(recruiterEmail),
                    escapeCSV(jobSeekerFirstName),
                    escapeCSV(jobSeekerLastName),
                    escapeCSV(jobSeekerEmail),
                    escapeCSV(jobSeekerPhone),
                    escapeCSV(location),
                    escapeCSV(headline),
                    escapeCSV(keywords),
                    escapeCSV(workLevel),
                    escapeCSV(educationLevel),
                    escapeCSV(employmentTypes),
                    escapeCSV(languages),
                    escapeCSV(clearance),
                    escapeCSV(veteranStatus),
                    escapeCSV(jobSeekerResumeUrl),
                    escapeCSV(interpreterName),
                    escapeCSV(formatDateForCSV(record.startTime)),
                    escapeCSV(formatDateForCSV(record.endTime)),
                    escapeCSV(duration),
                    escapeCSV(status),
                    escapeCSV(rating),
                    escapeCSV(feedback),
                    escapeCSV(messagesCount)
                ];
        });

        // Build CSV content
        const csvContent = [
            csvHeaders.map(h => escapeCSV(h)).join(','),
            ...csvRows.map(row => row.join(','))
        ].join('\r\n');

        // Add BOM for Excel compatibility (UTF-8 BOM)
        const BOM = '\uFEFF';
        const finalContent = BOM + csvContent;

        // Create blob and download
        const blob = new Blob([finalContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'meeting-records.csv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showToast(`Exported ${recordsToExport.length} meeting record(s) successfully`, 'Success');
    };

    const handleExportResumes = async () => {
        try {
            setIsExportingResumes(true);
            
            // Helper function to get file extension from URL
            const getFileExtension = (url) => {
                if (!url) return 'pdf';
                const match = url.match(/\.([a-zA-Z0-9]+)(\?|$)/);
                return match ? match[1].toLowerCase() : 'pdf';
            };

            // Helper function to sanitize filename
            const sanitizeFileName = (name) => {
                return name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
            };

            // Get selected records from grid
            const selectedFromGrid = getSelectedRecordsFromGrid();
            let selectedIds = null;

            // Determine which records to process
            if (selectedFromGrid.length > 0) {
                selectedIds = selectedFromGrid;
                showToast(`Fetching resumes for ${selectedFromGrid.length} selected job seeker(s)...`, 'Info', 2000);
            } else if (selectedRecords.length > 0) {
                selectedIds = selectedRecords;
                showToast(`Fetching resumes for ${selectedRecords.length} selected job seeker(s)...`, 'Info', 2000);
            } else {
                showToast('No records selected. Fetching all job seekers matching current filters...', 'Info', 2000);
            }

            // Call the API endpoint to get job seekers with proper filtering
            const response = await meetingRecordsAPI.getJobSeekersForResumeExport(filters, selectedIds);
            const uniqueJobSeekers = response.jobSeekers || [];

            if (uniqueJobSeekers.length === 0) {
                showToast('No job seekers with resume URLs found', 'Warning');
                return;
            }

            showToast(`Downloading ${uniqueJobSeekers.length} resume(s)...`, 'Info', 3000);

            // Create zip file
            const zip = new JSZip();

            // Download each resume and add to zip
            let successCount = 0;
            let failCount = 0;
            const errors = [];

            for (let i = 0; i < uniqueJobSeekers.length; i++) {
                const jobSeeker = uniqueJobSeekers[i];
                try {
                    // Fetch the resume file through proxy endpoint to avoid CORS issues
                    const token = localStorage.getItem('token');
                    const proxyUrl = `/api/uploads/proxy/download?url=${encodeURIComponent(jobSeeker.resumeUrl)}`;
                    
                    const response = await fetch(proxyUrl, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const blob = await response.blob();
                    
                    // Validate blob - check if it's not empty
                    if (!blob || blob.size === 0) {
                        throw new Error('Downloaded file is empty');
                    }
                    
                    // Get file extension
                    const extension = getFileExtension(jobSeeker.resumeUrl);
                    const sanitizedName = sanitizeFileName(jobSeeker.name);
                    const fileName = `${sanitizedName}_${jobSeeker.id}.${extension}`;

                    // Add to zip
                    zip.file(fileName, blob);
                    successCount++;
                    console.log(`✅ Downloaded resume ${i + 1}/${uniqueJobSeekers.length}: ${fileName} (${blob.size} bytes)`);

                    // Update progress
                    if ((i + 1) % 10 === 0 || i === uniqueJobSeekers.length - 1) {
                        showToast(`Downloaded ${i + 1}/${uniqueJobSeekers.length} resumes...`, 'Info', 2000);
                    }
                } catch (error) {
                    console.error(`❌ Error downloading resume for ${jobSeeker.name} (${jobSeeker.id}):`, error);
                    console.error(`   Resume URL: ${jobSeeker.resumeUrl}`);
                    console.error(`   Error details:`, error.message, error.stack);
                    failCount++;
                    errors.push(`${jobSeeker.name}: ${error.message}`);
                }
            }

            if (successCount === 0) {
                showToast('Failed to download any resumes. Please check the resume URLs.', 'Error', 5000);
                return;
            }

            // Generate zip file
            showToast('Creating zip file...', 'Info', 2000);
            const zipBlob = await zip.generateAsync({ type: 'blob' });

            // Download the zip file
            const url = window.URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            
            // Generate filename based on filters
            let filename = 'job-seeker-resumes';
            const selectedCount = selectedFromGrid.length > 0 ? selectedFromGrid.length : selectedRecords.length;
            
            if (selectedCount > 0) {
                filename = `selected-${selectedCount}-resumes`;
            } else if (filters.eventId) {
                const event = events.find(e => e._id === filters.eventId);
                if (event) {
                    filename = `${sanitizeFileName(event.name)}-resumes`;
                }
            }
            filename += '.zip';
            
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            // Show success message with summary
            let message = `Successfully exported ${successCount} resume(s)`;
            if (failCount > 0) {
                message += `. ${failCount} resume(s) failed to download.`;
            }
            showToast(message, successCount > 0 ? 'Success' : 'Warning', 5000);

            if (errors.length > 0 && errors.length <= 5) {
                console.warn('Resume download errors:', errors);
            }
        } catch (error) {
            console.error('Error exporting resumes:', error);
            showToast(`Failed to export resumes: ${error.message}`, 'Error', 5000);
        } finally {
            setIsExportingResumes(false);
        }
    };

    const clearFilters = () => {
        if (searchInputRef.current) {
            searchInputRef.current.value = '';
        }
        // Clear sessionStorage
        try {
            sessionStorage.removeItem('meetingRecords_filters');
            sessionStorage.removeItem('meetingRecords_searchQuery');
        } catch (error) {
            console.error('Error clearing filters from sessionStorage:', error);
        }
        setFilters({
            recruiterId: '',
            eventId: '',
            boothId: '',
            status: '',
            startDate: '',
            endDate: '',
            search: '',
            page: 1,
            limit: 50,
            sortBy: 'startTime',
            sortOrder: 'desc'
        });
    };
    
    const handleSearch = () => {
        const query = (searchInputRef.current?.value || '').trim();
        setFilters(prev => ({
            ...prev,
            search: query,
            page: 1 // Reset to first page when searching
        }));
    };
    
    const handleClearSearch = () => {
        if (searchInputRef.current) {
            searchInputRef.current.value = '';
        }
        setFilters(prev => ({
            ...prev,
            search: '',
            page: 1
        }));
        // Clear from sessionStorage
        try {
            sessionStorage.removeItem('meetingRecords_searchQuery');
        } catch (error) {
            console.error('Error clearing Meeting Records search query from sessionStorage:', error);
        }
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

    const handleSelectRecord = useCallback((recordId) => {
        setSelectedRecords(prev => {
            if (prev.includes(recordId)) {
                return prev.filter(id => id !== recordId);
            } else {
                return [...prev, recordId];
            }
        });
    }, []);

    // Memoize the dataSource transformation to prevent unnecessary re-renders
    const gridDataSource = useMemo(() => {
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
        
        const getFieldEmail = (field) => {
            if (!field) return '';
            if (typeof field === 'object' && field.email) return field.email;
            return '';
        };
        
        const getFieldResumeUrl = (field) => {
            if (!field) return '';
            if (typeof field === 'object' && field.resumeUrl) return field.resumeUrl;
            return '';
        };
        
        return meetingRecords.map(r => ({
            ...r, 
            id: r._id || r.id,
            // Flatten nested fields for sorting and filtering
            eventName: getFieldName(r.eventId),
            boothName: getFieldName(r.boothId),
            recruiterName: getFieldName(r.recruiterId),
            jobSeekerName: getFieldName(r.jobseekerId),
            jobSeekerEmail: getFieldEmail(r.jobseekerId),
            jobSeekerResumeUrl: getFieldResumeUrl(r.jobseekerId),
            jobSeekerCity: getFieldCity(r.jobseekerId),
            interpreterName: r.interpreterId ? getFieldName(r.interpreterId) : 'None',
            messagesCount: Array.isArray(r.jobSeekerMessages) ? r.jobSeekerMessages.length : 0
        }));
    }, [meetingRecords]);

    // Get selected records from grid when needed (for delete, export, etc.)
    const getSelectedRecordsFromGrid = useCallback(() => {
        if (!gridRef.current) return [];
        
        try {
            // Try the most common method first for speed
            if (typeof gridRef.current.getSelectedRecords === 'function') {
                const selectedRows = gridRef.current.getSelectedRecords();
                return selectedRows.map(row => row._id || row.id).filter(Boolean);
            }
            
            // Fallback methods
            if (typeof gridRef.current.getSelectedRowsData === 'function') {
                const selectedRows = gridRef.current.getSelectedRowsData();
                return selectedRows.map(row => row._id || row.id).filter(Boolean);
            }
            
            return [];
        } catch (error) {
            console.error('Error getting selected rows:', error);
            return [];
        }
    }, []);

    // Use ref to track selection update timeout
    const selectionUpdateTimeoutRef = useRef(null);

    const handleBulkDelete = () => {
        // Get fresh selection from grid
        const currentSelection = getSelectedRecordsFromGrid();
        if (currentSelection.length === 0) {
            showToast('Please select records to delete', 'Warning');
            return;
        }
        setSelectedRecords(currentSelection);
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
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {row.eventId?.name || 'N/A'}
            </div>
        );
    };

    const boothTemplate = (props) => {
        const row = props;
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'center' }}>
                {row.boothId?.name || 'N/A'}
            </div>
        );
    };

    const recruiterTemplate = (props) => {
        const row = props;
        // For left_with_message records, show "All Recruiters in Booth" instead of specific recruiter
        if (row.status === 'left_with_message') {
            return (
                <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <span style={{ fontStyle: 'italic', color: '#6b7280' }}>All Recruiters in Booth</span>
                </div>
            );
        }
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {row.recruiterId?.name || 'N/A'}
            </div>
        );
    };

    const jobSeekerTemplate = (props) => {
        const row = props;
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {row.jobseekerId?.name || 'N/A'}
            </div>
        );
    };

    const jobSeekerEmailTemplate = (props) => {
        const row = props;
        const email = row.jobseekerId?.email || row.jobSeekerEmail || 'N/A';
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {email !== 'N/A' ? (
                    <a 
                        href={`mailto:${email}`}
                        style={{ color: '#111827', textDecoration: 'none' }}
                        onClick={(e) => e.stopPropagation()}
                        title={`Send email to ${email}`}
                        onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                        onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
                    >
                        {email}
                    </a>
                ) : (
                    <span style={{ color: '#111827' }}>N/A</span>
                )}
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
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {locationText}
            </div>
        );
    };

    const startTimeTemplate = (props) => {
        const row = props;
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {formatDateTime(row.startTime)}
            </div>
        );
    };

    const durationTemplate = (props) => {
        const row = props;
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
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
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                <span className={`status-badge status-${row.status}`}>
                    {statusLabels[row.status] || row.status}
                </span>
            </div>
        );
    };

    const ratingTemplate = (props) => {
        const row = props;
        return (
            <div className="rating-display" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
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
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {row.jobSeekerMessages?.length || 0}
            </div>
        );
    };

    const interpreterTemplate = (props) => {
        const row = props;
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
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
                    maxWidth: '300px',
                    textAlign: 'center',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center'
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
                                    onClick={handleExportResumes}
                                    disabled={isExportingResumes || loadingData}
                                    aria-label="Export job seeker resumes as zip file"
                                >
                                    {isExportingResumes ? 'Exporting Resumes...' : 'Export Resumes'}
                                </ButtonComponent>
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
                                <div className="stat-value">
                                    {stats.averageDuration && !isNaN(stats.averageDuration) 
                                        ? formatDuration(Math.round(stats.averageDuration)) 
                                        : 'N/A'}
                                </div>
                            </div>
                            <div className="stat-card">
                                <h3>Avg Rating</h3>
                                <div className="stat-value">
                                    {stats.averageRating ? `${stats.averageRating.toFixed(1)}/5` : 'N/A'}
                                </div>
                            </div>
                        </div>

                        {/* Search and Filter Row */}
                        <div className="mr-filters-row" style={{ marginBottom: 12, paddingLeft: '20px', paddingRight: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {/* Event Filter */}
                            <div style={{ width: '200px', flexShrink: 0 }}>
                                <DropDownListComponent
                                    id="event-filter-dropdown"
                                    dataSource={[{ value: '', text: 'All Events' }, ...events.map(e => ({ value: e._id, text: e.name }))]}
                                    fields={{ value: 'value', text: 'text' }}
                                    value={filters.eventId}
                                    change={(e) => handleFilterChange('eventId', e.value || '')}
                                    placeholder="All Events"
                                    cssClass="filter-dropdown"
                                    popupHeight="300px"
                                    width="100%"
                                />
                            </div>
                            {/* Booth Filter */}
                            <div style={{ width: '200px', flexShrink: 0 }}>
                                <DropDownListComponent
                                    id="booth-filter-dropdown"
                                    dataSource={[{ value: '', text: 'All Booths' }, ...booths.map(b => ({ value: b._id, text: b.name }))]}
                                    fields={{ value: 'value', text: 'text' }}
                                    value={filters.boothId}
                                    change={(e) => handleFilterChange('boothId', e.value || '')}
                                    placeholder="All Booths"
                                    cssClass="filter-dropdown"
                                    popupHeight="300px"
                                    width="100%"
                                />
                            </div>
                            {/* Search Section */}
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: 'auto' }}>
                                <div style={{ marginBottom: 0 }}>
                                    <input
                                        ref={searchInputRef}
                                        id="meeting-records-search-input"
                                        type="text"
                                        defaultValue=""
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleSearch();
                                            }
                                        }}
                                        placeholder="Search by name, email, or any field..."
                                        style={{ width: '300px', marginBottom: 0, padding: '10px 12px', borderRadius: '10px', border: '1px solid #d1d5db', fontSize: '14px' }}
                                        className="mr-search-input-native"
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
                                {((searchInputRef.current && searchInputRef.current.value) || filters.search) && (
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
                        <div className="data-grid-container" style={{ position: 'relative' }}>
                            {loadingData && (
                                <div className="mr-grid-loading-overlay">
                                    <div className="mr-loading-container">
                                        <div className="mr-loading-spinner" aria-label="Loading meeting records" role="status" aria-live="polite"></div>
                                        <div className="mr-loading-text">Loading meeting records...</div>
                                    </div>
                                </div>
                            )}
                            <GridComponent
                                ref={gridRef}
                                dataSource={gridDataSource}
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
                                enableHover={true}
                                allowRowDragAndDrop={false}
                            >
                                <ColumnsDirective>
                                    {['Admin', 'GlobalSupport'].includes(user?.role) && (
                                        <ColumnDirective 
                                            type='checkbox' 
                                            width='50' 
                                        />
                                    )}
                                    <ColumnDirective field='id' headerText='' width='0' isPrimaryKey={true} visible={false} showInColumnChooser={false} />
                                    <ColumnDirective field='eventName' headerText='Event' width='150' clipMode='EllipsisWithTooltip' template={eventTemplate} allowFiltering={true} textAlign='Center' />
                                    <ColumnDirective field='boothName' headerText='Booth' width='150' clipMode='EllipsisWithTooltip' template={boothTemplate} allowFiltering={true} textAlign='Center' />
                                    <ColumnDirective field='recruiterName' headerText='Recruiter' width='150' clipMode='EllipsisWithTooltip' template={recruiterTemplate} allowFiltering={true} textAlign='Center' />
                                    <ColumnDirective field='jobSeekerName' headerText='Job Seeker' width='180' clipMode='EllipsisWithTooltip' template={jobSeekerTemplate} allowFiltering={true} textAlign='Center' />
                                    <ColumnDirective field='jobSeekerEmail' headerText='Job Seeker Email' width='220' clipMode='EllipsisWithTooltip' template={jobSeekerEmailTemplate} allowFiltering={true} textAlign='Center' />
                                    <ColumnDirective field='jobSeekerCity' headerText='Location' width='150' clipMode='EllipsisWithTooltip' template={locationTemplate} allowFiltering={true} textAlign='Center' />
                                    <ColumnDirective field='startTime' headerText='Start Time' width='180' clipMode='EllipsisWithTooltip' template={startTimeTemplate} allowFiltering={true} textAlign='Center' />
                                    <ColumnDirective field='duration' headerText='Duration' width='120' textAlign='Center' template={durationTemplate} allowFiltering={true} />
                                    <ColumnDirective field='status' headerText='Status' width='130' textAlign='Center' template={statusTemplate} allowFiltering={true} />
                                    <ColumnDirective field='recruiterRating' headerText='Rating' width='150' textAlign='Center' template={ratingTemplate} allowFiltering={true} />
                                    <ColumnDirective field='recruiterFeedback' headerText='Meeting Notes' width='300' clipMode='EllipsisWithTooltip' template={meetingNotesTemplate} allowFiltering={true} type='string' textAlign='Center' />
                                    <ColumnDirective field='messagesCount' headerText='Messages' width='100' textAlign='Center' template={messagesTemplate} allowFiltering={true} />
                                    <ColumnDirective field='interpreterName' headerText='Interpreter' width='150' clipMode='EllipsisWithTooltip' template={interpreterTemplate} allowFiltering={true} textAlign='Center' />
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
