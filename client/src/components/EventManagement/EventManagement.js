import React, { useMemo, useState, useEffect, useRef } from 'react';
import '../Dashboard/Dashboard.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import DataGrid from '../UI/DataGrid';
import { Input, DateTimePicker, Checkbox, TextArea, Select, MultiSelect } from '../UI/FormComponents';
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
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);

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
                addFooter: Boolean((e.addFooter !== undefined ? e.addFooter : e.theme?.addFooter)),
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

    const showToast = (message) => {
        if (toastTimer.current) {
            clearTimeout(toastTimer.current);
        }
        setToast(message);
        toastTimer.current = setTimeout(() => setToast(null), 2000);
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

    const gridColumns = [
        { key: 'name', title: 'Event Name' },
        { key: 'startTime', title: 'Event Start Time', render: (v) => v ? new Date(v).toLocaleString() : '-' },
        { key: 'endTime', title: 'Event End Time', render: (v) => v ? new Date(v).toLocaleString() : '-' },
        { key: 'date', title: 'Event Date' },
        { key: 'createdAt', title: 'Created Time' },
        { key: 'maxRecruitersPerEvent', title: 'Max Recruiters' },
        { key: 'maxBooths', title: 'Max Booths' },
        { key: 'sendyId', title: 'Sendy Event Id', render: (v) => v || '-' },
        {
            key: 'eventPage',
            title: 'Event Page',
            render: (value, row) => (
                <a className="ajf-btn ajf-btn-outline" href={eventPageUrlFor(row)} target="_blank" rel="noreferrer">
                    Event Page
                </a>
            )
        },
        {
            key: 'actions', title: 'Action', render: (_, row) => (
                <div className="ajf-grid-actions">
                    <button type="button" className="ajf-btn ajf-btn-dark" onClick={() => copyText(registrationUrlFor(row))}>Registration Link</button>
                    <button type="button" className="ajf-btn ajf-btn-outline" onClick={() => startEdit(row)}>Edit</button>
                    <button type="button" className="ajf-btn ajf-btn-outline" onClick={() => handleDelete(row)}>Delete</button>
                </div>
            )
        },
    ];

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
            addFooter: row.addFooter || false,
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
        e.preventDefault();
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
                                    <button className="dashboard-button" style={{ width: 'auto' }} onClick={() => setMode('create')}>Create Event</button>
                                ) : (
                                    <button className="dashboard-button" style={{ width: 'auto' }} onClick={() => setMode('list')}>Back to List</button>
                                )}
                            </div>
                        </div>

                        {mode === 'list' ? (
                            <div className="bm-grid-wrap">
                                <DataGrid
                                    data={events}
                                    columns={gridColumns}
                                    selectable
                                    searchable
                                    sortable
                                    aria-label="Event management table"
                                />
                                {loadingList && <div style={{ marginTop: 12 }}>Loading…</div>}
                            </div>
                        ) : (
                            <form className="account-form" onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
                                <Input label="Event Sendy Id" value={form.sendyId} onChange={(e) => setField('sendyId', e.target.value)} placeholder="" />
                                <Input label="Event Name" value={form.name} onChange={(e) => setField('name', e.target.value)} required placeholder="" />
                                <Input label="Event Link" value={form.link} onChange={(e) => setField('link', e.target.value)} placeholder="https://..." />

                                <div className="form-group">
                                    <label className="form-label">Event Logo</label>
                                    <div className="upload-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <label className="dashboard-button" style={{ width: 'auto', cursor: 'pointer' }}>
                                            Choose file
                                            <input type="file" accept="image/*" onChange={(e) => onPickLogo(e.target.files?.[0])} style={{ display: 'none' }} />
                                        </label>
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
                                    <RTE value={form.information} change={(e) => setField('information', e?.value || '')} placeholder="Type event details...">
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

                                <button type="submit" className="dashboard-button" disabled={saving}>
                                    {saving ? 'Saving…' : (mode === 'edit' ? 'Update' : 'Create')}
                                </button>
                            </form>
                        )}
                    </div>
                </main>
            </div>
            {confirmOpen && (
                <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                    <div className="modal-card" style={{ background: '#fff', borderRadius: 8, padding: 20, width: 420, boxShadow: '0 10px 30px rgba(0,0,0,0.2)', border: '1px solid #e5e7eb' }}>
                        <h3 id="confirm-title" style={{ marginTop: 0, marginBottom: 8 }}>Delete Event</h3>
                        <p style={{ marginTop: 0, marginBottom: 16 }}>Are you sure you want to delete <strong>{rowPendingDelete?.name}</strong>? This action cannot be undone.</p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button type="button" className="ajf-btn ajf-btn-outline" onClick={cancelDelete} disabled={saving}>Cancel</button>
                            <button type="button" className="ajf-btn ajf-btn-dark" onClick={confirmDelete} disabled={saving}>{saving ? 'Deleting…' : 'Delete'}</button>
                        </div>
                    </div>
                </div>
            )}
            {toast && (
                <div role="status" aria-live="polite" style={{ position: 'fixed', right: 16, bottom: 16, background: '#111', color: '#fff', padding: '10px 14px', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.2)', zIndex: 60 }}>
                    {toast}
                </div>
            )}
        </div>
    );
}
