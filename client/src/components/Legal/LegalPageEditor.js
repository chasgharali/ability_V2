import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    RichTextEditorComponent as RTE,
    Toolbar as RTEToolbar,
    Link as RteLink,
    Image as RteImage,
    HtmlEditor,
    QuickToolbar,
    Table,
    EmojiPicker,
    PasteCleanup,
    Count,
    Resize,
    Inject as RTEInject
} from '@syncfusion/ej2-react-richtexteditor';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import { legalPagesAPI } from '../../services/legalPages';
import { MdSave, MdOpenInNew } from 'react-icons/md';
import { uploadImageToS3 } from '../../services/uploads';
import { RTE_QUICK_TOOLBAR_SETTINGS, handleRteKeyDown } from '../../utils/rteConfig';
import '../Dashboard/Dashboard.css';
import './Legal.css';

const PAGE_LABELS = {
    'terms-of-use': 'Terms of Use',
    'privacy-policy': 'Privacy Policy'
};

const LegalPageEditor = ({ type }) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);
    const navigate = useNavigate();

    const rteRef = useRef(null);
    const hiddenImageInputRef = useRef(null);
    const pageLabel = PAGE_LABELS[type] || type;
    const viewPath = `/legal/${type}`;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await legalPagesAPI.getByType(type);
            setTitle(data.page.title || '');
            setContent(data.page.content || '');
        } catch (err) {
            if (err.response?.status === 404) {
                setTitle(pageLabel);
                setContent('');
            } else {
                setError('Failed to load existing content.');
            }
        } finally {
            setLoading(false);
        }
    }, [type, pageLabel]);

    useEffect(() => {
        load();
    }, [load]);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!title.trim()) {
            setError('Title is required.');
            return;
        }
        setSaving(true);
        setError(null);
        setSuccessMsg(null);
        try {
            await legalPagesAPI.save(type, { title, content });
            setSuccessMsg(`${pageLabel} saved successfully.`);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save.');
        } finally {
            setSaving(false);
        }
    };

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
            console.error('Legal page image upload failed', err);
        }
    };

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

    const rteToolbar = useMemo(() => ({
        type: 'Expand',
        enableFloating: true,
        items: [
            'Undo', 'Redo', '|',
            'Bold', 'Italic', 'Underline', 'StrikeThrough', '|',
            'FontName', 'FontSize', 'FontColor', 'BackgroundColor', '|',
            'Formats', 'Alignments', '|',
            'OrderedList', 'UnorderedList', '|',
            'Outdent', 'Indent', '|',
            'CreateLink',
            { id: `custom-image-legal-${type}`, tooltipText: 'Insert Image', template: '<button class="e-tbar-btn e-btn" tabindex="-1"><span class="e-icons e-image e-btn-icon"></span></button>', click: openImagePicker },
            'CreateTable', '|',
            'EmojiPicker', '|',
            'ClearFormat', '|',
            'SourceCode', 'FullScreen'
        ]
    }), [openImagePicker, type]);

    const sidebarActive = type === 'terms-of-use' ? 'legal-terms-of-use' : 'legal-privacy-policy';

    if (loading) {
        return (
            <div className="dashboard">
                <a href="#main-content" className="skip-link">Skip to main content</a>
                <AdminHeader />
                <div className="dashboard-layout">
                    <AdminSidebar active={sidebarActive} />
                    <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
                        <div className="loading">Loading {pageLabel}...</div>
                    </main>
                </div>
                <input type="file" accept="image/*" ref={hiddenImageInputRef} onChange={onHiddenImagePicked} style={{ display: 'none' }} />
            </div>
        );
    }

    return (
        <div className="dashboard">
            <a href="#main-content" className="skip-link">Skip to main content</a>
            <AdminHeader />
            <div className="dashboard-layout">
                <AdminSidebar active={sidebarActive} />
                <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
                    <div className="legal-editor-container">
                        <div className="legal-editor-header">
                            <div className="legal-editor-header-content">
                                <h1>Edit {pageLabel}</h1>
                                <a
                                    href={viewPath}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="legal-preview-link"
                                    aria-label={`Preview ${pageLabel} in a new tab`}
                                >
                                    <MdOpenInNew aria-hidden="true" />
                                    Preview
                                </a>
                            </div>
                        </div>

                        <div className="legal-editor-body">
                            {error && (
                                <div className="legal-alert legal-alert-error" role="alert" aria-live="polite">
                                    {error}
                                </div>
                            )}
                            {successMsg && (
                                <div className="legal-alert legal-alert-success" role="status" aria-live="polite">
                                    {successMsg}
                                </div>
                            )}

                            <form onSubmit={handleSave} className="legal-form">
                                <div className="legal-form-section">
                                    <label htmlFor="legal-title" className="legal-field-label">
                                        Page Title <span aria-hidden="true">*</span>
                                    </label>
                                    <input
                                        id="legal-title"
                                        type="text"
                                        className="legal-title-input"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder={`e.g. ${pageLabel}`}
                                        required
                                        aria-required="true"
                                    />
                                </div>

                                <div className="legal-form-section">
                                    <label className="legal-field-label" id="legal-content-label">
                                        Content
                                    </label>
                                    <div className="legal-rte-container">
                                        <RTE
                                            id={`legal-content-${type}`}
                                            ref={rteRef}
                                            value={content}
                                            change={(args) => setContent(args.value)}
                                            toolbarSettings={rteToolbar}
                                            quickToolbarSettings={RTE_QUICK_TOOLBAR_SETTINGS}
                                            height={550}
                                            placeholder={`Enter ${pageLabel} content here...`}
                                            aria-labelledby="legal-content-label"
                                            enableXhtml={true}
                                            showCharCount={true}
                                            imageUploading={handleImageUploading}
                                            keyDown={handleRteKeyDown}
                                        >
                                            <RTEInject services={[RTEToolbar, RteLink, RteImage, HtmlEditor, QuickToolbar, Table, EmojiPicker, PasteCleanup, Count, Resize]} />
                                        </RTE>
                                    </div>
                                </div>

                                <div className="legal-form-actions">
                                    <button
                                        type="button"
                                        className="legal-btn legal-btn-outline"
                                        onClick={() => navigate('/dashboard')}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="legal-btn legal-btn-primary"
                                        disabled={saving}
                                        aria-busy={saving}
                                    >
                                        <MdSave aria-hidden="true" />
                                        {saving ? 'Saving...' : `Save ${pageLabel}`}
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

export default LegalPageEditor;
