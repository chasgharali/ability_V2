import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import '../Dashboard/Dashboard.css';
import './BoothManagement.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import filterIcon from '../../assets/filter.png';
import { GridComponent, ColumnsDirective, ColumnDirective, Inject as GridInject, Page, Sort, Filter, Toolbar as GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu } from '@syncfusion/ej2-react-grids';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import { Input, Select, MultiSelect, DateTimePicker, Checkbox, TextArea } from '../UI/FormComponents';
import { listEvents } from '../../services/events';
import { listBooths, createBooths, deleteBooth, updateBooth, updateBoothRichSections } from '../../services/booths';
import { uploadBoothLogoToS3, uploadImageToS3 } from '../../services/uploads';
import { RichTextEditorComponent as RTE, Toolbar as RTEToolbar, Link as RteLink, Image as RteImage, HtmlEditor, QuickToolbar, Inject as RTEInject } from '@syncfusion/ej2-react-richtexteditor';
import { MdEdit, MdDelete, MdLink, MdBusiness } from 'react-icons/md';

export default function BoothManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Defense-in-depth: Check user role on component mount
  useEffect(() => {
    const allowedRoles = ['Admin', 'AdminEvent', 'GlobalSupport'];
    if (user && !allowedRoles.includes(user.role)) {
      // Redirect unauthorized users to dashboard
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);
  
  // Header uses branding/user from shared AdminHeader

  const [boothMode, setBoothMode] = useState('list'); // 'list' | 'create'
  const [boothSaving, setBoothSaving] = useState(false);
  const [boothForm, setBoothForm] = useState({
    boothName: '',
    boothLogo: '',
    firstHtml: '',
    secondHtml: '',
    thirdHtml: '',
    recruitersCount: 1,
    eventIds: [],
    customInviteText: '',
    expireLinkTime: '',
    enableExpiry: false,
    companyPage: '',
    joinBoothButtonLink: ''
  });
  const [booths, setBooths] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loadingBooths, setLoadingBooths] = useState(false);
  const [activeSearchQuery, setActiveSearchQuery] = useState(''); // Actual search parameter used in API
  const [previewBooth, setPreviewBooth] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rowPendingDelete, setRowPendingDelete] = useState(null);
  const toastRef = useRef(null);
  const gridRef = useRef(null);
  const deleteDialogRef = useRef(null);
  const searchInputRef = useRef(null);
  const [editingBoothId, setEditingBoothId] = useState(null);
  const loadingBoothsRef = useRef(false);
  const loadingEventsRef = useRef(false);
  // RTE image upload helpers
  const rteFirstRef = React.useRef(null);
  const rteSecondRef = React.useRef(null);
  const rteThirdRef = React.useRef(null);
  const hiddenImageInputRef = React.useRef(null);
  const [activeRteRef, setActiveRteRef] = useState(null);

  // Create a short, unique numeric token for the queue URL (6 digits)
  const genToken = () => String(Math.floor(100000 + Math.random() * 900000));
  const [queueToken] = useState(() => genToken());

  // Base URL from current window location (fallback to production domain if unavailable)
  const baseUrl = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin
    : 'https://abilityjobfair.com';

  // Build toolbar per instance to wire custom S3 image upload action
  const buildRteToolbar = (onInsertImage) => ({
    type: 'MultiRow',
    enableFloating: true,
    items: [
      'Bold', 'Italic', 'Underline', 'StrikeThrough',
      'FontName', 'FontSize', 'FontColor', 'BackgroundColor',
      'LowerCase', 'UpperCase', 'Formats',
      'Alignments', 'OrderedList', 'UnorderedList', 'Outdent', 'Indent',
      'CreateLink',
      { tooltipText: 'Insert Image from S3', text: 'Image', prefixIcon: 'e-icons e-image', id: 'ajf-s3-image', click: onInsertImage },
      'ClearFormat', 'Print', 'SourceCode', 'FullScreen', 'Undo', 'Redo'
    ]
  });

  const openImagePickerFor = (rteRef) => {
    setActiveRteRef(rteRef);
    hiddenImageInputRef.current?.click();
  };
  const onHiddenImagePicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeRteRef?.current) return;
    try {
      setBoothSaving(true);
      const { downloadUrl } = await uploadImageToS3(file);
      // Insert image at cursor
      try {
        activeRteRef.current.executeCommand('insertImage', { url: downloadUrl, altText: file.name });
      } catch {
        activeRteRef.current.executeCommand('insertHTML', `<img src="${downloadUrl}" alt="${file.name}" />`);
      }
      showToast('Image inserted', 'Success', 2000);
    } catch (err) {
      console.error('RTE image upload failed', err);
      showToast('Failed to upload image', 'Error', 4000);
    } finally {
      setBoothSaving(false);
      setActiveRteRef(null);
    }
  };

  const slugify = (s = '') => {
    const slug = s
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    return slug || 'new-booth';
  };

  // Sanitize Custom Invite (no spaces, only a-z0-9-). If empty, return empty.
  const sanitizeInvite = (s = '') => {
    if (!s || !s.toString().trim()) return '';
    return s
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  };

  // Compute live each render to ensure immediate UI updates as the booth name changes
  const boothQueueLink = useMemo(() => {
    const custom = sanitizeInvite(boothForm.customInviteText || '');
    if (custom) return `${baseUrl}/queue/${custom}`;
    const nameSlug = slugify(boothForm.boothName || '');
    return `${baseUrl}/queue/${nameSlug}-${queueToken}`;
  }, [boothForm.boothName, boothForm.customInviteText, queueToken, baseUrl]);

  // Event options for MultiSelect (loaded dynamically)
  const [eventOptions, setEventOptions] = useState([]);
  const [eventLimits, setEventLimits] = useState({}); // { [eventId]: { maxBooths, maxRecruitersPerEvent } }
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Compute current recruiters per event from loaded booths
  const recruitersByEvent = useMemo(() => {
    const map = {};
    for (const b of booths) {
      const eid = b.eventIdRaw;
      if (!eid) continue;
      map[eid] = (map[eid] || 0) + (b.recruitersCount ?? 0);
    }
    return map;
  }, [booths]);

  // Validate recruiters limit per selected event
  const validateRecruiterLimits = () => {
    const exceeded = [];
    for (const eid of boothForm.eventIds || []) {
      const max = eventLimits?.[eid]?.maxRecruitersPerEvent || 0; // 0 => unlimited
      if (!max) continue;
      // existing recruiters for this event, excluding this booth if editing
      let existing = recruitersByEvent[eid] || 0;
      if (editingBoothId) {
        // subtract the editing booth's recruiters if it belongs to this event
        const editing = booths.find(b => b.id === editingBoothId);
        if (editing && editing.eventIdRaw === eid) {
          existing = Math.max(0, existing - (editing.recruitersCount ?? 0));
        }
      }
      const proposedTotal = existing + (boothForm.recruitersCount || 0);
      if (proposedTotal > max) {
        exceeded.push({
          eventId: eid,
          name: eventLimits?.[eid]?.name || eid,
          existing,
          adding: boothForm.recruitersCount || 0,
          max,
        });
      }
    }
    return exceeded;
  };

  const loadEvents = useCallback(async () => {
    // Prevent multiple simultaneous fetches
    if (loadingEventsRef.current) return;
    
    try {
      loadingEventsRef.current = true;
      setLoadingEvents(true);
      const res = await listEvents({ page: 1, limit: 200 });
      const items = res?.events || [];
      const options = items.map(e => {
        const maxBooths = e?.limits?.maxBooths || 0; // 0 means unlimited
        const current = e?.boothCount || 0;
        const reached = maxBooths > 0 && current >= maxBooths;
        return {
          value: e._id,
          label: reached ? `${e.name} • limit reached` : e.name,
          disabled: reached,
        };
      });
      setEventOptions(options);
      // capture limits for validation
      const limitsMap = {};
      for (const e of items) {
        limitsMap[e._id] = {
          maxBooths: e?.limits?.maxBooths || 0,
          maxRecruitersPerEvent: e?.limits?.maxRecruitersPerEvent || 0,
          name: e?.name || 'Event',
        };
      }
      setEventLimits(limitsMap);
    } catch (err) {
      console.error('Failed to load events for booth', err);
      setEventOptions([]);
    } finally {
      loadingEventsRef.current = false;
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Center delete dialog when it opens
  useEffect(() => {
    if (confirmOpen && deleteDialogRef.current) {
      const dialogElement = deleteDialogRef.current.element || deleteDialogRef.current;
      if (dialogElement) {
        // Wait for dialog to render
        setTimeout(() => {
          const dialog = document.querySelector('.bm-delete-dialog.e-dialog');
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

  // (Focus management moved into reusable Toast component)

  // Grid template functions for custom column renders - using Syncfusion ButtonComponent
  const companyPageTemplate = (props) => {
    if (props.companyPage) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '4px 0' }}>
          <ButtonComponent
            cssClass="e-outline e-primary e-small"
            onClick={() => window.open(props.companyPage, '_blank')}
            style={{
              whiteSpace: 'nowrap',
              padding: '8px 24px',
              paddingLeft: '16px',
              paddingRight: '20px',
              borderWidth: '2px',
              minHeight: '36px'
            }}
          >
            <MdBusiness style={{ marginRight: '8px', verticalAlign: 'middle', flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap' }}>Company Page</span>
          </ButtonComponent>
        </div>
      );
    }
    return <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Not set</span>;
  };

  const actionsTemplate = (props) => {
    const row = props;
    return (
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <ButtonComponent
          cssClass="e-primary e-small"
          onClick={() => { }}
        >
          Job Seekers Report
        </ButtonComponent>
        <ButtonComponent
          cssClass="e-outline e-primary e-small"
          onClick={() => setPreviewBooth(row)}
        >
          Placeholder
        </ButtonComponent>
        <ButtonComponent
          cssClass="e-primary e-small"
          onClick={() => copyInvite(row)}
        >
          <MdLink style={{ marginRight: '4px', verticalAlign: 'middle' }} />
          Invite Link
        </ButtonComponent>
        <ButtonComponent
          cssClass="e-primary e-small"
          onClick={() => startEdit(row)}
        >
          <MdEdit style={{ marginRight: '4px', verticalAlign: 'middle' }} />
          Edit
        </ButtonComponent>
        <ButtonComponent
          cssClass="e-outline e-danger e-small"
          onClick={() => handleDelete(row)}
        >
          <MdDelete style={{ marginRight: '4px', verticalAlign: 'middle' }} />
          Delete
        </ButtonComponent>
      </div>
    );
  };

  const setBoothField = (k, v) => setBoothForm(prev => ({ ...prev, [k]: v }));
  const onPickBoothLogo = async (file) => {
    if (!file) return;
    try {
      setBoothSaving(true);
      const { downloadUrl } = await uploadBoothLogoToS3(file);
      setBoothField('boothLogo', downloadUrl);
    } catch (e) {
      console.error('Booth logo upload failed', e);
      alert('Failed to upload booth logo');
    } finally {
      setBoothSaving(false);
    }
  };
  const handleCreateBooth = async (e) => {
    e.preventDefault();
    setBoothSaving(true);
    try {
      // Client-side recruiters limit validation per event
      const exceeded = validateRecruiterLimits();
      if (exceeded.length) {
        const lines = exceeded.map(x => `• ${x.name}: ${x.existing} + ${x.adding} > ${x.max}`).join('\n');
        showToast(`Max number of recruiters reached for selected event(s):\n\n${lines}`, 'Error', 7000);
        return; // block submit
      }
      const payload = {
        name: boothForm.boothName,
        description: boothForm.firstHtml || '',
        logoUrl: boothForm.boothLogo || undefined,
        eventIds: boothForm.eventIds,
        companyPage: boothForm.companyPage || undefined,
        recruitersCount: boothForm.recruitersCount || 1,
        expireLinkTime: boothForm.expireLinkTime || undefined,
        customInviteSlug: sanitizeInvite(boothForm.customInviteText || ''),
        joinBoothButtonLink: boothForm.joinBoothButtonLink || '',
        richSections: [
          { title: 'First Placeholder', contentHtml: boothForm.firstHtml || '' },
          { title: 'Second Placeholder', contentHtml: boothForm.secondHtml || '' },
          { title: 'Third Placeholder', contentHtml: boothForm.thirdHtml || '' },
        ],
      };
      if (editingBoothId) {
        // Update base fields
        await updateBooth(editingBoothId, {
          name: payload.name,
          description: payload.description,
          logoUrl: payload.logoUrl,
          companyPage: payload.companyPage,
          recruitersCount: payload.recruitersCount,
          expireLinkTime: payload.expireLinkTime,
          customInviteSlug: payload.customInviteSlug,
          joinBoothButtonLink: payload.joinBoothButtonLink,
          eventId: boothForm.eventIds && boothForm.eventIds.length > 0 ? boothForm.eventIds[0] : undefined,
        });
        // Update rich sections via dedicated endpoint
        await updateBoothRichSections(editingBoothId, payload.richSections);
        // Refetch and redirect to list
        await loadBooths();
        await loadEvents();
        setBoothMode('list');
        setEditingBoothId(null);
        showToast('Booth updated', 'Success', 2500);
      } else {
        const res = await createBooths(payload);
        const createdCount = Array.isArray(res?.created) ? res.created.length : 0;
        const skipped = Array.isArray(res?.skipped) ? res.skipped : [];
        if (skipped.length) {
          console.warn('Some events skipped due to limits:', skipped);
          // Try to resolve event labels from current options
          const skippedList = skipped.map(s => {
            const opt = (eventOptions || []).find(o => o.value === s.eventId);
            const label = opt?.label || s.eventId;
            const reasonRaw = (s.reason || '').toString();
            const isRecruiter = /recruit/i.test(reasonRaw);
            const reasonNormalized = isRecruiter ? 'Recruiter limit reached' : 'Booth limit reached';
            return `• ${label} — ${reasonNormalized}`;
          }).join('\n');
          if (createdCount === 0) {
            showToast(`No booths were created.\n\n${skippedList}`, 'Error', 6000);
          } else {
            showToast(`Booth created for some events, but others were skipped due to limits:\n\n${skippedList}`, 'Warning', 6000);
          }
        } else if (createdCount === 0) {
          // Safety: backend responded but nothing created and no skips array
          showToast('No booths were created.', 'Error', 5000);
        } else {
          showToast('Booth created', 'Success', 2500);
        }
        await loadBooths();
        // Reload events to update booth counts in dropdown
        await loadEvents();
        // Only go back to list if at least one booth was created
        if (createdCount > 0) {
          setBoothMode('list');
          setEditingBoothId(null);
        }
        if (createdCount === 0) {
          // Stay on form for user to adjust selections
          setEditingBoothId(null);
        }
      }
    } catch (err) {
      console.error(editingBoothId ? 'Update booth failed' : 'Create booth failed', err);
      
      // Handle specific error cases
      if (err?.response?.status === 409) {
        showToast('Custom invite already taken', 'Error', 5000);
        return;
      }
      
      // Extract error message from response
      const errorData = err?.response?.data;
      let errorMessage = editingBoothId ? 'Failed to update booth' : 'Failed to create booth';
      
      if (errorData) {
        // Check for validation errors with details
        if (errorData.details && Array.isArray(errorData.details) && errorData.details.length > 0) {
          const validationErrors = errorData.details
            .map(detail => {
              if (detail.msg) return detail.msg;
              if (detail.path) return `${detail.path}: Invalid value`;
              return 'Validation error';
            })
            .filter(Boolean)
            .join('\n');
          
          if (validationErrors) {
            errorMessage = `Validation failed:\n${validationErrors}`;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
      }
      
      showToast(errorMessage, 'Error', 7000);
    } finally { setBoothSaving(false); }
  };

  const handleSearch = () => {
    const query = (searchInputRef.current?.value || '').trim();
    setActiveSearchQuery(query);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handleClearSearch = () => {
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
    }
    setActiveSearchQuery('');
    setCurrentPage(1); // Reset to first page when clearing
  };

  const loadBooths = useCallback(async () => {
    // Prevent multiple simultaneous fetches
    if (loadingBoothsRef.current) return;
    
    try {
      loadingBoothsRef.current = true;
      setLoadingBooths(true);
      // When searching, fetch a very large number (10000) to ensure ALL matching records are loaded
      // When not searching, fetch 50 for initial load (grid handles client-side pagination)
      const limit = activeSearchQuery && activeSearchQuery.trim() ? 10000 : 50;
      const params = { page: 1, limit };
      const res = await listBooths(params);
      let items = res?.booths || [];
      
      // Client-side filtering if search query exists
      if (activeSearchQuery && activeSearchQuery.trim()) {
        const searchLower = activeSearchQuery.trim().toLowerCase();
        items = items.filter(b => {
          const name = (b.name || '').toLowerCase();
          const eventName = (b.eventId?.name || '').toLowerCase();
          const customInvite = (b.customInviteSlug || '').toLowerCase();
          const companyPage = (b.companyPage || '').toLowerCase();
          return name.includes(searchLower) || 
                 eventName.includes(searchLower) || 
                 customInvite.includes(searchLower) ||
                 companyPage.includes(searchLower);
        });
      }
      
      // Map to grid rows expected by Syncfusion GridComponent
      setBooths(items.map(b => ({
        id: b._id,
        name: b.name,
        logo: b.logoUrl,
        events: [b.eventId?.name || ''],
        eventName: b.eventId?.name || '', // Flattened for filtering
        eventIdRaw: b.eventId?._id || null,
        richSections: b.richSections || [],
        customInviteSlug: b.customInviteSlug || '',
        companyPage: b.companyPage || '',
        joinBoothButtonLink: b.joinBoothButtonLink || '',
        customUrl: b.customInviteSlug ? `${baseUrl}/queue/${b.customInviteSlug}` : '',
        recruitersCount: b.recruitersCount ?? 0,
        expireLinkTime: b.expireLinkTime || null,
      })));
    } catch (e) {
      console.error('Failed to load booths', e);
      setBooths([]);
    } finally { 
      loadingBoothsRef.current = false;
      setLoadingBooths(false); 
    }
  }, [activeSearchQuery, baseUrl]);

  useEffect(() => { 
    loadBooths(); 
  }, [loadBooths]);

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
  }, [booths]);

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
  }, [booths]);

  // Edit handler (basic prefill)
  const startEdit = (row) => {
    setBoothForm(prev => ({
      ...prev,
      boothName: row.name || '',
      boothLogo: row.logo || '',
      firstHtml: row.richSections?.[0]?.contentHtml || '',
      secondHtml: row.richSections?.[1]?.contentHtml || '',
      thirdHtml: row.richSections?.[2]?.contentHtml || '',
      eventIds: row.eventIdRaw ? [row.eventIdRaw] : boothForm.eventIds,
      companyPage: row.companyPage || '',
      customInviteText: row.customInviteSlug || '',
      joinBoothButtonLink: row.joinBoothButtonLink || '',
    }));
    setBoothMode('create');
    setEditingBoothId(row.id);
  };

  // Delete handlers
  const handleDelete = (row) => { setRowPendingDelete(row); setConfirmOpen(true); };
  const confirmDelete = async () => {
    if (!rowPendingDelete) return;
    try {
      setBoothSaving(true);
      await deleteBooth(rowPendingDelete.id);
      await loadBooths();
      showToast('Booth deleted', 'Success');
    } catch (e) {
      console.error('Delete booth failed', e);
      showToast('Failed to delete');
    } finally {
      setBoothSaving(false);
      setConfirmOpen(false);
      setRowPendingDelete(null);
    }
  };
  const cancelDelete = () => { setConfirmOpen(false); setRowPendingDelete(null); };

  // Invite link copy - Syncfusion Toast
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
  const copyInvite = async (row) => {
    const custom = row.customInviteSlug && sanitizeInvite(row.customInviteSlug);
    const url = custom
      ? `${baseUrl}/queue/${custom}`
      : `${baseUrl}/queue/${slugify(row.name || 'booth')}-${queueToken}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Invite link copied', 'Success');
    } catch (e) {
      window.prompt('Copy to clipboard: Ctrl+C, Enter', url);
      showToast('Copy failed. Link shown.');
    }
  };

  // Check user role before rendering - all hooks must be called first
  const allowedRoles = ['Admin', 'AdminEvent', 'GlobalSupport'];
  if (!user || !allowedRoles.includes(user.role)) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="dashboard">
      <AdminHeader />

      <div className="dashboard-layout">
        <AdminSidebar active="booths" />

        <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
          <div className="dashboard-content">
            <div className="bm-header">
              <h2>Booth Management</h2>
              <div className="bm-header-actions">
                {boothMode === 'list' ? (
                  <ButtonComponent cssClass="e-primary" onClick={() => setBoothMode('create')}>
                    Create Booth
                  </ButtonComponent>
                ) : (
                  <ButtonComponent cssClass="e-outline e-primary" onClick={() => setBoothMode('list')}>
                    Back to List
                  </ButtonComponent>
                )}
              </div>
            </div>

            {boothMode === 'list' ? (
              <div className="bm-grid-wrap" style={{ position: 'relative' }}>
                <div className="form-row" style={{ marginBottom: 12, paddingLeft: '20px', paddingRight: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {/* Search Section - Right Aligned */}
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <input
                      ref={searchInputRef}
                      id="booth-search-input"
                      type="text"
                      defaultValue=""
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSearch();
                        }
                      }}
                      placeholder="Search by name, event, or any field..."
                      style={{ minWidth: '250px', maxWidth: '400px' }}
                      className="bm-search-input-native"
                    />
                    <ButtonComponent
                      cssClass="e-primary"
                      onClick={handleSearch}
                      disabled={loadingBooths}
                      aria-label="Search booths"
                    >
                      Search
                    </ButtonComponent>
                    {activeSearchQuery && (
                      <ButtonComponent
                        cssClass="e-outline e-primary"
                        onClick={handleClearSearch}
                        disabled={loadingBooths}
                        aria-label="Clear search"
                      >
                        Clear
                      </ButtonComponent>
                    )}
                  </div>
                </div>
                {loadingBooths && (
                  <div className="bm-grid-loading-overlay">
                    <div className="bm-loading-container">
                      <div className="bm-loading-spinner" aria-label="Loading booths" role="status" aria-live="polite"></div>
                      <div className="bm-loading-text">Loading booths...</div>
                    </div>
                  </div>
                )}
                <GridComponent
                  ref={gridRef}
                  dataSource={booths.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
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
                  enableHeaderFocus={false}
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
                      field='name'
                      headerText='Booth Name'
                      width='200'
                      allowFiltering={true}
                      template={(props) => (
                        <div style={{
                          wordWrap: 'break-word',
                          wordBreak: 'break-word',
                          whiteSpace: 'normal',
                          lineHeight: '1.5',
                          padding: '4px 0'
                        }}>
                          {props.name || '-'}
                        </div>
                      )}
                    />
                    <ColumnDirective
                      field='logo'
                      headerText='Logo'
                      width='100'
                      textAlign='Center'
                      allowFiltering={true}
                      template={(props) => props.logo ? <img src={props.logo} alt="Booth logo" style={{ width: 80, height: 28, objectFit: 'contain', borderRadius: 4 }} /> : '-'}
                    />
                    <ColumnDirective
                      field='eventName'
                      headerText='Event Title'
                      width='200'
                      allowFiltering={true}
                      template={(props) => (
                        <div style={{
                          wordWrap: 'break-word',
                          wordBreak: 'break-word',
                          whiteSpace: 'normal',
                          lineHeight: '1.5',
                          padding: '4px 0'
                        }}>
                          {props.eventName || 'No events'}
                        </div>
                      )}
                    />
                    <ColumnDirective
                      field='recruitersCount'
                      headerText='Recruiters'
                      width='120'
                      textAlign='Center'
                      allowFiltering={true}
                      template={(props) => (
                        <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'center' }}>
                          {props.recruitersCount ?? 0}
                        </div>
                      )}
                    />
                    <ColumnDirective
                      field='customInviteSlug'
                      headerText='Custom Invite Text'
                      width='180'
                      allowFiltering={true}
                      template={(props) => (
                        <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                          {props.customInviteSlug ? props.customInviteSlug : <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Not set</span>}
                        </div>
                      )}
                    />
                    <ColumnDirective
                      field='expireLinkTime'
                      headerText='Expire Date'
                      width='180'
                      allowFiltering={true}
                      template={(props) => {
                        let displayText = 'No expiry';
                        if (props.expireLinkTime) {
                          try {
                            const date = new Date(props.expireLinkTime);
                            if (!isNaN(date.getTime())) {
                              displayText = date.toLocaleString();
                            } else {
                              displayText = 'Invalid date';
                            }
                          } catch (e) {
                            displayText = 'Invalid date';
                          }
                        }
                        return (
                          <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                            {displayText}
                          </div>
                        );
                      }}
                    />
                    <ColumnDirective
                      field='companyPage'
                      headerText='Company Page'
                      width='180'
                      minWidth='170'
                      allowSorting={false}
                      allowFiltering={false}
                      clipMode='EllipsisWithTooltip'
                      template={companyPageTemplate}
                    />
                    <ColumnDirective
                      headerText='Actions'
                      width='500'
                      allowSorting={false}
                      allowFiltering={false}
                      template={actionsTemplate}
                    />
                  </ColumnsDirective>
                  <GridInject services={[Sort, Filter, GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu]} />
                </GridComponent>

                {/* Custom Pagination Footer */}
                {booths.length > 0 && (
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
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                                <option value={200}>200</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '14px', color: '#374151' }}>
                                Page {currentPage} of {Math.ceil(booths.length / pageSize) || 1} ({booths.length} total)
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                                onClick={() => {
                                    if (currentPage > 1) {
                                        setCurrentPage(1);
                                    }
                                }}
                                disabled={currentPage <= 1 || loadingBooths}
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
                                disabled={currentPage <= 1 || loadingBooths}
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
                                max={Math.ceil(booths.length / pageSize) || 1}
                                value={currentPage}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    const maxPage = Math.ceil(booths.length / pageSize) || 1;
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
                                    const maxPage = Math.ceil(booths.length / pageSize) || 1;
                                    if (currentPage < maxPage) {
                                        setCurrentPage(currentPage + 1);
                                    }
                                }}
                                disabled={currentPage >= (Math.ceil(booths.length / pageSize) || 1) || loadingBooths}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid #d1d5db',
                                    backgroundColor: currentPage >= (Math.ceil(booths.length / pageSize) || 1) ? '#f3f4f6' : '#fff',
                                    cursor: currentPage >= (Math.ceil(booths.length / pageSize) || 1) ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    color: currentPage >= (Math.ceil(booths.length / pageSize) || 1) ? '#9ca3af' : '#374151'
                                }}
                                title="Next Page"
                            >
                                Next ⟩
                            </button>
                            <button
                                onClick={() => {
                                    const maxPage = Math.ceil(booths.length / pageSize) || 1;
                                    if (currentPage < maxPage) {
                                        setCurrentPage(maxPage);
                                    }
                                }}
                                disabled={currentPage >= (Math.ceil(booths.length / pageSize) || 1) || loadingBooths}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid #d1d5db',
                                    backgroundColor: currentPage >= (Math.ceil(booths.length / pageSize) || 1) ? '#f3f4f6' : '#fff',
                                    cursor: currentPage >= (Math.ceil(booths.length / pageSize) || 1) ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    color: currentPage >= (Math.ceil(booths.length / pageSize) || 1) ? '#9ca3af' : '#374151'
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
              <form className="account-form" onSubmit={handleCreateBooth} style={{ maxWidth: 720 }}>
                <Input
                  label="Booth Name"
                  value={boothForm.boothName}
                  onChange={(e) => setBoothField('boothName', e.target.value)}
                  required
                  placeholder="Enter booth name"
                />

                <div className="form-group">
                  <label className="form-label">Booth Logo</label>
                  <div className="upload-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <ButtonComponent 
                      cssClass="e-outline e-primary e-small"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        document.getElementById('booth-logo-upload')?.click();
                      }}
                    >
                      Choose file
                    </ButtonComponent>
                    <input
                      id="booth-logo-upload"
                      type="file"
                      accept="image/*"
                      onChange={(e) => onPickBoothLogo(e.target.files?.[0])}
                      style={{ display: 'none' }}
                    />
                    {boothForm.boothLogo && <img src={boothForm.boothLogo} alt="Booth logo" style={{ height: 40, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', padding: 4 }} />}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Waiting Area Content</label>
                  <div className="bm-rte-tabs">
                    <div className="bm-rte-block">
                      <h4>First Placeholder</h4>
                      <RTE
                        ref={rteFirstRef}
                        value={boothForm.firstHtml}
                        change={(e) => setBoothField('firstHtml', e?.value || '')}
                        toolbarSettings={buildRteToolbar(() => openImagePickerFor(rteFirstRef))}
                        placeholder="Enter content for first placeholder..."
                      >
                        <RTEInject services={[HtmlEditor, RTEToolbar, QuickToolbar, RteLink, RteImage]} />
                      </RTE>
                    </div>
                    <div className="bm-rte-block">
                      <h4>Second Placeholder</h4>
                      <RTE
                        ref={rteSecondRef}
                        value={boothForm.secondHtml}
                        change={(e) => setBoothField('secondHtml', e?.value || '')}
                        toolbarSettings={buildRteToolbar(() => openImagePickerFor(rteSecondRef))}
                        placeholder="Enter content for second placeholder..."
                      >
                        <RTEInject services={[HtmlEditor, RTEToolbar, QuickToolbar, RteLink, RteImage]} />
                      </RTE>
                    </div>
                    <div className="bm-rte-block">
                      <h4>Third Placeholder</h4>
                      <RTE
                        ref={rteThirdRef}
                        value={boothForm.thirdHtml}
                        change={(e) => setBoothField('thirdHtml', e?.value || '')}
                        toolbarSettings={buildRteToolbar(() => openImagePickerFor(rteThirdRef))}
                        placeholder="Enter content for third placeholder..."
                      >
                        <RTEInject services={[HtmlEditor, RTEToolbar, QuickToolbar, RteLink, RteImage]} />
                      </RTE>
                    </div>
                  </div>
                </div>

                <div className="form-row">
                  <MultiSelect
                    label="Select Event"
                    value={boothForm.eventIds}
                    onChange={(e) => setBoothField('eventIds', e.target.value)}
                    options={eventOptions}
                    placeholder={loadingEvents ? 'Loading events…' : 'Choose your Event'}
                    name="eventIds"
                  />
                </div>

                <Input
                  label="Recruiters Count"
                  type="number"
                  min="1"
                  value={boothForm.recruitersCount}
                  onChange={(e) => setBoothField('recruitersCount', Number(e.target.value))}
                  required
                  placeholder="Enter number of recruiters"
                />

                <Input
                  label="Custom invite text"
                  value={boothForm.customInviteText}
                  onChange={(e) => setBoothField('customInviteText', e.target.value)}
                  placeholder="Enter custom invite text"
                />

                <div className="form-inline-row" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 380px', minWidth: 260 }}>
                    <DateTimePicker
                      label="Expire Link Time"
                      value={boothForm.expireLinkTime}
                      onChange={(e) => setBoothField('expireLinkTime', e.target.value)}
                      placeholder="Select expiry"
                      disabled={!boothForm.enableExpiry}
                      name="expireLinkTime"
                    />
                  </div>
                  <div style={{ flex: '0 0 auto', paddingBottom: 6 }}>
                    <Checkbox
                      label="Enable Expiry Link Time"
                      checked={boothForm.enableExpiry}
                      onChange={(e) => setBoothField('enableExpiry', e.target.checked)}
                      name="enableExpiry"
                    />
                  </div>
                </div>

                <Input
                  label="Company Page"
                  type="url"
                  value={boothForm.companyPage}
                  onChange={(e) => setBoothField('companyPage', e.target.value)}
                  placeholder="https://example.com"
                />

                <Input
                  label="Job Seeker Queue Link"
                  value={boothQueueLink}
                  readOnly
                  aria-live="polite"
                  name="jobSeekerQueueLink"
                  placeholder="Auto-generated link"
                />

                <Input
                  label="Join Booth Button Link"
                  type="url"
                  value={boothForm.joinBoothButtonLink}
                  onChange={(e) => setBoothField('joinBoothButtonLink', e.target.value)}
                  placeholder="Leave empty to use Job Seeker Queue Link"
                  name="joinBoothButtonLink"
                />
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                  If set, the "Join Queue" button on the event page will redirect to this URL instead of the default queue link.
                </p>

                <ButtonComponent
                  cssClass="e-primary"
                  disabled={boothSaving}
                  isPrimary={true}
                  onClick={(e) => { e.preventDefault(); handleCreateBooth(e); }}
                >
                  {boothSaving ? 'Saving…' : (editingBoothId ? 'Update Booth' : 'Create Booth')}
                </ButtonComponent>
              </form>
            )}
          </div>
        </main>
      </div>

      {/* Mobile overlay */}
      <div className="mobile-overlay" aria-hidden="true" />

      {/* Placeholder preview modal - rendered via portal to avoid DOM conflicts */}
      {previewBooth && typeof document !== 'undefined' && createPortal(
        <div 
          role="dialog" 
          aria-modal="true" 
          className="modal-overlay" 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(0,0,0,0.4)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 60 
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPreviewBooth(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setPreviewBooth(null);
            }
          }}
          tabIndex={-1}
        >
          <div 
            className="modal-card" 
            style={{ 
              background: '#fff', 
              borderRadius: 8, 
              padding: 20, 
              width: '90%', 
              maxWidth: 1100, 
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
              maxHeight: '90vh',
              overflow: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Placeholder Preview - {previewBooth.name}</h3>
              <ButtonComponent cssClass="e-outline e-primary" onClick={() => setPreviewBooth(null)}>
                Close
              </ButtonComponent>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              {[0, 1, 2].map(i => (
                <div 
                  key={`placeholder-${i}-${previewBooth.id || previewBooth.name}`} 
                  style={{ 
                    border: '1px solid #e5e7eb', 
                    borderRadius: 8, 
                    padding: 12, 
                    minHeight: 500, 
                    overflow: 'auto' 
                  }}
                >
                  <div dangerouslySetInnerHTML={{ __html: previewBooth.richSections?.[i]?.contentHtml || '<em>No content</em>' }} />
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete confirm modal - Syncfusion DialogComponent */}
      <DialogComponent
        ref={deleteDialogRef}
        width="450px"
        isModal={true}
        showCloseIcon={true}
        visible={confirmOpen}
        header="Delete Booth"
        closeOnEscape={true}
        close={cancelDelete}
        cssClass="bm-delete-dialog"
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
              content: boothSaving ? 'Deleting…' : 'Delete',
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
          Are you sure you want to delete <strong>{rowPendingDelete?.name}</strong>? This action cannot be undone.
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

      {/* hidden input for S3 image insert */}
      <input type="file" accept="image/*" ref={hiddenImageInputRef} onChange={onHiddenImagePicked} style={{ display: 'none' }} />
    </div>
  );
}
