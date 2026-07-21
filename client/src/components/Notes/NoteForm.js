import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
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
    Resize,
    FormatPainter,
    Inject as RTEInject 
} from '@syncfusion/ej2-react-richtexteditor';
import { MultiSelect } from '../UI/FormComponents';
import { notesAPI } from '../../services/notes';
import { MdSave, MdCancel } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import './Notes.css';
import { uploadImageToS3, uploadVideoToS3, uploadAudioToS3 } from '../../services/uploads';
import { RTE_QUICK_TOOLBAR_SETTINGS, getInsertVideoSettings, getInsertAudioSettings, handleRteKeyDown } from '../../utils/rteConfig';
import { closeRteMediaDialog, isVideoFile, isAudioFile, generateVideoHTML, generateAudioHTML } from '../../utils/rteDialogHelper';

const ROLE_OPTIONS = [
    'Admin',
    'AdminEvent',
    'BoothAdmin',
    'Recruiter',
    'Interpreter',
    'GlobalInterpreter',
    'Support',
    'GlobalSupport',
    'JobSeeker'
];

const NoteForm = () => {
    const [formData, setFormData] = useState({
        title: '',
        content: '',
        type: 'troubleshooting',
        assignedRoles: [],
        isActive: true
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isEdit, setIsEdit] = useState(false);
    const navigate = useNavigate();
    const { id } = useParams();
    const { user } = useAuth();
    const roleOptions = useMemo(() => {
        if (user?.role === 'SuperAdmin') return ROLE_OPTIONS;
        return ROLE_OPTIONS.filter((role) => role !== 'JobSeeker');
    }, [user?.role]);

    // Fetch existing note for editing
    const fetchNote = useCallback(async () => {
        try {
            setLoading(true);
            const data = await notesAPI.getById(id);
            const fetchedRoles = data.note.assignedRoles || [];
            const allowedRoles = user?.role === 'SuperAdmin'
                ? fetchedRoles
                : fetchedRoles.filter((role) => role !== 'JobSeeker');
            setFormData({
                title: data.note.title,
                content: data.note.content,
                type: data.note.type,
                assignedRoles: allowedRoles,
                isActive: data.note.isActive !== undefined ? data.note.isActive : true
            });
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to fetch note');
            console.error('Error fetching note:', err);
        } finally {
            setLoading(false);
        }
    }, [id, user?.role]);

    // Check if this is an edit operation
    useEffect(() => {
        if (id && id !== 'create') {
            setIsEdit(true);
            fetchNote();
        }
    }, [id, fetchNote]);

    // Handle form input changes
    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    // Handle role selection
    const handleRoleChange = (e) => {
        const selectedRoles = e.target.value;
        setFormData(prev => ({
            ...prev,
            assignedRoles: selectedRoles
        }));
    };

    // Handle rich text editor content change
    const handleContentChange = (args) => {
        setFormData(prev => ({
            ...prev,
            content: args.value
        }));
    };

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.title.trim()) {
            setError('Title is required');
            return;
        }

        if (!formData.content.trim()) {
            setError('Content is required');
            return;
        }

        if (!formData.assignedRoles || formData.assignedRoles.length === 0) {
            setError('At least one role must be assigned');
            return;
        }
        if (user?.role !== 'SuperAdmin' && formData.assignedRoles.includes('JobSeeker')) {
            setError('Only SuperAdmin can assign notes to Job Seeker');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            let data;
            if (isEdit) {
                data = await notesAPI.update(id, formData);
            } else {
                data = await notesAPI.create(formData);
            }

            navigate('/notes');
        } catch (err) {
            setError(err.response?.data?.message || err.message || `Failed to ${isEdit ? 'update' : 'create'} note`);
            console.error('Error saving note:', err);
        } finally {
            setLoading(false);
        }
    };

    // RTE refs and upload helpers
    const rteRef = useRef(null);
    const hiddenImageInputRef = useRef(null);
    const hiddenVideoInputRef = useRef(null);
    const hiddenAudioInputRef = useRef(null);
    
    const openImagePicker = useCallback(() => hiddenImageInputRef.current?.click(), []);
    
    const onHiddenImagePicked = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !rteRef.current) return;
        try {
            const { downloadUrl } = await uploadImageToS3(file);
            try {
                rteRef.current.executeCommand('insertImage', { url: downloadUrl, altText: file.name });
            } catch {
                rteRef.current.executeCommand('insertHTML', `<img src="${downloadUrl}" alt="${file.name}" />`);
            }
        } catch (err) {
            console.error('Note RTE image upload failed', err);
        }
    };

    // Handle image/video/audio upload before inserting
    const handleImageUploading = async (args) => {
        args.cancel = true; // Cancel default upload
        const file = args.fileData?.rawFile;
        if (!file || !rteRef.current) return;
        try {
            const { downloadUrl } = await uploadImageToS3(file);
            rteRef.current.executeCommand('insertImage', { url: downloadUrl, altText: file.name, cssClass: 'e-rte-image' });
        } catch (err) {
            console.error('Image upload failed:', err);
        }
    };

    /** Handle file upload for video/audio */
    const handleFileUploading = async (args) => {
        console.log('🎥 File uploading triggered:', args);
        
        const file = args.fileData?.rawFile;
        console.log('📁 File detected:', file, 'Type:', file?.type);
        
        if (!file || !rteRef.current) {
            console.error('❌ No file or RTE ref', 'file:', file, 'rteRef:', rteRef.current);
            args.cancel = true;
            return;
        }
        
        const isVideo = isVideoFile(file);
        const isAudio = isAudioFile(file);
        console.log('🔍 File classification - Video:', isVideo, 'Audio:', isAudio);
        
        if (!isVideo && !isAudio) {
            console.error('❌ File is neither video nor audio:', file.type);
            args.cancel = true;
            return;
        }
        
        // Cancel default upload
        args.cancel = true;
        
        // Close the Syncfusion dialog immediately (helper has internal retries)
        closeRteMediaDialog(rteRef.current);
        
        try {
            let downloadUrl;
            
            if (isVideo) {
                console.log('⬆️ Uploading video to S3...');
                const result = await uploadVideoToS3(file);
                downloadUrl = result.downloadUrl;
                console.log('✅ Video uploaded, URL:', downloadUrl);
                
                // Insert video with proper attributes
                const videoHTML = generateVideoHTML(downloadUrl, file.type);
                rteRef.current.executeCommand('insertHTML', videoHTML);
            } else if (isAudio) {
                console.log('⬆️ Uploading audio to S3...');
                const result = await uploadAudioToS3(file);
                downloadUrl = result.downloadUrl;
                console.log('✅ Audio uploaded, URL:', downloadUrl);
                
                // Insert audio with proper attributes
                const audioHTML = generateAudioHTML(downloadUrl, file.type);
                rteRef.current.executeCommand('insertHTML', audioHTML);
            }
            
        } catch (err) {
            console.error('❌ Media upload failed:', err);
        }
    };

    const rteToolbar = useMemo(() => ({
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
            'CreateLink', 
            { id: 'custom-image-note', tooltipText: 'Insert Image', template: '<button class="e-tbar-btn e-btn" tabindex="-1"><span class="e-icons e-image e-btn-icon"></span></button>', click: openImagePicker },
            'Video', 'Audio', '|',
            'CreateTable', '|',
            'EmojiPicker', '|',
            'ClearFormat', '|',
            'Print', 'FullScreen', '|',
            'SourceCode'
        ]
    }), [openImagePicker]);

    if (loading && isEdit) {
        return (
            <div className="dashboard">
                <a href="#main-content" className="skip-link">Skip to main content</a>
                <AdminHeader />
                <div className="dashboard-layout">
                    <AdminSidebar active="notes" />
                    <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
                        <div className="loading">Loading note...</div>
                    </main>
                    <input type="file" accept="image/*" ref={hiddenImageInputRef} onChange={onHiddenImagePicked} style={{ display: 'none' }} />
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard">
            <a href="#main-content" className="skip-link">Skip to main content</a>
            <AdminHeader />
            <div className="dashboard-layout">
                <AdminSidebar active="notes" />
                <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
                    <div className="note-form-container">
                        <div className="note-form-header">
                            <h1>{isEdit ? 'Edit Note' : 'Create New Note'}</h1>
                        </div>
                        
                        <div className="note-form-body">
                            {error && (
                                <div className="note-error-message">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="note-form">
                                <div className="note-form-section">
                                    <h3 className="note-form-section-title">Basic Information</h3>
                                    <div className="note-form-row">
                                        <div className="form-group">
                                            <label htmlFor="title">Title *</label>
                                            <input
                                                type="text"
                                                id="title"
                                                name="title"
                                                value={formData.title}
                                                onChange={handleInputChange}
                                                placeholder="Enter note title"
                                                required
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label htmlFor="type">Type *</label>
                                            <select
                                                id="type"
                                                name="type"
                                                value={formData.type}
                                                onChange={handleInputChange}
                                                required
                                            >
                                                <option value="troubleshooting">Troubleshooting</option>
                                                <option value="instruction">Instruction</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="note-form-section">
                                    <h3 className="note-form-section-title">Role Assignment</h3>
                                    <div className="form-group">
                                        <label htmlFor="assignedRoles">Assign to Roles *</label>
                                        <MultiSelect
                                            id="assignedRoles"
                                            name="assignedRoles"
                                            options={roleOptions.map(role => ({ value: role, label: role === 'JobSeeker' ? 'Job Seeker' : role }))}
                                            value={formData.assignedRoles}
                                            onChange={handleRoleChange}
                                            placeholder="Select roles"
                                        />
                                        <small className="form-help">
                                            Select one or more roles that should have access to this note
                                        </small>
                                    </div>
                                </div>

                                <div className="note-form-section">
                                    <h3 className="note-form-section-title">Content</h3>
                                    <div className="form-group">
                                        <label htmlFor="content">Content *</label>
                                        <div className="note-rte-container">
                                            <RTE
                                                id="content"
                                                ref={rteRef}
                                                value={formData.content}
                                                change={handleContentChange}
                                                toolbarSettings={rteToolbar}
                                                quickToolbarSettings={RTE_QUICK_TOOLBAR_SETTINGS}
                                                insertVideoSettings={getInsertVideoSettings()}
                                                insertAudioSettings={getInsertAudioSettings()}
                                                height={550}
                                                placeholder="Enter note content here..."
                                                aria-label="Note content editor"
                                                enableXhtml={true}
                                                showCharCount={true}
                                                imageUploading={handleImageUploading}
                                                fileUploading={handleFileUploading}
                                                keyDown={handleRteKeyDown}
                                            >
                                                <RTEInject services={[RTEToolbar, RteLink, RteImage, HtmlEditor, QuickToolbar, Table, Video, Audio, EmojiPicker, PasteCleanup, Count, Resize, FormatPainter]} />
                                            </RTE>
                                        </div>
                                    </div>
                                </div>

                                <div className="note-form-section">
                                    <h3 className="note-form-section-title">Status</h3>
                                    <div className="note-checkbox-group">
                                        <input
                                            type="checkbox"
                                            id="isActive"
                                            name="isActive"
                                            checked={formData.isActive}
                                            onChange={handleInputChange}
                                        />
                                        <label htmlFor="isActive" className="note-checkbox-label">
                                            Active (visible to assigned roles)
                                        </label>
                                    </div>
                                </div>

                                <div className="note-form-actions">
                                    <button
                                        type="button"
                                        onClick={() => navigate('/notes')}
                                        className="note-btn note-btn-outline"
                                        disabled={loading}
                                    >
                                        <MdCancel />
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="note-btn note-btn-primary"
                                    >
                                        <MdSave />
                                        {loading ? 'Saving...' : (isEdit ? 'Update Note' : 'Create Note')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </main>
            </div>
            <input type="file" accept="image/*" ref={hiddenImageInputRef} onChange={onHiddenImagePicked} style={{ display: 'none' }} />
        </div>
    );
};

export default NoteForm;

