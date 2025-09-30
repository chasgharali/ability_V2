import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import { RichTextEditorComponent as RTE, Toolbar as RTEToolbar, Link as RteLink, Image as RteImage, HtmlEditor, QuickToolbar, Inject as RTEInject } from '@syncfusion/ej2-react-richtexteditor';
import { Input } from '../UI/FormComponents';
import { termsConditionsAPI } from '../../services/termsConditions';
import { MdSave, MdCancel, MdPreview } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import './TermsConditions.css';
import { uploadImageToS3 } from '../../services/uploads';

const TermsConditionsForm = () => {
    const [formData, setFormData] = useState({
        title: '',
        content: '',
        version: '1.0',
        isActive: false
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
                isActive: data.terms.isActive
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

    // Shared Syncfusion RTE toolbar settings (MultiRow + floating)
    // RTE image upload helpers
    const rteRef = useRef(null);
    const hiddenImageInputRef = useRef(null);
    const openImagePicker = () => hiddenImageInputRef.current?.click();
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

    const rteToolbar = useMemo(() => ({
        type: 'MultiRow',
        enableFloating: true,
        items: [
            'Bold', 'Italic', 'Underline', 'StrikeThrough',
            'FontName', 'FontSize', 'FontColor', 'BackgroundColor',
            'LowerCase', 'UpperCase', 'Formats',
            'Alignments', 'OrderedList', 'UnorderedList', 'Outdent', 'Indent',
            'CreateLink',
            { tooltipText: 'Insert Image from S3', text: 'Image', prefixIcon: 'e-icons e-image', id: 'ajf-s3-image', click: openImagePicker },
            'ClearFormat', 'Print', 'SourceCode', 'FullScreen', 'Undo', 'Redo'
        ]
    }), []);

    if (loading && isEdit) {
        return (
            <div className="dashboard">
                <AdminHeader />
                <div className="dashboard-layout">
                    <AdminSidebar active="terms-conditions" />
                    <main id="dashboard-main" className="dashboard-main">
                        <div className="loading">Loading terms and conditions...</div>
                    </main>
                    {/* hidden input for S3 image insert */}
            <input type="file" accept="image/*" ref={hiddenImageInputRef} onChange={onHiddenImagePicked} style={{ display: 'none' }} />
        </div>
                <div className="mobile-overlay" aria-hidden="true" />
            </div>
        );
    }

    return (
        <div className="dashboard">
            <AdminHeader />
            <div className="dashboard-layout">
                <AdminSidebar active="terms-conditions" />
                <main id="dashboard-main" className="dashboard-main">
                    <div className="bm-header">
                        <h2>{isEdit ? 'Edit Terms & Conditions' : 'Create Terms & Conditions'}</h2>
                        <div className="bm-header-actions" />
                    </div>

                    {error && (
                        <div className="error-message">
                            <p>{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="dashboard-form">
                        <div className="form-row">
                            <div className="form-group">
                                <Input
                                    label="Terms Title *"
                                    id="title"
                                    name="title"
                                    type="text"
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
                                <Input
                                    label="Version *"
                                    id="version"
                                    name="version"
                                    type="text"
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

                        <div className="form-group">
                            <label htmlFor="content">Content *</label>
                            <div className="rich-text-container">
                                <RTE
                                    id="content"
                                    ref={rteRef}
                                    value={formData.content}
                                    change={handleContentChange}
                                    toolbarSettings={rteToolbar}
                                    height={400}
                                    placeholder="Enter terms and conditions content..."
                                    aria-label="Terms and conditions content editor"
                                >
                                    <RTEInject services={[RTEToolbar, RteLink, RteImage, HtmlEditor, QuickToolbar]} />
                                </RTE>
                            </div>
                            <small className="form-help">
                                Use the toolbar to format your terms and conditions content
                            </small>
                        </div>

                        {['Admin', 'AdminEvent'].includes(user?.role) && (
                            <div className="form-group">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        name="isActive"
                                        checked={formData.isActive}
                                        onChange={handleInputChange}
                                        aria-describedby="active-help"
                                    />
                                    <span className="checkbox-text">Make this the active terms and conditions</span>
                                </label>
                                <small id="active-help" className="form-help">
                                    Only one terms and conditions can be active at a time. Activating this will deactivate others.
                                </small>
                            </div>
                        )}

                        {showPreview && (
                            <div className="preview-section" ref={previewRef}>
                                <h3>Preview</h3>
                                <div className="preview-content">
                                    <h2>{formData.title || 'Untitled Terms'}</h2>
                                    <p><strong>Version:</strong> {formData.version}</p>
                                    <div
                                        className="preview-html"
                                        dangerouslySetInnerHTML={{ __html: formData.content || '<p>No content yet...</p>' }}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="form-actions" style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowPreview((p) => !p);
                                    setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                                }}
                                className="dashboard-button"
                                style={{ width: 'auto' }}
                                disabled={loading}
                            >
                                <MdPreview />
                                {showPreview ? 'Hide Preview' : 'Preview'}
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="dashboard-button save-btn"
                                style={{ width: 'auto' }}
                            >
                                <MdSave />
                                {loading ? 'Saving...' : (isEdit ? 'Update Terms' : 'Create Terms')}
                            </button>
                        </div>
                    </form>
                </main>
            </div>
            <div className="mobile-overlay" aria-hidden="true" />
        </div>
    );
};

export default TermsConditionsForm;
