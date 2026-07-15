import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import useModalAriaHidden from '../../hooks/useModalAriaHidden';
import useQueryParamState from '../../hooks/useQueryParamState';
import '../Dashboard/Dashboard.css';
import './JobSeekerManagement.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import { openResumeInNewTab } from '../../utils/resumeViewer';
import filterIcon from '../../assets/filter.png';
import { GridComponent, ColumnsDirective, ColumnDirective, Inject as GridInject, Page, Sort, Filter, Toolbar as GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu, Freeze } from '@syncfusion/ej2-react-grids';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import '@syncfusion/ej2-base/styles/material.css';
import '@syncfusion/ej2-buttons/styles/material.css';
import '@syncfusion/ej2-inputs/styles/material.css';
import '@syncfusion/ej2-react-dropdowns/styles/material.css';
import { listUsers, deactivateUser, reactivateUser, deleteUserPermanently, verifyUserEmail, bulkDeleteJobSeekers } from '../../services/users';
import { listEvents } from '../../services/events';
import { listOrganizations } from '../../services/organizations';
import { useAuth } from '../../contexts/AuthContext';
import MassUploadModal from '../UserManagement/MassUploadModal';
import AdminJobSeekerEditor from './AdminJobSeekerEditor';
import { 
  JOB_CATEGORY_LIST, 
  LANGUAGE_LIST, 
  JOB_TYPE_LIST, 
  EXPERIENCE_LEVEL_LIST, 
  EDUCATION_LEVEL_LIST, 
  MILITARY_EXPERIENCE_LIST
} from '../../constants/options';
import { SYNC_GRID_FILTER_SETTINGS, SYNC_GRID_CHECKBOX_COLUMN_PROPS } from '../../utils/syncfusionGridHelpers';
import { formatAccessibilityNeeds } from '../../utils/formatAccessibilityNeeds';
import { jobSeekerAvatarCellTemplate } from '../common/JobSeekerAvatarThumbnail';

export default function JobSeekerManagement() {
  const { user } = useAuth();
  
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
  const [selectAllPages, setSelectAllPages] = useState(false);
  const [allJobSeekerIds, setAllJobSeekerIds] = useState([]);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [jobSeekers, setJobSeekers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  // Use ref for search input to avoid re-renders on every keystroke
  const searchInputRef = useRef(null);
  
  // Keep the search query and filters in the URL (?search=, ?status=, ?org=,
  // ?event=) so they survive navigation and reloads without any browser storage.
  const [activeSearchQuery, setActiveSearchQuery] = useQueryParamState('search', '');
  const [searchTriggerNonce, setSearchTriggerNonce] = useState(0);
  const [statusFilter, setStatusFilter] = useQueryParamState('status', '');
  const [organizationFilter, setOrganizationFilter] = useQueryParamState('org', '');
  const [eventFilter, setEventFilter] = useQueryParamState('event', '');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [organizations, setOrganizations] = useState([]);
  const [events, setEvents] = useState([]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [eventSearchLoading, setEventSearchLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
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
  const pendingLoadArgsRef = useRef(null);
  const searchFilterRef = useRef('');
  const statusFilterRef = useRef('');
  const organizationFilterRef = useRef('');
  const eventFilterRef = useRef('');
  const sortByRef = useRef('createdAt');
  const sortDirRef = useRef('desc');
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
  const [showMassUpload, setShowMassUpload] = useState(false);


  // WCAG 1.3.1 / 2.4.3 — aria-hide background when any modal is open
  useModalAriaHidden(confirmOpen || confirmBulkDeleteOpen || verifyEmailOpen || showMassUpload);
  const [rowPendingVerify, setRowPendingVerify] = useState(null);
  // Password visibility toggles
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
  
  const canFilterByOrganization = useMemo(
    () => ['SuperAdmin', 'GlobalSupport'].includes(user?.role),
    [user?.role]
  );

  const organizationOptions = useMemo(() => {
    const options = [{ value: '', label: 'All Organizations' }];
    if (organizations && Array.isArray(organizations)) {
      organizations.forEach((org) => {
        options.push({ value: org._id, label: org.name });
      });
    }
    return options;
  }, [organizations]);

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

  const sortByOptions = useMemo(() => ([
    { value: 'createdAt', label: 'Sort: Registration Date' },
    { value: 'name', label: 'Sort: Name' },
    { value: 'email', label: 'Sort: Email' },
    { value: 'metadata.profile.educationLevel', label: 'Sort: Qualifications' }
  ]), []);

  const sortDirectionOptions = useMemo(() => ([
    { value: 'desc', label: 'Descending' },
    { value: 'asc', label: 'Ascending' }
  ]), []);

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
    
    // The filter-icon image is styled entirely via CSS (--filter-icon-url), so no
    // per-mutation DOM observer is needed. We only intercept clicks on the grid
    // element to open the column menu. Re-runs on data change so the handler is
    // re-attached if the grid remounts (e.g. list/form mode toggle).
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

  // Optimized row selection handler with debouncing to improve performance
  // Same handler for both rowSelected and rowDeselected (like Meeting Records)
  // EXACTLY like Meeting Records - only updates selection, nothing else
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
          setSelectedJobSeekers(selectedIds);
        } catch (error) {
          console.warn('Error getting selected records:', error);
        }
      }
      selectionUpdateRef.current = false;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (gridRef.current) {
      gridRef.current.selectRows(Array.from({ length: gridRef.current.currentViewData.length }, (_, i) => i));
    }
  }, []);

  const handleDeselectAll = useCallback(() => {
    if (gridRef.current) {
      gridRef.current.clearSelection();
    }
    setSelectedJobSeekers([]);
    setSelectAllPages(false);
    setAllJobSeekerIds([]);
  }, []);

  const handleSelectAllPages = useCallback(async () => {
    try {
      // Fetch all job seeker IDs (without pagination) with current filters
      const allFilters = {
        page: 1,
        limit: 99999, // Large limit to get all records
        role: 'JobSeeker'
      };
      
      // Apply current filters
      const search = searchFilterRef.current;
      if (search && search.trim()) {
        allFilters.search = search.trim();
      }
      
      const statusFilter = statusFilterRef.current;
      if (statusFilter === 'active') {
        allFilters.isActive = 'true';
      } else if (statusFilter === 'inactive') {
        allFilters.isActive = 'false';
      }
      
      const eventFilter = eventFilterRef.current;
      if (eventFilter && eventFilter.trim()) {
        allFilters.eventId = eventFilter.trim();
      }
      const organizationFilter = organizationFilterRef.current;
      if (organizationFilter && String(organizationFilter).trim()) {
        allFilters.organizationId = String(organizationFilter).trim();
      }
      
      const res = await listUsers(allFilters);
      const items = (res?.users || []).filter(u => u.role === 'JobSeeker');
      const allIds = items.map(u => u._id);
      
      setAllJobSeekerIds(allIds);
      setSelectedJobSeekers(allIds);
      setSelectAllPages(true);
      showToast(`Selected all ${allIds.length} job seeker(s) across all pages`, 'Info');
    } catch (error) {
      console.error('Error fetching all job seekers:', error);
      showToast('Failed to select all job seekers', 'Error');
    }
  }, [showToast]);

  const loadJobSeekers = useCallback(async (page, limit, search, isActive, event, organizationId, sortByOverride, sortDirOverride) => {
    // Prevent multiple simultaneous fetches
    if (loadingJobSeekersRef.current) {
      pendingLoadArgsRef.current = [page, limit, search, isActive, event, organizationId, sortByOverride, sortDirOverride];
      console.log('LoadJobSeekers already in progress, queueing latest request');
      return;
    }
    
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
      params.sortBy = sortByOverride || sortByRef.current || 'createdAt';
      params.sortDir = sortDirOverride || sortDirRef.current || 'desc';
      
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

      const effectiveOrganizationId = organizationId !== undefined
        ? organizationId
        : organizationFilterRef.current;
      if (effectiveOrganizationId && String(effectiveOrganizationId).trim()) {
        params.organizationId = String(effectiveOrganizationId).trim();
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
        const registeredEventsText = registeredEvents
          .map((ev) => ev?.name || ev?.slug || '')
          .filter(Boolean)
          .join(', ') || 'None';
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
          qualificationSummary: [
            getLabelFromValue(u.metadata?.profile?.educationLevel || u.metadata?.education || u.metadata?.educationLevel, EDUCATION_LEVEL_LIST),
            getLabelFromValue(u.metadata?.profile?.workLevel || u.metadata?.experienceLevel || u.metadata?.workLevel, EXPERIENCE_LEVEL_LIST)
          ].filter(Boolean).join(' | '),
          registeredEvents,
          registeredEventsText,
          avatarUrl: u.avatarUrl,
          usesScreenMagnifier: u.usesScreenMagnifier,
          usesScreenReader: u.usesScreenReader,
          needsASL: u.needsASL,
          needsCaptions: u.needsCaptions,
          needsOther: u.needsOther,
          accessibilityNeedsText: formatAccessibilityNeeds(u),
          importStatus: u.importStatus || 'complete',
          importMissingFields: Array.isArray(u.importMissingFields) ? u.importMissingFields : [],
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
      
      // Provide specific error messages
      if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) {
        showToast('Request timed out. Please try again with a more specific search.', 'Error');
      } else if (e.response) {
        // Server responded with an error
        showToast(`Failed to load job seekers: ${e.response.data?.message || e.response.statusText}`, 'Error');
      } else if (e.request) {
        // Request was made but no response received
        showToast('No response from server. Please check your connection.', 'Error');
      } else {
        showToast('Failed to load job seekers', 'Error');
      }
    } finally {
      loadingJobSeekersRef.current = false;
      setLoading(false);
      setSearchLoading(false);
      setEventSearchLoading(false);
      if (pendingLoadArgsRef.current) {
        const nextArgs = pendingLoadArgsRef.current;
        pendingLoadArgsRef.current = null;
        loadJobSeekers(...nextArgs);
      }
    }
  }, [showToast]);

  // Track previous values to detect actual changes
  const isFirstRender = useRef(true);
  const prevSearchFilter = useRef(activeSearchQuery);
  const prevSearchTriggerNonce = useRef(searchTriggerNonce);
  const prevStatusFilter = useRef(statusFilter);
  const prevSortBy = useRef(sortBy);
  const prevSortDir = useRef(sortDir);
  const searchTimeoutRef = useRef(null);

  // Update refs when filters change
  useEffect(() => {
    searchFilterRef.current = activeSearchQuery;
  }, [activeSearchQuery]);

  useEffect(() => {
    statusFilterRef.current = statusFilter;
  }, [statusFilter]);

  useEffect(() => {
    organizationFilterRef.current = organizationFilter;
  }, [organizationFilter]);

  useEffect(() => {
    eventFilterRef.current = eventFilter;
  }, [eventFilter]);

  useEffect(() => {
    sortByRef.current = sortBy;
  }, [sortBy]);

  useEffect(() => {
    sortDirRef.current = sortDir;
  }, [sortDir]);

  // Keep the (uncontrolled) search input in sync with the ?search= query param,
  // including on mount and when navigating back/forward.
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.value = activeSearchQuery || '';
    }
  }, [activeSearchQuery]);


  // Load events on mount - memoized to prevent unnecessary re-renders
  const loadEventsData = useCallback(async (organizationId = '') => {
    // Prevent multiple simultaneous fetches
    if (loadingEventsRef.current) return;
    
    try {
      loadingEventsRef.current = true;
      const eventParams = { page: 1, limit: 200 };
      if (organizationId && String(organizationId).trim()) {
        eventParams.organizationId = String(organizationId).trim();
      }
      const res = await listEvents(eventParams);
      setEvents(res.events || []);
    } catch (e) {
      console.error('Failed to load events', e);
      showToast('Failed to load events', 'Error');
    } finally {
      loadingEventsRef.current = false;
    }
  }, [showToast]);

  // Load organization options for roles that can filter across orgs
  useEffect(() => {
    if (!canFilterByOrganization) {
      setOrganizations([]);
      if (organizationFilterRef.current) {
        setOrganizationFilter('');
        organizationFilterRef.current = '';
      }
      return;
    }

    let mounted = true;
    listOrganizations({ page: 1, limit: 200 })
      .then((res) => {
        if (mounted) {
          setOrganizations(res.organizations || []);
        }
      })
      .catch((error) => {
        console.error('Failed to load organizations', error);
        if (mounted) {
          setOrganizations([]);
        }
      });

    return () => {
      mounted = false;
    };
  }, [canFilterByOrganization]);

  // Load events on mount - only runs once
  useEffect(() => {
    const initialOrgFilter = canFilterByOrganization ? (organizationFilter || '') : '';
    loadEventsData(initialOrgFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadEventsData, canFilterByOrganization]);

  // Initial load on mount - only runs once
  useEffect(() => {
    // Reset server stats on initial load
    setServerStats({
      totalCount: 0,
      activeCount: 0,
      inactiveCount: 0,
      verifiedCount: 0
    });
    // Load with the search query / filters from the URL if present
    const initialOrganizationFilter = canFilterByOrganization ? (organizationFilter || '') : '';
    loadJobSeekers(
      1,
      pageSize,
      activeSearchQuery || '',
      statusFilter || '',
      eventFilter || '',
      initialOrganizationFilter
    );
    isFirstRender.current = false; // Mark first render as complete
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFilterByOrganization]);

  // Handle active search query changes
  useEffect(() => {
    // Skip on first render
    if (isFirstRender.current) return;
    
    // Trigger if query changed OR user explicitly re-ran the same query.
    if (prevSearchFilter.current !== activeSearchQuery || prevSearchTriggerNonce.current !== searchTriggerNonce) {
      prevSearchFilter.current = activeSearchQuery;
      prevSearchTriggerNonce.current = searchTriggerNonce;
      setCurrentPage(1);
      
      // Call loadJobSeekers - the searchLoading state is managed by triggerSearch and loadJobSeekers
      loadJobSeekersRef.current(1, pageSize, activeSearchQuery, statusFilterRef.current, eventFilterRef.current);
    }
  }, [activeSearchQuery, pageSize, searchTriggerNonce]);

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

  useEffect(() => {
    if (isFirstRender.current) return;

    if (prevSortBy.current !== sortBy || prevSortDir.current !== sortDir) {
      prevSortBy.current = sortBy;
      prevSortDir.current = sortDir;
      setCurrentPage(1);
      loadJobSeekersRef.current(
        1,
        pageSize,
        activeSearchQuery || '',
        statusFilterRef.current,
        eventFilterRef.current,
        organizationFilterRef.current,
        sortBy,
        sortDir
      );
    }
  }, [sortBy, sortDir, pageSize, activeSearchQuery]);

  const prevOrganizationFilter = useRef(organizationFilter);
  useEffect(() => {
    if (isFirstRender.current) return;

    if (prevOrganizationFilter.current !== organizationFilter) {
      prevOrganizationFilter.current = organizationFilter;
      setCurrentPage(1);

      // Organization changed, so dependent event filter must reset.
      setEventFilter('');
      eventFilterRef.current = '';
      if (eventDropdownRef.current) {
        eventDropdownRef.current.value = '';
      }

      loadEventsData(organizationFilter || '');
      loadJobSeekersRef.current(
        1,
        pageSize,
        activeSearchQuery || '',
        statusFilterRef.current,
        '',
        organizationFilter || ''
      );
    }
  }, [organizationFilter, pageSize, activeSearchQuery, loadEventsData]);

  // Function to trigger event search - only called explicitly by button
  const triggerEventSearch = useCallback(() => {
    if (canFilterByOrganization && !organizationFilterRef.current) {
      showToast('Please select an organization first', 'Warning');
      return;
    }

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
    loadJobSeekersRef.current(
      1,
      pageSize,
      activeSearchQuery || '',
      statusFilterRef.current,
      currentEventValue,
      organizationFilterRef.current
    );
  }, [eventFilter, pageSize, activeSearchQuery, showToast, canFilterByOrganization]);

  // Function to trigger search - only called explicitly by button or Enter key
  const triggerSearch = useCallback(() => {
    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    
    // Get search value from input ref (uncontrolled input for performance)
    const searchValue = (searchInputRef.current?.value || '').trim();
    
    // Set loading state before updating activeSearchQuery
    // This will show "Searching..." immediately
    setSearchLoading(true);
    
    // Update activeSearchQuery - this will trigger the useEffect which calls loadJobSeekers
    // Even if a request is in progress, updating this will queue the new search
    setActiveSearchQuery(searchValue);
    setSearchTriggerNonce((prev) => prev + 1);
  }, []);

  // Export the full current result set (all matching filters/search, across all pages) to CSV.
  const handleExportCsv = useCallback(async () => {
    try {
      setExportLoading(true);

      const params = {
        page: 1,
        // Fetch the entire matching set, not just the current page.
        limit: Math.max(pagination?.totalCount || 0, serverStats?.totalCount || 0, 1) || 100000,
        role: 'JobSeeker',
        sortBy: sortByRef.current || 'createdAt',
        sortDir: sortDirRef.current || 'desc'
      };

      const search = searchFilterRef.current;
      if (search && search.trim()) params.search = search.trim();

      const statusValue = statusFilterRef.current;
      if (statusValue === 'active') params.isActive = 'true';
      else if (statusValue === 'inactive') params.isActive = 'false';

      const eventValue = eventFilterRef.current;
      if (eventValue && eventValue.trim()) params.eventId = eventValue.trim();

      const orgValue = organizationFilterRef.current;
      if (orgValue && String(orgValue).trim()) params.organizationId = String(orgValue).trim();

      const res = await listUsers(params);
      const items = (res?.users || []).filter(u => u.role === 'JobSeeker');

      if (items.length === 0) {
        showToast('No job seekers to export for the current filters', 'Warning');
        return;
      }

      const headers = [
        'First Name', 'Last Name', 'Email', 'Phone', 'City', 'State', 'Country',
        'Qualifications', 'Accessibility Needs', 'Status', 'Email Verified', 'Registration Date', 'Last Login', 'Event Registrations'
      ];

      const data = items.map(u => {
        const parts = (u.name || '').trim().split(/\s+/);
        const firstName = parts[0] || '';
        const lastName = parts.slice(1).join(' ') || '';
        const qualifications = [
          getLabelFromValue(u.metadata?.profile?.educationLevel || u.metadata?.education || u.metadata?.educationLevel, EDUCATION_LEVEL_LIST),
          getLabelFromValue(u.metadata?.profile?.workLevel || u.metadata?.experienceLevel || u.metadata?.workLevel, EXPERIENCE_LEVEL_LIST)
        ].filter(Boolean).join(' | ');
        const events = (u.metadata?.registeredEvents || [])
          .map(ev => ev?.name || ev?.slug || '')
          .filter(Boolean)
          .join('; ');
        return [
          firstName,
          lastName,
          u.email || '',
          u.phoneNumber || '',
          u.city || '',
          u.state || '',
          u.country || '',
          qualifications,
          formatAccessibilityNeeds(u),
          u.isActive ? 'Active' : 'Inactive',
          u.emailVerified ? 'Yes' : 'No',
          u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '',
          u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never',
          events
        ];
      });

      const csv = [
        headers.join(','),
        ...data.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      ].join('\n');
      // Prepend BOM so Excel renders UTF-8 correctly.
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `job-seekers-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);

      showToast(`Exported ${items.length} job seeker(s) to CSV`, 'Success');
    } catch (error) {
      console.error('Export CSV failed:', error);
      showToast('Failed to export job seekers', 'Error');
    } finally {
      setExportLoading(false);
    }
  }, [pagination, serverStats, showToast]);

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

  // Frozen columns rely on native Syncfusion movable/frozen pane scrolling.
  useEffect(() => undefined, [jobSeekers]);

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
    if (toastRef.current) {
      try {
        toastRef.current.hideAll();
      } catch (e) {
        /* ignore */
      }
    }

    setIsTransitioning(true);
    setSelectedJobSeeker(row);

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

      setTimeout(() => {
        setMode('edit');
        setIsTransitioning(false);
      }, 50);
    }, 100);
  }, []);

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

  const createdAtTemplate = useCallback((props) => {
    return (
      <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
        {props.createdAt ? new Date(props.createdAt).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }) : 'N/A'}
      </div>
    );
  }, []);

  const registeredEventsTemplate = useCallback((props) => (
    <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'left', color: props.registeredEventsText === 'None' ? '#6b7280' : 'inherit' }}>
      {props.registeredEventsText || 'None'}
    </div>
  ), []);

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
                <button
                  type="button"
                  className="btn-resume"
                  onClick={() => openResumeInNewTab(null, js.resumeUrl)}
                >
                  View Resume
                </button>
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
                <label>Sign Language Interpreter:</label>
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

  // Syncfusion Grid does not reliably pick up dataSource prop changes. Calling
  // refresh() alone only re-renders the grid's *existing* internal dataSource, so
  // searched/filtered results only appeared after a full page reload remounted the
  // grid. Assigning the new array to the grid instance forces EJ2 to rebind to the
  // fresh data (which also re-renders templated cells).
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.dataSource = paginatedDataSource;
  }, [paginatedDataSource]);

  // Memoize grid settings to prevent unnecessary re-renders
  const gridFilterSettings = useMemo(() => SYNC_GRID_FILTER_SETTINGS, []);

  const gridToolbar = useMemo(() => ['ColumnChooser'], []);

  const gridSelectionSettings = useMemo(() => ({
    type: 'Multiple',
    checkboxOnly: true
  }), []);

  // Memoize column templates to prevent re-renders
  const avatarTemplate = useCallback((props) => jobSeekerAvatarCellTemplate(props), []);

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
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="jobseekers" />
        <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
          {mode === 'view' ? (
            renderJobSeekerProfile()
          ) : mode === 'edit' && selectedJobSeeker ? (
            <AdminJobSeekerEditor
              key={String(selectedJobSeeker.id)}
              row={selectedJobSeeker}
              idPrefix="jsm-sa-edit-"
              onCancel={() => {
                setMode('list');
                setSelectedJobSeeker(null);
                setIsTransitioning(false);
              }}
              onSaved={async () => {
                await loadJobSeekers(
                  currentPage,
                  pageSize,
                  searchFilterRef.current,
                  statusFilterRef.current,
                  eventFilterRef.current
                );
                setMode('list');
                setSelectedJobSeeker(null);
                setIsTransitioning(false);
              }}
            />
          ) : (
          <div className="dashboard-content">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1>Job Seeker Management</h1>
                <p>Manage job seeker accounts and profiles</p>
              </div>
              <div className="header-actions">
                <ButtonComponent
                  cssClass="e-outline e-primary e-small"
                  onClick={() => setShowMassUpload(true)}
                  aria-label="Import job seekers from CSV or spreadsheet"
                >
                  Import
                </ButtonComponent>
                <ButtonComponent
                  cssClass="e-outline e-primary e-small"
                  onClick={handleExportCsv}
                  disabled={exportLoading}
                  aria-label="Export current search results to CSV"
                >
                  {exportLoading ? 'Exporting...' : 'Export CSV'}
                </ButtonComponent>
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
                  disabled={selectedJobSeekers.length === 0}
                  aria-label="Deselect all items"
                >
                  Deselect All
                </ButtonComponent>
                {['Admin', 'GlobalSupport', 'AdminEvent'].includes(user?.role) && (
                  <ButtonComponent 
                    cssClass="e-danger e-small"
                    onClick={handleBulkDelete}
                    disabled={selectedJobSeekers.length === 0 || isDeleting}
                    aria-label={`Delete ${selectedJobSeekers.length} selected item(s)`}
                  >
                    {isDeleting ? 'Deleting...' : `Delete Selected (${selectedJobSeekers.length})`}
                  </ButtonComponent>
                )}
              </div>
            </div>

            {/* Filters */}
            <div className="jsm-filters-row" style={{ marginBottom: 12, paddingLeft: '20px', paddingRight: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
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
              {/* Organization Filter */}
              {canFilterByOrganization && (
                <div style={{ width: '250px', flexShrink: 0 }}>
                  <DropDownListComponent
                    id="organization-filter-dropdown"
                    dataSource={organizationOptions.map(o => ({ value: o.value, text: o.label }))}
                    fields={{ value: 'value', text: 'text' }}
                    value={organizationFilter}
                    change={(e) => {
                      const selectedOrg = e.value || '';
                      setOrganizationFilter(selectedOrg);
                      organizationFilterRef.current = selectedOrg;
                    }}
                    placeholder="Select Organization"
                    cssClass="organization-filter-dropdown"
                    popupHeight="300px"
                    width="100%"
                  />
                </div>
              )}
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
                  enabled={!canFilterByOrganization || Boolean(organizationFilter)}
                />
              </div>
              {/* Search by Event Button */}
              <ButtonComponent
                cssClass="e-primary e-small"
                onClick={triggerEventSearch}
                disabled={eventSearchLoading || !eventFilter || (canFilterByOrganization && !organizationFilter)}
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
              <div style={{ width: '240px', flexShrink: 0 }}>
                <DropDownListComponent
                  id="jobseeker-sort-by-dropdown"
                  dataSource={sortByOptions.map(s => ({ value: s.value, text: s.label }))}
                  fields={{ value: 'value', text: 'text' }}
                  value={sortBy}
                  change={(e) => {
                    setSortBy(e.value || 'createdAt');
                  }}
                  placeholder="Sort by"
                  cssClass="sort-by-dropdown"
                  popupHeight="300px"
                  width="100%"
                />
              </div>
              <div style={{ width: '160px', flexShrink: 0 }}>
                <DropDownListComponent
                  id="jobseeker-sort-dir-dropdown"
                  dataSource={sortDirectionOptions.map(s => ({ value: s.value, text: s.label }))}
                  fields={{ value: 'value', text: 'text' }}
                  value={sortDir}
                  change={(e) => {
                    setSortDir(e.value || 'desc');
                  }}
                  placeholder="Direction"
                  cssClass="sort-direction-dropdown"
                  popupHeight="300px"
                  width="100%"
                />
              </div>
              {/* Search Section - Right */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: 'auto' }}>
                <div style={{ marginBottom: 0 }}>
                  <input
                    ref={searchInputRef}
                    id="jobseeker-search-input"
                    type="text"
                    defaultValue={activeSearchQuery}
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
                      // Bump the nonce so the search-trigger effect always re-fetches,
                      // even when the prev* refs already match the cleared query. Without
                      // this, the Clear path advances activeSearchQuery without the nonce,
                      // letting the guard desync after repeated clear+search cycles and
                      // silently skip the reload.
                      setSearchTriggerNonce((prev) => prev + 1);
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
            {selectedJobSeekers.length === jobSeekers.length && jobSeekers.length > 0 && !selectAllPages && pagination.totalCount > jobSeekers.length && (
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
                  ✓ All {selectedJobSeekers.length} job seeker(s) across all pages are selected.
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
                  rowSelected={handleRowSelected}
                  rowDeselected={handleRowSelected}
                >
              <ColumnsDirective>
                <ColumnDirective {...SYNC_GRID_CHECKBOX_COLUMN_PROPS} />
                <ColumnDirective
                  field='avatarUrl'
                  headerText='Photo'
                  width='110'
                  textAlign='Center'
                  allowFiltering={false}
                  allowSorting={false}
                  showColumnMenu={false}
                  template={avatarTemplate}
                  freeze='Left'
                />
                <ColumnDirective 
                  field='firstName' 
                  headerText='First Name' 
                  width='150' 
                  freeze='Left'
                  allowFiltering={true}
                  template={firstNameTemplate}
                />
                <ColumnDirective field='id' headerText='' width='0' isPrimaryKey={true} visible={false} showInColumnChooser={false} />
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
                  field='qualificationSummary'
                  headerText='Qualifications'
                  width='300'
                  allowFiltering={true}
                />
                <ColumnDirective
                  field='accessibilityNeedsText'
                  headerText='Accessibility Needs'
                  width='260'
                  allowFiltering={true}
                  template={(props) => (
                    <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                      {props.accessibilityNeedsText || 'None'}
                    </div>
                  )}
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
                  field='importStatus'
                  headerText='Import Status'
                  width='160'
                  allowFiltering={true}
                  template={(props) => {
                    const needsInfo = props.importStatus === 'incomplete';
                    const missing = Array.isArray(props.importMissingFields) ? props.importMissingFields : [];
                    return (
                      <div style={{ padding: '8px 0' }}>
                        <span
                          title={needsInfo && missing.length > 0 ? `Missing: ${missing.join(', ')}` : 'Ready'}
                          style={{
                            background: needsInfo ? '#fff4e5' : '#e8f5e9',
                            color: needsInfo ? '#b45309' : '#166534',
                            padding: '2px 8px',
                            borderRadius: 10,
                            fontSize: '0.82rem',
                            fontWeight: 600
                          }}
                        >
                          {needsInfo ? 'Needs Info' : 'Ready'}
                        </span>
                      </div>
                    );
                  }}
                />
                <ColumnDirective 
                  field='emailVerified' 
                  headerText='Email Verified' 
                  width='130' 
                  textAlign='Center'
                  type='boolean'
                  allowFiltering={true}
                  template={emailVerifiedTemplate}
                />
                <ColumnDirective 
                  field='createdAt' 
                  headerText='Registration Date' 
                  width='180' 
                  type='string'
                  allowFiltering={true}
                  allowSorting={true}
                  template={createdAtTemplate}
                />
                <ColumnDirective 
                  field='lastLogin' 
                  headerText='Last Login' 
                  width='150' 
                  type='string'
                  allowFiltering={true}
                  template={lastLoginTemplate}
                />
                <ColumnDirective 
                  field='registeredEventsText' 
                  headerText='Event Registrations' 
                  width='300' 
                  type='string'
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
              <GridInject services={[Page, Sort, Filter, GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu, Freeze]} />
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

      {showMassUpload && (
        <MassUploadModal
          title="Import Job Seekers"
          entityType="jobseekers"
          defaultRole="JobSeeker"
          onClose={() => setShowMassUpload(false)}
          onSuccess={(data) => {
            const created = data?.summary?.created || 0;
            const incomplete = data?.summary?.incomplete || 0;
            showToast(`Import complete: ${created} created, ${incomplete} need info`, 'Success');
            loadJobSeekersRef.current(1, pageSizeRef.current, searchFilterRef.current, statusFilterRef.current, eventFilterRef.current);
          }}
        />
      )}

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
          Are you sure you want to permanently delete <strong>{selectedJobSeekers.length}</strong> selected job seeker(s)? 
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

