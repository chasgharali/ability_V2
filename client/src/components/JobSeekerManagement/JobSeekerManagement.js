import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import '../Dashboard/Dashboard.css';
import './JobSeekerManagement.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import filterIcon from '../../assets/filter.png';
import { GridComponent, ColumnsDirective, ColumnDirective, Inject as GridInject, Page, Sort, Filter, Toolbar as GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu } from '@syncfusion/ej2-react-grids';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import { DropDownListComponent, MultiSelectComponent } from '@syncfusion/ej2-react-dropdowns';
// Custom tabs - removed Syncfusion TabComponent
import { Input } from '../UI/FormComponents';
import '@syncfusion/ej2-base/styles/material.css';
import '@syncfusion/ej2-buttons/styles/material.css';
import '@syncfusion/ej2-react-dropdowns/styles/material.css';
import { listUsers, deactivateUser, reactivateUser, deleteUserPermanently, verifyUserEmail, updateUser, bulkDeleteJobSeekers } from '../../services/users';
import { listEvents } from '../../services/events';
import axios from 'axios';
import { 
  JOB_CATEGORY_LIST, 
  LANGUAGE_LIST, 
  JOB_TYPE_LIST, 
  EXPERIENCE_LEVEL_LIST, 
  EDUCATION_LEVEL_LIST, 
  SECURITY_CLEARANCE_LIST,
  MILITARY_EXPERIENCE_LIST,
  COUNTRY_OF_ORIGIN_LIST
} from '../../constants/options';

// Helper function to convert country name to 2-letter code - moved outside component for stability
const getCountryCode = (countryValue) => {
  if (!countryValue) return '';
  // If it's already a 2-letter code, return it
  if (countryValue.length === 2) return countryValue.toUpperCase();
  // Otherwise, try to find it in the country list
  const country = COUNTRY_OF_ORIGIN_LIST.find(c => 
    c.name.toLowerCase() === countryValue.toLowerCase() || 
    c.value.toLowerCase() === countryValue.toLowerCase()
  );
  return country ? country.value : countryValue;
};

export default function JobSeekerManagement() {
  // Helper function to get label from value using options list
  const getLabelFromValue = (value, optionsList) => {
    if (!value) return 'Not provided';
    const option = optionsList.find(opt => opt.value === value);
    return option ? option.name : value; // Fallback to original value if not found
  };

  // Helper function to format array of values to labels
  const formatArrayToLabels = (values, optionsList) => {
    if (!values || !Array.isArray(values) || values.length === 0) {
      return ['Not provided'];
    }
    return values.map(value => getLabelFromValue(value, optionsList));
  };
  const [mode, setMode] = useState('list'); // 'list' | 'view' | 'edit'
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectAllPages, setSelectAllPages] = useState(false);
  const [allJobSeekerIds, setAllJobSeekerIds] = useState([]);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    country: '',
    password: '',
    confirmPassword: '',
    avatarUrl: '',
    resumeUrl: '',
    // Professional Summary
    headline: '',
    keywords: '',
    // Experience & Employment
    primaryExperience: [],
    employmentTypes: [],
    workLevel: '',
    // Education & Qualifications
    educationLevel: '',
    clearance: '',
    // Additional Information
    languages: [],
    workAuthorization: '',
    veteranStatus: '',
    // Accessibility Needs
    usesScreenMagnifier: false,
    usesScreenReader: false,
    needsASL: false,
    needsCaptions: false,
    needsOther: false,
  });
  const [jobSeekers, setJobSeekers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  // Use ref for search input to avoid re-renders on every keystroke
  const searchInputRef = useRef(null);
  
  // Load search query from sessionStorage on mount (per-table persistence for search)
  const loadSearchQueryFromSession = () => {
    try {
      const saved = sessionStorage.getItem('jobSeekerManagement_searchQuery');
      if (saved) {
        return saved;
      }
    } catch (error) {
      console.error('Error loading Job Seeker Management search query from sessionStorage:', error);
    }
    return '';
  };

  const savedSearchQuery = loadSearchQueryFromSession();
  const [activeSearchQuery, setActiveSearchQuery] = useState(savedSearchQuery); // Actual search parameter used in API

  // Load filters from sessionStorage on mount (per-table persistence)
  const loadFiltersFromSession = () => {
    try {
      const savedFilters = sessionStorage.getItem('jobSeekerManagement_filters');
      if (savedFilters) {
        const parsed = JSON.parse(savedFilters);
        return {
          statusFilter: parsed.statusFilter || '',
          eventFilter: parsed.eventFilter || '',
        };
      }
    } catch (error) {
      console.error('Error loading Job Seeker Management filters from sessionStorage:', error);
    }
    return {
      statusFilter: '',
      eventFilter: '',
    };
  };

  const initialFilters = loadFiltersFromSession();
  const [statusFilter, setStatusFilter] = useState(initialFilters.statusFilter);
  const [eventFilter, setEventFilter] = useState(initialFilters.eventFilter);
  const [events, setEvents] = useState([]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [eventSearchLoading, setEventSearchLoading] = useState(false);
  const [serverStats, setServerStats] = useState({
    totalCount: 0,
    activeCount: 0,
    inactiveCount: 0,
    verifiedCount: 0
  });
  const toastRef = useRef(null);
  const gridRef = useRef(null);
  const deleteDialogRef = useRef(null);
  const loadingJobSeekersRef = useRef(false);
  const loadingEventsRef = useRef(false);
  const selectionUpdateRef = useRef(false); // Prevent multiple simultaneous selection updates
  const searchFilterRef = useRef('');
  const statusFilterRef = useRef('');
  const eventFilterRef = useRef('');
  const eventDropdownRef = useRef(null);
  const currentPageRef = useRef(1);
  const pageSizeRef = useRef(50);
  const [selectedJobSeeker, setSelectedJobSeeker] = useState(null);
  // Delete confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rowPendingDelete, setRowPendingDelete] = useState(null);
  // Bulk delete
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
  const [selectedJobSeekers, setSelectedJobSeekers] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  // Verify email confirmation dialog
  const [verifyEmailOpen, setVerifyEmailOpen] = useState(false);
  const [rowPendingVerify, setRowPendingVerify] = useState(null);
  // Password visibility toggles
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [activeEditTab, setActiveEditTab] = useState(0); // Custom tab state
  // Upload states
  const [uploading, setUploading] = useState(false);
  const [uploadingType, setUploadingType] = useState(null); // 'resume' or 'avatar'
  const [resumeFileName, setResumeFileName] = useState('');
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');
  const resumeInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  
  // Edit form state
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phoneNumber: '',
    city: '',
    state: '',
    country: '',
    avatarUrl: '',
  });

  // Pagination state
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    hasNext: false,
    hasPrev: false
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  
  // Keep refs in sync with state for stable callback dependencies
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);
  
  useEffect(() => {
    pageSizeRef.current = pageSize;
  }, [pageSize]);

  // Accessibility live region message
  const [liveMsg, setLiveMsg] = useState('');

  const statusOptions = useMemo(() => [
    { value: '', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ], []);

  // Event filter options - built from fetched events
  const eventOptions = useMemo(() => {
    const options = [{ value: '', label: 'All Events' }];
    if (events && Array.isArray(events)) {
      events.forEach(event => {
        options.push({ value: event._id, label: event.name });
      });
    }
    return options;
  }, [events]);

  // Syncfusion Toast - memoized to prevent unnecessary re-renders
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
    
    // Watch for new filter icons being added - ONLY observe the grid element, not entire body
    // This prevents performance issues when typing in search field
    let observer = null;
    let debounceTimer = null;
    const debouncedApplyFilterIcon = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(applyFilterIcon, 100);
    };
    
    if (gridElement) {
      observer = new MutationObserver(debouncedApplyFilterIcon);
      observer.observe(gridElement, { 
        childList: true, 
        subtree: true 
      });
    }
    
    // Also apply after delays to catch grid render
    const timeoutId1 = setTimeout(applyFilterIcon, 500);
    const timeoutId2 = setTimeout(applyFilterIcon, 1000);
    
    return () => {
      document.documentElement.style.removeProperty('--filter-icon-url');
      if (gridElement) {
        gridElement.removeEventListener('click', handleFilterIconClick, true);
      }
      if (observer) observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
    };
  }, [jobSeekers]);

  const handleDelete = useCallback((row) => {
    if (row.isActive) return; // safety - can't delete active users
    setRowPendingDelete(row);
    setConfirmOpen(true);
  }, []);

  const confirmDelete = async () => {
    if (!rowPendingDelete) return;
    try {
      await deleteUserPermanently(rowPendingDelete.id);
      showToast('Job seeker deleted', 'Success');
      await loadJobSeekers(currentPage, pageSize, searchFilterRef.current, statusFilterRef.current, eventFilterRef.current);
    } catch (e) {
      console.error('Delete failed', e);
      const msg = e?.response?.data?.message || 'Delete failed';
      showToast(msg, 'Error');
    } finally {
      setConfirmOpen(false);
      setRowPendingDelete(null);
    }
  };

  const cancelDelete = () => {
    setConfirmOpen(false);
    setRowPendingDelete(null);
  };

  // Get selected job seekers from grid
  const getSelectedJobSeekersFromGrid = useCallback(() => {
    if (!gridRef.current) return [];
    
    try {
      if (typeof gridRef.current.getSelectedRecords === 'function') {
        const selectedRows = gridRef.current.getSelectedRecords();
        return selectedRows.map(row => row.id || row._id).filter(Boolean);
      }
      
      if (typeof gridRef.current.getSelectedRowsData === 'function') {
        const selectedRows = gridRef.current.getSelectedRowsData();
        return selectedRows.map(row => row.id || row._id).filter(Boolean);
      }
      
      return [];
    } catch (error) {
      console.error('Error getting selected rows:', error);
      return [];
    }
  }, []);

  const handleBulkDelete = () => {
    const currentSelection = getSelectedJobSeekersFromGrid();
    if (currentSelection.length === 0) {
      showToast('Please select job seekers to delete', 'Warning');
      return;
    }
    setSelectedJobSeekers(currentSelection);
    setConfirmBulkDeleteOpen(true);
  };

  const confirmBulkDelete = async () => {
    try {
      setIsDeleting(true);
      const response = await bulkDeleteJobSeekers(selectedJobSeekers);
      showToast(response.message || 'Job seekers deleted successfully', 'Success');
      setSelectedJobSeekers([]);
      await loadJobSeekers(currentPage, pageSize, searchFilterRef.current, statusFilterRef.current, eventFilterRef.current);
    } catch (error) {
      console.error('Error deleting job seekers:', error);
      showToast(error.response?.data?.message || 'Failed to delete job seekers', 'Error');
    } finally {
      setIsDeleting(false);
      setConfirmBulkDeleteOpen(false);
    }
  };

  const cancelBulkDelete = () => {
    setConfirmBulkDeleteOpen(false);
    setSelectedJobSeekers([]);
  };

  const loadJobSeekers = useCallback(async (page, limit, search, isActive, event) => {
    // Prevent multiple simultaneous fetches
    if (loadingJobSeekersRef.current) return;
    
    try {
      loadingJobSeekersRef.current = true;
      // Only set main loading for initial load or page changes, not for search
      const isSearch = search && search.trim();
      if (!isSearch) {
        setLoading(true);
      }
      
      // Build query parameters
      const params = {
        page: page || 1,
        limit: limit || 50,
        role: 'JobSeeker'
      };
      
      // Add search parameter if provided
      if (search && search.trim()) {
        params.search = search.trim();
      }
      
      // Add status filter if provided
      if (isActive === 'active') {
        params.isActive = 'true';
      } else if (isActive === 'inactive') {
        params.isActive = 'false';
      }
      
      // Add event filter if provided
      if (event && event.trim()) {
        params.eventId = event.trim();
        console.log('Filtering by event ID:', event.trim());
      }
      
      const res = await listUsers(params);
      console.log('API Response - Total Count:', res?.pagination?.totalCount);
      const items = (res?.users || []).filter(u => u.role === 'JobSeeker');
      
      // Batch state updates to prevent multiple re-renders
      const mappedItems = items.map(u => {
        const parts = (u.name || '').trim().split(/\s+/);
        const firstName = parts[0] || '';
        const lastName = parts.slice(1).join(' ') || '';
        const registeredEvents = (u.metadata?.registeredEvents || []);
        return {
          id: u._id,
          firstName,
          lastName,
          email: u.email,
          phone: u.phoneNumber || '',
          city: u.city || '',
          state: u.state || '',
          country: u.country || '',
          isActive: u.isActive,
          statusText: u.isActive ? 'Active' : 'Inactive', // Flattened for filtering
          createdAt: u.createdAt,
          lastLogin: u.lastLogin,
          emailVerified: u.emailVerified,
          resumeUrl: u.resumeUrl,
          survey: u.survey || {},
          metadata: u.metadata || {},
          registeredEvents: registeredEvents, // Extract registered events for display
          avatarUrl: u.avatarUrl,
          usesScreenMagnifier: u.usesScreenMagnifier,
          usesScreenReader: u.usesScreenReader,
          needsASL: u.needsASL,
          needsCaptions: u.needsCaptions,
          needsOther: u.needsOther,
        };
      });
      
      // Update all states in a single batch
      setJobSeekers(mappedItems);
      
      if (res?.pagination) {
        setPagination({
          currentPage: res.pagination.currentPage,
          totalPages: res.pagination.totalPages,
          totalCount: res.pagination.totalCount,
          hasNext: res.pagination.hasNext,
          hasPrev: res.pagination.hasPrev
        });
      }

      // Update server-side stats if provided
      if (res?.stats) {
        setServerStats({
          totalCount: res.stats.totalCount || 0,
          activeCount: res.stats.activeCount || 0,
          inactiveCount: res.stats.inactiveCount || 0,
          verifiedCount: res.stats.verifiedCount || 0
        });
      }
      
      setLiveMsg(`Loaded ${items.length} of ${res?.pagination?.totalCount || 0} job seekers`);
    } catch (e) {
      console.error('Load failed', e);
      showToast('Failed to load job seekers', 'Error');
    } finally {
      loadingJobSeekersRef.current = false;
      setLoading(false);
      setSearchLoading(false);
      setEventSearchLoading(false);
    }
  }, [showToast]);

  // Track previous values to detect actual changes
  const isFirstRender = useRef(true);
  const prevSearchFilter = useRef(activeSearchQuery);
  const prevStatusFilter = useRef(statusFilter);
  const searchTimeoutRef = useRef(null);

  // Update refs when filters change
  useEffect(() => {
    searchFilterRef.current = activeSearchQuery;
  }, [activeSearchQuery]);

  useEffect(() => {
    statusFilterRef.current = statusFilter;
  }, [statusFilter]);

  useEffect(() => {
    eventFilterRef.current = eventFilter;
  }, [eventFilter]);

  // Persist filters per-table in sessionStorage so they survive navigation
  useEffect(() => {
    try {
      const filtersToSave = {
        statusFilter,
        eventFilter,
      };
      sessionStorage.setItem('jobSeekerManagement_filters', JSON.stringify(filtersToSave));
    } catch (error) {
      console.error('Error saving Job Seeker Management filters to sessionStorage:', error);
    }
  }, [statusFilter, eventFilter]);

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
      if (activeSearchQuery && activeSearchQuery.trim()) {
        sessionStorage.setItem('jobSeekerManagement_searchQuery', activeSearchQuery.trim());
        // Also update the input field if it exists
        if (searchInputRef.current) {
          searchInputRef.current.value = activeSearchQuery.trim();
        }
      } else {
        sessionStorage.removeItem('jobSeekerManagement_searchQuery');
        // Also clear the input field if it exists
        if (searchInputRef.current) {
          searchInputRef.current.value = '';
        }
      }
    } catch (error) {
      console.error('Error saving Job Seeker Management search query to sessionStorage:', error);
    }
  }, [activeSearchQuery]);

  // Load events on mount - memoized to prevent unnecessary re-renders
  const loadEventsData = useCallback(async () => {
    // Prevent multiple simultaneous fetches
    if (loadingEventsRef.current) return;
    
    try {
      loadingEventsRef.current = true;
      const res = await listEvents({ page: 1, limit: 200 });
      setEvents(res.events || []);
    } catch (e) {
      console.error('Failed to load events', e);
      showToast('Failed to load events', 'Error');
    } finally {
      loadingEventsRef.current = false;
    }
  }, [showToast]);

  // Load events on mount - only runs once
  useEffect(() => {
    loadEventsData();
  }, [loadEventsData]);

  // Initial load on mount - only runs once
  useEffect(() => {
    // Reset server stats on initial load
    setServerStats({
      totalCount: 0,
      activeCount: 0,
      inactiveCount: 0,
      verifiedCount: 0
    });
    // Load with saved search query if available
    loadJobSeekers(1, pageSize, savedSearchQuery || '', initialFilters.statusFilter || '', initialFilters.eventFilter || '');
    isFirstRender.current = false; // Mark first render as complete
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle active search query changes
  useEffect(() => {
    // Skip on first render
    if (isFirstRender.current) return;
    
    // Only trigger if search actually changed
    if (prevSearchFilter.current !== activeSearchQuery) {
      prevSearchFilter.current = activeSearchQuery;
      setCurrentPage(1);
      setSearchLoading(true);
      loadJobSeekersRef.current(1, pageSize, activeSearchQuery, statusFilterRef.current, eventFilterRef.current);
    }
  }, [activeSearchQuery, pageSize]);

  // Store loadJobSeekers in ref to avoid dependency issues
  const loadJobSeekersRef = useRef(loadJobSeekers);
  useEffect(() => {
    loadJobSeekersRef.current = loadJobSeekers;
  }, [loadJobSeekers]);

  // Handle status filter changes (immediate, not debounced)
  // NOTE: This does NOT use searchQuery - status filter is independent
  useEffect(() => {
    // Skip on first render
    if (isFirstRender.current) return;
    
    // Only trigger if status actually changed
    if (prevStatusFilter.current !== statusFilter) {
      prevStatusFilter.current = statusFilter;
      setCurrentPage(1);
      // Clear any pending search
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      // Status filter change - preserve current search filter
      // Note: Grid key includes statusFilter, so grid will reset automatically
      loadJobSeekersRef.current(1, pageSize, activeSearchQuery || '', statusFilter, eventFilterRef.current);
    }
  }, [statusFilter, pageSize, activeSearchQuery]);

  // Function to trigger event search - only called explicitly by button
  const triggerEventSearch = useCallback(() => {
    // Get the current value from the dropdown ref if available, otherwise use state
    let currentEventValue = eventFilter;
    if (eventDropdownRef.current && eventDropdownRef.current.value) {
      currentEventValue = eventDropdownRef.current.value;
    }
    
    if (!currentEventValue || !currentEventValue.trim()) {
      showToast('Please select an event first', 'Warning');
      return;
    }
    
    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    
    setEventSearchLoading(true);
    setCurrentPage(1);
    // Update both state and ref
    setEventFilter(currentEventValue);
    eventFilterRef.current = currentEventValue;
    
    console.log('Triggering event search with eventId:', currentEventValue);
    loadJobSeekersRef.current(1, pageSize, activeSearchQuery || '', statusFilterRef.current, currentEventValue);
  }, [eventFilter, pageSize, activeSearchQuery, showToast]);

  // Function to trigger search - only called explicitly by button or Enter key
  const triggerSearch = useCallback(() => {
    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    
    // Get search value from input ref (uncontrolled input for performance)
    const searchValue = (searchInputRef.current?.value || '').trim();
    setActiveSearchQuery(searchValue);
    setSearchLoading(true);
    prevSearchFilter.current = searchValue;
    searchFilterRef.current = searchValue;
    setCurrentPage(1);
    loadJobSeekersRef.current(1, pageSize, searchValue, statusFilterRef.current, eventFilterRef.current);
  }, [pageSize]);

  // No automatic search on typing - search only on button click or Enter key

  // Cleanup grid and toast when mode changes to prevent DOM manipulation errors
  useEffect(() => {
    // When switching to view mode, ensure grid and toast are cleaned up
    if (mode === 'view') {
      // Cleanup grid
      if (gridRef.current) {
        const grid = gridRef.current;
        try {
          if (typeof grid.destroy === 'function') {
            grid.destroy();
          }
          gridRef.current = null;
        } catch (e) {
          console.warn('Grid cleanup (non-critical):', e.message);
        }
      }
      
      // Clear any active toasts to prevent DOM errors when switching ToastComponents
      if (toastRef.current) {
        try {
          // Hide all active toasts before component unmounts
          toastRef.current.hideAll();
        } catch (e) {
          // Ignore toast cleanup errors
        }
      }
    }
  }, [mode]);

  // Sync header and content horizontal scrolling
  useEffect(() => {
    let scrollSyncActive = false;
    let observerDebounceTimer = null;

    const syncScroll = () => {
      // Find all grids in Job Seeker Management - check multiple possible container classes
      const grids = document.querySelectorAll('.bm-grid-wrap .e-grid, .data-grid-container .e-grid');
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
    
    // Debounced sync for MutationObserver to prevent cascading updates
    const debouncedSyncScroll = () => {
      if (observerDebounceTimer) clearTimeout(observerDebounceTimer);
      observerDebounceTimer = setTimeout(syncScroll, 150);
    };
    
    // Only observe the grid container, not the entire document.body
    // This prevents performance issues when typing in search field
    let observer = null;
    const gridWrap = document.querySelector('.bm-grid-wrap');
    if (gridWrap) {
      observer = new MutationObserver(debouncedSyncScroll);
      observer.observe(gridWrap, { childList: true, subtree: true });
    }

    // Also watch for window resize
    const handleResize = () => setTimeout(syncScroll, 100);
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      if (observerDebounceTimer) clearTimeout(observerDebounceTimer);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [jobSeekers]);

  // Center delete dialog when it opens
  useEffect(() => {
    if (confirmOpen && deleteDialogRef.current) {
      const dialogElement = deleteDialogRef.current.element || deleteDialogRef.current;
      if (dialogElement) {
        // Wait for dialog to render
        setTimeout(() => {
          const dialog = document.querySelector('.jsm-delete-dialog.e-dialog');
          if (dialog) {
            dialog.style.position = 'fixed';
            dialog.style.top = '50%';
            dialog.style.left = '50%';
            dialog.style.transform = 'translate(-50%, -50%)';
            dialog.style.margin = '0';
          }
        }, 10);
      }
    }
  }, [confirmOpen]);

  const handleToggleActive = useCallback(async (row) => {
    try {
      if (row.isActive) {
        await deactivateUser(row.id);
        showToast(`${row.firstName} ${row.lastName} deactivated`, 'Success');
      } else {
        await reactivateUser(row.id);
        showToast(`${row.firstName} ${row.lastName} reactivated`, 'Success');
      }
      await loadJobSeekers(currentPageRef.current, pageSizeRef.current, searchFilterRef.current, statusFilterRef.current, eventFilterRef.current);
    } catch (e) {
      console.error('Toggle active failed', e);
      showToast('Failed to update status', 'Error');
    }
  }, [showToast, loadJobSeekers]); // Removed currentPage and pageSize from dependencies, using refs instead

  const handleViewProfile = useCallback((row) => {
    console.log('View Profile clicked for:', row);
    
    // Clear any active toasts before switching modes to prevent DOM errors
    if (toastRef.current) {
      try {
        toastRef.current.hideAll();
      } catch (e) {
        // Ignore toast cleanup errors
      }
    }
    
    // Set transitioning first to hide the grid
    setIsTransitioning(true);
    
    // Set the selected job seeker
    setSelectedJobSeeker(row);
    
    // Destroy the grid after a brief moment
    setTimeout(() => {
      if (gridRef.current) {
        try {
          const grid = gridRef.current;
          if (typeof grid.destroy === 'function') {
            grid.destroy();
          }
          gridRef.current = null;
        } catch (e) {
          console.warn('Grid cleanup warning:', e);
        }
      }
      
      // Change mode after grid is destroyed
      // Use a small additional delay to ensure all cleanup completes
      setTimeout(() => {
        setMode('view');
        setIsTransitioning(false);
      }, 50);
    }, 100); // Delay to allow grid to be hidden first
  }, []);

  const startEdit = (row) => {
    const firstName = row.firstName || '';
    const lastName = row.lastName || '';
    setForm({
      firstName,
      lastName,
      email: row.email || '',
      phoneNumber: row.phone || '',
      city: row.city || '',
      state: row.state || '',
      country: row.country || '',
      avatarUrl: row.avatarUrl || '',
      password: '',
      confirmPassword: '',
    });
    setEditingId(row.id);
    setSelectedJobSeeker(row);
    setMode('edit');
  };

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Password validation - only if password is provided
    if (form.password && form.password.trim()) {
      // Check password length first
      if (form.password.length < 8) {
        showToast('Password must be at least 8 characters long', 'Error');
        return;
      }
      
      // Check if confirm password is provided
      if (!form.confirmPassword || !form.confirmPassword.trim()) {
        showToast('Please confirm your password', 'Error');
        return;
      }
      
      // Check if passwords match
      if (form.password !== form.confirmPassword) {
        showToast('Passwords do not match. Please enter the same password in both fields', 'Error');
        return;
      }
    } else if (form.confirmPassword && form.confirmPassword.trim() && !form.password) {
      // If confirm password is provided but password is not
      showToast('Please enter a password', 'Error');
      return;
    }

    try {
      const fullName = `${form.firstName} ${form.lastName}`.trim();
      const payload = {
        name: fullName || undefined,
        email: form.email || undefined,
        phoneNumber: form.phoneNumber || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        country: form.country || undefined,
        avatarUrl: form.avatarUrl || undefined,
      };
      
      // Include password if provided (admin can update password)
      if (form.password && form.password.trim()) {
        payload.password = form.password;
      }
      
      await updateUser(editingId, payload);
      showToast('Job seeker updated', 'Success');
      setMode('list');
      setEditingId(null);
      setSelectedJobSeeker(null);
      setForm({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '', phoneNumber: '', city: '', state: '', country: '', avatarUrl: '' });
      await loadJobSeekers(currentPage, pageSize, searchFilterRef.current, statusFilterRef.current, eventFilterRef.current);
    } catch (e) {
      console.error('Update job seeker failed', e);
      const msg = e?.response?.data?.message || 'Failed to update job seeker';
      showToast(msg, 'Error', 5000);
    }
  };

  const handleVerifyEmail = useCallback((row) => {
    if (row.emailVerified) return; // safety check
    setRowPendingVerify(row);
    setVerifyEmailOpen(true);
  }, []);

  const confirmVerifyEmail = async () => {
    if (!rowPendingVerify) return;
    try {
      await verifyUserEmail(rowPendingVerify.id);
      showToast(`Email verified for ${rowPendingVerify.firstName} ${rowPendingVerify.lastName}`, 'Success');
      await loadJobSeekers(currentPage, pageSize, searchFilterRef.current, statusFilterRef.current, eventFilterRef.current); // Refresh the list
    } catch (e) {
      console.error('Verify email failed', e);
      const msg = e?.response?.data?.message || 'Failed to verify email';
      showToast(msg, 'Error');
    } finally {
      setVerifyEmailOpen(false);
      setRowPendingVerify(null);
    }
  };

  const cancelVerifyEmail = () => {
    setVerifyEmailOpen(false);
    setRowPendingVerify(null);
  };

  const handleEdit = useCallback((row) => {
    // Clear any active toasts before switching modes
    if (toastRef.current) {
      try {
        toastRef.current.hideAll();
      } catch (e) {
        // Ignore toast cleanup errors
      }
    }
    
    // Set transitioning first to hide the grid
    setIsTransitioning(true);
    
    // Set the selected job seeker and populate form
    setSelectedJobSeeker(row);
    const metadata = row.metadata || {};
    const profile = metadata.profile || {};
    
    setEditForm({
      firstName: row.firstName || '',
      lastName: row.lastName || '',
      email: row.email || '',
      phone: row.phone || row.phoneNumber || '',
      city: row.city || '',
      state: row.state || '',
      country: getCountryCode(row.country || ''),
      password: '',
      confirmPassword: '',
      avatarUrl: row.avatarUrl || '',
      resumeUrl: row.resumeUrl || '',
      // Professional Summary
      headline: profile.headline || metadata.professionalHeadline || metadata.headline || '',
      keywords: profile.keywords || metadata.skills || metadata.keywords || '',
      // Experience & Employment
      primaryExperience: Array.isArray(profile.primaryExperience) ? profile.primaryExperience : 
                        (profile.primaryExperience ? [profile.primaryExperience] : 
                        (metadata.primaryJobExperience ? [metadata.primaryJobExperience] : 
                        (Array.isArray(metadata.primaryExperience) ? metadata.primaryExperience : []))),
      employmentTypes: Array.isArray(profile.employmentTypes) ? profile.employmentTypes :
                       (profile.employmentTypes ? [profile.employmentTypes] :
                       (Array.isArray(metadata.employmentTypes) ? metadata.employmentTypes :
                       (metadata.employmentType ? [metadata.employmentType] : []))),
      workLevel: profile.workLevel || metadata.experienceLevel || metadata.workLevel || '',
      // Education & Qualifications
      educationLevel: profile.educationLevel || metadata.education || metadata.educationLevel || '',
      clearance: profile.clearance || metadata.securityClearance || metadata.clearance || '',
      // Additional Information
      languages: Array.isArray(profile.languages) ? profile.languages :
                 (profile.languages ? [profile.languages] :
                 (Array.isArray(metadata.languages) ? metadata.languages :
                 (Array.isArray(row.languages) ? row.languages : []))),
      workAuthorization: profile.workAuthorization || metadata.workAuthorization || metadata.workAuth || '',
      veteranStatus: profile.veteranStatus || metadata.veteranStatus || metadata.militaryStatus || '',
      // Accessibility Needs
      usesScreenMagnifier: row.usesScreenMagnifier || false,
      usesScreenReader: row.usesScreenReader || false,
      needsASL: row.needsASL || false,
      needsCaptions: row.needsCaptions || false,
      needsOther: row.needsOther || false,
    });
    // Initialize preview states
    const existingAvatarUrl = row.avatarUrl || '';
    const existingResumeUrl = row.resumeUrl || '';
    setAvatarPreviewUrl(existingAvatarUrl);
    // Try to extract filename from resume URL, or use a default message
    if (existingResumeUrl) {
      try {
        const urlParts = existingResumeUrl.split('/');
        const fileName = urlParts[urlParts.length - 1].split('?')[0]; // Remove query params
        setResumeFileName(fileName || 'Resume uploaded');
      } catch (e) {
        setResumeFileName('Resume uploaded');
      }
    } else {
      setResumeFileName('');
    }
    setEditingId(row.id);
    setActiveEditTab(0); // Reset to first tab when editing
    
    // Destroy the grid after a brief moment
    setTimeout(() => {
      if (gridRef.current) {
        try {
          const grid = gridRef.current;
          if (typeof grid.destroy === 'function') {
            grid.destroy();
          }
          gridRef.current = null;
        } catch (e) {
          console.warn('Grid cleanup warning:', e);
        }
      }
      
      // Change mode after grid is destroyed
      setTimeout(() => {
        setMode('edit');
        setIsTransitioning(false);
      }, 50);
    }, 100);
  }, []); // Removed getCountryCode from dependencies since it's now a stable function outside component

  const setEditField = (k, v) => setEditForm(prev => ({ ...prev, [k]: v }));

  // Sync preview states with form values when in edit mode
  useEffect(() => {
    if (mode === 'edit' && editingId) {
      // Sync avatar preview - use form value if preview is empty
      if (editForm.avatarUrl && editForm.avatarUrl !== avatarPreviewUrl) {
        setAvatarPreviewUrl(editForm.avatarUrl);
      }
      // Sync resume filename - use form value if filename is empty
      if (editForm.resumeUrl && !resumeFileName) {
        try {
          const urlParts = editForm.resumeUrl.split('/');
          const fileName = urlParts[urlParts.length - 1].split('?')[0];
          setResumeFileName(fileName || 'Resume uploaded');
        } catch (e) {
          setResumeFileName('Resume uploaded');
        }
      }
    }
  }, [mode, editingId, editForm.avatarUrl, editForm.resumeUrl]);

  // Upload functions for resume and avatar
  const uploadToS3 = async (file, fileType) => {
    setUploading(true);
    setUploadingType(fileType);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      // Request presigned URL
      const presignRes = await axios.post(
        '/api/uploads/presign',
        {
          fileName: file.name,
          fileType: fileType,
          mimeType: file.type || (fileType === 'resume' ? 'application/pdf' : 'image/jpeg'),
        },
        { headers }
      );

      const { upload, download } = presignRes.data;
      const { url, key } = upload;

      // Upload to S3
      await axios.put(url, file, {
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });

      // Confirm upload
      const completeRes = await axios.post(
        '/api/uploads/complete',
        {
          fileKey: key,
          fileType: fileType,
          fileName: file.name,
          mimeType: file.type || (fileType === 'resume' ? 'application/pdf' : 'image/jpeg'),
          size: file.size,
        },
        { headers }
      );

      const downloadUrl = completeRes?.data?.file?.downloadUrl || download?.url;

      if (fileType === 'resume') {
        setResumeFileName(file.name);
        setEditField('resumeUrl', downloadUrl);
        showToast('Resume uploaded successfully', 'Success');
        if (resumeInputRef.current) resumeInputRef.current.value = '';
      } else if (fileType === 'avatar') {
        setAvatarPreviewUrl(downloadUrl);
        setEditField('avatarUrl', downloadUrl);
        showToast('Profile picture uploaded successfully', 'Success');
        if (avatarInputRef.current) avatarInputRef.current.value = '';
      }

      return downloadUrl;
    } catch (e) {
      console.error('S3 upload error', e);
      const msg = e?.response?.data?.message || 'Upload failed';
      showToast(msg, 'Error', 5000);
      throw e;
    } finally {
      setUploading(false);
      setUploadingType(null);
    }
  };

  const handleResumeUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      showToast('Please upload a PDF or Word document', 'Error');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      showToast('File size must be less than 10MB', 'Error');
      return;
    }

    try {
      await uploadToS3(file, 'resume');
    } catch (e) {
      // Error already handled in uploadToS3
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file', 'Error');
      return;
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      showToast('Image size must be less than 2MB', 'Error');
      return;
    }

    try {
      await uploadToS3(file, 'avatar');
    } catch (e) {
      // Error already handled in uploadToS3
    }
  };

  const handleSaveEdit = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    
    if (!editingId) return;
    
    // Password validation - only if password is provided
    if (editForm.password && editForm.password.trim()) {
      // Check password length first
      if (editForm.password.length < 8) {
        showToast('Password must be at least 8 characters long', 'Error');
        return;
      }
      
      // Check if confirm password is provided
      if (!editForm.confirmPassword || !editForm.confirmPassword.trim()) {
        showToast('Please confirm your password', 'Error');
        return;
      }
      
      // Check if passwords match
      if (editForm.password !== editForm.confirmPassword) {
        showToast('Passwords do not match. Please enter the same password in both fields', 'Error');
        return;
      }
    } else if (editForm.confirmPassword && editForm.confirmPassword.trim() && !editForm.password) {
      // If confirm password is provided but password is not
      showToast('Please enter a password', 'Error');
      return;
    }
    
    setSaving(true);
    try {
      const fullName = `${editForm.firstName} ${editForm.lastName}`.trim();
      const payload = {
        name: fullName || undefined,
        email: editForm.email || undefined,
        phoneNumber: editForm.phone || undefined,
        city: editForm.city || undefined,
        state: editForm.state || undefined,
        country: editForm.country || undefined,
        avatarUrl: editForm.avatarUrl || undefined,
        resumeUrl: editForm.resumeUrl || undefined,
        // Accessibility Needs
        usesScreenMagnifier: editForm.usesScreenMagnifier,
        usesScreenReader: editForm.usesScreenReader,
        needsASL: editForm.needsASL,
        needsCaptions: editForm.needsCaptions,
        needsOther: editForm.needsOther,
        // Profile data
        profile: {
          headline: editForm.headline || undefined,
          keywords: editForm.keywords || undefined,
          primaryExperience: editForm.primaryExperience && editForm.primaryExperience.length > 0 ? editForm.primaryExperience : undefined,
          employmentTypes: editForm.employmentTypes && editForm.employmentTypes.length > 0 ? editForm.employmentTypes : undefined,
          workLevel: editForm.workLevel || undefined,
          educationLevel: editForm.educationLevel || undefined,
          clearance: editForm.clearance || undefined,
          languages: editForm.languages && editForm.languages.length > 0 ? editForm.languages : undefined,
          workAuthorization: editForm.workAuthorization || undefined,
          veteranStatus: editForm.veteranStatus || undefined,
        }
      };
      
      // Include password if provided (admin can update password)
      if (editForm.password && editForm.password.trim()) {
        payload.password = editForm.password;
      }
      
      await updateUser(editingId, payload);
      showToast('Job seeker updated successfully', 'Success');
      
      // Refresh the list
      await loadJobSeekers(currentPage, pageSize, searchFilterRef.current, statusFilterRef.current, eventFilterRef.current);
      
      // Reset form
      setEditForm({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        city: '',
        state: '',
        country: '',
        password: '',
        confirmPassword: '',
        avatarUrl: '',
        resumeUrl: '',
        headline: '',
        keywords: '',
        primaryExperience: [],
        employmentTypes: [],
        workLevel: '',
        educationLevel: '',
        clearance: '',
        languages: [],
        workAuthorization: '',
        veteranStatus: '',
        usesScreenMagnifier: false,
        usesScreenReader: false,
        needsASL: false,
        needsCaptions: false,
        needsOther: false,
      });
      // Reset preview states
      setAvatarPreviewUrl('');
      setResumeFileName('');
      
      // Return to list mode
      setMode('list');
      setEditingId(null);
      setSelectedJobSeeker(null);
    } catch (e) {
      console.error('Update failed', e);
      const msg = e?.response?.data?.message || 'Failed to update job seeker';
      showToast(msg, 'Error', 5000);
    } finally {
      setSaving(false);
    }
  };


  // Grid template functions for custom column renders - memoized to prevent re-renders
  const statusTemplate = useCallback((props) => {
    const row = props;
    return (
      <span className={`status-badge ${row.isActive ? 'active' : 'inactive'}`}>
        {row.isActive ? 'Active' : 'Inactive'}
      </span>
    );
  }, []);

  const emailVerifiedTemplate = useCallback((props) => {
    const row = props;
    return (
      <span className={`status-badge ${row.emailVerified ? 'verified' : 'unverified'}`}>
        {row.emailVerified ? 'Yes' : 'No'}
      </span>
    );
  }, []);

  const lastLoginTemplate = useCallback((props) => {
    const row = props;
    return row.lastLogin ? new Date(row.lastLogin).toLocaleDateString() : 'Never';
  }, []);

  const registeredEventsTemplate = useCallback((props) => {
    const row = props;
    const registeredEvents = row.registeredEvents || [];
    
    if (!Array.isArray(registeredEvents) || registeredEvents.length === 0) {
      return (
        <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', color: '#6b7280', textAlign: 'left' }}>
          None
        </div>
      );
    }
    
    // Extract event names from registered events
    const eventNames = registeredEvents
      .map(reg => reg.name || reg.slug || 'Unknown Event')
      .filter(Boolean);
    
    return (
      <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'left' }}>
        {eventNames.join(', ')}
      </div>
    );
  }, []);

  const actionsTemplate = useCallback((props) => {
    const row = props;
    return (
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <ButtonComponent 
          cssClass="e-primary e-small" 
          onClick={() => handleViewProfile(row)}
          title="View Profile"
        >
          View
        </ButtonComponent>
        <ButtonComponent 
          cssClass="e-outline e-primary e-small" 
          onClick={() => handleEdit(row)}
          title="Edit User"
        >
          Edit
        </ButtonComponent>
        {!row.emailVerified && (
          <ButtonComponent 
            cssClass="e-outline e-primary e-small" 
            onClick={() => handleVerifyEmail(row)}
            title="Verify Email"
          >
            Verify Email
          </ButtonComponent>
        )}
        <ButtonComponent 
          cssClass={row.isActive ? "e-outline e-primary e-small" : "e-primary e-small"}
          onClick={() => handleToggleActive(row)}
          title={row.isActive ? 'Deactivate' : 'Activate'}
        >
          {row.isActive ? 'Deactivate' : 'Activate'}
        </ButtonComponent>
        {!row.isActive && (
          <ButtonComponent 
            cssClass="e-outline e-danger e-small" 
            onClick={() => handleDelete(row)}
            title="Delete Permanently"
          >
            Delete
          </ButtonComponent>
        )}
      </div>
    );
  }, [handleViewProfile, handleEdit, handleVerifyEmail, handleToggleActive, handleDelete]);

  const renderJobSeekerProfile = () => {
    console.log('renderJobSeekerProfile called, selectedJobSeeker:', selectedJobSeeker);
    console.log('Current mode:', mode);
    console.log('isTransitioning:', isTransitioning);
    
    if (!selectedJobSeeker) {
      console.warn('No selectedJobSeeker, returning null');
      return (
        <div className="dashboard-content">
          <div className="form-header">
            <ButtonComponent 
              cssClass="e-outline e-primary"
              onClick={() => {
                setMode('list');
                setSelectedJobSeeker(null);
                setIsTransitioning(false);
              }}
            >
              ← Back to List
            </ButtonComponent>
            <h2>No Job Seeker Selected</h2>
          </div>
          <p>Please select a job seeker from the list to view their profile.</p>
        </div>
      );
    }

    const js = selectedJobSeeker;
    const survey = js.survey || {};
    const metadata = js.metadata || {};
    const profile = metadata.profile || {};
    
    // Debug: Log metadata to console
    console.log('Job Seeker Metadata:', metadata);
    console.log('Job Seeker Profile:', profile);
    console.log('Full Job Seeker Object:', js);

    return (
      <div className="dashboard-content">
        <div className="form-header">
          <ButtonComponent 
            cssClass="e-outline e-primary"
            onClick={() => setMode('list')}
          >
            ← Back to List
          </ButtonComponent>
          <h2>Job Seeker Profile: {js.firstName} {js.lastName}</h2>
        </div>

        <div className="profile-sections">
          {/* Profile Header with Image */}
          <div className="profile-header">
            <div className="profile-avatar">
              {js.avatarUrl ? (
                <img src={js.avatarUrl} alt={`${js.firstName} ${js.lastName}`} className="avatar-image" />
              ) : (
                <div className="avatar-placeholder">
                  <span className="avatar-initials">
                    {js.firstName?.charAt(0)}{js.lastName?.charAt(0)}
                  </span>
                </div>
              )}
            </div>
            <div className="profile-info">
              <h2>{js.firstName} {js.lastName}</h2>
              <p className="profile-email">{js.email}</p>
              <p className="profile-location">{js.phone || '09239320093'}</p>
              <p className="profile-location">{[js.city, js.state, js.country].filter(Boolean).join(', ') || 'denver, Colorado, US'}</p>
              {js.resumeUrl && (
                <a 
                  href={js.resumeUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn-resume"
                >
                  📄 View Complete Resume
                </a>
              )}
            </div>
          </div>

          {/* Basic Information */}
          <div className="profile-section">
            <h3>Basic Information</h3>
            <div className="profile-grid-basic">
              <div className="profile-field">
                <label>Name:</label>
                <span>{js.firstName} {js.lastName}</span>
              </div>
              <div className="profile-field">
                <label>Email:</label>
                <span>{js.email}</span>
              </div>
              <div className="profile-field">
                <label>Phone:</label>
                <span>{js.phone || 'Not provided'}</span>
              </div>
              <div className="profile-field">
                <label>Location:</label>
                <span>{[js.city, js.state, js.country].filter(Boolean).join(', ') || 'Not provided'}</span>
              </div>
              <div className="profile-field status-field">
                <label>Status:</label>
                <span className={`status-badge ${js.isActive ? 'active' : 'inactive'}`}>
                  {js.isActive ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
              <div className="profile-field email-verified-field">
                <label>Email Verified:</label>
                <span className={`status-badge ${js.emailVerified ? 'verified' : 'unverified'}`}>
                  {js.emailVerified ? 'YES' : 'NO'}
                </span>
              </div>
            </div>
          </div>

          {/* Professional Summary */}
          <div className="profile-section">
            <h3>Professional Summary</h3>
            <div className="profile-grid">
              <div className="profile-field">
                <label>Professional Headline:</label>
                <span>{profile.headline || metadata.professionalHeadline || metadata.headline || 'Not provided'}</span>
              </div>
              <div className="profile-field">
                <label>Keywords & Skills:</label>
                <span>{profile.keywords || metadata.skills || metadata.keywords || 'Not provided'}</span>
              </div>
            </div>
          </div>

          {/* Experience & Employment */}
          <div className="profile-section">
            <h3>Experience & Employment</h3>
            <div className="profile-grid">
              <div className="profile-field">
                <label>Primary Job Experience:</label>
                <span>{getLabelFromValue(profile.primaryExperience?.[0] || metadata.primaryJobExperience || metadata.primaryExperience?.[0], JOB_CATEGORY_LIST)}</span>
              </div>
              <div className="profile-field">
                <label>Secondary Job Experience:</label>
                <span>{getLabelFromValue(profile.primaryExperience?.[1] || metadata.secondaryJobExperience || metadata.primaryExperience?.[1], JOB_CATEGORY_LIST)}</span>
              </div>
              <div className="profile-field">
                <label>Employment Types:</label>
                <div className="tags">
                  {(profile.employmentTypes || metadata.employmentTypes || metadata.employmentType) ? 
                    (Array.isArray(profile.employmentTypes) ? profile.employmentTypes : 
                     Array.isArray(metadata.employmentTypes) ? metadata.employmentTypes : 
                     Array.isArray(metadata.employmentType) ? metadata.employmentType : 
                     [profile.employmentTypes || metadata.employmentTypes || metadata.employmentType]).map((type, index) => (
                      <span key={index} className="tag">{getLabelFromValue(type, JOB_TYPE_LIST)}</span>
                    )) : <span>Not provided</span>}
                </div>
              </div>
              <div className="profile-field">
                <label>Experience Level:</label>
                <span>{getLabelFromValue(profile.workLevel || metadata.experienceLevel || metadata.workLevel, EXPERIENCE_LEVEL_LIST)}</span>
              </div>
            </div>
          </div>

          {/* Education & Qualifications */}
          <div className="profile-section">
            <h3>Education & Qualifications</h3>
            <div className="profile-grid">
              <div className="profile-field">
                <label>Highest Education Level:</label>
                <span>{getLabelFromValue(profile.educationLevel || metadata.education || metadata.educationLevel, EDUCATION_LEVEL_LIST)}</span>
              </div>
              <div className="profile-field">
                <label>Security Clearance:</label>
                <span>{getLabelFromValue(profile.clearance || metadata.securityClearance || metadata.clearance, SECURITY_CLEARANCE_LIST)}</span>
              </div>
            </div>
          </div>

          {/* Additional Information */}
          <div className="profile-section">
            <h3>Additional Information</h3>
            <div className="profile-grid">
              <div className="profile-field">
                <label>Languages:</label>
                <div className="tags">
                  {(profile.languages || metadata.languages || js.languages) ? 
                    (profile.languages || metadata.languages || js.languages).map((lang, index) => (
                      <span key={index} className="tag">{getLabelFromValue(lang, LANGUAGE_LIST)}</span>
                    )) : <span>Not provided</span>}
                </div>
              </div>
              <div className="profile-field">
                <label>Work Authorization:</label>
                <span>{profile.workAuthorization || metadata.workAuthorization || metadata.workAuth || 'Not provided'}</span>
              </div>
              <div className="profile-field">
                <label>Veteran/Military Status:</label>
                <span>{getLabelFromValue(profile.veteranStatus || metadata.veteranStatus || metadata.militaryStatus, MILITARY_EXPERIENCE_LIST)}</span>
              </div>
            </div>
          </div>

          {/* Accessibility Needs */}
          <div className="profile-section">
            <h3>Accessibility Needs</h3>
            <div className="profile-grid">
              <div className="profile-field">
                <label>Screen Magnifier:</label>
                <span>{js.usesScreenMagnifier ? 'Yes' : 'No'}</span>
              </div>
              <div className="profile-field">
                <label>Screen Reader:</label>
                <span>{js.usesScreenReader ? 'Yes' : 'No'}</span>
              </div>
              <div className="profile-field">
                <label>ASL Interpreter:</label>
                <span>{js.needsASL ? 'Yes' : 'No'}</span>
              </div>
              <div className="profile-field">
                <label>Captions:</label>
                <span>{js.needsCaptions ? 'Yes' : 'No'}</span>
              </div>
              <div className="profile-field">
                <label>Other Accommodations:</label>
                <span>{js.needsOther ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>

          {/* Account Details */}
          <div className="profile-section">
            <h3>Account Details</h3>
            <div className="profile-grid">
              <div className="profile-field">
                <label>Created:</label>
                <span>{new Date(js.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="profile-field">
                <label>Last Login:</label>
                <span>{js.lastLogin ? new Date(js.lastLogin).toLocaleDateString() : 'Never'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Use server-side stats when available, otherwise calculate from current page
  const stats = useMemo(() => {
    // If we have server-side stats (from filtered query), use those
    if (serverStats.totalCount > 0 || eventFilter) {
      return {
        activeCount: serverStats.activeCount,
        inactiveCount: serverStats.inactiveCount,
        verifiedCount: serverStats.verifiedCount
      };
    }
    // Otherwise calculate from current page (for initial load without filters)
    const activeCount = jobSeekers.filter(js => js.isActive).length;
    const inactiveCount = jobSeekers.filter(js => !js.isActive).length;
    const verifiedCount = jobSeekers.filter(js => js.emailVerified).length;
    return { activeCount, inactiveCount, verifiedCount };
  }, [jobSeekers, serverStats, eventFilter]);

  // Memoize grid data - only update when jobSeekers actually changes
  // Memoize the paginated dataSource to prevent re-renders when selection changes
  const paginatedDataSource = useMemo(() => {
    return jobSeekers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [jobSeekers, currentPage, pageSize]);

  // Memoize grid settings to prevent unnecessary re-renders
  const gridFilterSettings = useMemo(() => ({
    type: 'Menu',
    showFilterBarStatus: true,
    immediateModeDelay: 0,
    showFilterBarOperator: true,
    enableCaseSensitivity: false
  }), []);

  const gridToolbar = useMemo(() => ['ColumnChooser'], []);

  const gridSelectionSettings = useMemo(() => ({
    type: 'Multiple',
    checkboxOnly: true
  }), []);

  // Memoize column templates to prevent re-renders
  const textTemplate = useCallback((props, field) => (
    <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
      {props[field] || ''}
    </div>
  ), []);

  const firstNameTemplate = useCallback((props) => textTemplate(props, 'firstName'), [textTemplate]);
  const lastNameTemplate = useCallback((props) => textTemplate(props, 'lastName'), [textTemplate]);
  const emailTemplate = useCallback((props) => textTemplate(props, 'email'), [textTemplate]);
  const phoneTemplate = useCallback((props) => textTemplate(props, 'phone'), [textTemplate]);
  const cityTemplate = useCallback((props) => textTemplate(props, 'city'), [textTemplate]);
  const stateTemplate = useCallback((props) => textTemplate(props, 'state'), [textTemplate]);

  return (
    <div className="dashboard">
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="jobseekers" />
        <main className="dashboard-main">
          {mode === 'view' ? (
            renderJobSeekerProfile()
          ) : mode === 'edit' ? (
            <div className="dashboard-content">
              <div className="form-header">
                <ButtonComponent 
                  cssClass="e-outline e-primary"
                  onClick={() => {
                    setMode('list');
                    setEditingId(null);
                    setSelectedJobSeeker(null);
                    setIsTransitioning(false);
                  }}
                >
                  ← Back to List
                </ButtonComponent>
                <h2>Edit Job Seeker: {editForm.firstName} {editForm.lastName}</h2>
              </div>

              {/* Custom Tabs */}
              <div className="jsm-custom-tabs">
                {/* Tab Headers */}
                <div className="jsm-tab-headers">
                  {['Basic Information', 'Professional Summary', 'Experience & Employment', 'Education & Qualifications', 'Additional Information', 'Accessibility Needs'].map((tab, index) => (
                    <button
                      key={index}
                      type="button"
                      className={`jsm-tab-btn ${activeEditTab === index ? 'active' : ''}`}
                      onClick={() => setActiveEditTab(index)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="jsm-tab-content">
                  {/* Basic Information Tab */}
                  {activeEditTab === 0 && (
                    <div className="jsm-tab-panel">
                      <Input
                        label="First Name"
                        value={editForm.firstName}
                        onChange={(e) => setEditField('firstName', e.target.value)}
                        required
                        placeholder="Enter first name"
                      />
                      <Input
                        label="Last Name"
                        value={editForm.lastName}
                        onChange={(e) => setEditField('lastName', e.target.value)}
                        required
                        placeholder="Enter last name"
                      />
                      <Input
                        label="Email"
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditField('email', e.target.value)}
                        required
                        placeholder="Enter email address"
                      />
                      <div className="password-field-container">
                        <Input 
                          label="New Password (leave blank to keep current)" 
                          type={showPwd ? 'text' : 'password'} 
                          value={editForm.password} 
                          onChange={(e) => setEditField('password', e.target.value)} 
                        />
                        <ButtonComponent 
                          cssClass="e-outline e-primary e-small password-toggle-btn" 
                          aria-pressed={showPwd} 
                          aria-label={showPwd ? 'Hide password' : 'Show password'} 
                          onClick={() => setShowPwd(s => !s)}
                        >
                          {showPwd ? 'Hide' : 'Show'}
                        </ButtonComponent>
                      </div>
                      <div className="password-field-container">
                        <Input 
                          label="Confirm New Password (leave blank to keep current)" 
                          type={showConfirmPwd ? 'text' : 'password'} 
                          value={editForm.confirmPassword} 
                          onChange={(e) => setEditField('confirmPassword', e.target.value)} 
                        />
                        <ButtonComponent 
                          cssClass="e-outline e-primary e-small password-toggle-btn" 
                          aria-pressed={showConfirmPwd} 
                          aria-label={showConfirmPwd ? 'Hide confirm password' : 'Show confirm password'} 
                          onClick={() => setShowConfirmPwd(s => !s)}
                        >
                          {showConfirmPwd ? 'Hide' : 'Show'}
                        </ButtonComponent>
                      </div>
                      <Input
                        label="Phone"
                        type="tel"
                        value={editForm.phone}
                        onChange={(e) => setEditField('phone', e.target.value)}
                        placeholder="Enter phone number"
                      />
                      <Input
                        label="City"
                        value={editForm.city}
                        onChange={(e) => setEditField('city', e.target.value)}
                        placeholder="Enter city"
                      />
                      <Input
                        label="State"
                        value={editForm.state}
                        onChange={(e) => setEditField('state', e.target.value)}
                        placeholder="Enter state"
                      />
                      <div className="jsm-form-field-wrapper">
                        <label className="jsm-field-label">Country</label>
                        <select
                          className="jsm-select"
                          value={editForm.country || ''}
                          onChange={(e) => setEditField('country', e.target.value)}
                        >
                          <option value="">Select Country</option>
                          {COUNTRY_OF_ORIGIN_LIST.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      {/* Profile Image Upload */}
                      <div className="jsm-upload-field">
                        <label className="jsm-field-label">Profile Image</label>
                        <div className="jsm-upload-container">
                          {(avatarPreviewUrl || editForm.avatarUrl) && (
                            <div className="jsm-avatar-preview">
                              <img src={avatarPreviewUrl || editForm.avatarUrl} alt="Profile preview" onError={(e) => {
                                // Hide image if it fails to load
                                e.target.style.display = 'none';
                              }} />
                              <button
                                type="button"
                                className="jsm-remove-avatar"
                                onClick={() => {
                                  setAvatarPreviewUrl('');
                                  setEditField('avatarUrl', '');
                                  if (avatarInputRef.current) avatarInputRef.current.value = '';
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                          <div className="jsm-upload-input-wrapper">
                            <input
                              ref={avatarInputRef}
                              type="file"
                              accept="image/*"
                              onChange={handleAvatarUpload}
                              disabled={uploading && uploadingType === 'avatar'}
                              className="jsm-file-input"
                              id="avatar-upload"
                            />
                            <label htmlFor="avatar-upload" className="jsm-file-label">
                              {uploading && uploadingType === 'avatar' ? 'Uploading...' : avatarPreviewUrl ? 'Change Image' : 'Upload Profile Image'}
                            </label>
                          </div>
                          <p className="jsm-upload-hint">Accepted formats: JPG, PNG, GIF, WebP (max 2MB)</p>
                        </div>
                      </div>

                      {/* Resume Upload */}
                      <div className="jsm-upload-field">
                        <label className="jsm-field-label">Resume</label>
                        <div className="jsm-upload-container">
                          {(resumeFileName || editForm.resumeUrl) && (
                            <div className="jsm-resume-info">
                              <span className="jsm-resume-name">{resumeFileName || 'Resume uploaded'}</span>
                              {(editForm.resumeUrl || resumeFileName) && (
                                <a
                                  href={editForm.resumeUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="jsm-view-resume"
                                >
                                  View Resume
                                </a>
                              )}
                              <button
                                type="button"
                                className="jsm-remove-resume"
                                onClick={() => {
                                  setResumeFileName('');
                                  setEditField('resumeUrl', '');
                                  if (resumeInputRef.current) resumeInputRef.current.value = '';
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                          <div className="jsm-upload-input-wrapper">
                            <input
                              ref={resumeInputRef}
                              type="file"
                              accept=".pdf,.doc,.docx"
                              onChange={handleResumeUpload}
                              disabled={uploading && uploadingType === 'resume'}
                              className="jsm-file-input"
                              id="resume-upload"
                            />
                            <label htmlFor="resume-upload" className="jsm-file-label">
                              {uploading && uploadingType === 'resume' ? 'Uploading...' : resumeFileName ? 'Change Resume' : 'Upload Resume'}
                            </label>
                          </div>
                          <p className="jsm-upload-hint">Accepted formats: PDF, DOC, DOCX (max 10MB)</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Professional Summary Tab */}
                  {activeEditTab === 1 && (
                    <div className="jsm-tab-panel">
                      <Input
                        label="Professional Headline"
                        value={editForm.headline}
                        onChange={(e) => setEditField('headline', e.target.value)}
                        placeholder="Enter professional headline"
                      />
                      <Input
                        label="Keywords & Skills"
                        value={editForm.keywords}
                        onChange={(e) => setEditField('keywords', e.target.value)}
                        placeholder="Enter keywords and skills (comma-separated)"
                      />
                    </div>
                  )}

                  {/* Experience & Employment Tab */}
                  {activeEditTab === 2 && (
                    <div className="jsm-tab-panel">
                      <div className="jsm-form-field-wrapper">
                        <label className="jsm-field-label">Primary Job Experience (max 2)</label>
                        <MultiSelectComponent
                          dataSource={JOB_CATEGORY_LIST}
                          fields={{ text: 'name', value: 'value' }}
                          value={editForm.primaryExperience}
                          mode="Box"
                          placeholder="Select primary job experience"
                          enableSelectionOrder={false}
                          maximumSelectionLength={2}
                          cssClass="jsm-multiselect"
                          showDropDownIcon={true}
                          popupHeight="260px"
                          allowFiltering={false}
                          change={(args) => {
                            const values = Array.isArray(args?.value) ? args.value : [];
                            setEditField('primaryExperience', values.slice(0, 2));
                          }}
                        />
                      </div>
                      <div className="jsm-form-field-wrapper">
                        <label className="jsm-field-label">Employment Types</label>
                        <MultiSelectComponent
                          dataSource={JOB_TYPE_LIST}
                          fields={{ text: 'name', value: 'value' }}
                          value={editForm.employmentTypes}
                          mode="Box"
                          placeholder="Select employment types"
                          enableSelectionOrder={false}
                          cssClass="jsm-multiselect"
                          showDropDownIcon={true}
                          popupHeight="260px"
                          allowFiltering={false}
                          change={(args) => {
                            const values = Array.isArray(args?.value) ? args.value : [];
                            setEditField('employmentTypes', values);
                          }}
                        />
                      </div>
                      <div className="jsm-form-field-wrapper">
                        <label className="jsm-field-label">Experience Level</label>
                        <select
                          className="jsm-select"
                          value={editForm.workLevel || ''}
                          onChange={(e) => setEditField('workLevel', e.target.value)}
                        >
                          <option value="">Select experience level</option>
                          {EXPERIENCE_LEVEL_LIST.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Education & Qualifications Tab */}
                  {activeEditTab === 3 && (
                    <div className="jsm-tab-panel">
                      <div className="jsm-form-field-wrapper">
                        <label className="jsm-field-label">Highest Education Level</label>
                        <select
                          className="jsm-select"
                          value={editForm.educationLevel || ''}
                          onChange={(e) => setEditField('educationLevel', e.target.value)}
                        >
                          <option value="">Select education level</option>
                          {EDUCATION_LEVEL_LIST.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="jsm-form-field-wrapper">
                        <label className="jsm-field-label">Security Clearance</label>
                        <select
                          className="jsm-select"
                          value={editForm.clearance || ''}
                          onChange={(e) => setEditField('clearance', e.target.value)}
                        >
                          <option value="">Select security clearance</option>
                          {SECURITY_CLEARANCE_LIST.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Additional Information Tab */}
                  {activeEditTab === 4 && (
                    <div className="jsm-tab-panel">
                      <div className="jsm-form-field-wrapper">
                        <label className="jsm-field-label">Languages</label>
                        <MultiSelectComponent
                          dataSource={LANGUAGE_LIST}
                          fields={{ text: 'name', value: 'value' }}
                          value={editForm.languages}
                          mode="Box"
                          placeholder="Select languages"
                          enableSelectionOrder={false}
                          cssClass="jsm-multiselect"
                          showDropDownIcon={true}
                          popupHeight="260px"
                          allowFiltering={false}
                          change={(args) => {
                            const values = Array.isArray(args?.value) ? args.value : [];
                            setEditField('languages', values);
                          }}
                        />
                      </div>
                      <Input
                        label="Work Authorization"
                        value={editForm.workAuthorization}
                        onChange={(e) => setEditField('workAuthorization', e.target.value)}
                        placeholder="Enter work authorization"
                      />
                      <div className="jsm-form-field-wrapper">
                        <label className="jsm-field-label">Veteran/Military Status</label>
                        <select
                          className="jsm-select"
                          value={editForm.veteranStatus || ''}
                          onChange={(e) => setEditField('veteranStatus', e.target.value)}
                        >
                          <option value="">Select veteran status</option>
                          {MILITARY_EXPERIENCE_LIST.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Accessibility Needs Tab */}
                  {activeEditTab === 5 && (
                    <div className="jsm-tab-panel">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <label className="jsm-checkbox-label">
                          <input
                            type="checkbox"
                            checked={editForm.usesScreenMagnifier}
                            onChange={(e) => setEditField('usesScreenMagnifier', e.target.checked)}
                          />
                          <span>Screen Magnifier</span>
                        </label>
                        <label className="jsm-checkbox-label">
                          <input
                            type="checkbox"
                            checked={editForm.usesScreenReader}
                            onChange={(e) => setEditField('usesScreenReader', e.target.checked)}
                          />
                          <span>Screen Reader</span>
                        </label>
                        <label className="jsm-checkbox-label">
                          <input
                            type="checkbox"
                            checked={editForm.needsASL}
                            onChange={(e) => setEditField('needsASL', e.target.checked)}
                          />
                          <span>ASL Interpreter</span>
                        </label>
                        <label className="jsm-checkbox-label">
                          <input
                            type="checkbox"
                            checked={editForm.needsCaptions}
                            onChange={(e) => setEditField('needsCaptions', e.target.checked)}
                          />
                          <span>Captions</span>
                        </label>
                        <label className="jsm-checkbox-label">
                          <input
                            type="checkbox"
                            checked={editForm.needsOther}
                            onChange={(e) => setEditField('needsOther', e.target.checked)}
                          />
                          <span>Other Accommodations</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Save Button */}
                <div className="jsm-save-button-container">
                  <ButtonComponent 
                    cssClass="e-primary" 
                    disabled={saving}
                    isPrimary={true}
                    onClick={handleSaveEdit}
                  >
                    {saving ? 'Saving…' : 'Save Changes'}
                  </ButtonComponent>
                </div>
              </div>
            </div>
          ) : (
          <div className="dashboard-content">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2>Job Seeker Management</h2>
                <p>Manage job seeker accounts and profiles</p>
              </div>
              {mode === 'list' && selectedJobSeekers.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="select-all-jobseekers"
                      checked={selectedJobSeekers.length > 0 && selectedJobSeekers.length === jobSeekers.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Select all rows
                          if (gridRef.current) {
                            gridRef.current.selectRows(Array.from({ length: jobSeekers.length }, (_, i) => i));
                            // Manually update state to ensure checkbox reflects selection immediately
                            setTimeout(() => {
                              const currentSelection = getSelectedJobSeekersFromGrid();
                              setSelectedJobSeekers(currentSelection);
                            }, 100);
                          }
                        } else {
                          // Deselect all rows
                          if (gridRef.current) {
                            gridRef.current.clearSelection();
                            setSelectedJobSeekers([]);
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
                    <label htmlFor="select-all-jobseekers" style={{ cursor: 'pointer', userSelect: 'none', fontSize: '14px', fontWeight: '500' }}>
                      Select All
                    </label>
                  </div>
                  <ButtonComponent 
                    cssClass="e-danger"
                    onClick={handleBulkDelete}
                    disabled={isDeleting}
                    aria-label={`Delete ${selectedJobSeekers.length} selected job seekers`}
                  >
                    {isDeleting ? 'Deleting...' : `Delete Selected (${selectedJobSeekers.length})`}
                  </ButtonComponent>
                </div>
              )}
            </div>

            {/* Filters */}
            <div className="jsm-filters-row" style={{ marginBottom: 12, paddingLeft: '20px', paddingRight: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Bulk Action Buttons */}
              <ButtonComponent 
                cssClass="e-outline e-primary e-small" 
                onClick={handleSelectAll}
                aria-label="Select all items on current page"
              >
                Select All
              </ButtonComponent>
              <ButtonComponent 
                cssClass="e-outline e-primary e-small" 
                onClick={handleDeselectAll}
                disabled={selectedItems.length === 0}
                aria-label="Deselect all items"
              >
                Deselect All
              </ButtonComponent>
              <ButtonComponent 
                cssClass="e-danger e-small" 
                onClick={handleBulkDelete} 
                disabled={selectedItems.length === 0}
                aria-label={`Delete ${selectedItems.length} selected item(s)`}
              >
                Delete Selected ({selectedItems.length})
              </ButtonComponent>
              {/* Status Filter */}
              <div style={{ width: '200px', flexShrink: 0 }}>
                <DropDownListComponent
                  id="status-filter-dropdown"
                  dataSource={statusOptions.map(s => ({ value: s.value, text: s.label }))}
                  fields={{ value: 'value', text: 'text' }}
                  value={statusFilter}
                  change={(e) => {
                    setStatusFilter(e.value || '');
                    // loadJobSeekers will be called automatically via useEffect when statusFilter changes
                  }}
                  placeholder="Select Status"
                  cssClass="status-filter-dropdown"
                  popupHeight="300px"
                  width="100%"
                />
              </div>
              {/* Event Filter */}
              <div style={{ width: '250px', flexShrink: 0 }}>
                <DropDownListComponent
                  ref={eventDropdownRef}
                  id="event-filter-dropdown"
                  dataSource={eventOptions.map(e => ({ value: e.value, text: e.label }))}
                  fields={{ value: 'value', text: 'text' }}
                  value={eventFilter}
                  change={(e) => {
                    const selectedValue = e.value || e.itemData?.value || '';
                    console.log('Event dropdown changed:', selectedValue, e);
                    setEventFilter(selectedValue);
                    eventFilterRef.current = selectedValue;
                    // Don't auto-trigger search - user must click "Search by Event" button
                  }}
                  placeholder="Select Event"
                  cssClass="event-filter-dropdown"
                  popupHeight="300px"
                  width="100%"
                />
              </div>
              {/* Search by Event Button */}
              <ButtonComponent
                cssClass="e-primary e-small"
                onClick={triggerEventSearch}
                disabled={eventSearchLoading || !eventFilter}
                aria-label="Search by event"
                style={{ minWidth: '140px', height: '44px' }}
              >
                {eventSearchLoading ? 'Searching...' : 'Search by Event'}
              </ButtonComponent>
              {eventFilter && (
                <ButtonComponent
                  cssClass="e-outline e-primary e-small"
                  onClick={() => {
                    setEventFilter('');
                    eventFilterRef.current = '';
                    setCurrentPage(1);
                    // Reload without event filter
                    loadJobSeekersRef.current(1, pageSize, activeSearchQuery || '', statusFilterRef.current, '');
                  }}
                  disabled={eventSearchLoading}
                  aria-label="Clear event filter"
                  style={{ minWidth: '70px', height: '44px' }}
                >
                  Clear
                </ButtonComponent>
              )}
              {/* Search Section - Right - Using uncontrolled input for performance */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: 'auto' }}>
                <div style={{ marginBottom: 0 }}>
                  <input
                    ref={searchInputRef}
                    id="jobseeker-search-input"
                    type="text"
                    defaultValue=""
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        triggerSearch();
                      }
                    }}
                    placeholder="Search by name, email, or any field..."
                    style={{ 
                      width: '300px', 
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      outline: 'none'
                    }}
                    className="jsm-search-input-native"
                  />
                </div>
                <ButtonComponent
                  cssClass="e-primary e-small"
                  onClick={triggerSearch}
                  disabled={searchLoading}
                  aria-label="Search job seekers"
                  style={{ minWidth: '80px', height: '44px' }}
                >
                  {searchLoading ? 'Searching...' : 'Search'}
                </ButtonComponent>
                {activeSearchQuery && (
                  <ButtonComponent
                    cssClass="e-outline e-primary e-small"
                    onClick={() => {
                      if (searchInputRef.current) {
                        searchInputRef.current.value = '';
                      }
                      setActiveSearchQuery('');
                      // Clear from sessionStorage
                      try {
                        sessionStorage.removeItem('jobSeekerManagement_searchQuery');
                      } catch (error) {
                        console.error('Error clearing Job Seeker Management search query from sessionStorage:', error);
                      }
                      // loadJobSeekers will be called automatically via useEffect when activeSearchQuery changes
                    }}
                    disabled={searchLoading}
                    aria-label="Clear search"
                    style={{ minWidth: '70px', height: '44px' }}
                  >
                    Clear
                  </ButtonComponent>
                )}
              </div>
            </div>

            {/* Select All Pages Banner */}
            {selectedItems.length === jobSeekers.length && jobSeekers.length > 0 && !selectAllPages && pagination.totalCount > jobSeekers.length && (
              <div style={{
                background: '#e3f2fd',
                padding: '12px 20px',
                borderRadius: '8px',
                marginBottom: '16px',
                marginLeft: '20px',
                marginRight: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: '1px solid #90caf9'
              }}>
                <span style={{ color: '#1976d2', fontWeight: '500' }}>
                  All {jobSeekers.length} job seeker(s) on this page are selected. 
                  {pagination.totalCount > jobSeekers.length && ` There are ${pagination.totalCount - jobSeekers.length} more job seeker(s) on other pages.`}
                </span>
                <ButtonComponent 
                  cssClass="e-primary e-small" 
                  onClick={handleSelectAllPages}
                  aria-label="Select all job seekers across all pages"
                >
                  Select All {pagination.totalCount} Job Seekers
                </ButtonComponent>
              </div>
            )}

            {/* All Pages Selected Banner */}
            {selectAllPages && (
              <div style={{
                background: '#c8e6c9',
                padding: '12px 20px',
                borderRadius: '8px',
                marginBottom: '16px',
                marginLeft: '20px',
                marginRight: '20px',
                border: '1px solid #81c784'
              }}>
                <span style={{ color: '#2e7d32', fontWeight: '600' }}>
                  ✓ All {selectedItems.length} job seeker(s) across all pages are selected.
                </span>
              </div>
            )}

            {/* Stats - using server-side filtered stats */}
            <div className="stats-row">
              <div className="stat-card">
                <h4>Total Job Seekers</h4>
                <span className="stat-number">{pagination.totalCount || serverStats.totalCount || 0}</span>
              </div>
              <div className="stat-card">
                <h4>Active</h4>
                <span className="stat-number">{stats.activeCount}</span>
              </div>
              <div className="stat-card">
                <h4>Inactive</h4>
                <span className="stat-number">{stats.inactiveCount}</span>
              </div>
              <div className="stat-card">
                <h4>Email Verified</h4>
                <span className="stat-number">{stats.verifiedCount}</span>
              </div>
            </div>

            {/* Data Grid */}
            {mode === 'list' && !isTransitioning && (
              <div className="bm-grid-wrap" style={{ position: 'relative', display: isTransitioning ? 'none' : 'block' }}>
                {loading && (
                  <div className="jsm-grid-loading-overlay">
                    <div className="jsm-loading-container">
                      <div className="jsm-loading-spinner" aria-label="Loading job seekers" role="status" aria-live="polite"></div>
                      <div className="jsm-loading-text">Loading job seekers...</div>
                    </div>
                  </div>
                )}
                {searchLoading && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(255, 255, 255, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10,
                    borderRadius: '8px',
                    pointerEvents: 'none' // Don't block interactions
                  }}>
                    <div style={{ fontSize: '14px', color: '#6b7280' }}>Searching...</div>
                  </div>
                )}
                <GridComponent
                  ref={gridRef}
                  dataSource={paginatedDataSource}
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
                  selectionSettings={gridSelectionSettings}
                  enableHover={true}
                  allowRowDragAndDrop={false}
                  enableHeaderFocus={false}
                  rowSelected={() => {
                    setTimeout(() => {
                      const currentSelection = getSelectedJobSeekersFromGrid();
                      setSelectedJobSeekers(currentSelection);
                    }, 50);
                  }}
                  rowDeselected={() => {
                    setTimeout(() => {
                      const currentSelection = getSelectedJobSeekersFromGrid();
                      setSelectedJobSeekers(currentSelection);
                    }, 50);
                  }}
                >
              <ColumnsDirective>
                <ColumnDirective type='checkbox' width='50' />
                <ColumnDirective field='id' headerText='' width='0' isPrimaryKey={true} visible={false} showInColumnChooser={false} />
                <ColumnDirective 
                  field='firstName' 
                  headerText='First Name' 
                  width='150' 
                  allowFiltering={true}
                  template={firstNameTemplate}
                />
                <ColumnDirective 
                  field='lastName' 
                  headerText='Last Name' 
                  width='150' 
                  allowFiltering={true}
                  template={lastNameTemplate}
                />
                <ColumnDirective 
                  field='email' 
                  headerText='Email' 
                  width='250' 
                  allowFiltering={true}
                  template={emailTemplate}
                />
                <ColumnDirective 
                  field='phone' 
                  headerText='Phone' 
                  width='150' 
                  allowFiltering={true}
                  template={phoneTemplate}
                />
                <ColumnDirective 
                  field='city' 
                  headerText='City' 
                  width='120' 
                  allowFiltering={true}
                  template={cityTemplate}
                />
                <ColumnDirective 
                  field='state' 
                  headerText='State' 
                  width='120' 
                  allowFiltering={true}
                  template={stateTemplate}
                />
                <ColumnDirective 
                  field='statusText' 
                  headerText='Status' 
                  width='120' 
                  textAlign='Center'
                  allowFiltering={true}
                  template={statusTemplate}
                />
                <ColumnDirective 
                  field='emailVerified' 
                  headerText='Email Verified' 
                  width='130' 
                  textAlign='Center'
                  allowFiltering={true}
                  template={emailVerifiedTemplate}
                />
                <ColumnDirective 
                  field='createdAt' 
                  headerText='Registration Date' 
                  width='180' 
                  allowFiltering={true}
                  allowSorting={true}
                  template={(props) => (
                    <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                      {props.createdAt ? new Date(props.createdAt).toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : 'N/A'}
                    </div>
                  )}
                />
                <ColumnDirective 
                  field='createdAt' 
                  headerText='Registration Date' 
                  width='180' 
                  allowFiltering={true}
                  template={(props) => (
                    <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                      {lastLoginTemplate(props)}
                    </div>
                  )}
                />
                <ColumnDirective 
                  field='lastLogin' 
                  headerText='Last Login' 
                  width='150' 
                  allowFiltering={true}
                  template={lastLoginTemplate}
                />
                <ColumnDirective 
                  field='registeredEvents' 
                  headerText='Event Registrations' 
                  width='300' 
                  allowFiltering={true}
                  template={registeredEventsTemplate}
                />
                <ColumnDirective 
                  headerText='Actions' 
                  width='550' 
                  allowSorting={false} 
                  allowFiltering={false}
                  template={actionsTemplate}
                />
              </ColumnsDirective>
              <GridInject services={[Page, Sort, Filter, GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu]} />
                </GridComponent>

                {/* Custom Server-Side Pagination */}
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
                      value={pageSize}
                      onChange={(e) => {
                        const newSize = parseInt(e.target.value);
                        setPageSize(newSize);
                        setCurrentPage(1);
                        loadJobSeekers(1, newSize, searchFilterRef.current, statusFilterRef.current, eventFilterRef.current);
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
                      Page {currentPage} of {pagination.totalPages || 1} ({pagination.totalCount || 0} total)
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => {
                        if (currentPage > 1) {
                          const newPage = 1;
                          setCurrentPage(newPage);
                          loadJobSeekers(newPage, pageSize, searchFilterRef.current, statusFilterRef.current, eventFilterRef.current);
                        }
                      }}
                      disabled={currentPage <= 1 || loading}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        backgroundColor: currentPage <= 1 ? '#f3f4f6' : '#fff',
                        cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        color: currentPage <= 1 ? '#9ca3af' : '#374151'
                      }}
                      title="First Page"
                    >
                      ⟨⟨
                    </button>
                    <button
                      onClick={() => {
                        if (currentPage > 1) {
                          const newPage = currentPage - 1;
                          setCurrentPage(newPage);
                          loadJobSeekers(newPage, pageSize, searchFilterRef.current, statusFilterRef.current, eventFilterRef.current);
                        }
                      }}
                      disabled={currentPage <= 1 || loading}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        backgroundColor: currentPage <= 1 ? '#f3f4f6' : '#fff',
                        cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        color: currentPage <= 1 ? '#9ca3af' : '#374151'
                      }}
                      title="Previous Page"
                    >
                      ⟨ Prev
                    </button>
                    
                    <input
                      type="number"
                      min="1"
                      max={pagination.totalPages || 1}
                      value={currentPage}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (val >= 1 && val <= (pagination.totalPages || 1)) {
                          setCurrentPage(val);
                          loadJobSeekers(val, pageSize, searchFilterRef.current, statusFilterRef.current, eventFilterRef.current);
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
                        if (currentPage < (pagination.totalPages || 1)) {
                          const newPage = currentPage + 1;
                          setCurrentPage(newPage);
                          loadJobSeekers(newPage, pageSize, searchFilterRef.current, statusFilterRef.current, eventFilterRef.current);
                        }
                      }}
                      disabled={currentPage >= (pagination.totalPages || 1) || loading}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        backgroundColor: currentPage >= (pagination.totalPages || 1) ? '#f3f4f6' : '#fff',
                        cursor: currentPage >= (pagination.totalPages || 1) ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        color: currentPage >= (pagination.totalPages || 1) ? '#9ca3af' : '#374151'
                      }}
                      title="Next Page"
                    >
                      Next ⟩
                    </button>
                    <button
                      onClick={() => {
                        if (currentPage < (pagination.totalPages || 1)) {
                          const newPage = pagination.totalPages || 1;
                          setCurrentPage(newPage);
                          loadJobSeekers(newPage, pageSize, searchFilterRef.current, statusFilterRef.current, eventFilterRef.current);
                        }
                      }}
                      disabled={currentPage >= (pagination.totalPages || 1) || loading}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        backgroundColor: currentPage >= (pagination.totalPages || 1) ? '#f3f4f6' : '#fff',
                        cursor: currentPage >= (pagination.totalPages || 1) ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        color: currentPage >= (pagination.totalPages || 1) ? '#9ca3af' : '#374151'
                      }}
                      title="Last Page"
                    >
                      ⟩⟩
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}
        </main>
      </div>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMsg}
      </div>

      {/* Delete confirm modal - Syncfusion DialogComponent */}
      <DialogComponent
        ref={deleteDialogRef}
        width="450px"
        isModal={true}
        showCloseIcon={true}
        visible={confirmOpen}
        header="Delete Job Seeker"
        closeOnEscape={true}
        close={cancelDelete}
        cssClass="jsm-delete-dialog"
        buttons={[
          {
            buttonModel: {
              content: 'Cancel',
              isPrimary: false,
              cssClass: 'e-outline e-primary'
            },
            click: () => {
              cancelDelete();
            }
          },
          {
            buttonModel: {
              content: 'Delete',
              isPrimary: true,
              cssClass: 'e-danger'
            },
            click: () => {
              confirmDelete();
            }
          }
        ]}
      >
        <div style={{ padding: '12px 0' }}>
          <p style={{ margin: 0, lineHeight: '1.5' }}>
            Are you sure you want to permanently delete <strong>{rowPendingDelete?.firstName} {rowPendingDelete?.lastName}</strong>? This action cannot be undone.
          </p>
        </div>
      </DialogComponent>

      {/* Bulk Delete confirm modal - Syncfusion DialogComponent */}
      <DialogComponent
        width="450px"
        isModal={true}
        showCloseIcon={true}
        visible={confirmBulkDeleteOpen}
        header="Bulk Delete Job Seekers"
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
          Are you sure you want to permanently delete <strong>{selectedJobSeekers.length} job seeker(s)</strong>? This action cannot be undone. Active users will be automatically deactivated before deletion.
        </p>
      </DialogComponent>

      {/* Verify Email confirm modal - Syncfusion DialogComponent */}
      <DialogComponent
        width="450px"
        isModal={true}
        showCloseIcon={true}
        visible={verifyEmailOpen}
        header="Verify Email"
        closeOnEscape={true}
        close={cancelVerifyEmail}
        buttons={[
          {
            buttonModel: {
              content: 'Cancel',
              isPrimary: false,
              cssClass: 'e-outline e-primary'
            },
            click: () => {
              cancelVerifyEmail();
            }
          },
          {
            buttonModel: {
              content: 'Verify',
              isPrimary: true,
              cssClass: 'e-primary'
            },
            click: () => {
              confirmVerifyEmail();
            }
          }
        ]}
      >
        <p style={{ margin: 0, lineHeight: '1.5' }}>
          Verify email for <strong>{rowPendingVerify?.firstName} {rowPendingVerify?.lastName}</strong> ({rowPendingVerify?.email})?
        </p>
      </DialogComponent>

      {/* Bulk Delete confirm modal */}
      <DialogComponent
        width="500px"
        isModal={true}
        showCloseIcon={true}
        visible={bulkDeleteConfirmOpen}
        header="Delete Multiple Job Seekers"
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
          Are you sure you want to permanently delete <strong>{selectedItems.length}</strong> selected job seeker(s)? 
          <br /><br />
          This action cannot be undone.
        </p>
      </DialogComponent>

      {/* Syncfusion ToastComponent - shared across all modes to prevent DOM errors */}
      <ToastComponent 
        ref={(toast) => toastRef.current = toast}
        position={{ X: 'Right', Y: 'Bottom' }}
        showProgressBar={true}
        timeOut={3000}
        newestOnTop={true}
      />
    </div>
  );
}

