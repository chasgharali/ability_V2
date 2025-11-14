import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import { RichTextEditorComponent as RTE, Toolbar as RTEToolbar, Link as RteLink, Image as RteImage, HtmlEditor, QuickToolbar, Inject as RTEInject } from '@syncfusion/ej2-react-richtexteditor';
import { MultiSelect } from '../UI/FormComponents';
import { notesAPI } from '../../services/notes';
import { MdSave, MdCancel } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import './Notes.css';
import { uploadImageToS3 } from '../../services/uploads';

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

    // Fetch existing note for editing
    const fetchNote = useCallback(async () => {
        try {
            setLoading(true);
            const data = await notesAPI.getById(id);
            setFormData({
                title: data.note.title,
                content: data.note.content,
                type: data.note.type,
                assignedRoles: data.note.assignedRoles || [],
                isActive: data.note.isActive !== undefined ? data.note.isActive : true
            });
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to fetch note');
            console.error('Error fetching note:', err);
        } finally {
            setLoading(false);
        }
    }, [id]);

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
            console.error('Note RTE image upload failed', err);
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
                    <AdminSidebar active="notes" />
                    <main id="dashboard-main" className="dashboard-main">
                        <div className="loading">Loading note...</div>
                    </main>
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
                <AdminSidebar active="notes" />
                <main id="dashboard-main" className="dashboard-main">
                    <div className="note-form-container">
                        <div className="note-form-header">
                            <h2>{isEdit ? 'Edit Note' : 'Create New Note'}</h2>
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
                                            options={ROLE_OPTIONS.map(role => ({ value: role, label: role }))}
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
                                                height={400}
                                                placeholder="Enter note content here..."
                                                aria-label="Note content editor"
                                            >
                                                <RTEInject services={[RTEToolbar, RteLink, RteImage, HtmlEditor, QuickToolbar]} />
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
            <div className="mobile-overlay" aria-hidden="true" />
            <input type="file" accept="image/*" ref={hiddenImageInputRef} onChange={onHiddenImagePicked} style={{ display: 'none' }} />
        </div>
    );
};

export default NoteForm;

