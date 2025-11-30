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
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { Input } from '../UI/FormComponents';
import { listUsers, deactivateUser, reactivateUser, deleteUserPermanently, verifyUserEmail, updateUser } from '../../services/users';
import { 
  JOB_CATEGORY_LIST, 
  LANGUAGE_LIST, 
  JOB_TYPE_LIST, 
  EXPERIENCE_LEVEL_LIST, 
  EDUCATION_LEVEL_LIST, 
  SECURITY_CLEARANCE_LIST,
  MILITARY_EXPERIENCE_LIST 
} from '../../constants/options';

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
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    country: '',
  });
  const [jobSeekers, setJobSeekers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const toastRef = useRef(null);
  const gridRef = useRef(null);
  const deleteDialogRef = useRef(null);
  const searchFilterRef = useRef('');
  const statusFilterRef = useRef('');
  const searchInputRef = useRef(null);
  // Use ref for input value to prevent re-renders on every keystroke
  const inputValueRef = useRef('');
  const [selectedJobSeeker, setSelectedJobSeeker] = useState(null);
  // Delete confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rowPendingDelete, setRowPendingDelete] = useState(null);
  // Verify email confirmation dialog
  const [verifyEmailOpen, setVerifyEmailOpen] = useState(false);
  const [rowPendingVerify, setRowPendingVerify] = useState(null);

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

  // Accessibility live region message
  const [liveMsg, setLiveMsg] = useState('');

  const statusOptions = useMemo(() => [
    { value: '', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ], []);

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

  const handleDelete = (row) => {
    if (row.isActive) return; // safety - can't delete active users
    setRowPendingDelete(row);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!rowPendingDelete) return;
    try {
      await deleteUserPermanently(rowPendingDelete.id);
      showToast('Job seeker deleted', 'Success');
      await loadJobSeekers(currentPage, pageSize, searchFilterRef.current, statusFilterRef.current);
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

  const loadJobSeekers = useCallback(async (page, limit, search, isActive) => {
    try {
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
      
      const res = await listUsers(params);
      const items = (res?.users || []).filter(u => u.role === 'JobSeeker');
      
      // Batch state updates to prevent multiple re-renders
      const mappedItems = items.map(u => {
        const parts = (u.name || '').trim().split(/\s+/);
        const firstName = parts[0] || '';
        const lastName = parts.slice(1).join(' ') || '';
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
      
      setLiveMsg(`Loaded ${items.length} of ${res?.pagination?.totalCount || 0} job seekers`);
    } catch (e) {
      console.error('Load failed', e);
      showToast('Failed to load job seekers', 'Error');
    } finally {
      setLoading(false);
      setSearchLoading(false);
    }
  }, [showToast]);

  // Track previous values to detect actual changes
  const isFirstRender = useRef(true);
  const prevSearchFilter = useRef(searchFilter);
  const prevStatusFilter = useRef(statusFilter);
  const searchTimeoutRef = useRef(null);

  // Update refs when filters change
  useEffect(() => {
    searchFilterRef.current = searchFilter;
  }, [searchFilter]);

  useEffect(() => {
    statusFilterRef.current = statusFilter;
  }, [statusFilter]);

  // Initial load on mount - only runs once
  useEffect(() => {
    loadJobSeekers(1, pageSize, '', '');
    isFirstRender.current = false; // Mark first render as complete
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Store loadJobSeekers in ref to avoid dependency issues
  const loadJobSeekersRef = useRef(loadJobSeekers);
  useEffect(() => {
    loadJobSeekersRef.current = loadJobSeekers;
  }, [loadJobSeekers]);

  // Handle status filter changes (immediate, not debounced)
  // NOTE: This does NOT use searchFilter - status filter is independent
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
      loadJobSeekersRef.current(1, pageSize, searchFilterRef.current || '', statusFilter);
    }
  }, [statusFilter, pageSize]);

  // Function to trigger search - only called explicitly by button or Enter key
  const triggerSearch = useCallback(() => {
    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    
    // Get search value from ref (most up-to-date) or state (fallback)
    const searchValue = (inputValueRef.current || searchFilterRef.current || searchFilter).trim();
    setSearchLoading(true);
    prevSearchFilter.current = searchValue;
    setCurrentPage(1);
    loadJobSeekersRef.current(1, pageSize, searchValue, statusFilterRef.current);
  }, [searchFilter, pageSize]);

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

  const handleToggleActive = async (row) => {
    try {
      if (row.isActive) {
        await deactivateUser(row.id);
        showToast(`${row.firstName} ${row.lastName} deactivated`, 'Success');
      } else {
        await reactivateUser(row.id);
        showToast(`${row.firstName} ${row.lastName} reactivated`, 'Success');
      }
      await loadJobSeekers(currentPage, pageSize, searchFilterRef.current, statusFilterRef.current);
    } catch (e) {
      console.error('Toggle active failed', e);
      showToast('Failed to update status', 'Error');
    }
  };

  const handleViewProfile = (row) => {
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
  };

  const handleVerifyEmail = (row) => {
    if (row.emailVerified) return; // safety check
    setRowPendingVerify(row);
    setVerifyEmailOpen(true);
  };

  const confirmVerifyEmail = async () => {
    if (!rowPendingVerify) return;
    try {
      await verifyUserEmail(rowPendingVerify.id);
      showToast(`Email verified for ${rowPendingVerify.firstName} ${rowPendingVerify.lastName}`, 'Success');
      await loadJobSeekers(currentPage, pageSize, searchFilterRef.current, statusFilterRef.current); // Refresh the list
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

  const handleEdit = (row) => {
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
    setEditForm({
      firstName: row.firstName || '',
      lastName: row.lastName || '',
      email: row.email || '',
      phone: row.phone || '',
      city: row.city || '',
      state: row.state || '',
      country: row.country || '',
    });
    setEditingId(row.id);
    
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
  };

  const setEditField = (k, v) => setEditForm(prev => ({ ...prev, [k]: v }));

  const handleSaveEdit = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    
    if (!editingId) return;
    
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
      };
      
      await updateUser(editingId, payload);
      showToast('Job seeker updated successfully', 'Success');
      
      // Refresh the list
      await loadJobSeekers(currentPage, pageSize, searchFilterRef.current, statusFilterRef.current);
      
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


  // Grid template functions for custom column renders - using Syncfusion ButtonComponent
  const statusTemplate = (props) => {
    const row = props;
    return (
      <span className={`status-badge ${row.isActive ? 'active' : 'inactive'}`}>
        {row.isActive ? 'Active' : 'Inactive'}
      </span>
    );
  };

  const emailVerifiedTemplate = (props) => {
    const row = props;
    return (
      <span className={`status-badge ${row.emailVerified ? 'verified' : 'unverified'}`}>
        {row.emailVerified ? 'Yes' : 'No'}
      </span>
    );
  };

  const lastLoginTemplate = (props) => {
    const row = props;
    return row.lastLogin ? new Date(row.lastLogin).toLocaleDateString() : 'Never';
  };

  const actionsTemplate = (props) => {
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
  };

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

          {/* Survey Information */}
          {survey && Object.keys(survey).length > 0 && (
            <div className="profile-section">
              <h3>Survey Information</h3>
              <div className="profile-grid">
                {survey.race && survey.race.length > 0 && (
                  <div className="profile-field">
                    <label>Race/Ethnicity:</label>
                    <span>{survey.race.join(', ')}</span>
                  </div>
                )}
                {survey.genderIdentity && (
                  <div className="profile-field">
                    <label>Gender Identity:</label>
                    <span>{survey.genderIdentity}</span>
                  </div>
                )}
                {survey.ageGroup && (
                  <div className="profile-field">
                    <label>Age Group:</label>
                    <span>{survey.ageGroup}</span>
                  </div>
                )}
                {survey.countryOfOrigin && (
                  <div className="profile-field">
                    <label>Country of Origin:</label>
                    <span>{survey.countryOfOrigin}</span>
                  </div>
                )}
                {survey.disabilities && survey.disabilities.length > 0 && (
                  <div className="profile-field">
                    <label>Disabilities:</label>
                    <span>{survey.disabilities.join(', ')}</span>
                  </div>
                )}
                {survey.otherDisability && (
                  <div className="profile-field">
                    <label>Other Disability:</label>
                    <span>{survey.otherDisability}</span>
                  </div>
                )}
              </div>
            </div>
          )}


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

  // Memoize stats calculation - only recalculate when jobSeekers actually changes
  const stats = useMemo(() => {
    const activeCount = jobSeekers.filter(js => js.isActive).length;
    const inactiveCount = jobSeekers.filter(js => !js.isActive).length;
    const verifiedCount = jobSeekers.filter(js => js.emailVerified).length;
    return { activeCount, inactiveCount, verifiedCount };
  }, [jobSeekers]);

  // Memoize grid data - only update when jobSeekers actually changes
  const gridDataSource = useMemo(() => jobSeekers, [jobSeekers]);

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

              <form className="account-form" onSubmit={handleSaveEdit} style={{ maxWidth: 720 }}>
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
                <Input
                  label="Country"
                  value={editForm.country}
                  onChange={(e) => setEditField('country', e.target.value)}
                  placeholder="Enter country"
                />
                <ButtonComponent 
                  cssClass="e-primary" 
                  disabled={saving}
                  isPrimary={true}
                  onClick={handleSaveEdit}
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </ButtonComponent>
              </form>
            </div>
          ) : (
          <div className="dashboard-content">
            <div className="page-header">
              <h2>Job Seeker Management</h2>
              <p>Manage job seeker accounts and profiles</p>
            </div>

            {/* Filters */}
            <div className="filters-row">
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1 }}>
                <div style={{ flex: 1 }}>
                  <Input
                    ref={searchInputRef}
                    label="Search by name or email"
                    defaultValue={searchFilter}
                    onChange={(e) => {
                      // ONLY update refs - NO state update, NO re-render, NO blocking
                      const value = e.target.value;
                      inputValueRef.current = value;
                      searchFilterRef.current = value;
                      // Do NOT call setSearchFilter - this prevents re-renders
                    }}
                    onKeyDown={(e) => {
                      // Trigger search only on Enter key
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        // Sync ref value to state only when searching
                        const searchValue = inputValueRef.current || searchFilterRef.current || '';
                        setSearchFilter(searchValue);
                        triggerSearch();
                      }
                    }}
                    placeholder="Search job seekers... (Press Enter or click Search)"
                  />
                </div>
                <ButtonComponent
                  cssClass="e-primary"
                  onClick={() => {
                    // Sync input value to state before searching
                    if (searchInputRef.current) {
                      const value = searchInputRef.current.value || inputValueRef.current || '';
                      setSearchFilter(value);
                      searchFilterRef.current = value;
                      inputValueRef.current = value;
                    }
                    triggerSearch();
                  }}
                  disabled={searchLoading}
                  style={{ minWidth: '100px', height: '40px', marginBottom: '0',alignContent: 'center' }}
                >
                  {searchLoading ? 'Searching...' : 'Search'}
                </ButtonComponent>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label htmlFor="status-filter-dropdown" style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827', marginBottom: '4px' }}>
                  Status Filter
                </label>
                <DropDownListComponent
                  id="status-filter-dropdown"
                  dataSource={statusOptions.map(s => ({ value: s.value, text: s.label }))}
                  fields={{ value: 'value', text: 'text' }}
                  value={statusFilter}
                  change={(e) => setStatusFilter(e.value || '')}
                  placeholder="Select Status"
                  cssClass="status-filter-dropdown"
                  popupHeight="300px"
                  width="200px"
                />
              </div>
            </div>

            {/* Stats - memoized to prevent unnecessary recalculations */}
            <div className="stats-row">
              <div className="stat-card">
                <h4>Total Job Seekers</h4>
                <span className="stat-number">{pagination.totalCount || 0}</span>
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
            {loading && <div style={{ marginBottom: 12 }}>Loading…</div>}
            {mode === 'list' && !isTransitioning && (
              <div className="bm-grid-wrap" style={{ position: 'relative', display: isTransitioning ? 'none' : 'block' }}>
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
                  key={`job-seekers-grid-${currentPage}-${pageSize}-${statusFilter}`}
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
                  showColumnMenu={false}
                  showColumnChooser={true}
                  allowResizing={true}
                  allowReordering={true}
                  toolbar={['ColumnChooser']}
                  selectionSettings={{ type: 'Multiple', checkboxOnly: true }}
                  enableHover={true}
                  allowRowDragAndDrop={false}
                >
              <ColumnsDirective>
                <ColumnDirective type='checkbox' width='50' />
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
                  field='phone' 
                  headerText='Phone' 
                  width='150' 
                  allowFiltering={true}
                  template={(props) => (
                    <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                      {props.phone || ''}
                    </div>
                  )}
                />
                <ColumnDirective 
                  field='city' 
                  headerText='City' 
                  width='120' 
                  allowFiltering={true}
                  template={(props) => (
                    <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                      {props.city || ''}
                    </div>
                  )}
                />
                <ColumnDirective 
                  field='state' 
                  headerText='State' 
                  width='120' 
                  allowFiltering={true}
                  template={(props) => (
                    <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                      {props.state || ''}
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
                  field='emailVerified' 
                  headerText='Email Verified' 
                  width='130' 
                  textAlign='Center'
                  allowFiltering={true}
                  template={emailVerifiedTemplate}
                />
                <ColumnDirective 
                  field='lastLogin' 
                  headerText='Last Login' 
                  width='150' 
                  allowFiltering={true}
                  template={(props) => (
                    <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                      {lastLoginTemplate(props)}
                    </div>
                  )}
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
                        loadJobSeekers(1, newSize, searchFilterRef.current, statusFilterRef.current);
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
                      Page {currentPage} of {pagination.totalPages || 1} ({pagination.totalCount || 0} total)
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => {
                        if (currentPage > 1) {
                          const newPage = 1;
                          setCurrentPage(newPage);
                          loadJobSeekers(newPage, pageSize, searchFilterRef.current, statusFilterRef.current);
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
                          loadJobSeekers(newPage, pageSize, searchFilterRef.current, statusFilterRef.current);
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
                          loadJobSeekers(val, pageSize, searchFilterRef.current, statusFilterRef.current);
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
                          loadJobSeekers(newPage, pageSize, searchFilterRef.current, statusFilterRef.current);
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
                          loadJobSeekers(newPage, pageSize, searchFilterRef.current, statusFilterRef.current);
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
