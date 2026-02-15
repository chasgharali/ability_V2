import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import '../Dashboard/Dashboard.css';
import './UserManagement.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import filterIcon from '../../assets/filter.png';
import { GridComponent, ColumnsDirective, ColumnDirective, Inject as GridInject, Page, Sort, Filter, Toolbar as GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu } from '@syncfusion/ej2-react-grids';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { Input, Select, MultiSelect } from '../UI/FormComponents';
import { listUsers, createUser, updateUser, deactivateUser, reactivateUser, deleteUserPermanently, bulkDeleteUsers } from '../../services/users';
import { listBooths, getBoothEvents } from '../../services/booths';
import { listEvents } from '../../services/events';
import { JOB_CATEGORY_LIST } from '../../constants/options';

export default function UserManagement() {
  const [mode, setMode] = useState('list'); // 'list' | 'create' | 'edit'
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Keep selectedUsers state but minimize updates to prevent blinking
  const [selectedUsers, setSelectedUsers] = useState([]);
  const selectedUsersRef = useRef([]); // Store in ref for immediate access without re-render

  // Load filters from sessionStorage on mount (per-table persistence for role filter)
  const loadRoleFilterFromSession = () => {
    try {
      const saved = sessionStorage.getItem('userManagement_roleFilter');
      if (saved) {
        return saved;
      }
    } catch (error) {
      console.error('Error loading User Management role filter from sessionStorage:', error);
    }
    return '';
  };

  // Load search query from sessionStorage on mount (per-table persistence for search)
  const loadSearchQueryFromSession = () => {
    try {
      const saved = sessionStorage.getItem('userManagement_searchQuery');
      if (saved) {
        return saved;
      }
    } catch (error) {
      console.error('Error loading User Management search query from sessionStorage:', error);
    }
    return '';
  };

  const [roleFilter, setRoleFilter] = useState(loadRoleFilterFromSession);
  const savedSearchQuery = loadSearchQueryFromSession();
  const [searchQuery, setSearchQuery] = useState(savedSearchQuery); // Input field value
  const [activeSearchQuery, setActiveSearchQuery] = useState(savedSearchQuery); // Actual search parameter used in API
  const [editingId, setEditingId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [boothOptions, setBoothOptions] = useState([]);
  const [eventOptions, setEventOptions] = useState([]);
  // Accessibility live region message
  const [liveMsg, setLiveMsg] = useState('');
  // Password visibility toggles
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  // Syncfusion Toast ref
  const toastRef = useRef(null);
  const deleteDialogRef = useRef(null);
  const gridRef = useRef(null);
  const loadingUsersRef = useRef(false);
  const selectionUpdateTimeoutRef = useRef(null);
  const isUpdatingSelectionRef = useRef(false);
  const previousUsersRef = useRef([]);
  // Delete confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rowPendingDelete, setRowPendingDelete] = useState(null);
  // Bulk delete
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Persist role filter in sessionStorage so it survives navigation within the session
  useEffect(() => {
    try {
      if (roleFilter) {
        sessionStorage.setItem('userManagement_roleFilter', roleFilter);
      } else {
        sessionStorage.removeItem('userManagement_roleFilter');
      }
    } catch (error) {
      console.error('Error saving User Management role filter to sessionStorage:', error);
    }
  }, [roleFilter]);

  // Persist search query in sessionStorage so it survives navigation within the session
  useEffect(() => {
    try {
      if (activeSearchQuery && activeSearchQuery.trim()) {
        sessionStorage.setItem('userManagement_searchQuery', activeSearchQuery.trim());
      } else {
        sessionStorage.removeItem('userManagement_searchQuery');
      }
    } catch (error) {
      console.error('Error saving User Management search query to sessionStorage:', error);
    }
  }, [activeSearchQuery]);

  const roleOptionsAll = useMemo(() => [
    { value: 'Admin', label: 'Admin' },
    { value: 'AdminEvent', label: 'Event Admin' },
    { value: 'BoothAdmin', label: 'Booth Admin' },
    { value: 'Recruiter', label: 'Recruiter' },
    { value: 'Interpreter', label: 'Interpreter' },
    { value: 'GlobalInterpreter', label: 'Global Interpreter' },
    { value: 'Support', label: 'Support' },
    { value: 'GlobalSupport', label: 'Global Support' },
    { value: 'JobSeeker', label: 'Job Seeker' },
  ], []);
  // Hide JobSeeker from filter and create lists
  const roleOptionsNoJobSeeker = useMemo(() => roleOptionsAll.filter(r => r.value !== 'JobSeeker'), [roleOptionsAll]);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: '',
    boothId: '', // maps to assignedBooth on API
    field: '',
    eventId: '',
    selectedEvents: [], // Events assigned to recruiter (multi-select)
  });
  
  // State for booth-specific events (loaded when booth is selected)
  const [boothEvents, setBoothEvents] = useState([]);

  // Build Field options from centralized constants
  const fieldOptions = useMemo(
    () => [
      { value: '', label: 'Choose your Field' },
      ...JOB_CATEGORY_LIST.map(item => ({ value: item.value, label: item.name }))
    ],
    []
  );

  const fullName = `${form.firstName} ${form.lastName}`.trim();

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

  const handleDelete = (row) => {
    setRowPendingDelete(row);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!rowPendingDelete) return;
    const deletedUserId = rowPendingDelete.id;
    
    try {
      // Optimistically remove user from state immediately to prevent flashing
      setUsers(prevUsers => prevUsers.filter(u => u.id !== deletedUserId));
      
      // Clear selection if deleted user was selected
      setSelectedUsers(prevSelected => prevSelected.filter(id => id !== deletedUserId));
      selectedUsersRef.current = selectedUsersRef.current.filter(id => id !== deletedUserId);
      
      // Clear grid selection if needed
      if (gridRef.current && typeof gridRef.current.clearSelection === 'function') {
        gridRef.current.clearSelection();
      }
      
      // Perform the actual delete
      await deleteUserPermanently(deletedUserId);
      showToast('User deleted', 'Success');
      
      // Reload users to ensure data is in sync with server
      await loadUsers();
      
      // Force grid refresh
      if (gridRef.current && typeof gridRef.current.refresh === 'function') {
        gridRef.current.refresh();
      }
    } catch (e) {
      console.error('Delete failed', e);
      const msg = e?.response?.data?.message || 'Permanent delete is not available on the server yet.';
      showToast(msg, 'Error');
      
      // Reload users to restore correct state if delete failed
      await loadUsers();
    } finally {
      setConfirmOpen(false);
      setRowPendingDelete(null);
    }
  };

  const cancelDelete = () => {
    setConfirmOpen(false);
    setRowPendingDelete(null);
  };

  // Get selected users from grid
  const getSelectedUsersFromGrid = useCallback(() => {
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

  // Batched selection update to prevent blinking/flashing
  // Uses requestAnimationFrame and only updates state when selection actually changed
  const updateSelectionBatched = useCallback(() => {
    if (selectionUpdateTimeoutRef.current) {
      cancelAnimationFrame(selectionUpdateTimeoutRef.current);
    }
    if (isUpdatingSelectionRef.current) return;
    isUpdatingSelectionRef.current = true;

    selectionUpdateTimeoutRef.current = requestAnimationFrame(() => {
      const currentSelection = getSelectedUsersFromGrid();
      selectedUsersRef.current = currentSelection;
      setSelectedUsers((prev) => {
        if (prev.length !== currentSelection.length || prev.some((id, i) => id !== currentSelection[i])) {
          return currentSelection;
        }
        return prev;
      });
      isUpdatingSelectionRef.current = false;
      selectionUpdateTimeoutRef.current = null;
    });
  }, [getSelectedUsersFromGrid]);

  const handleBulkDelete = () => {
    // Get fresh selection from grid
    const currentSelection = getSelectedUsersFromGrid();
    if (currentSelection.length === 0) {
      showToast('Please select users to delete', 'Warning');
      return;
    }
    // Store in ref and update state for confirmation dialog
    selectedUsersRef.current = currentSelection;
    setSelectedUsers(currentSelection);
    setConfirmBulkDeleteOpen(true);
  };

  const confirmBulkDelete = async () => {
    const userIdsToDelete = [...selectedUsersRef.current];
    if (!userIdsToDelete || userIdsToDelete.length === 0) return;
    
    try {
      setIsDeleting(true);
      
      // Optimistically remove users from state immediately to prevent flashing
      setUsers(prevUsers => prevUsers.filter(u => !userIdsToDelete.includes(u.id)));
      
      // Clear grid selection
      if (gridRef.current && typeof gridRef.current.clearSelection === 'function') {
        gridRef.current.clearSelection();
      }
      
      // Perform the actual bulk delete
      const response = await bulkDeleteUsers(userIdsToDelete);
      showToast(response.message || 'Users deleted successfully', 'Success');
      
      // Clear selection
      setSelectedUsers([]);
      selectedUsersRef.current = [];
      
      // Reload users to ensure data is in sync with server
      await loadUsers();
      
      // Force grid refresh
      if (gridRef.current && typeof gridRef.current.refresh === 'function') {
        gridRef.current.refresh();
      }
    } catch (error) {
      console.error('Error deleting users:', error);
      showToast(error.response?.data?.message || 'Failed to delete users', 'Error');
      
      // Reload users to restore correct state if delete failed
      await loadUsers();
    } finally {
      setIsDeleting(false);
      setConfirmBulkDeleteOpen(false);
    }
  };

  const cancelBulkDelete = () => {
    setConfirmBulkDeleteOpen(false);
    // Don't clear selection when canceling - user might want to keep selection
  };

  const handleSearch = useCallback(() => {
    // Set the active search query to trigger API call
    setActiveSearchQuery(searchQuery.trim());
  }, [searchQuery]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setActiveSearchQuery('');
    // Clear from sessionStorage
    try {
      sessionStorage.removeItem('userManagement_searchQuery');
    } catch (error) {
      console.error('Error clearing User Management search query from sessionStorage:', error);
    }
    // loadUsers will be called automatically via useEffect when activeSearchQuery changes
  }, []);

  const loadUsers = useCallback(async () => {
    // Prevent multiple simultaneous fetches
    if (loadingUsersRef.current) return;
    
    try {
      loadingUsersRef.current = true;
      setLoading(true);
      // Only pass role parameter if roleFilter has a value
      // When "All Roles" is selected, don't pass role parameter at all
      // The server will exclude JobSeekers by default
      // When searching, fetch a very large number (10000) to ensure ALL matching records are loaded
      // When not searching, fetch 5000 for initial load (grid handles client-side pagination)
      const params = { page: 1, limit: activeSearchQuery && activeSearchQuery.trim() ? 10000 : 5000 };
      if (roleFilter && roleFilter.trim()) {
        params.role = roleFilter.trim();
      }
      // Add search parameter if active search query exists
      if (activeSearchQuery && activeSearchQuery.trim()) {
        params.search = activeSearchQuery.trim();
      }
      
      const res = await listUsers(params);
      // Server already excludes JobSeekers when no role filter is provided
      // But keep this filter as a safety measure
      const items = (res?.users || []).filter(u => u.role !== 'JobSeeker');
      setUsers(items.map(u => {
        const parts = (u.name || '').trim().split(/\s+/);
        const firstName = parts[0] || '';
        const lastName = parts.slice(1).join(' ') || '';
        return {
          id: u._id,
          firstName,
          lastName,
          email: u.email,
          role: u.role,
          booth: u.boothName || '-',
          assignedBoothId: u.assignedBooth?._id || u.assignedBooth || '',
          assignedEvents: (u.assignedEvents || []).map(e => e?._id || e),
          isActive: u.isActive,
          createdAt: u.createdAt,
        };
      }));
      // announce results for screen readers
      const count = (items || []).length;
      const roleLabel = roleFilter ? roleOptionsNoJobSeeker.find(r => r.value === roleFilter)?.label || roleFilter : null;
      const roleText = roleLabel ? ` with role "${roleLabel}"` : '';
      const searchText = activeSearchQuery ? ` matching "${activeSearchQuery}"` : '';
      setLiveMsg(`${count} user${count === 1 ? '' : 's'} loaded${roleText}${searchText}`);
    } catch (e) {
      console.error('Failed to load users', e);
      showToast('Failed to load users', 'Error');
    } finally { 
      loadingUsersRef.current = false;
      setLoading(false); 
    }
  }, [roleFilter, activeSearchQuery, roleOptionsNoJobSeeker]);

  // Memoize paginated data source to ensure grid updates when users change
  const paginatedDataSource = useMemo(() => {
    return users.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [users, currentPage, pageSize]);

  // Track when user data actually changes for potential grid refresh
  useEffect(() => {
    const currentUserIds = users.map(u => u.id).sort().join(',');
    const previousUserIds = previousUsersRef.current.map(u => u.id).sort().join(',');
    
    // Update ref when user data changes
    if (currentUserIds !== previousUserIds || users.length !== previousUsersRef.current.length) {
      previousUsersRef.current = [...users];
    }
  }, [users]);

  const loadBoothsAndEvents = async () => {
    try {
      const [boothRes, eventRes] = await Promise.all([
        listBooths({ page: 1, limit: 200 }),
        listEvents({ page: 1, limit: 200 }),
      ]);
      setBoothOptions((boothRes?.booths || []).map(b => ({ value: b._id, label: b.name })));
      setEventOptions((eventRes?.events || []).map(e => ({ value: e._id, label: e.name })));
    } catch (e) {
      // Non-blocking
    }
  };

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { if (mode !== 'list') loadBoothsAndEvents(); }, [mode]);

  // Fetch booth events when booth is selected for Recruiter/BoothAdmin
  useEffect(() => {
    const fetchBoothEventsForRole = async () => {
      if (form.boothId && ['Recruiter', 'BoothAdmin', 'Support'].includes(form.role)) {
        try {
          const events = await getBoothEvents(form.boothId);
          setBoothEvents(events.map(e => ({ value: e._id, label: e.name })));
        } catch (error) {
          console.error('Failed to fetch booth events:', error);
          setBoothEvents([]);
        }
      } else {
        setBoothEvents([]);
      }
    };
    fetchBoothEventsForRole();
  }, [form.boothId, form.role]);

  // Cleanup selection RAF on unmount
  useEffect(() => {
    return () => {
      if (selectionUpdateTimeoutRef.current) {
        cancelAnimationFrame(selectionUpdateTimeoutRef.current);
      }
    };
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
  }, [users]);

  // Sync header and content horizontal scrolling
  useEffect(() => {
    let scrollSyncActive = false;

    const syncScroll = () => {
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
  }, [users]);

  // Center delete dialog when it opens
  useEffect(() => {
    if (confirmOpen && deleteDialogRef.current) {
      const dialogElement = deleteDialogRef.current.element || deleteDialogRef.current;
      if (dialogElement) {
        // Wait for dialog to render
        setTimeout(() => {
          const dialog = document.querySelector('.um-delete-dialog.e-dialog');
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

  // Grid template functions for custom column renders - using Syncfusion ButtonComponent
  const actionsTemplate = (props) => {
    const row = props;
    return (
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <ButtonComponent 
          cssClass="e-outline e-primary e-small" 
          onClick={() => startEdit(row)}
          aria-label={`Edit ${row.firstName} ${row.lastName}`}
        >
          Edit
        </ButtonComponent>
        {row.isActive ? (
          <ButtonComponent 
            cssClass="e-outline e-primary e-small" 
            onClick={() => handleDeactivate(row)}
            aria-label={`Deactivate ${row.firstName} ${row.lastName}`}
          >
            Deactivate
          </ButtonComponent>
        ) : (
          <ButtonComponent 
            cssClass="e-primary e-small" 
            onClick={() => handleReactivate(row)}
            aria-label={`Reactivate ${row.firstName} ${row.lastName}`}
          >
            Reactivate
          </ButtonComponent>
        )}
        <ButtonComponent 
          cssClass="e-outline e-danger e-small" 
          onClick={() => handleDelete(row)}
          aria-label={`Delete ${row.firstName} ${row.lastName}`}
        >
          Delete
        </ButtonComponent>
      </div>
    );
  };

  const startEdit = (row) => {
    const firstName = row.firstName || '';
    const lastName = row.lastName || '';
    setForm(prev => ({
      ...prev,
      firstName,
      lastName,
      email: row.email || '',
      role: row.role || '',
      boothId: row.assignedBoothId || '',
      field: '',
      eventId: row.role === 'GlobalSupport' && row.assignedEvents?.length > 0
        ? row.assignedEvents[0]
        : '',
      password: '',
      confirmPassword: '',
      selectedEvents: row.assignedEvents || [],
    }));
    setEditingId(row.id);
    setMode('create'); // reuse the same form UI
  };

  const handleDeactivate = async (row) => {
    try {
      await deactivateUser(row.id);
      showToast('User deactivated', 'Success');
      await loadUsers();
    } catch (e) {
      console.error('Deactivate failed', e);
      showToast('Failed to deactivate user', 'Error');
    }
  };

  const handleReactivate = async (row) => {
    try {
      await reactivateUser(row.id);
      showToast('User reactivated', 'Success');
      await loadUsers();
    } catch (e) {
      console.error('Reactivate failed', e);
      showToast('Failed to reactivate user', 'Error');
    }
  };

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Password validation for both create and edit modes
    if (form.password) {
      if (form.password.length < 8) {
        showToast('Password must be at least 8 characters', 'Error');
        return;
      }
      if (form.password !== form.confirmPassword) {
        showToast('Passwords do not match', 'Error');
        return;
      }
    } else if (!editingId) {
      // Password is required for new users
      showToast('Password is required', 'Error');
      return;
    }

    try {
      if (editingId) {
        const payload = {
          name: fullName || undefined,
          email: form.email || undefined,
          role: form.role || undefined,
        };
        // Include password if provided (admin can update password)
        if (form.password && form.password.trim()) {
          payload.password = form.password;
        }
        // Assign booth for Recruiter, BoothAdmin, Support, and Interpreter roles
        if (['Recruiter', 'BoothAdmin', 'Support', 'Interpreter'].includes(form.role)) {
          payload.assignedBooth = form.boothId || undefined;
        }
        // Assign events for Recruiter, BoothAdmin, Support, and GlobalInterpreter roles
        if (['Recruiter', 'BoothAdmin', 'Support', 'GlobalInterpreter'].includes(form.role)) {
          payload.assignedEvents = form.selectedEvents || [];
        }
        // Assign single event for GlobalSupport role
        if (form.role === 'GlobalSupport' && form.eventId) {
          payload.assignedEvents = [form.eventId];
        }
        await updateUser(editingId, payload);
        showToast('User updated', 'Success');
      } else {
        if (!form.role) {
          showToast('Please select a role', 'Error');
          return;
        }
        const payload = {
          name: fullName,
          email: form.email,
          password: form.password,
          role: form.role,
        };
        // Assign booth for Recruiter, BoothAdmin, Support, and Interpreter roles
        if (['Recruiter', 'BoothAdmin', 'Support', 'Interpreter'].includes(form.role)) {
          if (!form.boothId) {
            showToast('Please select a booth for this role', 'Error');
            return;
          }
          payload.assignedBooth = form.boothId;
        }
        // Assign events for Recruiter, BoothAdmin, Support, and GlobalInterpreter roles
        if (['Recruiter', 'BoothAdmin', 'Support', 'GlobalInterpreter'].includes(form.role)) {
          payload.assignedEvents = form.selectedEvents || [];
        }
        // Assign single event for GlobalSupport role
        if (form.role === 'GlobalSupport') {
          if (!form.eventId) {
            showToast('Please select an event for Global Support', 'Error');
            return;
          }
          payload.assignedEvents = [form.eventId];
        }
        // Validate GlobalInterpreter has at least one event
        if (form.role === 'GlobalInterpreter' && (!form.selectedEvents || form.selectedEvents.length === 0)) {
          showToast('Please select at least one event for Global Interpreter', 'Error');
          return;
        }
        await createUser(payload);
        showToast('User created', 'Success');
      }
      setMode('list');
      setEditingId(null);
      setForm({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '', role: '', boothId: '', field: '', eventId: '', selectedEvents: [] });
      await loadUsers();
    } catch (e) {
      console.error('Save user failed', e);
      const msg = e?.response?.data?.message || 'Failed to save user';
      showToast(msg, 'Error', 5000);
    }
  };

  return (
    <div className="dashboard">
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="users" />
        <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
          <div className="dashboard-content">
            <div className="bm-header">
              <h2>User Management</h2>
              <div className="bm-header-actions">
                {mode === 'list' ? (
                  <>
                    {selectedUsers.length > 0 && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '12px' }}>
                          <input
                            type="checkbox"
                            id="select-all-users"
                            checked={selectedUsers.length > 0 && selectedUsers.length === paginatedDataSource.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                // Select all rows on current page
                                if (gridRef.current) {
                                  const pageData = paginatedDataSource;
                                  gridRef.current.selectRows(Array.from({ length: pageData.length }, (_, i) => i));
                                  // Use batched update to prevent flashing
                                  updateSelectionBatched();
                                }
                              } else {
                                // Deselect all rows
                                if (gridRef.current) {
                                  gridRef.current.clearSelection();
                                  setSelectedUsers([]);
                                  selectedUsersRef.current = [];
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
                          <label htmlFor="select-all-users" style={{ cursor: 'pointer', userSelect: 'none', fontSize: '14px', fontWeight: '500' }}>
                            Select All
                          </label>
                        </div>
                        <ButtonComponent 
                          cssClass="e-danger"
                          onClick={handleBulkDelete}
                          disabled={isDeleting}
                          aria-label={`Delete ${selectedUsers.length} selected users`}
                        >
                          {isDeleting ? 'Deleting...' : `Delete Selected (${selectedUsers.length})`}
                        </ButtonComponent>
                      </>
                    )}
                    <ButtonComponent cssClass="e-primary" onClick={() => setMode('create')} aria-label="Create new user">
                      Create User
                    </ButtonComponent>
                  </>
                ) : (
                  <ButtonComponent cssClass="e-outline e-primary" onClick={() => { setMode('list'); setEditingId(null); }} aria-label="Back to user list">
                    Back to List
                  </ButtonComponent>
                )}
              </div>
            </div>

            {mode === 'list' ? (
              <div className="bm-grid-wrap" style={{ position: 'relative' }}>
                <div className="um-filters-row" style={{ marginBottom: 12, paddingLeft: '20px', paddingRight: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Role Filter - Left */}
                  <div style={{ width: '200px', flexShrink: 0 }}>
                    <DropDownListComponent
                      id="role-filter-dropdown"
                      dataSource={[{ value: '', text: 'All Roles' }, ...roleOptionsNoJobSeeker.map(r => ({ value: r.value, text: r.label }))]}
                      fields={{ value: 'value', text: 'text' }}
                      value={roleFilter}
                      change={(e) => {
                        setRoleFilter(e.value || '');
                        // loadUsers will be called automatically via useEffect when roleFilter changes
                      }}
                      placeholder="Select Role"
                      cssClass="role-filter-dropdown"
                      popupHeight="300px"
                      width="100%"
                    />
                  </div>
                  {/* Search Section - Right */}
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: 'auto' }}>
                    <div style={{ marginBottom: 0 }}>
                      <Input
                        id="user-search-input"
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
                        className="um-search-input-no-label"
                      />
                    </div>
                    <ButtonComponent
                      cssClass="e-primary e-small"
                      onClick={handleSearch}
                      disabled={loading}
                      aria-label="Search users"
                      style={{ minWidth: '80px', height: '44px' }}
                    >
                      Search
                    </ButtonComponent>
                    {(searchQuery || activeSearchQuery) && (
                      <ButtonComponent
                        cssClass="e-outline e-primary e-small"
                        onClick={handleClearSearch}
                        disabled={loading}
                        aria-label="Clear search"
                        style={{ minWidth: '70px', height: '44px' }}
                      >
                        Clear
                      </ButtonComponent>
                    )}
                  </div>
                </div>
                <div aria-live="polite" className="sr-only">{liveMsg}</div>
                {loading && (
                  <div className="um-grid-loading-overlay">
                    <div className="um-loading-container">
                      <div className="um-loading-spinner" aria-label="Loading users" role="status" aria-live="polite"></div>
                      <div className="um-loading-text">Loading users...</div>
                    </div>
                  </div>
                )}
                <GridComponent
                  ref={gridRef}
                  dataSource={paginatedDataSource}
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
                  selectionSettings={{ type: 'Multiple', checkboxOnly: true }}
                  enableHover={true}
                  allowRowDragAndDrop={false}
                  enableHeaderFocus={false}
                  rowSelected={updateSelectionBatched}
                  rowDeselected={updateSelectionBatched}
                >
                  <ColumnsDirective>
                    <ColumnDirective type='checkbox' width='50' />
                    <ColumnDirective field='id' headerText='' width='0' isPrimaryKey={true} visible={false} showInColumnChooser={false} />
                    <ColumnDirective 
                      field='firstName' 
                      headerText='First Name' 
                      width='150' 
                      allowFiltering={true}
                      template={(props) => (
                        <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                          {props.firstName || ''}
                        </div>
                      )}
                    />
                    <ColumnDirective 
                      field='lastName' 
                      headerText='Last Name' 
                      width='150' 
                      allowFiltering={true}
                      template={(props) => (
                        <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                          {props.lastName || ''}
                        </div>
                      )}
                    />
                    <ColumnDirective 
                      field='email' 
                      headerText='Email' 
                      width='250' 
                      allowFiltering={true}
                      template={(props) => (
                        <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                          {props.email || ''}
                        </div>
                      )}
                    />
                    <ColumnDirective 
                      field='role' 
                      headerText='Role' 
                      width='150' 
                      allowFiltering={true}
                      template={(props) => (
                        <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                          {props.role || ''}
                        </div>
                      )}
                    />
                    <ColumnDirective 
                      field='booth' 
                      headerText='Booth' 
                      width='180' 
                      allowFiltering={true}
                      template={(props) => (
                        <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                          {props.booth || '-'}
                        </div>
                      )}
                    />
                    <ColumnDirective 
                      headerText='Action' 
                      width='350' 
                      allowSorting={false} 
                      allowFiltering={false}
                      template={actionsTemplate}
                    />
                  </ColumnsDirective>
                  <GridInject services={[Sort, Filter, GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu]} />
                </GridComponent>

                {/* Custom Pagination Footer */}
                {users.length > 0 && (
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
                                Page {currentPage} of {Math.ceil(users.length / pageSize) || 1} ({users.length} total)
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                                onClick={() => {
                                    if (currentPage > 1) {
                                        setCurrentPage(1);
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
                                        setCurrentPage(currentPage - 1);
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
                                max={Math.ceil(users.length / pageSize) || 1}
                                value={currentPage}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    const maxPage = Math.ceil(users.length / pageSize) || 1;
                                    if (val >= 1 && val <= maxPage) {
                                        setCurrentPage(val);
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
                                    const maxPage = Math.ceil(users.length / pageSize) || 1;
                                    if (currentPage < maxPage) {
                                        setCurrentPage(currentPage + 1);
                                    }
                                }}
                                disabled={currentPage >= (Math.ceil(users.length / pageSize) || 1) || loading}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid #d1d5db',
                                    backgroundColor: currentPage >= (Math.ceil(users.length / pageSize) || 1) ? '#f3f4f6' : '#fff',
                                    cursor: currentPage >= (Math.ceil(users.length / pageSize) || 1) ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    color: currentPage >= (Math.ceil(users.length / pageSize) || 1) ? '#9ca3af' : '#374151'
                                }}
                                title="Next Page"
                            >
                                Next ⟩
                            </button>
                            <button
                                onClick={() => {
                                    const maxPage = Math.ceil(users.length / pageSize) || 1;
                                    if (currentPage < maxPage) {
                                        setCurrentPage(maxPage);
                                    }
                                }}
                                disabled={currentPage >= (Math.ceil(users.length / pageSize) || 1) || loading}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid #d1d5db',
                                    backgroundColor: currentPage >= (Math.ceil(users.length / pageSize) || 1) ? '#f3f4f6' : '#fff',
                                    cursor: currentPage >= (Math.ceil(users.length / pageSize) || 1) ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    color: currentPage >= (Math.ceil(users.length / pageSize) || 1) ? '#9ca3af' : '#374151'
                                }}
                                title="Last Page"
                            >
                                ⟩⟩
                            </button>
                        </div>
                    </div>
                )}
              </div>
            ) : (
              <form className="account-form" onSubmit={(e) => { e.preventDefault(); }} style={{ maxWidth: 720 }}>
                <Input label="First Name" value={form.firstName} onChange={(e) => setField('firstName', e.target.value)} required />
                <Input label="Last Name" value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} required />
                <Select label="Select User Role" value={form.role} onChange={(e) => setField('role', e.target.value)} options={[{ value: '', label: 'Choose Role' }, ...roleOptionsAll]} required />
                <Input label="Email" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} required />
                <div className="password-field-container">
                  <Input 
                    label={editingId ? "New Password (leave blank to keep current)" : "Password"} 
                    type={showPwd ? 'text' : 'password'} 
                    value={form.password} 
                    onChange={(e) => setField('password', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                      }
                    }}
                    autoComplete="new-password"
                    required={!editingId} 
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
                    label={editingId ? "Confirm New Password (leave blank to keep current)" : "Confirm Password"} 
                    type={showConfirmPwd ? 'text' : 'password'} 
                    value={form.confirmPassword} 
                    onChange={(e) => setField('confirmPassword', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                      }
                    }}
                    autoComplete="new-password"
                    required={!editingId} 
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
                <Select label="Select Booth" value={form.boothId} onChange={(e) => setField('boothId', e.target.value)} options={[{ value: '', label: 'Choose your Booth' }, ...boothOptions]} required={['Recruiter', 'BoothAdmin', 'Support', 'Interpreter'].includes(form.role)} disabled={['GlobalSupport', 'GlobalInterpreter'].includes(form.role)} />
                
                {/* Multi-select events for Recruiter/BoothAdmin/Support when booth is selected */}
                {['Recruiter', 'BoothAdmin', 'Support'].includes(form.role) && form.boothId && (
                  <>
                    <MultiSelect
                      label="Select Events"
                      value={form.selectedEvents}
                      onChange={(e) => setField('selectedEvents', e.target.value)}
                      options={boothEvents}
                      placeholder={boothEvents.length === 0 ? 'No events assigned to this booth' : 'Select events for this user'}
                      name="selectedEvents"
                      required
                    />
                  </>
                )}
                
                {/* Multi-select events for GlobalInterpreter (all events, no booth required) */}
                {form.role === 'GlobalInterpreter' && (
                  <MultiSelect
                    label="Select Events"
                    value={form.selectedEvents}
                    onChange={(e) => setField('selectedEvents', e.target.value)}
                    options={eventOptions}
                    placeholder="Select events for this interpreter"
                    name="selectedEvents"
                    required
                  />
                )}
                
                {/* <Select label="Select Field" value={form.field} onChange={(e) => setField('field', e.target.value)} options={fieldOptions} /> */}
                {!['Recruiter', 'BoothAdmin', 'Support', 'GlobalInterpreter'].includes(form.role) && (
                  <Select label="Select Event" value={form.eventId} onChange={(e) => setField('eventId', e.target.value)} options={[{ value: '', label: 'Select Event' }, ...eventOptions]} disabled={!['AdminEvent', 'GlobalSupport'].includes(form.role)} required={form.role === 'GlobalSupport'} />
                )}
                <ButtonComponent 
                  cssClass="e-primary" 
                  disabled={loading}
                  isPrimary={true}
                  onClick={(e) => { e.preventDefault(); handleSubmit(e); }}
                >
                  {editingId ? 'Update User' : 'Create User'}
                </ButtonComponent>
              </form>
            )}
          </div>
        </main>
      </div>

      <div className="mobile-overlay" aria-hidden="true" />

      {/* Delete confirm modal - Syncfusion DialogComponent */}
      <DialogComponent
        ref={deleteDialogRef}
        width="450px"
        isModal={true}
        showCloseIcon={true}
        visible={confirmOpen}
        header="Delete User"
        closeOnEscape={true}
        close={cancelDelete}
        cssClass="um-delete-dialog"
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
        <p style={{ margin: 0, lineHeight: '1.5' }}>
          Are you sure you want to permanently delete <strong>{rowPendingDelete?.firstName} {rowPendingDelete?.lastName}</strong>? This action cannot be undone.
        </p>
      </DialogComponent>

      {/* Bulk Delete confirm modal - Syncfusion DialogComponent */}
      <DialogComponent
        width="450px"
        isModal={true}
        showCloseIcon={true}
        visible={confirmBulkDeleteOpen}
        header="Bulk Delete Users"
        closeOnEscape={true}
        close={cancelBulkDelete}
        cssClass="um-delete-dialog"
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
          Are you sure you want to permanently delete <strong>{selectedUsers.length} user(s)</strong>? This action cannot be undone. Only inactive users can be permanently deleted.
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
    </div>
  );
}
