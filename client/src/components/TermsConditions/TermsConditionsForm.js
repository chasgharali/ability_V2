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
import { Input, Select, Checkbox } from '../UI/FormComponents';
import { termsConditionsAPI } from '../../services/termsConditions';
import { MdSave, MdCancel, MdPreview } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import './TermsConditions.css';
import { uploadImageToS3, uploadVideoToS3, uploadAudioToS3 } from '../../services/uploads';
import { RTE_QUICK_TOOLBAR_SETTINGS, getInsertVideoSettings, getInsertAudioSettings, handleRteKeyDown } from '../../utils/rteConfig';
import { closeRteMediaDialog, isVideoFile, isAudioFile, generateVideoHTML, generateAudioHTML } from '../../utils/rteDialogHelper';

const TermsConditionsForm = () => {
    const [formData, setFormData] = useState({
        title: '',
        content: '',
        version: '1.0',
        isActive: false,
        isRequired: true
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isEdit, setIsEdit] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const navigate = useNavigate();
    const { id } = useParams();
    const { user } = useAuth();
    const previewRef = useRef(null);

    // Fetch existing terms for editing
    const fetchTerms = useCallback(async () => {
        try {
            setLoading(true);
            const data = await termsConditionsAPI.getById(id);
            setFormData({
                title: data.terms.title,
                content: data.terms.content,
                version: data.terms.version,
                isActive: data.terms.isActive,
                isRequired: data.terms.isRequired !== undefined ? data.terms.isRequired : true
            });
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to fetch terms and conditions');
            console.error('Error fetching terms:', err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    // Check if this is an edit operation
    useEffect(() => {
        if (id && id !== 'create') {
            setIsEdit(true);
            fetchTerms();
        }
    }, [id, fetchTerms]);

    // Handle form input changes
    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
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

        if (!formData.version.trim()) {
            setError('Version is required');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            let data;
            if (isEdit) {
                data = await termsConditionsAPI.update(id, formData);
            } else {
                data = await termsConditionsAPI.create(formData);
            }

            // Navigate to the terms list or the created/updated terms
            if (isEdit) {
                navigate('/terms-conditions');
            } else {
                navigate(`/terms-conditions/${data.terms._id}`);
            }
        } catch (err) {
            setError(err.response?.data?.message || err.message || `Failed to ${isEdit ? 'update' : 'create'} terms and conditions`);
            console.error('Error saving terms:', err);
        } finally {
            setLoading(false);
        }
    };

    // Handle cancel
    const handleCancel = () => {
        navigate('/terms-conditions');
    };

    // RTE refs and upload helpers
    const rteRef = useRef(null);
    const hiddenImageInputRef = useRef(null);
    
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
            console.error('Terms RTE image upload failed', err);
        }
    };

    // Handle image/video/audio upload before inserting
    const handleImageUploading = async (args) => {
        args.cancel = true;
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
            { id: 'custom-image-terms', tooltipText: 'Insert Image', template: '<button class="e-tbar-btn e-btn" tabindex="-1"><span class="e-icons e-image e-btn-icon"></span></button>', click: openImagePicker },
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
                    <AdminSidebar active="terms-conditions" />
                    <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
                        <div className="loading">Loading terms and conditions...</div>
                    </main>
                    {/* hidden input for S3 image insert */}
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
                <AdminSidebar active="terms-conditions" />
                <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
                    <div className="terms-form-container">
                        <div className="terms-form-header">
                            <h1>{isEdit ? 'Edit Terms & Conditions' : 'Create Terms & Conditions'}</h1>
                        </div>
                        
                        <div className="terms-form-body">
                            {error && (
                                <div className="terms-error-message">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="terms-form">
                                <div className="terms-form-section">
                                    <h3 className="terms-form-section-title">Basic Information</h3>
                                    <div className="terms-form-row">
                                        <div className="form-group">
                                            <label htmlFor="title">Terms Title *</label>
                                            <input
                                                type="text"
                                                id="title"
                                                name="title"
                                                value={formData.title}
                                                onChange={handleInputChange}
                                                placeholder="Enter terms title"
                                                required
                                                aria-describedby="title-help"
                                            />
                                            <small id="title-help" className="form-help">
                                                A descriptive title for these terms and conditions
                                            </small>
                                        </div>

                                        <div className="form-group">
                                            <label htmlFor="version">Version *</label>
                                            <input
                                                type="text"
                                                id="version"
                                                name="version"
                                                value={formData.version}
                                                onChange={handleInputChange}
                                                placeholder="e.g., 1.0, 2.1"
                                                required
                                                aria-describedby="version-help"
                                            />
                                            <small id="version-help" className="form-help">
                                                Version number for tracking changes
                                            </small>
                                        </div>
                                    </div>
                                </div>

                                <div className="terms-form-section">
                                    <h3 className="terms-form-section-title">Field Settings</h3>
                                    <div className="terms-checkbox-group">
                                        <input
                                            type="checkbox"
                                            id="isRequired"
                                            name="isRequired"
                                            checked={formData.isRequired}
                                            onChange={handleInputChange}
                                            aria-describedby="required-help"
                                        />
                                        <div className="terms-checkbox-content">
                                            <label htmlFor="isRequired" className="terms-checkbox-label">
                                                Required Field
                                            </label>
                                            <p id="required-help" className="terms-checkbox-help">
                                                Whether users must complete this field to proceed
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="terms-form-section">
                                    <h3 className="terms-form-section-title">Content</h3>
                                    <div className="form-group">
                                        <label htmlFor="content">Terms & Conditions Content *</label>
                                        <div className="terms-rte-container">
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
                                                placeholder="Enter terms and conditions content..."
                                                aria-label="Terms and conditions content editor"
                                                enableXhtml={true}
                                                showCharCount={true}
                                                imageUploading={handleImageUploading}
                                                fileUploading={handleFileUploading}
                                                keyDown={handleRteKeyDown}
                                            >
                                                <RTEInject services={[RTEToolbar, RteLink, RteImage, HtmlEditor, QuickToolbar, Table, Video, Audio, EmojiPicker, PasteCleanup, Count, Resize, FormatPainter]} />
                                            </RTE>
                                        </div>
                                        <small className="form-help">
                                            Use the toolbar to format your terms and conditions content
                                        </small>
                                    </div>
                                </div>

                                {['SuperAdmin', 'Admin', 'AdminEvent'].includes(user?.role) && (
                                    <div className="terms-form-section">
                                        <h3 className="terms-form-section-title">Activation Settings</h3>
                                        <div className="terms-checkbox-group">
                                            <input
                                                type="checkbox"
                                                id="isActive"
                                                name="isActive"
                                                checked={formData.isActive}
                                                onChange={handleInputChange}
                                            />
                                            <div className="terms-checkbox-content">
                                                <label htmlFor="isActive" className="terms-checkbox-label">
                                                    Make this the active terms and conditions
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {showPreview && (
                                    <div className="terms-preview-section" ref={previewRef}>
                                        <div className="terms-preview-header">
                                            Preview
                                        </div>
                                        <div className="terms-preview-content">
                                            <h2 className="terms-preview-title">{formData.title || 'Untitled Terms'}</h2>
                                            <div className="terms-preview-meta">
                                                <strong>Version:</strong> {formData.version}
                                            </div>
                                            <div
                                                className="terms-preview-html"
                                                dangerouslySetInnerHTML={{ __html: formData.content || '<p>No content yet...</p>' }}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="terms-form-actions">
                                    <button
                                        type="button"
                                        onClick={() => navigate('/terms-conditions')}
                                        className="terms-btn terms-btn-outline"
                                        disabled={loading}
                                    >
                                        <MdCancel />
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowPreview((p) => !p);
                                            setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                                        }}
                                        className="terms-btn terms-btn-secondary"
                                        disabled={loading}
                                    >
                                        <MdPreview />
                                        {showPreview ? 'Hide Preview' : 'Preview'}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="terms-btn terms-btn-primary"
                                    >
                                        <MdSave />
                                        {loading ? 'Saving...' : (isEdit ? 'Update Terms' : 'Create Terms')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </main>
            </div>
            {/* hidden input for S3 image insert */}
            <input type="file" accept="image/*" ref={hiddenImageInputRef} onChange={onHiddenImagePicked} style={{ display: 'none' }} />
        </div>
    );
};

export default TermsConditionsForm;
