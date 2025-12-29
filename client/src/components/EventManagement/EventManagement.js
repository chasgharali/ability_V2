import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../Dashboard/Dashboard.css';
import './EventManagement.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import filterIcon from '../../assets/filter.png';
import { GridComponent, ColumnsDirective, ColumnDirective, Inject as GridInject, Sort, Filter, Toolbar as GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu } from '@syncfusion/ej2-react-grids';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { Input, DateTimePicker, Checkbox, Select, MultiSelect } from '../UI/FormComponents';
import { RichTextEditorComponent as RTE, Toolbar as RTEToolbar, Link as RteLink, Image as RteImage, HtmlEditor, QuickToolbar, Inject as RTEInject } from '@syncfusion/ej2-react-richtexteditor';
import { uploadImageToS3 } from '../../services/uploads';
import { listEvents, createEvent, updateEvent, deleteEvent, bulkDeleteEvents } from '../../services/events';
import { termsConditionsAPI } from '../../services/termsConditions';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function EventManagement() {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    useEffect(() => {
        if (!loading) {
            if (!user) {
                navigate('/login', { replace: true });
            } else if (!['Admin', 'GlobalSupport'].includes(user.role)) {
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

    const [mode, setMode] = useState('list'); // 'list' | 'create' | 'edit'
    const [editingId, setEditingId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [rowPendingDelete, setRowPendingDelete] = useState(null);
    const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
    const [selectedEvents, setSelectedEvents] = useState([]);
    const [isDeleting, setIsDeleting] = useState(false);
    const toastRef = useRef(null);
    const deleteDialogRef = useRef(null);
    const gridRef = useRef(null);
    const loadingListRef = useRef(false);

    // RTE image upload helpers (Event Information editor)
    const rteInfoRef = useRef(null);
    const hiddenImageInputRef = useRef(null);
    const [activeRteRef, setActiveRteRef] = useState(null);

    const [form, setForm] = useState({
        sendyId: '',
        name: '',
        link: '',
        logoUrl: '',
        maxBooths: 0,
        maxRecruitersPerEvent: 0,
        startTime: '',
        endTime: '',
        information: '',
        termsId: '',
        termsIds: [],
        status: 'draft',
        headerColor: '#ffffff',
        headerTextColor: '#000000',
        bodyColor: '#ff9800',
        bodyTextColor: '#000000',
        sidebarColor: '#ffffff',
        sidebarTextColor: '#000000',
        btnPrimaryColor: '#000000',
        btnPrimaryTextColor: '#ffffff',
        btnSecondaryColor: '#000000',
        btnSecondaryTextColor: '#ffffff',
        entranceFormColor: '#ff9800',
        entranceFormTextColor: '#000000',
        chatHeaderColor: '#eeeeee',
        chatSidebarColor: '#000000',
        addFooter: false,
        isDemo: false,
    });

    // RichTextEditor toolbar settings: MultiRow with floating toolbar and comprehensive items
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
            const { downloadUrl } = await uploadImageToS3(file);
            try {
                activeRteRef.current.executeCommand('insertImage', { url: downloadUrl, altText: file.name });
            } catch {
                activeRteRef.current.executeCommand('insertHTML', `<img src="${downloadUrl}" alt="${file.name}" />`);
            }
            showToast('Image inserted');
        } catch (err) {
            console.error('Event RTE image upload failed', err);
            showToast('Failed to upload image');
        } finally {
            setActiveRteRef(null);
        }
    };

    const [events, setEvents] = useState([]);
    const [loadingList, setLoadingList] = useState(false);
    const [termsOptions, setTermsOptions] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    // Load status filter from sessionStorage on mount (per-table persistence)
    const loadStatusFilterFromSession = () => {
        try {
            const saved = sessionStorage.getItem('eventManagement_statusFilter');
            if (saved) {
                return saved;
            }
        } catch (error) {
            console.error('Error loading Event Management status filter from sessionStorage:', error);
        }
        return '';
    };

    const [statusFilter, setStatusFilter] = useState(loadStatusFilterFromSession);
    const searchInputRef = useRef(null); // Uncontrolled input to avoid live filtering on typing
    const [activeSearchQuery, setActiveSearchQuery] = useState(''); // Actual search parameter used for filtering

    const handleSearch = useCallback(() => {
        const query = (searchInputRef.current?.value || '').trim();
        setActiveSearchQuery(query);
        setCurrentPage(1); // Reset to first page when searching
    }, []);

    const handleClearSearch = useCallback(() => {
        if (searchInputRef.current) {
            searchInputRef.current.value = '';
        }
        setActiveSearchQuery('');
        // loadEvents will be called automatically via useEffect when activeSearchQuery changes
        setCurrentPage(1); // Reset to first page when clearing
    }, []);

    const statusOptions = [
        { value: '', label: 'All Statuses' },
        { value: 'draft', label: 'Draft' },
        { value: 'published', label: 'Published' },
        { value: 'active', label: 'Active' },
        { value: 'completed', label: 'Completed' },
        { value: 'cancelled', label: 'Cancelled' },
    ];

    // Persist status filter in sessionStorage so it survives navigation during the session
    useEffect(() => {
        try {
            if (statusFilter) {
                sessionStorage.setItem('eventManagement_statusFilter', statusFilter);
            } else {
                sessionStorage.removeItem('eventManagement_statusFilter');
            }
        } catch (error) {
            console.error('Error saving Event Management status filter to sessionStorage:', error);
        }
    }, [statusFilter]);

    const loadEvents = useCallback(async () => {
        // Prevent multiple simultaneous fetches
        if (loadingListRef.current) return;
        
        try {
            loadingListRef.current = true;
            setLoadingList(true);
            // Fetch a very large number (10000) to ensure ALL records are loaded for client-side pagination and filtering
            // This allows all events to be displayed whether searching or not
            const limit = 10000;
            const params = { page: 1, limit };
            // Add status filter if selected
            if (statusFilter && statusFilter.trim()) {
                params.status = statusFilter.trim();
            }
            const res = await listEvents(params);
            let items = res?.events || [];
            
            // Client-side filtering if search query exists
            if (activeSearchQuery && activeSearchQuery.trim()) {
                const searchLower = activeSearchQuery.trim().toLowerCase();
                items = items.filter(e => {
                    const name = (e.name || '').toLowerCase();
                    const description = (e.description || '').toLowerCase();
                    const slug = (e.slug || '').toLowerCase();
                    const sendyId = (e.sendyId || '').toLowerCase();
                    const status = (e.status || '').toLowerCase();
                    // Also search in formatted date strings
                    let startDate = '';
                    let endDate = '';
                    let createdDate = '';
                    try {
                        if (e.start) {
                            const start = new Date(e.start);
                            if (!isNaN(start.getTime())) {
                                startDate = start.toLocaleString().toLowerCase();
                            }
                        }
                        if (e.end) {
                            const end = new Date(e.end);
                            if (!isNaN(end.getTime())) {
                                endDate = end.toLocaleString().toLowerCase();
                            }
                        }
                        if (e.createdAt) {
                            const created = new Date(e.createdAt);
                            if (!isNaN(created.getTime())) {
                                createdDate = created.toDateString().toLowerCase();
                            }
                        }
                    } catch (err) {
                        // Ignore date parsing errors
                    }
                    const maxRecruiters = String(e.limits?.maxRecruitersPerEvent ?? 0);
                    const maxBooths = String(e.limits?.maxBooths ?? 0);
                    
                    return name.includes(searchLower) || 
                           description.includes(searchLower) || 
                           slug.includes(searchLower) ||
                           sendyId.includes(searchLower) ||
                           status.includes(searchLower) ||
                           startDate.includes(searchLower) ||
                           endDate.includes(searchLower) ||
                           createdDate.includes(searchLower) ||
                           maxRecruiters.includes(searchLower) ||
                           maxBooths.includes(searchLower);
                });
            }
            
            setEvents(items.map((e) => ({
                id: e._id,
                name: e.name,
                link: e.link,
                slug: e.slug,
                sendyId: e.sendyId,
                description: e.description || '',
                logoUrl: e.logoUrl || '',
                startTime: e.start,
                endTime: e.end,
                date: new Date(e.start).toDateString(),
                createdAt: new Date(e.createdAt).toDateString(),
                maxRecruitersPerEvent: e.limits?.maxRecruitersPerEvent ?? 0,
                maxBooths: e.limits?.maxBooths ?? 0,
                registrationCount: e.stats?.totalRegistrations ?? 0,
                status: e.status || 'draft',
                isDemo: e.isDemo || false,
                addFooter: Boolean((e.addFooter !== undefined ? e.addFooter : e.theme?.addFooter)),
                termsIds: e.termsIds || [],
            })));
        } catch (err) {
            console.error('Failed to load events', err);
            setEvents([]);
        } finally {
            loadingListRef.current = false;
            setLoadingList(false);
        }
    }, [statusFilter, activeSearchQuery]);

    const loadTerms = useCallback(async () => {
        try {
            const res = await termsConditionsAPI.getAll({ page: 1, limit: 100 });
            const list = res?.terms || [];
            setTermsOptions(list.map(t => ({ value: t._id, label: `${t.title} (v${t.version})${t.isActive ? ' • Active' : ''}` })));
        } catch (e) {
            console.error('Failed to load terms', e);
        }
    }, []);

    // Load events on mount and when filters change
    useEffect(() => { 
        if (!loading) { 
            loadEvents(); 
        } 
    }, [loading, loadEvents]);

    // Track selection changes from grid
    useEffect(() => {
        if (!gridRef.current) return;
        
        const updateSelection = () => {
            const currentSelection = getSelectedEventsFromGrid();
            setSelectedEvents(currentSelection);
        };

        // Listen for selection events
        const grid = gridRef.current;
        if (grid.element) {
            const handleSelectionChange = () => {
                setTimeout(updateSelection, 100);
            };
            
            grid.element.addEventListener('click', handleSelectionChange);
            
            return () => {
                if (grid.element) {
                    grid.element.removeEventListener('click', handleSelectionChange);
                }
            };
        }
    }, [events, getSelectedEventsFromGrid]);

    // Load terms only when user enters create or edit mode (not needed for list view)
    useEffect(() => {
        if ((mode === 'create' || mode === 'edit') && termsOptions.length === 0) {
            loadTerms();
        }
    }, [mode, loadTerms, termsOptions.length]);

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
    }, [events]);

    // Center delete dialog when it opens
    useEffect(() => {
        if (confirmOpen && deleteDialogRef.current) {
            const dialogElement = deleteDialogRef.current.element || deleteDialogRef.current;
            if (dialogElement) {
                // Wait for dialog to render
                setTimeout(() => {
                    const dialog = document.querySelector('.em-delete-dialog.e-dialog');
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

    const showToast = (message, type = 'Success') => {
        if (toastRef.current) {
            toastRef.current.show({
                title: type,
                content: message,
                cssClass: `e-toast-${type.toLowerCase()}`,
                showProgressBar: true,
                timeOut: 3000
            });
        }
    };

    const copyText = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Registration link copied');
        } catch (e) {
            console.error('Copy failed', e);
            window.prompt('Copy to clipboard: Ctrl+C, Enter', text);
            showToast('Copy failed. Link shown.');
        }
    };

    const registrationUrlFor = (row) => `${window.location.origin}/register?redirect=${encodeURIComponent(`/event/${row.slug}/register`)}`;

    const eventPageUrlFor = (row) => row.link || `${window.location.origin}/event/${row.slug}`;

    // Grid template functions for custom column renders - using Syncfusion ButtonComponent
    // Format date/time to show the time in user's local timezone
    const formatEventDateTime = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        // Format date in local timezone
        const dateStr = date.toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric'
        });
        // Format time in local timezone
        const timeStr = date.toLocaleString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        return `${dateStr}, ${timeStr}`;
    };

    const eventPageTemplate = (props) => (
        <ButtonComponent 
            cssClass="e-outline e-primary e-small" 
            onClick={() => window.open(eventPageUrlFor(props), '_blank')}
        >
            Event Page
        </ButtonComponent>
    );

    const actionsTemplate = (props) => (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <ButtonComponent 
                cssClass="e-primary e-small" 
                onClick={() => copyText(registrationUrlFor(props))}
            >
                Registration Link
            </ButtonComponent>
            <ButtonComponent 
                cssClass="e-outline e-primary e-small" 
                onClick={() => startEdit(props)}
            >
                Edit
            </ButtonComponent>
            <ButtonComponent 
                cssClass="e-outline e-danger e-small" 
                onClick={() => handleDelete(props)}
            >
                Delete
            </ButtonComponent>
        </div>
    );

    const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const resetForm = () => {
        // Clear RichTextEditor content first if ref exists
        if (rteInfoRef.current) {
            try {
                rteInfoRef.current.value = '';
                rteInfoRef.current.refresh();
            } catch (e) {
                // Ignore errors if RTE is not initialized
                console.debug('RTE reset:', e);
            }
        }
        setForm({
            sendyId: '',
            name: '',
            link: '',
            logoUrl: '',
            maxBooths: 0,
            maxRecruitersPerEvent: 0,
            startTime: '',
            endTime: '',
            information: '',
            termsId: '',
            termsIds: [],
            status: 'draft',
            headerColor: '#ffffff',
            headerTextColor: '#000000',
            bodyColor: '#ff9800',
            bodyTextColor: '#000000',
            sidebarColor: '#ffffff',
            sidebarTextColor: '#000000',
            btnPrimaryColor: '#000000',
            btnPrimaryTextColor: '#ffffff',
            btnSecondaryColor: '#000000',
            btnSecondaryTextColor: '#ffffff',
            entranceFormColor: '#ff9800',
            entranceFormTextColor: '#000000',
            chatHeaderColor: '#eeeeee',
            chatSidebarColor: '#000000',
            addFooter: false,
            isDemo: false,
        });
        setEditingId(null);
    };

    const handleNew = () => {
        resetForm();
        setMode('create');
    };

    const onPickLogo = async (file) => {
        if (!file) return;
        try {
            setSaving(true);
            const { downloadUrl } = await uploadImageToS3(file);
            setField('logoUrl', downloadUrl);
        } catch (e) {
            console.error('Logo upload failed', e);
            alert('Failed to upload logo. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const startEdit = (row) => {
        setEditingId(row.id);
        
        // Helper function to convert UTC date to local datetime-local format
        const toLocalDateTimeString = (dateString) => {
            if (!dateString) return '';
            const date = new Date(dateString);
            // Get local date/time components
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day}T${hours}:${minutes}`;
        };
        
        setForm(prev => ({
            ...prev,
            sendyId: row.sendyId || '',
            name: row.name || '',
            link: row.link || '',
            logoUrl: row.logoUrl || '',
            maxBooths: row.maxBooths || 0,
            maxRecruitersPerEvent: row.maxRecruitersPerEvent || 0,
            startTime: toLocalDateTimeString(row.startTime),
            endTime: toLocalDateTimeString(row.endTime),
            information: row.description || '',
            status: row.status || 'draft',
            addFooter: row.addFooter || false,
            isDemo: row.isDemo || false,
            termsIds: row.termsIds || [],
        }));
        setMode('edit');
    };

    const handleDelete = (row) => {
        setRowPendingDelete(row);
        setConfirmOpen(true);
    };

    const confirmDelete = async () => {
        if (!rowPendingDelete) return;
        try {
            setSaving(true);
            await deleteEvent(rowPendingDelete.id);
            await loadEvents();
        } finally {
            setSaving(false);
            setConfirmOpen(false);
            setRowPendingDelete(null);
        }
    };

    const cancelDelete = () => {
        setConfirmOpen(false);
        setRowPendingDelete(null);
    };

    // Get selected events from grid
    const getSelectedEventsFromGrid = useCallback(() => {
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
        const currentSelection = getSelectedEventsFromGrid();
        if (currentSelection.length === 0) {
            showToast('Please select events to delete', 'Warning');
            return;
        }
        setSelectedEvents(currentSelection);
        setConfirmBulkDeleteOpen(true);
    };

    const confirmBulkDelete = async () => {
        try {
            setIsDeleting(true);
            const response = await bulkDeleteEvents(selectedEvents);
            showToast(response.message || 'Events deleted successfully', 'Success');
            setSelectedEvents([]);
            await loadEvents();
        } catch (error) {
            console.error('Error deleting events:', error);
            showToast(error.response?.data?.message || 'Failed to delete events', 'Error');
        } finally {
            setIsDeleting(false);
            setConfirmBulkDeleteOpen(false);
        }
    };

    const cancelBulkDelete = () => {
        setConfirmBulkDeleteOpen(false);
        setSelectedEvents([]);
    };

    const handleSubmit = async (e) => {
        if (e && e.preventDefault) {
            e.preventDefault();
        }
        setSaving(true);
        try {
            // Convert datetime-local format to ISO string
            // datetime-local gives us "YYYY-MM-DDTHH:MM" in user's local time
            // We need to convert it to ISO string for the server
            const startISO = form.startTime ? new Date(form.startTime).toISOString() : undefined;
            const endISO = form.endTime ? new Date(form.endTime).toISOString() : undefined;
            
            const payload = {
                name: form.name,
                description: form.information,
                start: startISO,
                end: endISO,
                logoUrl: form.logoUrl || undefined,
                link: form.link || undefined,
                sendyId: form.sendyId || undefined,
                termsId: form.termsId || undefined,
                termsIds: form.termsIds || [],
                status: form.status || undefined,
                limits: {
                    maxBooths: form.maxBooths || 0,
                    maxRecruitersPerEvent: form.maxRecruitersPerEvent || 0,
                },
                theme: {
                    headerColor: form.headerColor,
                    headerTextColor: form.headerTextColor,
                    bodyColor: form.bodyColor,
                    bodyTextColor: form.bodyTextColor,
                    sidebarColor: form.sidebarColor,
                    sidebarTextColor: form.sidebarTextColor,
                    btnPrimaryColor: form.btnPrimaryColor,
                    btnPrimaryTextColor: form.btnPrimaryTextColor,
                    btnSecondaryColor: form.btnSecondaryColor,
                    btnSecondaryTextColor: form.btnSecondaryTextColor,
                    entranceFormColor: form.entranceFormColor,
                    entranceFormTextColor: form.entranceFormTextColor,
                    chatHeaderColor: form.chatHeaderColor,
                    chatSidebarColor: form.chatSidebarColor,
                    addFooter: !!form.addFooter,
                },
                isDemo: !!form.isDemo,
            };

            if (mode === 'edit' && editingId) {
                await updateEvent(editingId, payload);
            } else {
                await createEvent(payload);
            }
            await loadEvents();
            resetForm();
            setMode('list');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="dashboard">
            <AdminHeader />

            <div className="dashboard-layout">
                <AdminSidebar active="events" />

                <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
                    <div className="dashboard-content">
                        <div className="bm-header">
                            <h2>Event Management</h2>
                            <div className="bm-header-actions">
                                {mode === 'list' ? (
                                    <>
                                        {selectedEvents.length > 0 && (
                                            <ButtonComponent 
                                                cssClass="e-danger"
                                                onClick={handleBulkDelete}
                                                disabled={isDeleting}
                                                aria-label={`Delete ${selectedEvents.length} selected events`}
                                            >
                                                {isDeleting ? 'Deleting...' : `Delete Selected (${selectedEvents.length})`}
                                            </ButtonComponent>
                                        )}
                                        <ButtonComponent cssClass="e-primary" onClick={handleNew}>
                                            Create Event
                                        </ButtonComponent>
                                    </>
                                ) : (
                                    <ButtonComponent cssClass="e-outline e-primary" onClick={() => { resetForm(); setMode('list'); }}>
                                        Back to List
                                    </ButtonComponent>
                                )}
                            </div>
                        </div>

                        {mode === 'list' ? (
                            <div className="bm-grid-wrap" style={{ position: 'relative' }}>
                                <div className="em-filters-row" style={{ marginBottom: 12, paddingLeft: '20px', paddingRight: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    {/* Status Filter - Left */}
                                    <div style={{ width: '200px', flexShrink: 0 }}>
                                        <DropDownListComponent
                                            id="status-filter-dropdown"
                                            dataSource={statusOptions.map(s => ({ value: s.value, text: s.label }))}
                                            fields={{ value: 'value', text: 'text' }}
                                            value={statusFilter}
                                            change={(e) => {
                                                setStatusFilter(e.value || '');
                                                setCurrentPage(1); // Reset to first page when filter changes
                                                // loadEvents will be called automatically via useEffect when statusFilter changes
                                            }}
                                            placeholder="Select Status"
                                            cssClass="status-filter-dropdown"
                                            popupHeight="300px"
                                            width="100%"
                                        />
                                    </div>
                                    {/* Search Section - Right */}
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: 'auto' }}>
                                        <div style={{ marginBottom: 0 }}>
                                            <input
                                                ref={searchInputRef}
                                                id="event-search-input"
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
                                                className="em-search-input-native"
                                            />
                                        </div>
                                        <ButtonComponent
                                            cssClass="e-primary e-small"
                                            onClick={handleSearch}
                                            disabled={loadingList}
                                            aria-label="Search events"
                                            style={{ minWidth: '80px', height: '44px' }}
                                        >
                                            Search
                                        </ButtonComponent>
                                        {((searchInputRef.current && searchInputRef.current.value) || activeSearchQuery) && (
                                            <ButtonComponent
                                                cssClass="e-outline e-primary e-small"
                                                onClick={handleClearSearch}
                                                disabled={loadingList}
                                                aria-label="Clear search"
                                                style={{ minWidth: '70px', height: '44px' }}
                                            >
                                                Clear
                                            </ButtonComponent>
                                        )}
                                    </div>
                                </div>
                                {loadingList && (
                                    <div className="em-grid-loading-overlay">
                                        <div className="em-loading-container">
                                            <div className="em-loading-spinner" aria-label="Loading events" role="status" aria-live="polite"></div>
                                            <div className="em-loading-text">Loading events...</div>
                                        </div>
                                    </div>
                                )}
                                <GridComponent
                                    ref={gridRef}
                                    dataSource={events.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
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
                                >
                                    <ColumnsDirective>
                                        <ColumnDirective type='checkbox' width='50' />
                                        <ColumnDirective 
                                            field='name' 
                                            headerText='Event Name' 
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
                                            field='startTime' 
                                            headerText='Event Start Time' 
                                            width='200' 
                                            allowFiltering={true}
                                            template={(props) => (
                                                <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                                                    {formatEventDateTime(props.startTime)}
                                                </div>
                                            )}
                                        />
                                        <ColumnDirective 
                                            field='endTime' 
                                            headerText='Event End Time' 
                                            width='200' 
                                            allowFiltering={true}
                                            template={(props) => (
                                                <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                                                    {formatEventDateTime(props.endTime)}
                                                </div>
                                            )}
                                        />
                                        <ColumnDirective 
                                            field='date' 
                                            headerText='Event Date' 
                                            width='180' 
                                            allowFiltering={true}
                                            template={(props) => (
                                                <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                                                    {props.date || '-'}
                                                </div>
                                            )}
                                        />
                                        <ColumnDirective 
                                            field='createdAt' 
                                            headerText='Created Time' 
                                            width='150' 
                                            allowFiltering={true}
                                            template={(props) => (
                                                <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                                                    {props.createdAt || '-'}
                                                </div>
                                            )}
                                        />
                                        <ColumnDirective 
                                            field='status' 
                                            headerText='Status' 
                                            width='120' 
                                            allowFiltering={true}
                                            template={(props) => (
                                                <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                                                    {props.status || '-'}
                                                </div>
                                            )}
                                        />
                                        <ColumnDirective 
                                            field='maxRecruitersPerEvent' 
                                            headerText='Max Recruiters' 
                                            width='130' 
                                            textAlign='Center'
                                            allowFiltering={true}
                                            template={(props) => (
                                                <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'center' }}>
                                                    {props.maxRecruitersPerEvent ?? 0}
                                                </div>
                                            )}
                                        />
                                        <ColumnDirective 
                                            field='maxBooths' 
                                            headerText='Max Booths' 
                                            width='110' 
                                            textAlign='Center'
                                            allowFiltering={true}
                                            template={(props) => (
                                                <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'center' }}>
                                                    {props.maxBooths ?? 0}
                                                </div>
                                            )}
                                        />
                                        <ColumnDirective 
                                            field='registrationCount' 
                                            headerText='Registered Jobseekers' 
                                            width='180' 
                                            textAlign='Center'
                                            allowFiltering={true}
                                            allowSorting={true}
                                            template={(props) => (
                                                <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'center' }}>
                                                    {props.registrationCount ?? 0}
                                                </div>
                                            )}
                                        />
                                        <ColumnDirective 
                                            field='sendyId' 
                                            headerText='Sendy Event Id' 
                                            width='150' 
                                            allowFiltering={true}
                                            template={(props) => (
                                                <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                                                    {props.sendyId || '-'}
                                                </div>
                                            )}
                                        />
                                        <ColumnDirective 
                                            headerText='Event Page' 
                                            width='130' 
                                            allowSorting={false} 
                                            allowFiltering={false}
                                            template={eventPageTemplate}
                                        />
                                        <ColumnDirective 
                                            headerText='Action' 
                                            width='360' 
                                            allowSorting={false} 
                                            allowFiltering={false}
                                            template={actionsTemplate}
                                        />
                                    </ColumnsDirective>
                                    <GridInject services={[Sort, Filter, GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu]} />
                                </GridComponent>

                                {/* Custom Pagination Footer */}
                                {events.length > 0 && (
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
                                                Page {currentPage} of {Math.ceil(events.length / pageSize) || 1} ({events.length} total)
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button
                                                onClick={() => {
                                                    if (currentPage > 1) {
                                                        setCurrentPage(1);
                                                    }
                                                }}
                                                disabled={currentPage <= 1 || loadingList}
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
                                                disabled={currentPage <= 1 || loadingList}
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
                                                max={Math.ceil(events.length / pageSize) || 1}
                                                value={currentPage}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    const maxPage = Math.ceil(events.length / pageSize) || 1;
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
                                                    const maxPage = Math.ceil(events.length / pageSize) || 1;
                                                    if (currentPage < maxPage) {
                                                        setCurrentPage(currentPage + 1);
                                                    }
                                                }}
                                                disabled={currentPage >= (Math.ceil(events.length / pageSize) || 1) || loadingList}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #d1d5db',
                                                    backgroundColor: currentPage >= (Math.ceil(events.length / pageSize) || 1) ? '#f3f4f6' : '#fff',
                                                    cursor: currentPage >= (Math.ceil(events.length / pageSize) || 1) ? 'not-allowed' : 'pointer',
                                                    fontSize: '14px',
                                                    color: currentPage >= (Math.ceil(events.length / pageSize) || 1) ? '#9ca3af' : '#374151'
                                                }}
                                                title="Next Page"
                                            >
                                                Next ⟩
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const maxPage = Math.ceil(events.length / pageSize) || 1;
                                                    if (currentPage < maxPage) {
                                                        setCurrentPage(maxPage);
                                                    }
                                                }}
                                                disabled={currentPage >= (Math.ceil(events.length / pageSize) || 1) || loadingList}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #d1d5db',
                                                    backgroundColor: currentPage >= (Math.ceil(events.length / pageSize) || 1) ? '#f3f4f6' : '#fff',
                                                    cursor: currentPage >= (Math.ceil(events.length / pageSize) || 1) ? 'not-allowed' : 'pointer',
                                                    fontSize: '14px',
                                                    color: currentPage >= (Math.ceil(events.length / pageSize) || 1) ? '#9ca3af' : '#374151'
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
                            <form className="account-form" onSubmit={(e) => { e.preventDefault(); handleSubmit(e); }} style={{ maxWidth: 720 }}>
                                <Input label="Event Sendy Id" value={form.sendyId} onChange={(e) => setField('sendyId', e.target.value)} placeholder="" />
                                <Input label="Event Name" value={form.name} onChange={(e) => setField('name', e.target.value)} required placeholder="" />
                                <Input label="Event Link" value={form.link} onChange={(e) => setField('link', e.target.value)} placeholder="https://..." />

                                <Select
                                    label="Status"
                                    value={form.status}
                                    onChange={(e) => setField('status', e.target.value)}
                                    options={[
                                        { value: 'draft', label: 'Draft' },
                                        { value: 'published', label: 'Published' },
                                        { value: 'active', label: 'Active' },
                                        { value: 'completed', label: 'Completed' },
                                        { value: 'cancelled', label: 'Cancelled' },
                                    ]}
                                />

                                <div className="form-group">
                                    <label className="form-label">Event Logo</label>
                                    <div className="upload-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <ButtonComponent 
                                            cssClass="e-outline e-primary e-small"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                document.getElementById('logo-upload')?.click();
                                            }}
                                        >
                                            Choose file
                                        </ButtonComponent>
                                        <input 
                                            id="logo-upload"
                                            type="file" 
                                            accept="image/*" 
                                            onChange={(e) => onPickLogo(e.target.files?.[0])} 
                                            style={{ display: 'none' }} 
                                        />
                                        {form.logoUrl && <img src={form.logoUrl} alt="Event logo" style={{ height: 40, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', padding: 4 }} />}
                                    </div>
                                </div>

                                <Input label="Maximum Number of Booths" type="number" min="0" value={form.maxBooths} onChange={(e) => setField('maxBooths', Number(e.target.value))} />
                                <Input label="Maximum Recruiters Per Event" type="number" min="0" value={form.maxRecruitersPerEvent} onChange={(e) => setField('maxRecruitersPerEvent', Number(e.target.value))} />

                                <div className="form-row">
                                    <DateTimePicker
                                        label="Event Start Time"
                                        value={form.startTime}
                                        onChange={(e) => setField('startTime', e.target.value)}
                                        placeholder="Select start"
                                        disabled={form.isDemo}
                                    />
                                    <DateTimePicker
                                        label="Event End Time"
                                        value={form.endTime}
                                        onChange={(e) => setField('endTime', e.target.value)}
                                        placeholder="Select end"
                                        disabled={form.isDemo}
                                    />
                                </div>

                                <Checkbox
                                    label="Demo Event (always available, no specific start/end date)"
                                    checked={form.isDemo}
                                    onChange={(e) => setField('isDemo', e.target.checked)}
                                />

                                <div className="form-group">
                                    <label className="form-label">Event Information</label>
                                    <RTE
                                        ref={rteInfoRef}
                                        value={form.information}
                                        change={(e) => setField('information', e?.value || '')}
                                        placeholder="Type event details..."
                                        toolbarSettings={buildRteToolbar(() => openImagePickerFor(rteInfoRef))}
                                    >
                                        <RTEInject services={[HtmlEditor, RTEToolbar, QuickToolbar, RteLink, RteImage]} />
                                    </RTE>
                                </div>

                                <MultiSelect
                                    label="Select Terms and Conditions (multiple)"
                                    value={form.termsIds}
                                    onChange={(e) => setField('termsIds', e.target.value)}
                                    options={termsOptions}
                                    placeholder="Choose one or more Terms & Conditions"
                                />

                                {/* Simple color inputs (can be replaced with color pickers later) */}
                                <div className="form-row">
                                    <Input label="Header Color" type="color" value={form.headerColor} onChange={(e) => setField('headerColor', e.target.value)} />
                                    <Input label="Header Text Color" type="color" value={form.headerTextColor} onChange={(e) => setField('headerTextColor', e.target.value)} />
                                </div>
                                <div className="form-row">
                                    <Input label="Body Color" type="color" value={form.bodyColor} onChange={(e) => setField('bodyColor', e.target.value)} />
                                    <Input label="Body Text Color" type="color" value={form.bodyTextColor} onChange={(e) => setField('bodyTextColor', e.target.value)} />
                                </div>
                                <div className="form-row">
                                    <Input label="Sidebar Color" type="color" value={form.sidebarColor} onChange={(e) => setField('sidebarColor', e.target.value)} />
                                    <Input label="Sidebar Text Color" type="color" value={form.sidebarTextColor} onChange={(e) => setField('sidebarTextColor', e.target.value)} />
                                </div>
                                <div className="form-row">
                                    <Input label="Button Primary Color" type="color" value={form.btnPrimaryColor} onChange={(e) => setField('btnPrimaryColor', e.target.value)} />
                                    <Input label="Button Primary Text Color" type="color" value={form.btnPrimaryTextColor} onChange={(e) => setField('btnPrimaryTextColor', e.target.value)} />
                                </div>
                                <div className="form-row">
                                    <Input label="Button Secondary Color" type="color" value={form.btnSecondaryColor} onChange={(e) => setField('btnSecondaryColor', e.target.value)} />
                                    <Input label="Button Secondary Text Color" type="color" value={form.btnSecondaryTextColor} onChange={(e) => setField('btnSecondaryTextColor', e.target.value)} />
                                </div>
                                <div className="form-row">
                                    <Input label="Entrance Form Color" type="color" value={form.entranceFormColor} onChange={(e) => setField('entranceFormColor', e.target.value)} />
                                    <Input label="Entrance Form Text Color" type="color" value={form.entranceFormTextColor} onChange={(e) => setField('entranceFormTextColor', e.target.value)} />
                                </div>
                                <div className="form-row">
                                    <Input label="Chat header Color" type="color" value={form.chatHeaderColor} onChange={(e) => setField('chatHeaderColor', e.target.value)} />
                                    <Input label="Chat Sidebar Color" type="color" value={form.chatSidebarColor} onChange={(e) => setField('chatSidebarColor', e.target.value)} />
                                </div>

                                <Checkbox label="Add Event Footer" checked={form.addFooter} onChange={(e) => setField('addFooter', e.target.checked)} />

                                <ButtonComponent 
                                    cssClass="e-primary" 
                                    disabled={saving}
                                    isPrimary={true}
                                    onClick={() => handleSubmit({ preventDefault: () => {} })}
                                >
                                    {saving ? 'Saving…' : (mode === 'edit' ? 'Update' : 'Create')}
                                </ButtonComponent>
                            </form>
                        )}
                    </div>
                </main>
            </div>
            <DialogComponent
                ref={deleteDialogRef}
                width="450px"
                isModal={true}
                showCloseIcon={true}
                visible={confirmOpen}
                header="Delete Event"
                closeOnEscape={true}
                close={cancelDelete}
                cssClass="em-delete-dialog"
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
                            content: saving ? 'Deleting…' : 'Delete',
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

            {/* Bulk Delete confirm modal - Syncfusion DialogComponent */}
            <DialogComponent
                width="450px"
                isModal={true}
                showCloseIcon={true}
                visible={confirmBulkDeleteOpen}
                header="Bulk Delete Events"
                closeOnEscape={true}
                close={cancelBulkDelete}
                cssClass="em-delete-dialog"
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
                    Are you sure you want to permanently delete <strong>{selectedEvents.length} event(s)</strong>? This action cannot be undone.
                </p>
            </DialogComponent>

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
