import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRoleMessages } from '../../contexts/RoleMessagesContext';
import { useNavigate } from 'react-router-dom';
import { jobSeekerInterestsAPI } from '../../services/jobSeekerInterests';
import { listEvents } from '../../services/events';
import { listUsers } from '../../services/users';
import { listBooths } from '../../services/booths';
import AdminHeader from '../Layout/AdminHeader';
import { useRecruiterBooth } from '../../hooks/useRecruiterBooth';
import AdminSidebar from '../Layout/AdminSidebar';
import { GridComponent, ColumnsDirective, ColumnDirective, Inject as GridInject, Page, Sort, Filter, Toolbar as GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu } from '@syncfusion/ej2-react-grids';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { Input } from '../UI/FormComponents';
import filterIcon from '../../assets/filter.png';
import JobSeekerProfileModal from '../common/JobSeekerProfileModal';
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

    const [interests, setInterests] = useState([]);
    const [recruiters, setRecruiters] = useState([]);
    const [events, setEvents] = useState([]);
    const [booths, setBooths] = useState([]);
    const [legacyEventIds, setLegacyEventIds] = useState([]);
    const [loadingData, setLoadingData] = useState(true);
    const toastRef = useRef(null);
    const gridRef = useRef(null);
    const initialLoadDone = useRef(false);
    const loadingInterestsRef = useRef(false);
    const loadingRecruitersRef = useRef(false);
    const loadingEventsRef = useRef(false);
    const loadingBoothsRef = useRef(false);
    const fetchInProgress = useRef(false);

    // Filters
    const [filters, setFilters] = useState({
        recruiterId: '',
        eventId: '',
        boothId: '',
        search: '',
        page: 1,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'desc'
    });
    
    // Search input ref (uncontrolled to avoid live filtering on typing)
    const searchInputRef = useRef(null);

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

    // Job Seeker Profile Modal state
    const [showJobSeekerModal, setShowJobSeekerModal] = useState(false);
    const [selectedJobSeekerForModal, setSelectedJobSeekerForModal] = useState(null);

    // Build Event dropdown options, ensuring that the currently selected legacy
    // event stays in the list even if the latest API call returned no interests
    // for that legacy ID (so the dropdown doesn't reset to "All Events").
    const getEventFilterOptions = () => {
        const options = [
            { value: '', text: 'All Events' },
            ...events.map(e => ({ value: e._id, text: e.name })),
            ...legacyEventIds.map(legacyId => ({
                value: `legacy_${legacyId}`,
                text: `Legacy Event (${legacyId})`
            }))
        ];

        if (filters.eventId && filters.eventId.startsWith('legacy_')) {
            const exists = options.some(opt => opt.value === filters.eventId);
            if (!exists) {
                const legacyId = filters.eventId.replace('legacy_', '');
                options.push({
                    value: filters.eventId,
                    text: `Legacy Event (${legacyId})`
                });
            }
        }

        return options;
    };

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

    // Sync header and content horizontal scrolling
    useEffect(() => {
        let scrollSyncActive = false;

        const syncScroll = () => {
            const grids = document.querySelectorAll('.jobseeker-interests-container .e-grid, .data-grid-container .e-grid');
            grids.forEach(grid => {
                const header = grid.querySelector('.e-gridheader');
                const content = grid.querySelector('.e-content');
                if (!header || !content) return;

                // Force enable scrolling on header
                header.style.overflowX = 'auto';
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
                header.scrollLeft = content.scrollLeft;
            });
        };

        // Run immediately and after delays
        syncScroll();
        const timer1 = setTimeout(syncScroll, 100);
        const timer2 = setTimeout(syncScroll, 500);
        const timer3 = setTimeout(syncScroll, 1000);
        
        const observer = new MutationObserver(() => {
            setTimeout(syncScroll, 50);
        });
        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
            clearTimeout(timer3);
            observer.disconnect();
        };
    }, [interests, loadingData]);

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
                // Handle legacy event IDs (format: "legacy_<id>")
                const filtersForAPI = { ...filters };
                if (filtersForAPI.eventId && filtersForAPI.eventId.startsWith('legacy_')) {
                    // Extract the legacy event ID
                    filtersForAPI.eventId = filtersForAPI.eventId.replace('legacy_', '');
                }
                console.log('Loading interests with filters:', filtersForAPI);
                const response = await jobSeekerInterestsAPI.getInterests(filtersForAPI);

                if (cancelled) return;

                const interests = response.interests || [];
                setInterests(interests);

                // Extract unique legacy event IDs from interests for filter dropdown
                // Accumulate all legacy events found, don't replace the list
                setLegacyEventIds(prevLegacyIds => {
                    const newLegacyEventIds = new Set(prevLegacyIds);
                    interests.forEach(interest => {
                        if (interest.legacyEventId && !interest.event) {
                            // Add legacy event ID (handle both string and ObjectId)
                            const legacyId = String(interest.legacyEventId);
                            newLegacyEventIds.add(legacyId);
                        }
                    });
                    return Array.from(newLegacyEventIds);
                });

                // Update pagination from API response
                if (response.pagination) {
                    console.log('Setting pagination:', response.pagination);
                    setPagination(response.pagination);
                }

                // Calculate stats
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
            } catch (error) {
                console.error('Error loading data:', error);
            } finally {
                fetchInProgress.current = false;
                setLoadingData(false);
            }
        };

        fetchAllData();

        return () => {
            cancelled = true;
        };
    }, [user, filters]);

    // Load recruiters - only once on mount for Admin/GlobalSupport
    const loadRecruiters = useCallback(async () => {
        // Prevent multiple simultaneous fetches
        if (loadingRecruitersRef.current) return;
        if (initialLoadDone.current) return; // Already loaded
        if (user?.role === 'Recruiter') return; // Recruiters don't need this
        
        try {
            loadingRecruitersRef.current = true;
            const recruiterResponse = await listUsers({ role: 'Recruiter', limit: 1000 });
            setRecruiters(recruiterResponse.users || []);
        } catch (error) {
            console.error('Error loading recruiters:', error);
        } finally {
            loadingRecruitersRef.current = false;
        }
    }, [user?.role]);

    // Load events - only once on mount
    const loadEvents = useCallback(async () => {
        // Prevent multiple simultaneous fetches
        if (loadingEventsRef.current) return;
        if (initialLoadDone.current) return; // Already loaded
        
        try {
            loadingEventsRef.current = true;
            const eventsResponse = await listEvents({ limit: 1000 });
            setEvents(eventsResponse.events || []);
        } catch (error) {
            console.error('Error loading events:', error);
        } finally {
            loadingEventsRef.current = false;
        }
    }, []);

    // Load booths - only once on mount
    const loadBooths = useCallback(async () => {
        // Prevent multiple simultaneous fetches
        if (loadingBoothsRef.current) return;
        if (initialLoadDone.current) return; // Already loaded
        
        try {
            loadingBoothsRef.current = true;
            const boothsResponse = await listBooths({ limit: 1000 });
            setBooths(boothsResponse.booths || []);
        } catch (error) {
            console.error('Error loading booths:', error);
        } finally {
            loadingBoothsRef.current = false;
        }
    }, []);

    // Load interests with current filters
    const loadInterests = useCallback(async () => {
        // Prevent multiple simultaneous fetches
        if (loadingInterestsRef.current) return;
        
        try {
            loadingInterestsRef.current = true;
            setLoadingData(true);
            
            console.log('Loading interests with filters:', filters);
            const response = await jobSeekerInterestsAPI.getInterests(filters);

            console.log('API Response:', response);

            const interests = response.interests || [];
            setInterests(interests);
                
            // Extract unique legacy event IDs from interests for filter dropdown
            // Accumulate all legacy events found, don't replace the list
            setLegacyEventIds(prevLegacyIds => {
                const newLegacyEventIds = new Set(prevLegacyIds);
                interests.forEach(interest => {
                    if (interest.legacyEventId && !interest.event) {
                        // Add legacy event ID (handle both string and ObjectId)
                        const legacyId = String(interest.legacyEventId);
                        newLegacyEventIds.add(legacyId);
                    }
                });
                return Array.from(newLegacyEventIds);
            });

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
            console.error('Error loading data:', error);
            showToast(`Failed to load job seeker interests: ${error.message}`, 'Error', 5000);
        } finally {
            loadingInterestsRef.current = false;
            setLoadingData(false);
        }
    }, [filters, showToast]);

    // Load recruiters, events, and booths on initial mount
    useEffect(() => {
        if (!user) return;
        if (!['Admin', 'GlobalSupport', 'Recruiter'].includes(user.role)) return;
        if (initialLoadDone.current) return;

        loadRecruiters();
        loadEvents();
        loadBooths();
        initialLoadDone.current = true;
    }, [user, loadRecruiters, loadEvents, loadBooths]);

    // Load interests when filters change
    useEffect(() => {
        if (!user) return;
        if (!['Admin', 'GlobalSupport', 'Recruiter'].includes(user.role)) return;

        loadInterests();
    }, [user, loadInterests]);

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({
            ...prev,
            [key]: value,
            page: 1 // Reset to first page when filters change
        }));
    };

    const clearFilters = () => {
        if (searchInputRef.current) {
            searchInputRef.current.value = '';
        }
        setFilters({
            recruiterId: '',
            eventId: '',
            boothId: '',
            search: '',
            page: 1,
            limit: 50,
            sortBy: 'createdAt',
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
    };

    const handleExport = async () => {
        try {
            console.log('📤 Starting export...');
            setLoadingData(true);
            
            // Build export filters (same as current filters but without pagination)
            // Handle legacy event IDs (format: "legacy_<id>")
            let eventIdForExport = filters.eventId || '';
            if (eventIdForExport.startsWith('legacy_')) {
                // Extract the legacy event ID
                eventIdForExport = eventIdForExport.replace('legacy_', '');
            }
            
            const exportFilters = {
                eventId: eventIdForExport,
                boothId: filters.boothId || '',
                recruiterId: filters.recruiterId || '',
                search: filters.search || ''
            };
            
            // Remove empty filters
            Object.keys(exportFilters).forEach(key => {
                if (exportFilters[key] === '') {
                    delete exportFilters[key];
                }
            });
            
            console.log('📋 Export filters:', exportFilters);
            console.log('📋 Current filters state:', filters);
            
            const blob = await jobSeekerInterestsAPI.exportCSV(exportFilters);
            console.log('✅ Received blob:', blob?.size, 'bytes, type:', blob?.type);
            
            // Log blob details for debugging
            if (blob) {
                console.log('📦 Blob details:', {
                    size: blob.size,
                    type: blob.type,
                    hasData: blob.size > 0
                });
            }
            
            // Check if blob is valid
            if (!blob || blob.size === 0) {
                throw new Error('Empty response from server');
            }
            
            // Check if response is actually an error (JSON error response)
            if (blob.type === 'application/json') {
                const text = await blob.text();
                const errorData = JSON.parse(text);
                throw new Error(errorData.message || errorData.error || 'Export failed');
            }
            
            // Create download link and trigger download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'job-seeker-interests.csv';
            document.body.appendChild(a);
            
            // Use requestAnimationFrame to ensure DOM is ready
            requestAnimationFrame(() => {
                a.click();
                
                // Clean up after a delay to ensure download starts
                setTimeout(() => {
                    try {
                        window.URL.revokeObjectURL(url);
                        if (document.body.contains(a)) {
                            document.body.removeChild(a);
                        }
                    } catch (cleanupError) {
                        console.warn('Cleanup error (non-critical):', cleanupError);
                    }
                }, 300);
            });
            
            showToast('Job seeker interests exported successfully', 'Success');
        } catch (error) {
            console.error('Error exporting interests:', error);
            const errorMessage = error.response?.data?.message || error.message || 'Failed to export job seeker interests';
            showToast(errorMessage, 'Error', 5000);
        } finally {
            setLoadingData(false);
        }
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

    const actionsTemplate = (props) => {
        const row = props;
        // Handle both populated jobSeeker object and jobSeeker ID
        const jobSeekerData = row.jobSeeker || (row.jobSeekerId ? { _id: row.jobSeekerId } : null) || (row.legacyJobSeekerId ? { _id: row.legacyJobSeekerId } : null);
        
        if (!jobSeekerData) {
            return <div style={{ padding: '8px 0', color: '#999' }}>N/A</div>;
        }
        
        return (
            <div style={{ display: 'flex', gap: '8px' }}>
                <ButtonComponent 
                    cssClass="e-primary e-small" 
                    onClick={() => {
                        setSelectedJobSeekerForModal(jobSeekerData);
                        setShowJobSeekerModal(true);
                    }}
                    aria-label="View job seeker details"
                >
                    View Job Seeker Detail
                </ButtonComponent>
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

                            {/* Search and Event Filter Row */}
                            <div className="jsi-filters-row" style={{ marginBottom: 12, paddingLeft: '20px', paddingRight: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                {/* Event Filter */}
                                <div style={{ width: '200px', flexShrink: 0 }}>
                                    <DropDownListComponent
                                        id="event-filter-dropdown-main"
                                        dataSource={getEventFilterOptions()}
                                        fields={{ value: 'value', text: 'text' }}
                                        value={filters.eventId}
                                        change={(e) => handleFilterChange('eventId', e.value || '')}
                                        placeholder="All Events"
                                        cssClass="event-filter-dropdown"
                                        popupHeight="300px"
                                        width="100%"
                                    />
                                </div>
                                {/* Booth Filter - Only for Admin/GlobalSupport */}
                                {['Admin', 'GlobalSupport'].includes(user?.role) && (
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
                                )}
                                {/* Search Section - Right */}
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: 'auto' }}>
                                    <div style={{ marginBottom: 0 }}>
                                        <input
                                            ref={searchInputRef}
                                            id="jsi-search-input"
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
                                            className="jsi-search-input-native"
                                        />
                                    </div>
                                    <ButtonComponent
                                        cssClass="e-primary e-small"
                                        onClick={handleSearch}
                                        disabled={loadingData}
                                        aria-label="Search job seeker interests"
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
                                    <ButtonComponent
                                        cssClass="e-primary e-small"
                                        onClick={handleExport}
                                        disabled={loadingData}
                                        aria-label="Export job seeker interests to CSV"
                                        style={{ minWidth: '100px', height: '44px' }}
                                    >
                                        Export CSV
                                    </ButtonComponent>
                                </div>
                            </div>

                            {/* Data Grid */}
                            <div className="data-grid-container" style={{ position: 'relative' }}>
                                {loadingData && (
                                    <div className="jsi-grid-loading-overlay">
                                        <div className="jsi-loading-container">
                                            <div className="jsi-loading-spinner" aria-label="Loading job seeker interests" role="status" aria-live="polite"></div>
                                            <div className="jsi-loading-text">Loading job seeker interests...</div>
                                        </div>
                                    </div>
                                )}
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
                                    showColumnMenu={true}
                                    showColumnChooser={true}
                                    allowResizing={true}
                                    allowReordering={true}
                                    toolbar={['ColumnChooser']}
                                    selectionSettings={{ type: 'None' }}
                                    enableHover={true}
                                    allowRowDragAndDrop={false}
                                >
                                    <ColumnsDirective>
                                        <ColumnDirective field='id' headerText='' width='0' isPrimaryKey={true} visible={false} showInColumnChooser={false} />
                                        <ColumnDirective field='jobSeekerName' headerText='Job Seeker' width='220' clipMode='EllipsisWithTooltip' template={jobSeekerTemplate} allowFiltering={true} />
                                        <ColumnDirective field='eventName' headerText='Event' width='180' clipMode='EllipsisWithTooltip' template={eventTemplate} allowFiltering={true} />
                                        <ColumnDirective field='boothName' headerText='Booth' width='180' clipMode='EllipsisWithTooltip' template={boothTemplate} allowFiltering={true} />
                                        <ColumnDirective field='jobSeekerCity' headerText='Location' width='150' clipMode='EllipsisWithTooltip' template={locationTemplate} allowFiltering={true} />
                                        <ColumnDirective field='createdAt' headerText='Date Expressed' width='180' clipMode='EllipsisWithTooltip' template={dateExpressedTemplate} allowFiltering={true} />
                                        <ColumnDirective 
                                            headerText='Actions' 
                                            width='200' 
                                            allowSorting={false} 
                                            allowFiltering={false}
                                            template={actionsTemplate}
                                            showInColumnChooser={true}
                                            visible={true}
                                        />
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
};

export default JobSeekerInterests;