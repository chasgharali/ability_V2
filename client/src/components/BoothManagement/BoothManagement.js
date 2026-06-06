import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import useModalAriaHidden from '../../hooks/useModalAriaHidden';
import '../Dashboard/Dashboard.css';
import './BoothManagement.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import PageInstructionBanner from '../common/PageInstructionBanner';
import filterIcon from '../../assets/filter.png';
import { GridComponent, ColumnsDirective, ColumnDirective, Inject as GridInject, Page, Sort, Filter, Toolbar as GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu, Freeze } from '@syncfusion/ej2-react-grids';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import { Input, MultiSelect, DateTimePicker, Checkbox } from '../UI/FormComponents';
import { listEvents } from '../../services/events';
import { listBooths, createBooths, deleteBooth, updateBooth, updateBoothRichSections, updateBoothEmployerPageSections, bulkDeleteBooths } from '../../services/booths';
import { uploadBoothLogoToS3, uploadVideoToS3, uploadAudioToS3 } from '../../services/uploads';
import VideoUploadProgress from '../UI/VideoUploadProgress';
import { 
  RichTextEditorComponent as RTE, 
  Toolbar as RTEToolbar, 
  Link as RteLink, 
  Image as RteImage, 
  HtmlEditor, 
  QuickToolbar,
  Table,
  Video,
  Audio,
  EmojiPicker,
  PasteCleanup,
  Count,
  Resize as RTEResize,
  FormatPainter,
  Inject as RTEInject 
} from '@syncfusion/ej2-react-richtexteditor';
import { RTE_QUICK_TOOLBAR_SETTINGS, getInsertImageSettings, getInsertVideoSettings, getInsertAudioSettings, handleRteKeyDown } from '../../utils/rteConfig';
import { closeRteMediaDialog, isVideoFile, isAudioFile, generateVideoHTML, generateAudioHTML } from '../../utils/rteDialogHelper';
import { MdEdit, MdDelete, MdLink, MdBusiness } from 'react-icons/md';
import EmployerPageTemplate from '../BoothQueue/EmployerPageTemplate';

const EMPLOYER_PAGE_SECTION_DEFS = [
  { key: 'about', title: 'About Section' },
  { key: 'program', title: 'Special Program Section' },
  { key: 'video', title: 'Hosted Video Section' },
  { key: 'gallery', title: 'Image Gallery Section' },
  { key: 'jobs', title: 'Open Positions Section' },
  { key: 'benefits', title: 'Benefits Section' },
  { key: 'contact', title: 'Call To Action Section' },
  { key: 'social', title: 'Social Links Section' },
];

const getDefaultEmployerPageSections = () => EMPLOYER_PAGE_SECTION_DEFS.map((section, index) => ({
  key: section.key,
  title: section.title,
  contentHtml: '',
  isActive: true,
  order: index,
}));

const BOOTH_FORM_DRAFT_KEY = 'boothManagement_formDraft';
const BOOTH_FORM_RESTORE_FLAG_KEY = 'boothManagement_restoreDraft';

const normalizeId = (value) => {
  let current = value;
  const visited = new Set();
  for (let i = 0; i < 6; i += 1) {
    if (current === null || current === undefined) return '';
    if (typeof current === 'string') return current.trim();
    if (typeof current === 'number' || typeof current === 'bigint') return String(current).trim();
    if (typeof current === 'object') {
      if (visited.has(current)) return '';
      visited.add(current);
      if (current._id !== undefined && current._id !== current) {
        current = current._id;
        continue;
      }
      if (current.id !== undefined && current.id !== current) {
        current = current.id;
        continue;
      }
    }
    try {
      return String(current).trim();
    } catch (error) {
      return '';
    }
  }
  return '';
};

const normalizeIdArray = (values) => {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(normalizeId).filter(Boolean))];
};

const getBoothAssignedEventIds = (booth) => {
  if (!booth) return [];
  const eventIds = Array.isArray(booth.eventIds) ? booth.eventIds : [];
  return normalizeIdArray([...eventIds, booth.eventIdRaw]);
};

export default function BoothManagement() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  // Defense-in-depth: Check user role on component mount
  useEffect(() => {
    const allowedRoles = ['Admin', 'AdminEvent', 'GlobalSupport'];
    if (user && !allowedRoles.includes(user.role)) {
      // Redirect unauthorized users to dashboard
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    try {
      const shouldRestore = sessionStorage.getItem(BOOTH_FORM_RESTORE_FLAG_KEY) === '1';
      if (!shouldRestore) return;
      const raw = sessionStorage.getItem(BOOTH_FORM_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.boothForm) {
        setBoothForm(prev => ({
          ...prev,
          ...parsed.boothForm,
          employerPageSections: Array.isArray(parsed.boothForm.employerPageSections) && parsed.boothForm.employerPageSections.length
            ? parsed.boothForm.employerPageSections
            : getDefaultEmployerPageSections(),
        }));
      }
      setBoothMode(parsed?.boothMode || 'create');
      setEditingBoothId(parsed?.editingBoothId || null);
      sessionStorage.setItem(BOOTH_FORM_RESTORE_FLAG_KEY, '0');
    } catch (error) {
      console.error('Failed to restore booth draft', error);
    }
  }, [location.key]);
  
  // Header uses branding/user from shared AdminHeader

  const [boothMode, setBoothMode] = useState('list'); // 'list' | 'create'
  const [boothSaving, setBoothSaving] = useState(false);
  const [boothForm, setBoothForm] = useState({
    boothName: '',
    boothLogo: '',
    boothLogoAlt: '',
    firstHtml: '',
    secondHtml: '',
    thirdHtml: '',
    waitingAreaMode: 'placeholders',
    employerPageTemplateId: 'default-v1',
    employerPageSections: getDefaultEmployerPageSections(),
    recruitersCount: 1,
    eventIds: [],
    customInviteText: '',
    expireLinkTime: '',
    enableExpiry: false,
    companyPage: '',
    joinBoothButtonLink: ''
  });
  const [booths, setBooths] = useState([]);
  const [boothsTotalCount, setBoothsTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loadingBooths, setLoadingBooths] = useState(false);
  
  // Load search query from sessionStorage on mount (per-table persistence for search)
  const loadSearchQueryFromSession = () => {
    try {
      const saved = sessionStorage.getItem('boothManagement_searchQuery');
      if (saved) {
        return saved;
      }
    } catch (error) {
      console.error('Error loading Booth Management search query from sessionStorage:', error);
    }
    return '';
  };

  const savedSearchQuery = loadSearchQueryFromSession();
  const [activeSearchQuery, setActiveSearchQuery] = useState(savedSearchQuery); // Actual search parameter used in API
  const [searchTriggerNonce, setSearchTriggerNonce] = useState(0);
  const [previewBooth, setPreviewBooth] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rowPendingDelete, setRowPendingDelete] = useState(null);
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
  const [selectedBooths, setSelectedBooths] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // WCAG 1.3.1 / 2.4.3 — aria-hide background when any modal is open
  useModalAriaHidden(confirmOpen || confirmBulkDeleteOpen);
  const toastRef = useRef(null);
  const gridRef = useRef(null);
  const deleteDialogRef = useRef(null);
  const searchInputRef = useRef(null);
  const [editingBoothId, setEditingBoothId] = useState(null);
  const loadingBoothsRef = useRef(false);
  const loadRequestGenRef = useRef(0); // Generation counter to discard stale API responses
  const loadingEventsRef = useRef(false);
  // RTE image upload helpers
  const rteFirstRef = React.useRef(null);
  const rteSecondRef = React.useRef(null);
  const rteThirdRef = React.useRef(null);

  // Upload progress state for video/audio
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFile, setUploadingFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Create a short, unique numeric token for the queue URL (6 digits)
  const genToken = () => String(Math.floor(100000 + Math.random() * 900000));
  const [queueToken] = useState(() => genToken());

  // Base URL from current window location (fallback to production domain if unavailable)
  const baseUrl = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin
    : 'https://abilityjobfair.com';

  // Memoize toolbar settings so Syncfusion RTE doesn't reinitialize on every render
  const rteToolbarSettings = useMemo(() => ({
    type: 'Expand',
    enableFloating: true,
    items: [
      'Undo', 'Redo', '|',
      'Bold', 'Italic', 'Underline', 'StrikeThrough', 'InlineCode', '|',
      'FontName', 'FontSize', 'FontColor', 'BackgroundColor', '|',
      'LowerCase', 'UpperCase', '|',
      'SuperScript', 'SubScript', '|',
      'Formats', 'Alignments', '|',
      'OrderedList', 'UnorderedList', '|',
      'Outdent', 'Indent', '|',
      'CreateLink', 'Image', 'Video', 'Audio', '|',
      'CreateTable', '|',
      'EmojiPicker', '|',
      'ClearFormat', '|',
      'Print', 'FullScreen', '|',
      'SourceCode'
    ]
  }), []);

  /** Add auth header so Syncfusion's built-in uploader can reach POST /api/uploads/rte-image */
  const handleImageUploading = useCallback((args) => {
    const token = localStorage.getItem('token');
    if (args.currentRequest && token) {
      args.currentRequest.setRequestHeader('Authorization', `Bearer ${token}`);
    }
  }, []);

  /** After Syncfusion upload succeeds, replace the blob src with the stable proxy URL from server */
  const handleImageUploadSuccess = useCallback((args) => {
    try {
      const response = JSON.parse(args.e?.currentTarget?.response || '{}');
      if (response.url) {
        // Update file name so Syncfusion constructs the correct URL (path + file.name)
        // Server returns url like '/api/uploads/rte-content/image/<userId>/<uuid>_<file>'
        // With path='/api/uploads/rte-content/', file.name should be the key portion
        if (args.file) {
          const key = response.url.replace(/^\/api\/uploads\/rte-content\//, '');
          args.file.name = key;
        }
        // Also directly set the element src as a safety measure
        if (args.element) {
          args.element.src = response.url;
        }
        // Sync RTE content back to form state after DOM update
        setTimeout(() => {
          setBoothForm(prev => {
            const updates = {};
            try { if (rteFirstRef.current?.inputElement) updates.firstHtml = rteFirstRef.current.inputElement.innerHTML; } catch (e) { /* ignore */ }
            try { if (rteSecondRef.current?.inputElement) updates.secondHtml = rteSecondRef.current.inputElement.innerHTML; } catch (e) { /* ignore */ }
            try { if (rteThirdRef.current?.inputElement) updates.thirdHtml = rteThirdRef.current.inputElement.innerHTML; } catch (e) { /* ignore */ }
            return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
          });
        }, 500);
      }
    } catch (err) {
      console.error('Failed to set image URL from server response:', err);
    }
  }, []);

  /** Handle file upload for video/audio with progress tracking */
  const handleFileUploading = useCallback(async (args, rteRef) => {
    console.log('🎥 File uploading triggered:', args);
    
    const file = args.fileData?.rawFile;
    console.log('📁 File detected:', file, 'Type:', file?.type);
    
    if (!file || !rteRef?.current) {
      console.error('❌ No file or RTE ref', 'file:', file, 'rteRef:', rteRef?.current);
      args.cancel = true;
      return;
    }
    
    const isVideo = isVideoFile(file);
    const isAudio = isAudioFile(file);
    console.log('🔍 File classification - Video:', isVideo, 'Audio:', isAudio);
    
    if (!isVideo && !isAudio) {
      console.error('❌ File is neither video nor audio:', file.type);
      showToast('Please select a video or audio file', 'Error', 4000);
      args.cancel = true;
      return;
    }
    
    // Cancel default upload
    args.cancel = true;
    
    // Close the Syncfusion dialog immediately (before showing progress)
    // Pass the RTE instance so we can close via module dialogObj when available.
    closeRteMediaDialog(rteRef.current);
    
    // Show our custom progress modal
    setUploadingFile(file.name);
    setUploadProgress(0);
    setIsUploading(true);
    
    try {
      let downloadUrl;
      
      const onProgress = (percent) => {
        setUploadProgress(percent);
      };
      
      if (isVideo) {
        console.log('⬆️ Uploading video to S3...');
        const result = await uploadVideoToS3(file, onProgress);
        downloadUrl = result.downloadUrl;
        console.log('✅ Video uploaded, URL:', downloadUrl);
        
        // Insert video with proper attributes
        const videoHTML = generateVideoHTML(downloadUrl, file.type);
        rteRef.current.executeCommand('insertHTML', videoHTML);
        const isMov = (file.name || '').toLowerCase().endsWith('.mov');
        showToast(isMov ? 'Video uploaded. If it doesn\'t play, try converting to MP4.' : 'Video uploaded successfully', 'Success', 3000);
      } else if (isAudio) {
        console.log('⬆️ Uploading audio to S3...');
        const result = await uploadAudioToS3(file, onProgress);
        downloadUrl = result.downloadUrl;
        console.log('✅ Audio uploaded, URL:', downloadUrl);
        
        // Insert audio with proper attributes
        const audioHTML = generateAudioHTML(downloadUrl, file.type);
        rteRef.current.executeCommand('insertHTML', audioHTML);
        showToast('Audio uploaded successfully', 'Success', 2000);
      }
      
    } catch (err) {
      console.error('❌ Media upload failed:', err);
      showToast(isVideo ? 'Failed to upload video' : 'Failed to upload audio', 'Error', 4000);
    } finally {
      // Hide progress modal after a brief delay
      setTimeout(() => {
        setIsUploading(false);
        setUploadingFile(null);
        setUploadProgress(0);
      }, 500);
    }
  }, []);

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
      const recruitersCount = Number(b.recruitersCount) || 0;
      const assignedEventIds = getBoothAssignedEventIds(b);
      for (const eid of assignedEventIds) {
        if (!eid) continue;
        map[eid] = (map[eid] || 0) + recruitersCount;
      }
    }
    return map;
  }, [booths]);

  // Validate recruiters limit per selected event
  const validateRecruiterLimits = (selectedEventIdsInput = boothForm.eventIds) => {
    const exceeded = [];
    const requestedRecruiters = Number(boothForm.recruitersCount) || 0;
    const selectedEventIds = normalizeIdArray(selectedEventIdsInput);
    const normalizedEditingBoothId = normalizeId(editingBoothId);
    const editing = normalizedEditingBoothId
      ? booths.find(b => normalizeId(b.id) === normalizedEditingBoothId)
      : null;
    const editingRecruiters = Number(editing?.recruitersCount) || 0;
    const editingEventIds = new Set(getBoothAssignedEventIds(editing));
    for (const eid of selectedEventIds) {
      const max = eventLimits?.[eid]?.maxRecruitersPerEvent || 0; // 0 => unlimited
      if (!max) continue;
      // existing recruiters for this event, excluding this booth if editing
      let existing = recruitersByEvent[eid] || 0;
      if (editingEventIds.has(eid)) {
        existing = Math.max(0, existing - editingRecruiters);
      }
      const proposedTotal = existing + requestedRecruiters;
      if (proposedTotal > max) {
        exceeded.push({
          eventId: eid,
          name: eventLimits?.[eid]?.name || eid,
          existing,
          adding: requestedRecruiters,
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
        const eventId = normalizeId(e?._id);
        const maxBooths = e?.limits?.maxBooths || 0; // 0 means unlimited
        const current = e?.boothCount || 0;
        const reached = maxBooths > 0 && current >= maxBooths;
        return {
          value: eventId,
          label: reached ? `${e.name} • limit reached` : e.name,
          disabled: reached,
        };
      });
      setEventOptions(options);
      // capture limits for validation
      const limitsMap = {};
      for (const e of items) {
        const eventId = normalizeId(e?._id);
        if (!eventId) continue;
        limitsMap[eventId] = {
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
    if (props.waitingAreaMode === 'employerPage') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '4px 0' }}>
          <ButtonComponent
            cssClass="e-outline e-primary e-small"
            onClick={() => setPreviewBooth(props)}
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
            <span style={{ whiteSpace: 'nowrap' }}>Employer Page</span>
          </ButtonComponent>
        </div>
      );
    }

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
  const persistBoothDraft = useCallback((nextForm = boothForm, nextMode = boothMode, nextEditingId = editingBoothId) => {
    try {
      sessionStorage.setItem(BOOTH_FORM_DRAFT_KEY, JSON.stringify({
        boothForm: nextForm,
        boothMode: nextMode,
        editingBoothId: nextEditingId || null,
      }));
    } catch (error) {
      console.error('Failed to persist booth draft', error);
    }
  }, [boothForm, boothMode, editingBoothId]);

  const clearBoothDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(BOOTH_FORM_DRAFT_KEY);
      sessionStorage.removeItem(BOOTH_FORM_RESTORE_FLAG_KEY);
    } catch (error) {
      console.error('Failed to clear booth draft', error);
    }
  }, []);

  const openEmployerTemplateEditor = () => {
    const draftForm = {
      ...boothForm,
      waitingAreaMode: 'employerPage',
      employerPageSections: Array.isArray(boothForm.employerPageSections) && boothForm.employerPageSections.length
        ? boothForm.employerPageSections
        : getDefaultEmployerPageSections(),
    };
    persistBoothDraft(draftForm, boothMode, editingBoothId);
    navigate('/boothmanagement/template-editor');
  };

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
    const orgBoothLimit = Number(user?.organizationId?.limits?.maxBooths || 0);
    const orgBoothLimitReached = orgBoothLimit > 0 && boothsTotalCount >= orgBoothLimit;
    if (!editingBoothId && orgBoothLimitReached) {
      showToast(`Booth limit reached (${orgBoothLimit}). You cannot create more booths.`, 'Error', 5000);
      return;
    }
    setBoothSaving(true);
    try {
      const selectedEventIds = normalizeIdArray(boothForm.eventIds);

      // Client-side recruiters limit validation per event
      const exceeded = selectedEventIds.length > 0 ? validateRecruiterLimits(selectedEventIds) : [];
      if (exceeded.length) {
        if (!editingBoothId) {
          const lines = exceeded.map(x => `• ${x.name}: ${x.existing} + ${x.adding} > ${x.max}`).join('\n');
          showToast(`Max number of recruiters reached for selected event(s):\n\n${lines}`, 'Error', 7000);
          return; // block create; updates are validated by backend as source of truth
        }
      }
      // Process expireLinkTime: convert datetime-local to ISO string, or undefined if disabled
      let expireLinkTimeValue;
      if (boothForm.enableExpiry && boothForm.expireLinkTime) {
        try {
          const date = new Date(boothForm.expireLinkTime);
          if (!isNaN(date.getTime())) {
            expireLinkTimeValue = date.toISOString();
          }
        } catch (e) {
          expireLinkTimeValue = undefined;
        }
      }

      // Read the latest HTML directly from RTE content areas.
      // Image upload success handlers update the DOM img src attribute directly,
      // which may not trigger a React state update via the RTE change event.
      // This ensures we save the correct server URLs instead of blob: URLs.
      const getLatestRteHtml = (ref, fallback) => {
        try {
          if (ref?.current?.inputElement) return ref.current.inputElement.innerHTML;
          if (ref?.current?.value != null) return ref.current.value;
        } catch (e) { /* fall through */ }
        return fallback;
      };
      const latestFirstHtml = getLatestRteHtml(rteFirstRef, boothForm.firstHtml);
      const latestSecondHtml = getLatestRteHtml(rteSecondRef, boothForm.secondHtml);
      const latestThirdHtml = getLatestRteHtml(rteThirdRef, boothForm.thirdHtml);
      const employerPageSectionsPayload = (boothForm.employerPageSections || [])
        .map((section, index) => ({
          key: section.key,
          title: section.title || EMPLOYER_PAGE_SECTION_DEFS.find(s => s.key === section.key)?.title || `Section ${index + 1}`,
          contentHtml: section.contentHtml || '',
          contentData: section.contentData ?? null,
          isActive: section.isActive !== false,
          order: typeof section.order === 'number' ? section.order : index,
        }))
        .slice(0, 8);
      const employerAboutHtml = employerPageSectionsPayload.find(section => section.key === 'about')?.contentHtml || '';
      const primaryDescription = boothForm.waitingAreaMode === 'employerPage'
        ? employerAboutHtml
        : latestFirstHtml;

      const customInviteSlug = sanitizeInvite(boothForm.customInviteText || '');
      const payload = {
        name: boothForm.boothName,
        description: primaryDescription || '',
        logoUrl: boothForm.boothLogo || undefined,
        logoAltText: boothForm.boothLogoAlt || undefined,
        eventIds: selectedEventIds,
        companyPage: boothForm.companyPage || undefined,
        recruitersCount: boothForm.recruitersCount || 1,
        expireLinkTime: expireLinkTimeValue,
        customInviteSlug: customInviteSlug || undefined,
        joinBoothButtonLink: boothForm.joinBoothButtonLink || '',
        waitingAreaMode: boothForm.waitingAreaMode || 'placeholders',
        employerPageTemplateId: boothForm.employerPageTemplateId || 'default-v1',
        employerPageSections: employerPageSectionsPayload,
        richSections: [
          { title: 'First Placeholder', contentHtml: latestFirstHtml || '' },
          { title: 'Second Placeholder', contentHtml: latestSecondHtml || '' },
          { title: 'Third Placeholder', contentHtml: latestThirdHtml || '' },
        ],
      };
      if (editingBoothId) {
        // Update base fields including events array
        await updateBooth(editingBoothId, {
          name: payload.name,
          description: payload.description,
          logoUrl: payload.logoUrl,
          logoAltText: payload.logoAltText,
          companyPage: payload.companyPage,
          recruitersCount: payload.recruitersCount,
          expireLinkTime: expireLinkTimeValue,
          customInviteSlug: payload.customInviteSlug,
          joinBoothButtonLink: payload.joinBoothButtonLink,
          waitingAreaMode: payload.waitingAreaMode,
          employerPageTemplateId: payload.employerPageTemplateId,
          events: selectedEventIds, // Send full events array
          eventId: selectedEventIds.length > 0 ? selectedEventIds[0] : undefined, // Backward compat
        });
        if (payload.waitingAreaMode === 'employerPage') {
          await updateBoothEmployerPageSections(editingBoothId, payload.employerPageSections);
        } else {
          // Update rich sections via dedicated endpoint
          await updateBoothRichSections(editingBoothId, payload.richSections);
        }
        // Refetch and redirect to list
        await loadBooths();
        await loadEvents();
        setBoothMode('list');
        setEditingBoothId(null);
        clearBoothDraft();
        showToast('Booth updated', 'Success', 2500);
      } else {
        const res = await createBooths(payload);
        const createdFromArray = Array.isArray(res?.created) ? res.created.length : 0;
        const createdFromSingle = res?.booth ? 1 : 0;
        const createdCount = createdFromArray + createdFromSingle;
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
          clearBoothDraft();
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
        if (Array.isArray(errorData.exceededEvents) && errorData.exceededEvents.length > 0) {
          const lines = errorData.exceededEvents
            .map(x => `• ${x.name || x.eventId}: ${x.existing} + ${x.adding} > ${x.max}`)
            .join('\n');
          errorMessage = `Max number of recruiters reached for selected event(s):\n\n${lines}`;
        } else
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
        sessionStorage.setItem('boothManagement_searchQuery', activeSearchQuery.trim());
        // Also update the input field if it exists
        if (searchInputRef.current) {
          searchInputRef.current.value = activeSearchQuery.trim();
        }
      } else {
        sessionStorage.removeItem('boothManagement_searchQuery');
        // Also clear the input field if it exists
        if (searchInputRef.current) {
          searchInputRef.current.value = '';
        }
      }
    } catch (error) {
      console.error('Error saving Booth Management search query to sessionStorage:', error);
    }
  }, [activeSearchQuery]);


  const handleSearch = () => {
    const query = (searchInputRef.current?.value || '').trim();
    setActiveSearchQuery(query);
    setSearchTriggerNonce((prev) => prev + 1);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handleClearSearch = () => {
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
    }
    setActiveSearchQuery('');
    // Bump the nonce so loadBooths is always recreated and re-fetches, even when
    // the active query is already empty (otherwise clearing is a no-op and the
    // grid keeps showing stale results).
    setSearchTriggerNonce((prev) => prev + 1);
    setCurrentPage(1); // Reset to first page when clearing
    // Clear from sessionStorage
    try {
      sessionStorage.removeItem('boothManagement_searchQuery');
    } catch (error) {
      console.error('Error clearing Booth Management search query from sessionStorage:', error);
    }
  };

  const loadBooths = useCallback(async () => {
    // Track this specific request so stale responses can be discarded
    const gen = ++loadRequestGenRef.current;

    try {
      setLoadingBooths(true);
      // When searching, fetch a very large number (10000) to ensure ALL matching records are loaded
      // When not searching, fetch 50 for initial load (grid handles client-side pagination)
      const limit = activeSearchQuery && activeSearchQuery.trim() ? 10000 : 50;
      const params = { page: 1, limit };
      const res = await listBooths(params);
      let items = res?.booths || [];
      setBoothsTotalCount(Number(res?.total || 0));
      
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
      
      // Discard results if a newer request has already started
      if (gen !== loadRequestGenRef.current) return;

      // Map to grid rows expected by Syncfusion GridComponent
      setBooths(items.map(b => {
        // Get events from both events array and single eventId (legacy)
        const eventsArray = b.events || [];
        const eventNames = [...new Set([
          ...eventsArray.map(e => e?.name || '').filter(Boolean),
          b.eventId?.name || '',
        ].filter(Boolean))];
        const eventIds = normalizeIdArray(
          [...eventsArray.map(e => e?._id || e), b.eventId?._id || b.eventId]
        );
        
        return {
          id: b._id,
          name: b.name,
          logo: b.logoUrl,
          logoUrl: b.logoUrl,
          logoAltText: b.logoAltText || '',
          events: eventNames,
          eventName: eventNames.join(', ') || '', // Flattened for filtering
          eventIdRaw: normalizeId(b.eventId?._id || b.eventId) || null, // Keep for backward compat
          eventIds: eventIds, // Full events array
          richSections: b.richSections || [],
          waitingAreaMode: b.waitingAreaMode || 'placeholders',
          employerPageTemplateId: b.employerPageTemplateId || 'default-v1',
          employerPageSections: Array.isArray(b.employerPageSections) && b.employerPageSections.length
            ? b.employerPageSections
            : getDefaultEmployerPageSections(),
          customInviteSlug: b.customInviteSlug || '',
          companyPage: b.companyPage || '',
          joinBoothButtonLink: b.joinBoothButtonLink || '',
          customUrl: b.customInviteSlug ? `${baseUrl}/queue/${b.customInviteSlug}` : '',
          recruitersCount: b.recruitersCount ?? 0,
          expireLinkTime: b.expireLinkTime || null,
        };
      }));
    } catch (e) {
      if (gen === loadRequestGenRef.current) {
        console.error('Failed to load booths', e);
        setBooths([]);
        setBoothsTotalCount(0);
      }
    } finally { 
      if (gen === loadRequestGenRef.current) {
        setLoadingBooths(false);
      }
    }
  }, [activeSearchQuery, baseUrl, searchTriggerNonce]);

  // Get selected booths from grid
  const getSelectedBoothsFromGrid = useCallback(() => {
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

  useEffect(() => { 
    loadBooths(); 
  }, [loadBooths]);

  // Syncfusion Grid does not automatically pick up dataSource prop changes —
  // an explicit refresh() is required after every data update.
  useEffect(() => {
    if (gridRef.current && typeof gridRef.current.refresh === 'function') {
      gridRef.current.refresh();
    }
  }, [booths, currentPage, pageSize]);

  // Track selection changes from grid
  useEffect(() => {
    if (!gridRef.current) return;
    
    const updateSelection = () => {
      const currentSelection = getSelectedBoothsFromGrid();
      setSelectedBooths(currentSelection);
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
  }, [booths, getSelectedBoothsFromGrid]);

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

  // Frozen columns rely on native Syncfusion movable/frozen pane scrolling.
  useEffect(() => undefined, [booths]);

  // Helper to format ISO date to datetime-local input format (YYYY-MM-DDTHH:mm)
  const formatDateTimeLocal = (isoDateStr) => {
    if (!isoDateStr) return '';
    try {
      const date = new Date(isoDateStr);
      if (isNaN(date.getTime())) return '';
      // Format to local time for datetime-local input
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (e) {
      return '';
    }
  };

  // Edit handler (basic prefill)
  const startEdit = (row) => {
    const expireTime = formatDateTimeLocal(row.expireLinkTime);
    // Use the full eventIds array if available, otherwise fallback to eventIdRaw
    const eventIdsToUse = normalizeIdArray(
      row.eventIds && row.eventIds.length > 0
        ? row.eventIds
        : (row.eventIdRaw ? [row.eventIdRaw] : boothForm.eventIds)
    );
    
    setBoothForm(prev => ({
      ...prev,
      boothName: row.name || '',
      boothLogo: row.logo || '',
      boothLogoAlt: row.logoAltText || '',
      firstHtml: row.richSections?.[0]?.contentHtml || '',
      secondHtml: row.richSections?.[1]?.contentHtml || '',
      thirdHtml: row.richSections?.[2]?.contentHtml || '',
      waitingAreaMode: row.waitingAreaMode || 'placeholders',
      employerPageTemplateId: row.employerPageTemplateId || 'default-v1',
      employerPageSections: Array.isArray(row.employerPageSections) && row.employerPageSections.length
        ? EMPLOYER_PAGE_SECTION_DEFS.map((section, index) => {
          const saved = row.employerPageSections.find(s => s.key === section.key);
          return {
            key: section.key,
            title: saved?.title || section.title,
            contentHtml: saved?.contentHtml || '',
            contentData: saved?.contentData ?? null,
            isActive: saved?.isActive !== false,
            order: typeof saved?.order === 'number' ? saved.order : index,
          };
        })
        : getDefaultEmployerPageSections(),
      eventIds: eventIdsToUse,
      companyPage: row.companyPage || '',
      customInviteText: row.customInviteSlug || '',
      joinBoothButtonLink: row.joinBoothButtonLink || '',
      recruitersCount: row.recruitersCount || 1,
      expireLinkTime: expireTime,
      enableExpiry: !!row.expireLinkTime,
    }));
    setBoothMode('create');
    setEditingBoothId(normalizeId(row.id));
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

  const handleBulkDelete = () => {
    const currentSelection = getSelectedBoothsFromGrid();
    if (currentSelection.length === 0) {
      showToast('Please select booths to delete', 'Warning');
      return;
    }
    setSelectedBooths(currentSelection);
    setConfirmBulkDeleteOpen(true);
  };

  const confirmBulkDelete = async () => {
    try {
      setIsDeleting(true);
      const response = await bulkDeleteBooths(selectedBooths);
      showToast(response.message || 'Booths deleted successfully', 'Success');
      setSelectedBooths([]);
      await loadBooths();
    } catch (error) {
      console.error('Error deleting booths:', error);
      showToast(error.response?.data?.message || 'Failed to delete booths', 'Error');
    } finally {
      setIsDeleting(false);
      setConfirmBulkDeleteOpen(false);
    }
  };

  const cancelBulkDelete = () => {
    setConfirmBulkDeleteOpen(false);
    setSelectedBooths([]);
  };

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
  const orgBoothLimit = Number(user?.organizationId?.limits?.maxBooths || 0);
  const orgBoothLimitReached = orgBoothLimit > 0 && boothsTotalCount >= orgBoothLimit;
  if (!user || !allowedRoles.includes(user.role)) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="dashboard">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {/* Video Upload Progress Modal */}
      <VideoUploadProgress 
        progress={uploadProgress}
        fileName={uploadingFile}
        isUploading={isUploading}
      />
      
      <AdminHeader />

      <div className="dashboard-layout">
        <AdminSidebar active="booths" />

        <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
          <div className="dashboard-content">
            <PageInstructionBanner screen={boothMode === 'list' ? 'booth-management' : 'create-edit-page'} />
            <div className="bm-header">
              <h1>Booth Management</h1>
              <div className="bm-header-actions">
                {boothMode === 'list' ? (
                  <>
                    {selectedBooths.length > 0 && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '12px' }}>
                          <input
                            type="checkbox"
                            id="select-all-booths"
                            checked={selectedBooths.length > 0 && selectedBooths.length === booths.slice((currentPage - 1) * pageSize, currentPage * pageSize).length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                // Select all rows on current page
                                if (gridRef.current) {
                                  const pageData = booths.slice((currentPage - 1) * pageSize, currentPage * pageSize);
                                  gridRef.current.selectRows(Array.from({ length: pageData.length }, (_, i) => i));
                                  // Manually update state to ensure checkbox reflects selection immediately
                                  setTimeout(() => {
                                    const currentSelection = getSelectedBoothsFromGrid();
                                    setSelectedBooths(currentSelection);
                                  }, 100);
                                }
                              } else {
                                // Deselect all rows
                                if (gridRef.current) {
                                  gridRef.current.clearSelection();
                                  setSelectedBooths([]);
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
                          <label htmlFor="select-all-booths" style={{ cursor: 'pointer', userSelect: 'none', fontSize: '14px', fontWeight: '500' }}>
                            Select All
                          </label>
                        </div>
                        <ButtonComponent 
                          cssClass="e-danger"
                          onClick={handleBulkDelete}
                          disabled={isDeleting}
                          aria-label={`Delete ${selectedBooths.length} selected booths`}
                        >
                          {isDeleting ? 'Deleting...' : `Delete Selected (${selectedBooths.length})`}
                        </ButtonComponent>
                      </>
                    )}
                    <ButtonComponent
                      cssClass="e-primary"
                      onClick={() => setBoothMode('create')}
                      disabled={orgBoothLimitReached}
                      title={orgBoothLimitReached ? `Booth limit reached (${orgBoothLimit})` : 'Create Booth'}
                    >
                      Create Booth
                    </ButtonComponent>
                    {orgBoothLimitReached && (
                      <span style={{ fontSize: '12px', color: '#b91c1c', marginLeft: '8px' }}>
                        Booth limit reached ({boothsTotalCount}/{orgBoothLimit})
                      </span>
                    )}
                  </>
                ) : (
                  <ButtonComponent cssClass="e-outline e-primary" onClick={() => { clearBoothDraft(); setBoothMode('list'); }}>
                    Back to List
                  </ButtonComponent>
                )}
              </div>
            </div>

            {boothMode === 'list' ? (
              <div className="bm-grid-wrap" style={{ position: 'relative' }}>
                <div className="form-row bm-search-row">
                  {/* Search Section - Right Aligned */}
                  <div className="bm-search-row-inner">
                    <input
                      ref={searchInputRef}
                      id="booth-search-input"
                      type="text"
                      defaultValue={savedSearchQuery}
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
                      cssClass="e-primary bm-search-button"
                      onClick={handleSearch}
                      disabled={loadingBooths}
                      aria-label="Search booths"
                    >
                      Search
                    </ButtonComponent>
                    {activeSearchQuery && (
                      <ButtonComponent
                        cssClass="e-outline e-primary bm-search-button"
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
                    <ColumnDirective type='checkbox' width='50' freeze='Left' />
                    <ColumnDirective
                      field='name'
                      headerText='Booth Name'
                      width='200'
                      freeze='Left'
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
                  <GridInject services={[Sort, Filter, GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu, Freeze]} />
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
              <form className="account-form" onSubmit={handleCreateBooth} style={{ maxWidth: 720, paddingBottom: 350 }}>
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

                <Input
                  label="Booth Logo Alt Text (for screen readers)"
                  type="text"
                  value={boothForm.boothLogoAlt}
                  onChange={(e) => setBoothField('boothLogoAlt', e.target.value)}
                  placeholder="e.g., Company Name Logo"
                  maxLength="200"
                />

                <div className="form-group">
                  <label className="form-label">Waiting Area Content</label>
                  <div style={{ marginBottom: '12px' }}>
                    <label className="form-label" htmlFor="waiting-area-mode-switch">Waiting Area Type</label>
                    <button
                      id="waiting-area-mode-switch"
                      type="button"
                      role="switch"
                      aria-checked={boothForm.waitingAreaMode === 'employerPage'}
                      onClick={() => setBoothField(
                        'waitingAreaMode',
                        boothForm.waitingAreaMode === 'employerPage' ? 'placeholders' : 'employerPage'
                      )}
                      style={{
                        width: '100%',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        background: '#fff',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer'
                      }}
                    >
                      <span style={{ fontSize: '16px', color: '#111827' }}>
                        {boothForm.waitingAreaMode === 'employerPage' ? 'Employer Page' : '3 Placeholders'}
                      </span>
                      <span
                        aria-hidden="true"
                        style={{
                          width: '48px',
                          height: '26px',
                          borderRadius: '9999px',
                          background: boothForm.waitingAreaMode === 'employerPage' ? '#2563eb' : '#d1d5db',
                          position: 'relative',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <span
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            background: '#fff',
                            position: 'absolute',
                            top: '2px',
                            left: boothForm.waitingAreaMode === 'employerPage' ? '24px' : '2px',
                            transition: 'left 0.15s ease'
                          }}
                        />
                      </span>
                    </button>
                  </div>
                  {boothForm.waitingAreaMode === 'employerPage' && (
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#f8fafc', padding: 12 }}>
                      <p style={{ margin: '0 0 10px 0', color: '#374151', fontSize: 14 }}>
                        Configure the employer page in the visual template editor with inline section editing and live preview.
                      </p>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <ButtonComponent cssClass="e-primary" type="button" onClick={openEmployerTemplateEditor}>
                          Open Template Editor
                        </ButtonComponent>
                        <span style={{ fontSize: 13, color: '#6b7280' }}>
                          Sections configured: {(boothForm.employerPageSections || []).filter(s => (s.contentData && Object.keys(s.contentData).some(k => s.contentData[k])) || (s.contentHtml || '').trim()).length}/{(boothForm.employerPageSections || []).length || 8}
                        </span>
                      </div>
                    </div>
                  )}
                  {boothForm.waitingAreaMode !== 'employerPage' && (
                    <div className="bm-rte-tabs">
                      <div className="bm-rte-block">
                        <h4>First Placeholder</h4>
                        <RTE
                          ref={rteFirstRef}
                          value={boothForm.firstHtml}
                          change={(e) => setBoothField('firstHtml', e?.value || '')}
                          toolbarSettings={rteToolbarSettings}
                          quickToolbarSettings={RTE_QUICK_TOOLBAR_SETTINGS}
                          insertImageSettings={getInsertImageSettings()}
                          insertVideoSettings={getInsertVideoSettings()}
                          insertAudioSettings={getInsertAudioSettings()}
                          height={550}
                          placeholder="Enter content for first placeholder..."
                          enableXhtml={true}
                          keyDown={handleRteKeyDown}
                          fileUploading={(args) => handleFileUploading(args, rteFirstRef)}
                          imageUploading={handleImageUploading}
                          imageUploadSuccess={handleImageUploadSuccess}
                        >
                          <RTEInject services={[HtmlEditor, RTEToolbar, QuickToolbar, RteLink, RteImage, Table, Video, Audio, EmojiPicker, PasteCleanup, Count, RTEResize, FormatPainter]} />
                        </RTE>
                      </div>
                      <div className="bm-rte-block">
                        <h4>Second Placeholder</h4>
                        <RTE
                          ref={rteSecondRef}
                          value={boothForm.secondHtml}
                          change={(e) => setBoothField('secondHtml', e?.value || '')}
                          toolbarSettings={rteToolbarSettings}
                          quickToolbarSettings={RTE_QUICK_TOOLBAR_SETTINGS}
                          insertImageSettings={getInsertImageSettings()}
                          insertVideoSettings={getInsertVideoSettings()}
                          insertAudioSettings={getInsertAudioSettings()}
                          height={550}
                          placeholder="Enter content for second placeholder..."
                          enableXhtml={true}
                          keyDown={handleRteKeyDown}
                          fileUploading={(args) => handleFileUploading(args, rteSecondRef)}
                          imageUploading={handleImageUploading}
                          imageUploadSuccess={handleImageUploadSuccess}
                        >
                          <RTEInject services={[HtmlEditor, RTEToolbar, QuickToolbar, RteLink, RteImage, Table, Video, Audio, EmojiPicker, PasteCleanup, Count, RTEResize, FormatPainter]} />
                        </RTE>
                      </div>
                      <div className="bm-rte-block">
                        <h4>Third Placeholder</h4>
                        <RTE
                          ref={rteThirdRef}
                          value={boothForm.thirdHtml}
                          change={(e) => setBoothField('thirdHtml', e?.value || '')}
                          toolbarSettings={rteToolbarSettings}
                          quickToolbarSettings={RTE_QUICK_TOOLBAR_SETTINGS}
                          insertImageSettings={getInsertImageSettings()}
                          insertVideoSettings={getInsertVideoSettings()}
                          insertAudioSettings={getInsertAudioSettings()}
                          height={550}
                          placeholder="Enter content for third placeholder..."
                          enableXhtml={true}
                          keyDown={handleRteKeyDown}
                          fileUploading={(args) => handleFileUploading(args, rteThirdRef)}
                          imageUploading={handleImageUploading}
                          imageUploadSuccess={handleImageUploadSuccess}
                        >
                          <RTEInject services={[HtmlEditor, RTEToolbar, QuickToolbar, RteLink, RteImage, Table, Video, Audio, EmojiPicker, PasteCleanup, Count, RTEResize, FormatPainter]} />
                        </RTE>
                      </div>
                    </div>
                  )}
                </div>

                <MultiSelect
                  label="Select Event (Optional)"
                  value={boothForm.eventIds}
                  onChange={(e) => setBoothField('eventIds', e.target.value)}
                  options={eventOptions}
                  placeholder={loadingEvents ? 'Loading events…' : 'Choose your Event'}
                  name="eventIds"
                />

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
                  hint="Custom slug for the booth's join URL. Whatever you enter becomes the end of the queue link (e.g. /queue/your-text). Leave empty to use the default auto-generated slug."
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
                      hint="Date and time after which the booth invite link stops working. Enable the checkbox to set an expiry."
                    />
                  </div>
                  <div style={{ flex: '0 0 auto', paddingBottom: 6 }}>
                    <Checkbox
                      label="Enable Expiry Link Time"
                      checked={boothForm.enableExpiry}
                      onChange={(e) => setBoothField('enableExpiry', e.target.checked)}
                      name="enableExpiry"
                      hint="Turn on to make the invite link expire at the time set above. When off, the link never expires."
                    />
                  </div>
                </div>

                <Input
                  label="Company Page"
                  type="url"
                  value={boothForm.companyPage}
                  onChange={(e) => setBoothField('companyPage', e.target.value)}
                  placeholder="https://example.com"
                  hint="The destination URL opened when a job seeker selects the company logo on the event page. Typically the organization's official website or careers page."
                />

                <Input
                  label="Job Seeker Queue Link"
                  value={boothQueueLink}
                  readOnly
                  aria-live="polite"
                  name="jobSeekerQueueLink"
                  placeholder="Auto-generated link"
                  hint="Auto-generated link that job seekers use to join this booth's queue. Share this link to invite candidates."
                />

                <Input
                  label="Join Booth Button Link"
                  type="url"
                  value={boothForm.joinBoothButtonLink}
                  onChange={(e) => setBoothField('joinBoothButtonLink', e.target.value)}
                  placeholder="Leave empty to use Job Seeker Queue Link"
                  name="joinBoothButtonLink"
                  hint={'Optional. If set, the "Join Queue" button on the event page redirects to this URL instead of the default Job Seeker Queue Link.'}
                />

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
              <h3 style={{ margin: 0 }}>
                {previewBooth.waitingAreaMode === 'employerPage' ? 'Employer Page Preview' : 'Placeholder Preview'} - {previewBooth.name}
              </h3>
              <ButtonComponent cssClass="e-outline e-primary" onClick={() => setPreviewBooth(null)}>
                Close
              </ButtonComponent>
            </div>
            {previewBooth.waitingAreaMode === 'employerPage' ? (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                <EmployerPageTemplate booth={previewBooth} />
              </div>
            ) : (
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
            )}
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

      {/* Bulk Delete confirm modal - Syncfusion DialogComponent */}
      <DialogComponent
        width="450px"
        isModal={true}
        showCloseIcon={true}
        visible={confirmBulkDeleteOpen}
        header="Bulk Delete Booths"
        closeOnEscape={true}
        close={cancelBulkDelete}
        cssClass="bm-delete-dialog"
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
          Are you sure you want to permanently delete <strong>{selectedBooths.length} booth(s)</strong>? This action cannot be undone.
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
