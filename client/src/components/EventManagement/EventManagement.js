import React, { useState, useEffect, useRef } from 'react';
import '../Dashboard/Dashboard.css';
import './EventManagement.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import { GridComponent, ColumnsDirective, ColumnDirective, Inject as GridInject, Page, Sort, Filter, Toolbar as GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu } from '@syncfusion/ej2-react-grids';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import { Input, DateTimePicker, Checkbox, Select, MultiSelect } from '../UI/FormComponents';
import { RichTextEditorComponent as RTE, Toolbar as RTEToolbar, Link as RteLink, Image as RteImage, HtmlEditor, QuickToolbar, Inject as RTEInject } from '@syncfusion/ej2-react-richtexteditor';
import { uploadImageToS3 } from '../../services/uploads';
import { listEvents, createEvent, updateEvent, deleteEvent } from '../../services/events';
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

    const [mode, setMode] = useState('list'); // 'list' | 'create' | 'edit'
    const [editingId, setEditingId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [rowPendingDelete, setRowPendingDelete] = useState(null);
    const toastRef = useRef(null);

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

    const loadEvents = async () => {
        try {
            setLoadingList(true);
            const res = await listEvents({ page: 1, limit: 50 });
            const items = res?.events || [];
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
                status: e.status || 'draft',
                addFooter: Boolean((e.addFooter !== undefined ? e.addFooter : e.theme?.addFooter)),
                termsIds: e.termsIds || [],
            })));
        } catch (err) {
            console.error('Failed to load events', err);
        } finally {
            setLoadingList(false);
        }
    };

    const loadTerms = async () => {
        try {
            const res = await termsConditionsAPI.getAll({ page: 1, limit: 100 });
            const list = res?.terms || [];
            setTermsOptions(list.map(t => ({ value: t._id, label: `${t.title} (v${t.version})${t.isActive ? ' • Active' : ''}` })));
        } catch (e) {
            console.error('Failed to load terms', e);
        }
    };

    useEffect(() => { if (!loading) { loadEvents(); loadTerms(); } }, [loading]);

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
        setForm(prev => ({
            ...prev,
            sendyId: row.sendyId || '',
            name: row.name || '',
            link: row.link || '',
            logoUrl: row.logoUrl || '',
            maxBooths: row.maxBooths || 0,
            maxRecruitersPerEvent: row.maxRecruitersPerEvent || 0,
            startTime: row.startTime ? new Date(row.startTime).toISOString().slice(0, 16) : '',
            endTime: row.endTime ? new Date(row.endTime).toISOString().slice(0, 16) : '',
            information: row.description || '',
            status: row.status || 'draft',
            addFooter: row.addFooter || false,
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

    const handleSubmit = async (e) => {
        if (e && e.preventDefault) {
            e.preventDefault();
        }
        setSaving(true);
        try {
            const payload = {
                name: form.name,
                description: form.information,
                start: form.startTime,
                end: form.endTime,
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
            };

            if (mode === 'edit' && editingId) {
                await updateEvent(editingId, payload);
            } else {
                await createEvent(payload);
            }
            await loadEvents();
            setMode('list');
            setEditingId(null);
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
                                    <ButtonComponent cssClass="e-primary" onClick={() => setMode('create')}>
                                        Create Event
                                    </ButtonComponent>
                                ) : (
                                    <ButtonComponent cssClass="e-outline e-primary" onClick={() => setMode('list')}>
                                        Back to List
                                    </ButtonComponent>
                                )}
                            </div>
                        </div>

                        {mode === 'list' ? (
                            <div className="bm-grid-wrap">
                                {loadingList && <div style={{ marginBottom: 12 }}>Loading…</div>}
                                <GridComponent
                                    dataSource={events}
                                    allowPaging={true}
                                    pageSettings={{ pageSize: 10, pageSizes: [10, 20, 50, 100] }}
                                    allowSorting={true}
                                    allowFiltering={true}
                                    filterSettings={{ type: 'Menu' }}
                                    showColumnMenu={true}
                                    showColumnChooser={true}
                                    allowResizing={true}
                                    allowReordering={true}
                                    toolbar={['Search', 'ColumnChooser']}
                                    selectionSettings={{ type: 'Multiple', checkboxOnly: true }}
                                    enableHover={true}
                                    allowRowDragAndDrop={false}
                                >
                                    <ColumnsDirective>
                                        <ColumnDirective type='checkbox' width='50' />
                                        <ColumnDirective 
                                            field='name' 
                                            headerText='Event Name' 
                                            width='200' 
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
                                            template={(props) => (
                                                <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                                                    {props.startTime ? new Date(props.startTime).toLocaleString() : '-'}
                                                </div>
                                            )}
                                        />
                                        <ColumnDirective 
                                            field='endTime' 
                                            headerText='Event End Time' 
                                            width='200' 
                                            template={(props) => (
                                                <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                                                    {props.endTime ? new Date(props.endTime).toLocaleString() : '-'}
                                                </div>
                                            )}
                                        />
                                        <ColumnDirective 
                                            field='date' 
                                            headerText='Event Date' 
                                            width='180' 
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
                                            template={(props) => (
                                                <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0', textAlign: 'center' }}>
                                                    {props.maxBooths ?? 0}
                                                </div>
                                            )}
                                        />
                                        <ColumnDirective 
                                            field='sendyId' 
                                            headerText='Sendy Event Id' 
                                            width='150' 
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
                                    <GridInject services={[Page, Sort, Filter, GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu]} />
                                </GridComponent>
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
                                        <label htmlFor="logo-upload" style={{ margin: 0 }}>
                                            <ButtonComponent cssClass="e-outline e-primary e-small">
                                                Choose file
                                            </ButtonComponent>
                                        </label>
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
                                    <DateTimePicker label="Event Start Time" value={form.startTime} onChange={(e) => setField('startTime', e.target.value)} placeholder="Select start" />
                                    <DateTimePicker label="Event End Time" value={form.endTime} onChange={(e) => setField('endTime', e.target.value)} placeholder="Select end" />
                                </div>

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
                width="450px"
                isModal={true}
                showCloseIcon={true}
                visible={confirmOpen}
                header="Delete Event"
                closeOnEscape={true}
                close={cancelDelete}
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
