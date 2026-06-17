import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRoleMessages } from '../../contexts/RoleMessagesContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { jobSeekerInterestsAPI } from '../../services/jobSeekerInterests';
import { listEvents } from '../../services/events';
import { listUsers } from '../../services/users';
import { listBooths } from '../../services/booths';
import AdminHeader from '../Layout/AdminHeader';
import { useRecruiterBooth } from '../../hooks/useRecruiterBooth';
import AdminSidebar from '../Layout/AdminSidebar';
import { GridComponent, ColumnsDirective, ColumnDirective, Inject as GridInject, Page, Sort, Filter, Toolbar as GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu, Freeze } from '@syncfusion/ej2-react-grids';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { Input } from '../UI/FormComponents';
import filterIcon from '../../assets/filter.png';
import JobSeekerProfileModal from '../common/JobSeekerProfileModal';
import AdvancedJobSeekerSearch from '../JobSeekerManagement/AdvancedJobSeekerSearch';
import { openResumeInNewTab } from '../../utils/resumeViewer';
import JSZip from 'jszip';
import { SYNC_GRID_FILTER_SETTINGS, SYNC_GRID_CHECKBOX_COLUMN_PROPS, labelsToFilterText } from '../../utils/syncfusionGridHelpers';
import {
    JOB_CATEGORY_LIST,
    EXPERIENCE_LEVEL_LIST,
    EDUCATION_LEVEL_LIST,
    JOB_TYPE_LIST,
    MILITARY_EXPERIENCE_LIST,
    LANGUAGE_LIST
} from '../../constants/options';
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
        
        // The filter-icon image is styled entirely via CSS (--filter-icon-url), so no
        // per-mutation DOM observer is needed. We only intercept clicks on the grid
        // element to open the column menu. Runs once on mount.
        const gridElement = grid.element;
        if (gridElement) {
            gridElement.addEventListener('click', handleFilterIconClick, true);
        }
        
        return () => {
            document.documentElement.style.removeProperty('--filter-icon-url');
            if (gridElement) {
                gridElement.removeEventListener('click', handleFilterIconClick, true);
            }
        };
    }, []);

    const [interests, setInterests] = useState([]);
    const [recruiters, setRecruiters] = useState([]);
    const [events, setEvents] = useState([]);
    const [booths, setBooths] = useState([]);
    const [legacyEventIds, setLegacyEventIds] = useState([]);
    const [loadingData, setLoadingData] = useState(true);
    const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
    const [selectedInterests, setSelectedInterests] = useState([]);
    const [isDeleting, setIsDeleting] = useState(false);
    const toastRef = useRef(null);
    const gridRef = useRef(null);
    const selectionUpdateRef = useRef(false); // Prevent multiple simultaneous selection updates
    const initialLoadDone = useRef(false);
    const loadingInterestsRef = useRef(false);
    const loadRequestGenRef = useRef(0); // Generation counter to discard stale API responses
    const loadingRecruitersRef = useRef(false);
    const loadingEventsRef = useRef(false);
    const loadingBoothsRef = useRef(false);
    const fetchInProgress = useRef(false);
    const pendingFetchRequestedRef = useRef(false);

    // Keep the search query and filters in the URL (?search=, ?recruiter=,
    // ?event=, ?booth=, ?sortBy=, ?sortOrder=) so they survive navigation and
    // reloads without any browser storage.
    const [searchParams, setSearchParams] = useSearchParams();

    // Filters - initialised from the URL query params on mount
    const [filters, setFilters] = useState(() => ({
        recruiterId: searchParams.get('recruiter') || '',
        eventId: searchParams.get('event') || '',
        boothId: searchParams.get('booth') || '',
        search: searchParams.get('search') || '',
        page: 1,
        limit: 50,
        sortBy: searchParams.get('sortBy') || 'createdAt',
        sortOrder: searchParams.get('sortOrder') || 'desc'
    }));
    const [searchTriggerNonce, setSearchTriggerNonce] = useState(0);

    // Search input ref (uncontrolled to avoid live filtering on typing)
    const searchInputRef = useRef(null);

    // Mirror the filters/search into the URL whenever they change.
    useEffect(() => {
        setSearchParams((prev) => {
            const params = new URLSearchParams(prev);
            const setOrDelete = (key, value, defaultValue = '') => {
                const v = (value ?? '').toString().trim();
                if (v && v !== defaultValue) {
                    params.set(key, v);
                } else {
                    params.delete(key);
                }
            };
            setOrDelete('search', filters.search);
            setOrDelete('recruiter', filters.recruiterId);
            setOrDelete('event', filters.eventId);
            setOrDelete('booth', filters.boothId);
            setOrDelete('sortBy', filters.sortBy, 'createdAt');
            setOrDelete('sortOrder', filters.sortOrder, 'desc');
            return params;
        }, { replace: true });
    }, [filters.search, filters.recruiterId, filters.eventId, filters.boothId, filters.sortBy, filters.sortOrder, setSearchParams]);

    // Keep the (uncontrolled) search input in sync with the ?search= query param.
    useEffect(() => {
        if (searchInputRef.current) {
            searchInputRef.current.value = filters.search || '';
        }
    }, [filters.search]);


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
    const [selectedEventIdForModal, setSelectedEventIdForModal] = useState(null);
    const [activeTab, setActiveTab] = useState('list');
    const supportsInterestsAiTab = ['Admin', 'GlobalSupport', 'Recruiter'].includes(user?.role);

    useEffect(() => {
        if (!supportsInterestsAiTab && activeTab !== 'list') {
            setActiveTab('list');
        }
    }, [supportsInterestsAiTab, activeTab]);

    const handleViewJobSeekerFromAi = useCallback((jobSeeker, eventId) => {
        // Defer past Syncfusion sibling reconciliation (see InterpreterCategories form modal comment)
        window.requestAnimationFrame(() => {
            setSelectedJobSeekerForModal(jobSeeker);
            setSelectedEventIdForModal(eventId || null);
            setShowJobSeekerModal(true);
        });
    }, []);

    // Resume export state
    const [isExportingResumes, setIsExportingResumes] = useState(false);

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

    // Get selected interests from grid (return string IDs for reliable comparison)
    const getSelectedInterestsFromGrid = useCallback(() => {
        if (!gridRef.current) return [];
        
        try {
            // Use getSelectedRecords - most reliable method for Syncfusion Grid
            if (typeof gridRef.current.getSelectedRecords === 'function') {
                const rows = gridRef.current.getSelectedRecords();
                // Each row has 'id' field that we set to r._id when creating gridDataSource
                const ids = rows.map(row => String(row.id || '')).filter(Boolean);
                return ids;
            }
            return [];
        } catch (error) {
            console.error('Error getting selected rows:', error);
            return [];
        }
    }, []);

    // Frozen columns rely on native Syncfusion movable/frozen pane scrolling.
    useEffect(() => undefined, [interests, loadingData]);

    // Load all data when component mounts or filters change
    useEffect(() => {
        if (!user) return;

        // Only make request if user role is valid
        if (!['Admin', 'GlobalSupport', 'Recruiter'].includes(user.role)) {
            return;
        }

        // Prevent duplicate requests; keep the latest intent queued.
        if (fetchInProgress.current) {
            pendingFetchRequestedRef.current = true;
            console.log('Fetch already in progress, queueing latest request...');
            return;
        }

        let cancelled = false;

        const fetchAllData = async () => {
            fetchInProgress.current = true;
            // Track this specific request so stale/overlapping responses are discarded
            // (covers the pendingFetchRequestedRef re-invoke path that bypasses cleanup).
            const gen = ++loadRequestGenRef.current;
            
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

                if (cancelled || gen !== loadRequestGenRef.current) return;

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
                if (!cancelled && pendingFetchRequestedRef.current) {
                    pendingFetchRequestedRef.current = false;
                    fetchAllData();
                }
            }
        };

        // Debounce the fetch so rapid Search/Clear (and filter changes) collapse
        // into a single request instead of firing one per keystroke/click.
        const debounceTimer = setTimeout(fetchAllData, 250);

        return () => {
            cancelled = true;
            clearTimeout(debounceTimer);
        };
    }, [user, filters, searchTriggerNonce]);

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
        // Track this specific request so stale responses can be discarded
        const gen = ++loadRequestGenRef.current;

        try {
            setLoadingData(true);
            
            console.log('Loading interests with filters:', filters);
            const response = await jobSeekerInterestsAPI.getInterests(filters);

            console.log('API Response:', response);

            // Discard results if a newer request has already started
            if (gen !== loadRequestGenRef.current) return;

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
            if (gen === loadRequestGenRef.current) {
                console.error('Error loading data:', error);
                showToast(`Failed to load job seeker interests: ${error.message}`, 'Error', 5000);
            }
        } finally {
            if (gen === loadRequestGenRef.current) {
                setLoadingData(false);
            }
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
        if (query) {
            console.log('🔍 Searching for:', query);
            showToast(`Searching for "${query}"...`, 'Info', 1500);
        }
        setSearchTriggerNonce((prev) => prev + 1);
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
        showToast('Search cleared', 'Success', 1500);
        // Bump the nonce like handleSearch so the fetch effect always re-runs, even
        // when search was already empty (otherwise clearing could be a stale no-op).
        setSearchTriggerNonce((prev) => prev + 1);
        setFilters(prev => ({
            ...prev,
            search: '',
            page: 1
        }));
    };

    const handleBulkDelete = () => {
        if (selectedInterests.length === 0) {
            showToast('Please select items to delete', 'Warning');
            return;
        }
        setConfirmBulkDeleteOpen(true);
    };

    const confirmBulkDelete = async () => {
        if (selectedInterests.length === 0) return;
        
        try {
            await jobSeekerInterestsAPI.bulkDelete(selectedInterests);
            showToast(`Successfully deleted ${selectedInterests.length} interest(s)`, 'Success');
            setSelectedInterests([]);
            await loadInterests();
        } catch (e) {
            console.error('Bulk delete failed', e);
            const msg = e?.response?.data?.message || 'Failed to delete selected items';
            showToast(msg, 'Error', 5000);
        } finally {
            setConfirmBulkDeleteOpen(false);
        }
    };

    const cancelBulkDelete = () => {
        setConfirmBulkDeleteOpen(false);
    };

    const handleRowSelected = useCallback(() => {
        // Prevent multiple simultaneous updates
        if (selectionUpdateRef.current) return;
        
        selectionUpdateRef.current = true;
        
        // Use requestAnimationFrame to batch updates and avoid blocking the UI
        requestAnimationFrame(() => {
            if (gridRef.current) {
                try {
                    const selectedRecords = gridRef.current.getSelectedRecords();
                    const selectedIds = selectedRecords.map(record => record.id || record._id);
                    setSelectedInterests(selectedIds);
                } catch (error) {
                    console.warn('Error getting selected records:', error);
                }
            }
            selectionUpdateRef.current = false;
        });
    }, []);

    const handleSelectAll = () => {
        if (gridRef.current) {
            gridRef.current.selectRows(Array.from({ length: gridRef.current.currentViewData.length }, (_, i) => i));
        }
    };

    const handleDeselectAll = () => {
        if (gridRef.current) {
            gridRef.current.clearSelection();
        }
        setSelectedInterests([]);
    };

    // Memoize grid dataSource to prevent expensive transformations on every render
    const gridDataSource = useMemo(() => {
        return interests.map(r => {
            // Helper to get profile
            const getProfile = (jobSeeker) => {
                if (!jobSeeker || typeof jobSeeker !== 'object') return null;
                if (jobSeeker.metadata?.profile) return jobSeeker.metadata.profile;
                if (typeof jobSeeker.metadata === 'string') {
                    try {
                        return JSON.parse(jobSeeker.metadata)?.profile || null;
                    } catch (e) {
                        return null;
                    }
                }
                return null;
            };

            // Split name
            const name = r.jobSeeker?.name || '';
            const nameParts = name ? name.trim().split(/\s+/) : [];
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';

            // Get profile
            const profile = getProfile(r.jobSeeker);
            const getLabelFromValueLocal = (value, optionsList) => {
                if (value === null || value === undefined || value === '') return '';
                const s = String(value).trim();
                const opt = optionsList.find(o => (o.value || '').toString() === s || (o.name || '').toString() === s);
                return opt ? (opt.name || opt.value || s) : s;
            };
            const getLabelsArrayFromValuesLocal = (values, optionsList) => {
                if (!Array.isArray(values)) return [];
                return values
                    .map((value) => getLabelFromValueLocal(value, optionsList))
                    .filter(Boolean);
            };
            const primaryExperienceValue = Array.isArray(profile?.primaryExperience)
                ? profile.primaryExperience.find(Boolean) || ''
                : profile?.primaryExperience || '';

            return {
                ...r, 
                id: r._id,
                // Flatten nested fields for sorting
                jobSeekerName: name || (r.legacyJobSeekerId ? 'Legacy User' : ''),
                jobSeekerFirstName: firstName,
                jobSeekerLastName: lastName,
                jobSeekerEmail: r.jobSeeker?.email || '',
                jobSeekerPhone: r.jobSeeker?.phoneNumber || '',
                jobSeekerCity: r.jobSeeker?.city || '',
                jobSeekerState: r.jobSeeker?.state || '',
                jobSeekerCountry: r.jobSeeker?.country || '',
                jobSeekerHeadline: profile?.headline || '',
                jobSeekerKeywords: profile?.keywords || '',
                jobSeekerPrimaryExperience: getLabelFromValueLocal(primaryExperienceValue, JOB_CATEGORY_LIST),
                jobSeekerWorkLevel: getLabelFromValueLocal(profile?.workLevel || '', EXPERIENCE_LEVEL_LIST),
                jobSeekerEducationLevel: getLabelFromValueLocal(profile?.educationLevel || '', EDUCATION_LEVEL_LIST),
                jobSeekerEmploymentTypes: labelsToFilterText(getLabelsArrayFromValuesLocal(profile?.employmentTypes || [], JOB_TYPE_LIST)),
                jobSeekerLanguages: labelsToFilterText(getLabelsArrayFromValuesLocal(profile?.languages || [], LANGUAGE_LIST)),
                jobSeekerVeteranStatus: getLabelFromValueLocal(profile?.veteranStatus || '', MILITARY_EXPERIENCE_LIST),
                jobSeekerResumeId: r.jobSeeker?.resolvedResume?.resumeId || '',
                jobSeekerResumeUrl: r.jobSeeker?.resolvedResume?.resumeUrl || r.jobSeeker?.resumeUrl || '',
                boothName: r.booth?.name || (r.legacyBoothId ? 'Legacy Booth' : ''),
                boothCompany: r.booth?.company || '',
                eventName: r.event?.name || (r.legacyEventId ? 'Legacy Event' : ''),
                recruiterName: r.recruiter?.name || '',
                createdAtFormatted: r.createdAt ? new Date(r.createdAt).toLocaleString() : ''
            };
        });
    }, [interests]);

    // Syncfusion Grid does not reliably pick up dataSource prop changes. Calling
    // refresh() alone only re-renders the grid's *existing* internal dataSource, so
    // searched/filtered results only appeared after a full page reload remounted the
    // grid. Assigning the new array to the grid instance forces EJ2 to rebind to the
    // fresh data (which also re-renders templated cells).
    useEffect(() => {
        const grid = gridRef.current;
        if (!grid) return;
        grid.dataSource = gridDataSource;
    }, [gridDataSource]);

    // Memoize grid settings to prevent unnecessary re-renders
    const gridFilterSettings = useMemo(() => SYNC_GRID_FILTER_SETTINGS, []);

    const gridToolbar = useMemo(() => ['ColumnChooser'], []);

    const gridSelectionSettings = useMemo(() => ({
        type: 'Multiple',
        checkboxOnly: true
    }), []);

    const gridNoSelectionSettings = useMemo(() => ({
        type: 'None'
    }), []);

    // Helper: value -> label for dropdown fields in CSV
    const getLabelFromValue = (value, optionsList) => {
        if (value === null || value === undefined || value === '') return '';
        const s = String(value).trim();
        const opt = optionsList.find(o => (o.value || '').toString() === s || (o.name || '').toString() === s);
        return opt ? (opt.name || opt.value || s) : s;
    };
    const getLabelFromValues = (values, optionsList) => {
        if (!values || !Array.isArray(values)) return '';
        return values.map(v => getLabelFromValue(v, optionsList)).filter(Boolean).join('; ');
    };

    // Helper function for client-side CSV export
    const exportToCSVClientSide = (recordsToExport) => {
        // CSV Headers (no "Job Seeker" prefix, no Recruiter columns)
        const csvHeaders = [
            'Event Name',
            'Booth Name',
            'Company',
            'First Name',
            'Last Name',
            'Email',
            'Phone',
            'Location',
            'Headline',
            'Keywords',
            'Primary Job Experience',
            'Work Experience Level',
            'Highest Education Level',
            'Employment Types',
            'Language(s)',
            'Veteran/Military Status',
            'Resume Link',
            'Interest Level',
            'Notes',
            'Date Expressed'
        ];

        // Helper function to escape CSV fields
        const escapeCSV = (value) => {
            if (value === null || value === undefined || value === '') {
                return '';
            }
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
        };

        // Helper function to format date
        const formatDate = (date) => {
            if (!date) return '';
            try {
                const d = new Date(date);
                if (isNaN(d.getTime())) return '';
                return d.toLocaleString();
            } catch (e) {
                return '';
            }
        };

        // Helper function to get profile field
        const getProfileField = (interest, field) => {
            return interest.jobSeeker?.metadata?.profile?.[field] || '';
        };

        // Helper function to format array field
        const formatArray = (arr) => {
            if (!Array.isArray(arr)) return '';
            return arr.filter(Boolean).join('; ');
        };

        // Convert records to CSV rows
        const csvRows = recordsToExport.map(interest => {
            // Split name into first and last
            const name = interest.jobSeeker?.name || '';
            const nameParts = name ? name.trim().split(/\s+/) : [];
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            
            // Build location string
            const locationParts = [
                interest.jobSeeker?.city || '',
                interest.jobSeeker?.state || '',
                interest.jobSeeker?.country || ''
            ].filter(Boolean);
            const location = locationParts.join(', ');

            // Get event info
            const eventId = interest.event?._id || interest.event || '';
            const eventName = interest.event?.name || (interest.legacyEventId ? 'Legacy Event' : '');
            
            // Get booth info
            const boothId = interest.booth?._id || interest.booth || '';
            const boothName = interest.booth?.name || (interest.legacyBoothId ? 'Legacy Booth' : '');
            const company = interest.booth?.company || interest.company || '';
            
            // Get recruiter info
            const recruiterId = interest.recruiter?._id || interest.recruiter || '';
            const recruiterName = interest.recruiter?.name || '';
            const recruiterEmail = interest.recruiter?.email || '';

            // Get profile fields
            const getProfile = (js) => {
                if (!js) return null;
                if (js.metadata?.profile) return js.metadata.profile;
                if (js.metadata && typeof js.metadata === 'string') {
                    try {
                        return JSON.parse(js.metadata)?.profile || null;
                    } catch (e) {
                        return null;
                    }
                }
                return null;
            };
            
            const profile = getProfile(interest.jobSeeker);
            const headline = profile?.headline || '';
            const keywords = profile?.keywords || '';
            const primaryJobExperience = Array.isArray(profile?.primaryExperience)
                ? profile.primaryExperience.find(Boolean) || ''
                : profile?.primaryExperience || '';
            const primaryJobExperienceLabel = getLabelFromValue(primaryJobExperience, JOB_CATEGORY_LIST);
            const workLevelLabel = getLabelFromValue(profile?.workLevel || '', EXPERIENCE_LEVEL_LIST);
            const educationLevelLabel = getLabelFromValue(profile?.educationLevel || '', EDUCATION_LEVEL_LIST);
            const employmentTypesLabel = getLabelFromValues(profile?.employmentTypes || [], JOB_TYPE_LIST);
            const veteranStatusLabel = getLabelFromValue(profile?.veteranStatus || '', MILITARY_EXPERIENCE_LIST);
            const languagesDisplay = getLabelFromValues(profile?.languages || [], LANGUAGE_LIST);
            const resumeUrl = interest.jobSeeker?.resumeUrl || '';

            return [
                escapeCSV(eventName),
                escapeCSV(boothName),
                escapeCSV(company),
                escapeCSV(firstName),
                escapeCSV(lastName),
                escapeCSV(interest.jobSeeker?.email || ''),
                escapeCSV(interest.jobSeeker?.phoneNumber || ''),
                escapeCSV(location),
                escapeCSV(headline),
                escapeCSV(keywords),
                escapeCSV(primaryJobExperienceLabel),
                escapeCSV(workLevelLabel),
                escapeCSV(educationLevelLabel),
                escapeCSV(employmentTypesLabel),
                escapeCSV(languagesDisplay),
                escapeCSV(veteranStatusLabel),
                escapeCSV(resumeUrl),
                escapeCSV(interest.interestLevel || ''),
                escapeCSV(interest.notes || ''),
                escapeCSV(formatDate(interest.createdAt))
            ].join(',');
        });

        // Combine headers and rows
        const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

        // Create blob and download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'job-seeker-interests.csv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };

    const handleExport = async () => {
        try {
            console.log('📤 Starting export...');
            console.log('📤 Selected interests from state:', selectedInterests);
            console.log('📤 Total interests:', interests.length);
            setLoadingData(true);
            
            // Use the selectedInterests state that's maintained by rowSelected/rowDeselected events
            if (selectedInterests && selectedInterests.length > 0) {
                console.log(`📊 Exporting ${selectedInterests.length} selected record(s)`);
                console.log('📊 Selected IDs:', selectedInterests);
                
                // Match against original interests data
                const selectedRowData = interests.filter(r => {
                    const recordId = String(r._id);
                    const isMatch = selectedInterests.includes(recordId);
                    if (isMatch) {
                        console.log('✅ Matched record:', recordId);
                    }
                    return isMatch;
                });
                
                console.log(`✅ Matched ${selectedRowData.length} interest(s) from original data`);
                
                if (selectedRowData.length > 0) {
                    exportToCSVClientSide(selectedRowData);
                    showToast(`✅ Exported ${selectedRowData.length} selected record(s)`, 'Success');
                    setLoadingData(false);
                    return;
                } else {
                    console.error('❌ No matching data!');
                    console.error('❌ Selected IDs from state:', selectedInterests);
                    console.error('❌ Sample interest IDs:', interests.slice(0, 3).map(r => String(r._id)));
                    const msg = `Selection detected (${selectedInterests.length} rows) but could not match IDs. Check console for details.`;
                    alert(msg);
                    showToast(msg, 'Error', 5000);
                    setLoadingData(false);
                    return;
                }
            }
            
            console.log('📋 No records selected, exporting all/filtered data');
            showToast('No selection detected. Exporting all/filtered records...', 'Info', 2000);
            
            // No selected rows - use current search input value so export matches what user sees
            // Build export filters (same as current filters but without pagination)
            const searchForExport = (searchInputRef.current?.value ?? filters.search ?? '').trim();
            let eventIdForExport = filters.eventId || '';
            if (eventIdForExport.startsWith('legacy_')) {
                eventIdForExport = eventIdForExport.replace('legacy_', '');
            }
            
            const exportFilters = {
                eventId: eventIdForExport,
                boothId: filters.boothId || '',
                recruiterId: filters.recruiterId || '',
                search: searchForExport
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
            
            const exportMessage = exportFilters.search 
                ? `Exported search results successfully` 
                : 'Job seeker interests exported successfully';
            showToast(exportMessage, 'Success');
        } catch (error) {
            console.error('Error exporting interests:', error);
            const errorMessage = error.response?.data?.message || error.message || 'Failed to export job seeker interests';
            showToast(errorMessage, 'Error', 5000);
        } finally {
            setLoadingData(false);
        }
    };

    // Get selected records from grid when needed (for export, etc.)
    const getSelectedRecordsFromGrid = useCallback(() => {
        if (!gridRef.current) return [];
        try {
            if (typeof gridRef.current.getSelectedRecords === 'function') {
                const rows = gridRef.current.getSelectedRecords();
                return rows.map(row => String(row.id || row._id || '')).filter(Boolean);
            }
            return [];
        } catch (error) {
            console.error('Error getting selected rows:', error);
            return [];
        }
    }, []);

    const handleExportResumes = async () => {
        try {
            setIsExportingResumes(true);
            
            // Helper function to extract resume URL from job seeker data
            // Handles both populated objects and migrated data structures
            const getResumeUrl = (jobSeeker) => {
                if (!jobSeeker) {
                    console.log('⚠️ getResumeUrl: jobSeeker is null/undefined');
                    return null;
                }
                
                // Handle populated object
                if (typeof jobSeeker === 'object') {
                    // Check direct resumeUrl field
                    if (jobSeeker.resumeUrl) {
                        console.log('✅ Found resumeUrl in jobSeeker.resumeUrl:', jobSeeker.resumeUrl);
                        return jobSeeker.resumeUrl;
                    }
                    
                    // Check if it's an ObjectId string (not populated)
                    if (typeof jobSeeker === 'string' || (jobSeeker._id && !jobSeeker.name)) {
                        console.log('⚠️ getResumeUrl: jobSeeker appears to be an ID, not populated');
                        return null;
                    }
                    
                    // Log the structure for debugging
                    console.log('⚠️ getResumeUrl: jobSeeker object structure:', {
                        hasResumeUrl: !!jobSeeker.resumeUrl,
                        keys: Object.keys(jobSeeker),
                        _id: jobSeeker._id,
                        name: jobSeeker.name
                    });
                }
                
                return null;
            };

            // Helper function to get job seeker name
            const getJobSeekerName = (jobSeeker) => {
                if (!jobSeeker) return 'Unknown';
                if (typeof jobSeeker === 'object' && jobSeeker.name) {
                    return jobSeeker.name;
                }
                return 'Unknown';
            };

            // Helper function to get file extension from URL
            const getFileExtension = (url) => {
                if (!url) return 'pdf';
                try {
                    const urlObj = new URL(url);
                    const pathname = urlObj.pathname;
                    const match = pathname.match(/\.([a-zA-Z0-9]+)(\?|$)/);
                    if (match) {
                        return match[1].toLowerCase();
                    }
                } catch (e) {
                    // If URL parsing fails, try to extract from string
                    const match = url.match(/\.([a-zA-Z0-9]+)(\?|$)/);
                    if (match) {
                        return match[1].toLowerCase();
                    }
                }
                return 'pdf'; // Default to pdf
            };

            // Helper function to sanitize filename
            const sanitizeFileName = (name) => {
                return name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
            };

            let interestsToProcess = [];

            // Get selected records from grid directly
            const selectedFromGrid = getSelectedRecordsFromGrid();
            console.log('📋 Selected records from grid:', selectedFromGrid);
            console.log('📋 Selected interests from state:', selectedInterests);

            // Determine which records to process
            if (selectedFromGrid.length > 0) {
                // Use grid selection (primary source)
                interestsToProcess = interests.filter(r => {
                    const recordId = String(r._id || r.id);
                    return selectedFromGrid.includes(recordId);
                });
                console.log(`✅ Exporting resumes for ${selectedFromGrid.length} selected record(s)`, {
                    selectedIds: selectedFromGrid,
                    filteredRecords: interestsToProcess.length,
                    totalInterests: interests.length
                });
                showToast(`Exporting resumes for ${selectedFromGrid.length} selected job seeker(s)...`, 'Info', 2000);
            } else if (selectedInterests.length > 0) {
                // Fallback to state-tracked selection
                const selectedIdsAsStrings = selectedInterests.map(id => String(id));
                interestsToProcess = interests.filter(r => {
                    const recordId = String(r._id || r.id);
                    return selectedIdsAsStrings.includes(recordId);
                });
                console.log(`✅ Exporting resumes for ${selectedInterests.length} selected record(s) (from state)`, {
                    selectedIds: selectedInterests,
                    filteredRecords: interestsToProcess.length,
                    totalInterests: interests.length
                });
                showToast(`Exporting resumes for ${selectedInterests.length} selected job seeker(s)...`, 'Info', 2000);
            } else {
                // No selection - fetch all interests matching current filters (not paginated)
                const exportFilters = { ...filters };
                
                // Handle legacy event IDs (format: "legacy_<id>") - strip prefix before sending to API
                if (exportFilters.eventId && exportFilters.eventId.startsWith('legacy_')) {
                    exportFilters.eventId = exportFilters.eventId.replace('legacy_', '');
                }
                
                exportFilters.page = 1;
                exportFilters.limit = 100000; // Large limit to get all records
                
                console.log('📤 Export filters (after legacy handling):', exportFilters);
                
                showToast('Fetching all job seekers matching current filters...', 'Info', 2000);
                const response = await jobSeekerInterestsAPI.getInterests(exportFilters);
                interestsToProcess = response.interests || [];
                console.log(`📥 Received ${interestsToProcess.length} interests for export`);
                
                if (interestsToProcess.length > 0) {
                    showToast(`Exporting resumes for ${interestsToProcess.length} job seeker(s)...`, 'Info', 2000);
                }
            }

            if (interestsToProcess.length === 0) {
                showToast('No records found to export resumes', 'Warning');
                return;
            }

            // Extract unique job seekers with resume URLs
            const jobSeekersMap = new Map();
            let skippedCount = 0;
            let skippedReasons = { noJobSeeker: 0, noResumeUrl: 0, emptyResumeUrl: 0 };
            
            console.log(`📋 Processing ${interestsToProcess.length} interests for resume export`);
            console.log(`📋 Sample interest structure:`, interestsToProcess.length > 0 ? {
                hasJobSeeker: !!interestsToProcess[0].jobSeeker,
                jobSeekerType: typeof interestsToProcess[0].jobSeeker,
                jobSeekerKeys: interestsToProcess[0].jobSeeker && typeof interestsToProcess[0].jobSeeker === 'object' 
                    ? Object.keys(interestsToProcess[0].jobSeeker) 
                    : 'N/A',
                hasResumeUrl: interestsToProcess[0].jobSeeker && typeof interestsToProcess[0].jobSeeker === 'object'
                    ? !!interestsToProcess[0].jobSeeker.resumeUrl
                    : false,
                legacyEventId: interestsToProcess[0].legacyEventId,
                eventId: interestsToProcess[0].event
            } : 'No interests');
            
            interestsToProcess.forEach((interest, index) => {
                const jobSeeker = interest.jobSeeker;
                
                if (!jobSeeker) {
                    skippedReasons.noJobSeeker++;
                    if (index < 5) {
                        console.log(`⚠️ Interest ${index}: No jobSeeker found`, {
                            interestId: interest._id,
                            legacyEventId: interest.legacyEventId,
                            eventId: interest.event
                        });
                    }
                    return;
                }

                const resumeUrl = getResumeUrl(jobSeeker);
                
                if (!resumeUrl || !resumeUrl.trim()) {
                    skippedReasons.noResumeUrl++;
                    if (index < 5) {
                        console.log(`⚠️ Interest ${index}: No resume URL found for job seeker:`, {
                            interestId: interest._id,
                            jobSeekerId: typeof jobSeeker === 'object' ? jobSeeker._id : jobSeeker,
                            jobSeekerName: typeof jobSeeker === 'object' ? jobSeeker.name : 'Unknown',
                            jobSeekerType: typeof jobSeeker,
                            jobSeekerKeys: typeof jobSeeker === 'object' ? Object.keys(jobSeeker) : [],
                            hasResumeUrl: typeof jobSeeker === 'object' ? !!jobSeeker.resumeUrl : false,
                            resumeUrlValue: typeof jobSeeker === 'object' ? jobSeeker.resumeUrl : 'N/A',
                            legacyEventId: interest.legacyEventId,
                            eventId: interest.event
                        });
                    }
                    return; // Skip if no resume URL
                }

                const jobSeekerId = typeof jobSeeker === 'object' ? jobSeeker._id : jobSeeker;
                const jobSeekerName = getJobSeekerName(jobSeeker);

                // Only add if not already in map (to avoid duplicates)
                if (!jobSeekersMap.has(jobSeekerId)) {
                    jobSeekersMap.set(jobSeekerId, {
                        id: jobSeekerId,
                        name: jobSeekerName,
                        resumeUrl: resumeUrl.trim()
                    });
                    if (jobSeekersMap.size <= 5) {
                        console.log(`✅ Added job seeker to export: ${jobSeekerName} (${jobSeekerId})`);
                    }
                }
            });
            
            console.log(`📊 Resume export summary:`, {
                totalInterests: interestsToProcess.length,
                uniqueJobSeekersWithResume: jobSeekersMap.size,
                skipped: skippedReasons.noJobSeeker + skippedReasons.noResumeUrl,
                skippedReasons
            });

            const uniqueJobSeekers = Array.from(jobSeekersMap.values());

            if (uniqueJobSeekers.length === 0) {
                const message = `No job seekers with resume URLs found. Skipped: ${skippedReasons.noJobSeeker} (no job seeker), ${skippedReasons.noResumeUrl} (no resume URL). Check console for details.`;
                console.error('❌ Resume export failed:', message);
                showToast(message, 'Warning', 8000);
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

                    // Update progress
                    if ((i + 1) % 10 === 0 || i === uniqueJobSeekers.length - 1) {
                        showToast(`Downloaded ${i + 1}/${uniqueJobSeekers.length} resumes...`, 'Info', 2000);
                    }
                } catch (error) {
                    console.error(`Error downloading resume for ${jobSeeker.name}:`, error);
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
            const selectedCount = selectedFromGrid.length > 0 ? selectedFromGrid.length : selectedInterests.length;
            
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

    // Grid template functions for custom column renders - memoized to prevent re-renders
    const jobSeekerTemplate = useCallback((props) => {
        const row = props;
        const jobSeekerName = row.jobSeeker?.name || (row.legacyJobSeekerId ? 'Legacy User' : 'N/A');
        const jobSeekerEmail = row.jobSeeker?.email || (row.legacyJobSeekerId ? 'N/A' : 'N/A');
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                <div className="job-seeker-name">{jobSeekerName}</div>
                <div className="job-seeker-email">{jobSeekerEmail}</div>
            </div>
        );
    }, []);

    const eventTemplate = useCallback((props) => {
        const row = props;
        const eventName = row.event?.name || (row.legacyEventId ? 'Legacy Event' : 'N/A');
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {eventName}
            </div>
        );
    }, []);

    const boothTemplate = useCallback((props) => {
        const row = props;
        const boothName = row.booth?.name || row.company || (row.legacyBoothId ? 'Legacy Booth' : 'N/A');
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {boothName}
            </div>
        );
    }, []);

    const locationTemplate = useCallback((props) => {
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
    }, []);

    const interestLevelTemplate = useCallback((props) => {
        const row = props;
        return (
            <span className={`interest-level interest-level-${row.interestLevel}`}>
                {formatInterestLevel(row.interestLevel)}
            </span>
        );
    }, []);

    const dateExpressedTemplate = useCallback((props) => {
        const row = props;
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {formatDateTime(row.createdAt)}
            </div>
        );
    }, []);

    const actionsTemplate = useCallback((props) => {
        const row = props;
        // Handle both populated jobSeeker object and jobSeeker ID
        const jobSeekerData = row.jobSeeker || (row.jobSeekerId ? { _id: row.jobSeekerId } : null) || (row.legacyJobSeekerId ? { _id: row.legacyJobSeekerId } : null);
        
        if (!jobSeekerData) {
            return <div style={{ padding: '8px 0', color: '#999' }}>N/A</div>;
        }
        
        const resumeId = row.jobSeekerResumeId || row.jobSeeker?.resolvedResume?.resumeId || '';
        const resumeUrl = row.jobSeekerResumeUrl || row.jobSeeker?.resolvedResume?.resumeUrl || row.jobSeeker?.resumeUrl || '';
        const hasResume = !!(resumeId || resumeUrl);
        const eventIdForModal = row.event?._id || row.event || null;

        return (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <ButtonComponent 
                    cssClass="e-primary e-small" 
                    onClick={() => {
                        window.setTimeout(() => {
                            setSelectedJobSeekerForModal(jobSeekerData);
                            setSelectedEventIdForModal(eventIdForModal);
                            setShowJobSeekerModal(true);
                        }, 0);
                    }}
                    aria-label="View job seeker details"
                >
                    View Job Seeker Detail
                </ButtonComponent>
                {hasResume ? (
                    <ButtonComponent
                        cssClass="e-outline e-primary e-small"
                        onClick={() => openResumeInNewTab(resumeId || null, resumeUrl || null)}
                        aria-label="View job seeker resume"
                    >
                        View Resume
                    </ButtonComponent>
                ) : null}
            </div>
        );
    }, []); // setState functions are stable, no need to include in dependencies

    const notesTemplate = useCallback((props) => {
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
    }, []);

    // Helper function to extract profile data from job seeker
    const getJobSeekerProfile = (jobSeeker) => {
        if (!jobSeeker || typeof jobSeeker !== 'object') return null;
        
        // Handle metadata.profile structure
        if (jobSeeker.metadata && jobSeeker.metadata.profile) {
            return jobSeeker.metadata.profile;
        }
        
        // Handle string metadata (JSON)
        if (jobSeeker.metadata && typeof jobSeeker.metadata === 'string') {
            try {
                const parsed = JSON.parse(jobSeeker.metadata);
                return parsed?.profile || null;
            } catch (e) {
                return null;
            }
        }
        
        return null;
    };

    // Helper function to split name into first and last
    const splitName = (name) => {
        if (!name) return { firstName: '', lastName: '' };
        const parts = name.trim().split(/\s+/);
        return {
            firstName: parts[0] || '',
            lastName: parts.slice(1).join(' ') || ''
        };
    };

    // Template functions for job seeker data columns - memoized to prevent re-renders
    const firstNameTemplate = useCallback((props) => {
        const row = props;
        const firstName = row.jobSeekerFirstName || '';
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {firstName || 'N/A'}
            </div>
        );
    }, []);

    const lastNameTemplate = useCallback((props) => {
        const row = props;
        const lastName = row.jobSeekerLastName || '';
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {lastName || 'N/A'}
            </div>
        );
    }, []);

    const emailTemplate = useCallback((props) => {
        const row = props;
        const email = row.jobSeekerEmail || '';
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {email || 'N/A'}
            </div>
        );
    }, []);

    const phoneTemplate = useCallback((props) => {
        const row = props;
        const phone = row.jobSeekerPhone || '';
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {phone || 'N/A'}
            </div>
        );
    }, []);

    const headlineTemplate = useCallback((props) => {
        const row = props;
        const headline = row.jobSeekerHeadline || '';
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {headline || 'N/A'}
            </div>
        );
    }, []);

    const keywordsTemplate = useCallback((props) => {
        const row = props;
        const keywords = row.jobSeekerKeywords || '';
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {keywords || 'N/A'}
            </div>
        );
    }, []);

    const primaryJobExperienceTemplate = useCallback((props) => {
        const row = props;
        const primaryJobExperience = row.jobSeekerPrimaryExperience || '';
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {primaryJobExperience || 'N/A'}
            </div>
        );
    }, []);

    const workExperienceLevelTemplate = useCallback((props) => {
        const row = props;
        const workLevel = row.jobSeekerWorkLevel || '';
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {workLevel || 'N/A'}
            </div>
        );
    }, []);

    const educationLevelTemplate = useCallback((props) => {
        const row = props;
        const educationLevel = row.jobSeekerEducationLevel || '';
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {educationLevel || 'N/A'}
            </div>
        );
    }, []);

    const employmentTypesTemplate = useCallback((props) => {
        const displayValue = props.jobSeekerEmploymentTypes || '';
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {displayValue || 'N/A'}
            </div>
        );
    }, []);

    const languagesTemplate = useCallback((props) => {
        const displayValue = props.jobSeekerLanguages || '';
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {displayValue || 'N/A'}
            </div>
        );
    }, []);

    const veteranStatusTemplate = useCallback((props) => {
        const row = props;
        const veteranStatus = row.jobSeekerVeteranStatus || '';
        return (
            <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                {veteranStatus || 'N/A'}
            </div>
        );
    }, []);

    if (loading) {
        return (
            <div className="dashboard">
                <a href="#main-content" className="skip-link">Skip to main content</a>
                <AdminHeader
                    brandingLogo={event?.logoUrl || event?.logo || ''}
                    brandingLogoAlt={event?.logoAltText || ''}
                    secondaryLogo={booth?.logoUrl || booth?.companyLogo || ''}
                    secondaryLogoAlt={booth?.logoAltText || ''}
                />
                <div className="dashboard-layout">
                    <AdminSidebar active={user?.role === 'Recruiter' ? 'interests' : 'jobseeker-interests'} />
                    <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
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
            <a href="#main-content" className="skip-link">Skip to main content</a>
            <AdminHeader
                brandingLogo={event?.logoUrl || event?.logo || ''}
                brandingLogoAlt={event?.logoAltText || ''}
                secondaryLogo={booth?.logoUrl || booth?.companyLogo || ''}
                secondaryLogoAlt={booth?.logoAltText || ''}
            />
            <div className="dashboard-layout">
                <AdminSidebar active={user?.role === 'Recruiter' ? 'interests' : 'jobseeker-interests'} />
                <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
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
                                {supportsInterestsAiTab && (
                                    <div className="jsi-tab-bar" role="tablist" aria-label="Job seeker interests view mode">
                                        <button
                                            type="button"
                                            role="tab"
                                            aria-selected={activeTab === 'list'}
                                            className={`jsi-tab-btn${activeTab === 'list' ? ' jsi-tab-btn--active' : ''}`}
                                            onClick={() => setActiveTab('list')}
                                        >
                                            All Job Seeker Interests
                                        </button>
                                        <button
                                            type="button"
                                            role="tab"
                                            aria-selected={activeTab === 'ai-search'}
                                            className={`jsi-tab-btn${activeTab === 'ai-search' ? ' jsi-tab-btn--active' : ''}`}
                                            onClick={() => setActiveTab('ai-search')}
                                        >
                                            ✦ AI Search
                                        </button>
                                    </div>
                                )}
                                {(!supportsInterestsAiTab || activeTab === 'list') && (
                                <div className="header-actions" style={{ marginTop: '1rem', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                    {['Admin', 'GlobalSupport', 'Recruiter'].includes(user?.role) && selectedInterests.length > 0 && (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="checkbox"
                                                    id="select-all-interests"
                                                    checked={selectedInterests.length > 0 && selectedInterests.length === interests.length}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            // Select all rows
                                                            if (gridRef.current) {
                                                                gridRef.current.selectRows(Array.from({ length: interests.length }, (_, i) => i));
                                                                // Manually update state to ensure checkbox reflects selection immediately
                                                                setTimeout(() => {
                                                                    const currentSelection = getSelectedInterestsFromGrid();
                                                                    setSelectedInterests(currentSelection);
                                                                }, 100);
                                                            }
                                                        } else {
                                                            // Deselect all rows
                                                            if (gridRef.current) {
                                                                gridRef.current.clearSelection();
                                                                setSelectedInterests([]);
                                                            }
                                                        }
                                                    }}
                                                    style={{ 
                                                        width: '18px', 
                                                        height: '18px', 
                                                        cursor: 'pointer',
                                                        accentColor: '#000000'
                                                    }}
                                                />
                                                <label htmlFor="select-all-interests" style={{ cursor: 'pointer', userSelect: 'none', fontSize: '14px', fontWeight: '500' }}>
                                                    Select All
                                                </label>
                                            </div>
                                            <ButtonComponent 
                                                cssClass="e-danger"
                                                onClick={handleBulkDelete}
                                                disabled={isDeleting}
                                                aria-label={`Delete ${selectedInterests.length} selected interests`}
                                            >
                                                {isDeleting ? 'Deleting...' : `Delete Selected (${selectedInterests.length})`}
                                            </ButtonComponent>
                                        </>
                                    )}
                                    <ButtonComponent 
                                        cssClass="e-primary"
                                        onClick={handleExportResumes}
                                        disabled={isExportingResumes || loadingData}
                                        aria-label="Export job seeker resumes as zip file"
                                    >
                                        {isExportingResumes ? 'Exporting Resumes...' : 'Export Resumes'}
                                    </ButtonComponent>
                                </div>
                                )}
                            </div>

                            {supportsInterestsAiTab && activeTab === 'ai-search' && (
                                <div className="jsi-ai-tab-content">
                                    <AdvancedJobSeekerSearch
                                        mode="interests"
                                        onViewJobSeeker={handleViewJobSeekerFromAi}
                                    />
                                </div>
                            )}

                            {(!supportsInterestsAiTab || activeTab === 'list') && (
                            <>
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
                                            defaultValue={filters.search}
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
                                    {filters.search && (
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
                                    dataSource={gridDataSource}
                                    allowPaging={false}
                                    allowSorting={true}
                                    allowFiltering={true}
                                    enablePersistence={false}
                                    filterSettings={gridFilterSettings}
                                    showColumnMenu={true}
                                    showColumnChooser={true}
                                    allowResizing={true}
                                    allowReordering={true}
                                    toolbar={gridToolbar}
                                    selectionSettings={['Admin', 'GlobalSupport', 'Recruiter'].includes(user?.role) ? gridSelectionSettings : gridNoSelectionSettings}
                                    enableHover={true}
                                    allowRowDragAndDrop={false}
                                    rowSelected={() => {
                                        setTimeout(() => {
                                            const currentSelection = getSelectedInterestsFromGrid();
                                            console.log('✅ Row selected, current selection:', currentSelection);
                                            setSelectedInterests(currentSelection);
                                        }, 50);
                                    }}
                                    rowDeselected={() => {
                                        setTimeout(() => {
                                            const currentSelection = getSelectedInterestsFromGrid();
                                            console.log('❌ Row deselected, current selection:', currentSelection);
                                            setSelectedInterests(currentSelection);
                                        }, 50);
                                    }}
                                >
                                    <ColumnsDirective>
                                        {['Admin', 'GlobalSupport', 'Recruiter'].includes(user?.role) && (
                                            <ColumnDirective {...SYNC_GRID_CHECKBOX_COLUMN_PROPS} />
                                        )}
                                        <ColumnDirective field='jobSeekerName' headerText='Job Seeker' width='220' clipMode='EllipsisWithTooltip' template={jobSeekerTemplate} allowFiltering={true} freeze='Left' />
                                        <ColumnDirective field='id' headerText='' width='0' isPrimaryKey={true} visible={false} showInColumnChooser={false} />
                                        <ColumnDirective field='jobSeekerFirstName' headerText='Firstname' width='150' clipMode='EllipsisWithTooltip' template={firstNameTemplate} allowFiltering={true} visible={true} />
                                        <ColumnDirective field='jobSeekerLastName' headerText='Lastname' width='150' clipMode='EllipsisWithTooltip' template={lastNameTemplate} allowFiltering={true} visible={true} />
                                        <ColumnDirective field='jobSeekerEmail' headerText='Email' width='220' clipMode='EllipsisWithTooltip' template={emailTemplate} allowFiltering={true} visible={true} />
                                        <ColumnDirective field='jobSeekerPhone' headerText='Phone' width='150' clipMode='EllipsisWithTooltip' template={phoneTemplate} allowFiltering={true} visible={true} />
                                        <ColumnDirective field='jobSeekerCity' headerText='Location' width='150' clipMode='EllipsisWithTooltip' template={locationTemplate} allowFiltering={true} />
                                        <ColumnDirective field='jobSeekerHeadline' headerText='Headline' width='200' clipMode='EllipsisWithTooltip' template={headlineTemplate} allowFiltering={true} visible={true} />
                                        <ColumnDirective field='jobSeekerKeywords' headerText='Keywords' width='200' clipMode='EllipsisWithTooltip' template={keywordsTemplate} allowFiltering={true} visible={true} />
                                        <ColumnDirective field='jobSeekerPrimaryExperience' headerText='Primary Job Experience' width='210' clipMode='EllipsisWithTooltip' template={primaryJobExperienceTemplate} allowFiltering={true} visible={true} />
                                        <ColumnDirective field='jobSeekerWorkLevel' headerText='Work Experience Level' width='180' clipMode='EllipsisWithTooltip' template={workExperienceLevelTemplate} allowFiltering={true} visible={true} />
                                        <ColumnDirective field='jobSeekerEducationLevel' headerText='Highest Education Level' width='200' clipMode='EllipsisWithTooltip' template={educationLevelTemplate} allowFiltering={true} visible={true} />
                                        <ColumnDirective field='jobSeekerEmploymentTypes' headerText='Employment Types' width='200' clipMode='EllipsisWithTooltip' template={employmentTypesTemplate} allowFiltering={true} type='string' visible={true} />
                                        <ColumnDirective field='jobSeekerLanguages' headerText='Language(s)' width='200' clipMode='EllipsisWithTooltip' template={languagesTemplate} allowFiltering={true} type='string' visible={true} />
                                        <ColumnDirective field='jobSeekerVeteranStatus' headerText='Veteran/Military Status' width='200' clipMode='EllipsisWithTooltip' template={veteranStatusTemplate} allowFiltering={true} visible={true} />
                                        <ColumnDirective field='eventName' headerText='Event' width='180' clipMode='EllipsisWithTooltip' template={eventTemplate} allowFiltering={true} />
                                        <ColumnDirective field='boothName' headerText='Booth' width='180' clipMode='EllipsisWithTooltip' template={boothTemplate} allowFiltering={true} />
                                        <ColumnDirective field='createdAt' headerText='Date Expressed' width='180' clipMode='EllipsisWithTooltip' template={dateExpressedTemplate} allowFiltering={true} type='string' />
                                        <ColumnDirective field='jobSeekerResumeUrl' headerText='Resume' width='120' textAlign='Center' allowFiltering={false} template={(props) => {
                                            const rid = props.jobSeekerResumeId || props.jobSeeker?.resolvedResume?.resumeId;
                                            const rurl = props.jobSeekerResumeUrl || props.jobSeeker?.resolvedResume?.resumeUrl;
                                            return (rid || rurl)
                                                ? <button type="button" className="btn-view-resume-inline" onClick={() => openResumeInNewTab(rid || null, rurl || null)}>View</button>
                                                : <span style={{ color: '#9ca3af' }}>—</span>;
                                        }} />
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
                                    <GridInject services={[Page, Sort, Filter, GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu, Freeze]} />
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
                            </>
                            )}
                        </div>
                    </div>
                </main>
            </div>

            {/* Bulk Delete confirm modal - mount only when open (Syncfusion portal DOM) */}
            {confirmBulkDeleteOpen && ['Admin', 'GlobalSupport'].includes(user?.role) && (
                <DialogComponent
                    width="450px"
                    isModal={true}
                    showCloseIcon={true}
                    visible={true}
                    header="Bulk Delete Interests"
                    closeOnEscape={true}
                    close={cancelBulkDelete}
                    cssClass="jsm-delete-dialog"
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
                                content: isDeleting ? 'Deleting...' : 'Delete',
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
                        Are you sure you want to permanently delete <strong>{selectedInterests.length} interest(s)</strong>? This action cannot be undone.
                    </p>
                </DialogComponent>
            )}

            {/* Syncfusion ToastComponent */}
            <ToastComponent
                ref={(toast) => toastRef.current = toast}
                position={{ X: 'Right', Y: 'Bottom' }}
                showProgressBar={true}
                timeOut={3000}
                newestOnTop={true}
            />

            {confirmBulkDeleteOpen && (
            <DialogComponent
                width="500px"
                isModal={true}
                showCloseIcon={true}
                visible={true}
                header="Delete Multiple Interests"
                closeOnEscape={true}
                close={cancelBulkDelete}
                cssClass="bulk-delete-dialog"
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
                            content: 'Delete All',
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
                    Are you sure you want to permanently delete <strong>{selectedInterests.length}</strong> selected interest(s)? 
                    <br /><br />
                    This action cannot be undone.
                </p>
            </DialogComponent>
            )}

            {showJobSeekerModal && selectedJobSeekerForModal && (
                <JobSeekerProfileModal
                    isOpen
                    onClose={() => {
                        setShowJobSeekerModal(false);
                        setSelectedJobSeekerForModal(null);
                        setSelectedEventIdForModal(null);
                    }}
                    jobSeeker={selectedJobSeekerForModal}
                    eventId={selectedEventIdForModal}
                />
            )}
        </div>
    );
};

export default JobSeekerInterests;