import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSocket } from '../../contexts/SocketContext';
import { useToast } from '../../contexts/ToastContext';
import { useRecruiterBooth } from '../../hooks/useRecruiterBooth';
import { MdLogout, MdRefresh, MdExpandMore, MdExpandLess, MdMenu, MdClose } from 'react-icons/md';
import { RichTextEditorComponent as RTE, Toolbar as RTEToolbar, Link as RteLink, Image as RteImage, HtmlEditor, QuickToolbar, Inject as RTEInject } from '@syncfusion/ej2-react-richtexteditor';
import { TabComponent, TabItemsDirective, TabItemDirective } from '@syncfusion/ej2-react-navigations';
import { MultiSelectComponent } from '@syncfusion/ej2-react-dropdowns';
import { DateTimePickerComponent } from '@syncfusion/ej2-react-calendars';
import { GridComponent, ColumnsDirective, ColumnDirective, Inject as GridInject, Page, Sort, Filter, Toolbar as GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu } from '@syncfusion/ej2-react-grids';
import './Dashboard.css';
import SurveyForm from './SurveyForm';
import EditProfileResume from './EditProfileResume';
import ViewProfile from './ViewProfile';
import InterpreterDashboard from './InterpreterDashboard';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import MyAccountInline from '../Account/MyAccountInline';
import Chat from '../Chat/Chat';
import settingsAPI from '../../services/settings';

// Simple error boundary to prevent white screens if a nested view crashes
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(err, info) { console.error('Dashboard view error:', err, info); }
    render() {
        if (this.state.hasError) {
            return this.props.fallback || <div className="dashboard-content"><div className="alert-box" style={{ background: '#ffe8e8' }}>Something went wrong loading this view.</div></div>;
        }
        return this.props.children;
    }
}

const Dashboard = () => {
    const { user, logout, loading, updateProfile } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const { socket } = useSocket();
    const { showToast } = useToast();
    const { booth, event } = useRecruiterBooth();
    const [activeSection, setActiveSection] = useState('my-account');
    const [expandedSections, setExpandedSections] = useState({
        'my-account': true,
        'registrations': true,
        'upcoming-events': true
    });
    const [brandingLogo, setBrandingLogo] = useState('');
    // Simple monochrome default icon (SVG data URL)
    const DEFAULT_ICON = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="180" height="36" viewBox="0 0 180 36" fill="none"><path d="M18 2 L6 22 h8 l-4 12 16-24 h-8 l4-8 z" fill="%23000000"/><text x="34" y="24" fill="%23000000" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700">ABILITYJOBFAIR</text></svg>';
    // Booth Management form state (admin)
    const [boothForm, setBoothForm] = useState({
        boothName: '',
        boothLogo: '', // data URL
        firstHtml: '',
        secondHtml: '',
        thirdHtml: '',
        recruitersCount: 1,
        eventDate: '', // ISO string or blank
        eventIds: [], // multiselect
        customInviteText: '',
        expireLinkTime: '', // ISO datetime-local
        enableExpiry: false,
        companyPage: ''
    });
    const [boothSaving, setBoothSaving] = useState(false);
    const [boothMode, setBoothMode] = useState('list'); // 'list' | 'create'
    const [booths, setBooths] = useState([
        {
            id: 'bth_1',
            name: 'ABILITY JOBS',
            logo: '',
            recruitersCount: 3,
            eventDate: '2025-11-11T17:00:00.000Z',
            events: ['Event Demo test'],
            customInviteText: 'abilityjobs.dev-invite',
            expireLinkTime: '',
            enableExpiry: false,
            companyPage: 'https://abilityjobs.com'
        },
        {
            id: 'bth_2',
            name: 'Demonstration Co',
            logo: '',
            recruitersCount: 5,
            eventDate: '2025-10-21T15:30:00.000Z',
            events: ['Demonstration'],
            customInviteText: '',
            expireLinkTime: '2025-12-31T23:00:00.000Z',
            enableExpiry: true,
            companyPage: 'https://demo.example.com'
        }
    ]);
    // Local form state for Account Information
    const [formData, setFormData] = useState({
        firstName: user?.name?.split(' ')[0] || '',
        lastName: user?.name?.split(' ').slice(1).join(' ') || '',
        email: user?.email || '',
        phone: user?.phoneNumber || '',
        state: user?.state || '',
        city: user?.city || '',
        country: user?.country || 'US',
        password: ''
    });
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [saveError, setSaveError] = useState('');
    const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
    const [errors, setErrors] = useState({});
    const [accessibility, setAccessibility] = useState({
        usesScreenMagnifier: user?.usesScreenMagnifier || false,
        usesScreenReader: user?.usesScreenReader || false,
        needsASL: user?.needsASL || false,
        needsCaptions: user?.needsCaptions || false,
        needsOther: user?.needsOther || false,
        subscribeAnnouncements: user?.subscribeAnnouncements || false
    });

    const handleAccessibilityToggle = async (key, value) => {
        setAccessibility(prev => ({ ...prev, [key]: value }));
        try {
            const result = await updateProfile({ [key]: value });
            if (result.success) {
                showToast('Saved accessibility preference', 'success');
            } else {
                showToast(result.error || 'Failed to save preference', 'error');
                // Revert if server failed
                setAccessibility(prev => ({ ...prev, [key]: !value }));
            }
        } catch (e) {
            showToast('Failed to save preference', 'error');
            setAccessibility(prev => ({ ...prev, [key]: !value }));
        }
    };

    // Sync section based on URL path
    useEffect(() => {
        if (location.pathname.endsWith('/survey')) {
            setActiveSection('survey');
        } else if (location.pathname.endsWith('/edit-profile')) {
            setActiveSection('edit-profile');
        } else if (location.pathname.endsWith('/view-profile')) {
            setActiveSection('view-profile');
        } else if (location.pathname.endsWith('/delete-account')) {
            setActiveSection('delete-account');
        } else {
            setActiveSection('my-account');
        }
    }, [location.pathname]);

    useEffect(() => {
        // When user loads/changes, sync form
        if (user) {
            setFormData(prev => ({
                ...prev,
                firstName: (user?.name || '').split(' ')[0] || '',
                lastName: (user?.name || '').split(' ').slice(1).join(' ') || '',
                email: user?.email || '',
                phone: user?.phoneNumber || '',
                state: user?.state || '',
                city: user?.city || '',
                country: user?.country || 'US'
            }));
            setAccessibility({
                usesScreenMagnifier: user?.usesScreenMagnifier || false,
                usesScreenReader: user?.usesScreenReader || false,
                needsASL: user?.needsASL || false,
                needsCaptions: user?.needsCaptions || false,
                needsOther: user?.needsOther || false,
                subscribeAnnouncements: user?.subscribeAnnouncements || false
            });
        }
    }, [user]);

    // Fetch branding logo on mount
    useEffect(() => {
        const fetchBrandingLogo = async () => {
            try {
                const response = await settingsAPI.getSetting('branding_logo');
                if (response.success && response.value) {
                    setBrandingLogo(response.value);
                }
            } catch (error) {
                // Setting doesn't exist yet
                console.log('No branding logo set');
            }
        };
        fetchBrandingLogo();
    }, []);

    // Admin: branding logo helpers
    const saveBrandingLogo = async (dataUrl) => {
        try {
            if (dataUrl) {
                await settingsAPI.setSetting('branding_logo', dataUrl, 'Header logo for the application');
            } else {
                await settingsAPI.deleteSetting('branding_logo');
            }
            setBrandingLogo(dataUrl || '');
            showToast(dataUrl ? 'Header logo updated' : 'Header logo removed', 'success');
        } catch (e) {
            showToast('Failed to save header logo', 'error');
        }
    };

    const onPickLogoFile = async (file) => {
        if (!file) return;
        if (!/^image\//.test(file.type)) {
            showToast('Please select an image file', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result;
            saveBrandingLogo(dataUrl);
        };
        reader.onerror = () => showToast('Failed to read file', 'error');
        reader.readAsDataURL(file);
    };

    // Booth: pick logo
    const onPickBoothLogo = (file) => {
        if (!file) return;
        if (!/^image\//.test(file.type)) { showToast('Booth logo must be an image', 'error'); return; }
        const reader = new FileReader();
        reader.onload = () => setBoothForm(prev => ({ ...prev, boothLogo: reader.result }));
        reader.onerror = () => showToast('Failed to read file', 'error');
        reader.readAsDataURL(file);
    };

    // Booth: helpers
    const setBoothField = (k, v) => setBoothForm(prev => ({ ...prev, [k]: v }));
    const slugify = (s) => (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const boothQueueLink = boothForm.boothName ? `/booth/${slugify(boothForm.boothName)}/queue` : '';

    const handleCreateBooth = async (e) => {
        e.preventDefault();
        // minimal client validation
        if (!boothForm.boothName.trim()) { showToast('Booth Name is required', 'error'); return; }
        if (!boothForm.recruitersCount || boothForm.recruitersCount < 1) { showToast('Recruiters Count must be at least 1', 'error'); return; }
        if (boothForm.enableExpiry && !boothForm.expireLinkTime) { showToast('Expire Link Time is required when expiry is enabled', 'error'); return; }
        setBoothSaving(true);
        try {
            // TODO: POST to backend endpoint when available
            console.log('Create Booth payload', boothForm);
            showToast('Booth saved (local only). Wire API to persist.', 'success');
            // reset optionally
            // setBoothForm({ ...boothForm, boothName: '' });
        } catch (err) {
            showToast('Failed to save booth', 'error');
        } finally { setBoothSaving(false); }
    };



    const handleFieldChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setErrors(prev => ({ ...prev, [name]: '' }));
    };

    const validate = () => {
        const nextErrors = {};
        if (!formData.firstName.trim()) nextErrors.firstName = 'First name is required';
        if (!formData.lastName.trim()) nextErrors.lastName = 'Last name is required';
        if (!formData.country) nextErrors.country = 'Country is required';
        const phone = (formData.phone || '').trim();
        if (phone) {
            // Simple international phone validation: + and digits, 7-15 length
            const phoneOk = /^\+?[0-9\-\s()]{7,20}$/.test(phone);
            if (!phoneOk) nextErrors.phone = 'Enter a valid phone number';
        }
        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleUpdateSubmit = async (e) => {
        e.preventDefault();
        setSaveMessage('');
        setSaveError('');
        setSaving(true);
        if (!validate()) {
            setSaving(false);
            showToast('Please fix the highlighted fields', 'error');
            return;
        }
        const fullName = `${formData.firstName} ${formData.lastName}`.trim();
        try {
            // Always send current values so backend persists accessibility reliably
            const payload = {
                name: fullName || user?.name || '',
                state: formData.state || '',
                city: formData.city || '',
                country: formData.country || 'US',
                usesScreenMagnifier: !!accessibility.usesScreenMagnifier,
                usesScreenReader: !!accessibility.usesScreenReader,
                needsASL: !!accessibility.needsASL,
                needsCaptions: !!accessibility.needsCaptions,
                needsOther: !!accessibility.needsOther,
                subscribeAnnouncements: !!accessibility.subscribeAnnouncements
            };
            const phoneTrimmed = (formData.phone || '').trim();
            if (phoneTrimmed) {
                payload.phoneNumber = phoneTrimmed;
            }

            const result = await updateProfile(payload);
            if (result.success) {
                setSaveMessage('Account updated successfully.');
                showToast('Account updated successfully', 'success');
                // Sync form with latest user data from server
                const updated = result.user;
                setFormData(prev => ({
                    ...prev,
                    firstName: (updated?.name || '').split(' ')[0] || '',
                    lastName: (updated?.name || '').split(' ').slice(1).join(' ') || '',
                    email: updated?.email || prev.email,
                    phone: updated?.phoneNumber || '',
                    state: updated?.state || '',
                    city: updated?.city || '',
                    country: updated?.country || 'US'
                }));
                setAccessibility({
                    usesScreenMagnifier: updated?.usesScreenMagnifier || false,
                    usesScreenReader: updated?.usesScreenReader || false,
                    needsASL: updated?.needsASL || false,
                    needsCaptions: updated?.needsCaptions || false,
                    needsOther: updated?.needsOther || false,
                    subscribeAnnouncements: updated?.subscribeAnnouncements || false
                });
            } else {
                setSaveError(result.error || 'Failed to update account.');
                showToast(result.error || 'Failed to update account', 'error');
            }
        } catch (err) {
            setSaveError('Failed to update account.');
            showToast('Failed to update account', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Handle loading state
    if (loading) {
        return (
            <div className="dashboard-loading">
                <div className="loading-spinner">
                    <MdRefresh className="spinning" />
                </div>
                <p>Loading your dashboard...</p>
            </div>
        );
    }

    // Handle case where user is not authenticated
    if (!user) {
        navigate('/login');
        return null;
    }

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const getRoleDisplayName = (role) => {
        const roleNames = {
            'JobSeeker': 'JobSeeker',
            'Admin': 'Administrator',
            'AdminEvent': 'Event Administrator',
            'BoothAdmin': 'Booth Administrator',
            'Recruiter': 'Recruiter',
            'Interpreter': 'Interpreter',
            'GlobalInterpreter': 'Global Interpreter',
            'Support': 'Support Staff',
            'GlobalSupport': 'Global Support Staff'
        };
        return roleNames[role] || role;
    };

    const toggleSection = (section) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };


    const getDashboardContent = () => {
        switch (user?.role) {
            case 'Interpreter':
            case 'GlobalInterpreter':
                return <InterpreterDashboard />;
            case 'Support':
            case 'GlobalSupport':
                return (
                    <div className="dashboard-content support-dashboard">
                        <h2>Support Dashboard</h2>
                        <p className="support-subtitle">Welcome to your support workspace. Use team chat to collaborate with recruiters and interpreters.</p>
                        <div className="support-info-cards">
                            <div className="dashboard-card">
                                <h3>Team Communication</h3>
                                <p>Access team chat to communicate with recruiters and interpreters</p>
                                <div className="support-hint">Click the "Team Chat" button in the bottom right to open chat</div>
                            </div>
                            <div className="dashboard-card">
                                <h3>Active Support Sessions</h3>
                                <p>Monitor ongoing support requests and assist team members</p>
                            </div>
                            <div className="dashboard-card">
                                <h3>Quick Actions</h3>
                                <p>Manage booth operations and support recruitment activities</p>
                            </div>
                        </div>
                    </div>
                );
            case 'JobSeeker':
                if (activeSection === 'survey') {
                    return <SurveyForm />;
                }
                if (activeSection === 'edit-profile') {
                    return <EditProfileResume />;
                }
                if (activeSection === 'view-profile') {
                    return (
                        <ErrorBoundary>
                            <ViewProfile />
                        </ErrorBoundary>
                    );
                }
                if (activeSection === 'delete-account') {
                    return (
                        <div className="dashboard-content">
                            <h2>Delete My Account</h2>
                            <div className="alert-box" style={{ background: '#fff3cd', borderColor: '#ffeeba' }}>
                                <p><strong>Warning:</strong> Deleting your account will deactivate your access. This action cannot be undone.</p>
                            </div>
                            <DeleteAccountPanel onDeleted={() => { logout(); navigate('/'); }} />
                        </div>
                    );
                }
                return (
                    <div className="dashboard-content" style={{ paddingTop: '0.5rem', width: '100%', maxWidth: '100%', margin: 0 }}>
                        <div className="alert-box" style={{ marginBottom: '1rem', marginTop: 0 }}>
                            <p>• Welcome to your job seeker dashboard</p>
                        </div>

                        <MyAccountInline user={user} updateProfile={updateProfile} />
                    </div>
                );
            case 'Recruiter':
            case 'BoothAdmin': {
                const assignedBoothId = user?.assignedBooth;
                return (
                    <div className="dashboard-content">
                        <h2>Recruiter Dashboard</h2>
                        {!assignedBoothId && (
                            <div className="alert-box" style={{ background: '#fff3cd', borderColor: '#ffeeba' }}>
                                <p><strong>Action required:</strong> No booth is assigned to your account yet. Please ask an administrator to assign a booth so you can manage your meeting queue.</p>
                            </div>
                        )}
                        <div className="dashboard-cards">
                            <div className="dashboard-card">
                                <h3>Active Booths</h3>
                                <p>Manage your recruitment booths</p>
                                <button className="dashboard-button" onClick={() => navigate('/boothmanagement')}>View Booths</button>
                            </div>
                            <div className="dashboard-card">
                                <h3>Queue Management</h3>
                                <p>View and manage job seeker queues</p>
                                <button className="dashboard-button" disabled={!assignedBoothId} onClick={() => assignedBoothId && navigate(`/booth-queue/manage/${assignedBoothId}`)}>Manage Queue</button>
                            </div>
                            <div className="dashboard-card">
                                <h3>Interview Schedule</h3>
                                <p>Schedule and conduct interviews</p>
                                <button className="dashboard-button" onClick={() => navigate('/meetings')}>Schedule Interview</button>
                            </div>
                        </div>
                    </div>
                );
            }
            case 'Admin':
            case 'AdminEvent':
                return (
                    <div className="dashboard-content">
                        <h2>Administrator Dashboard</h2>
                        <div className="dashboard-cards">
                            <div className="dashboard-card">
                                <h3>Event Management</h3>
                                <p>Create and manage job fair events</p>
                                <button className="dashboard-button" onClick={() => navigate('/eventmanagement')}>Manage Events</button>
                            </div>
                            <div className="dashboard-card">
                                <h3>User Management</h3>
                                <p>Manage users and permissions</p>
                                <button className="dashboard-button" onClick={() => navigate('/usermanagement')}>Manage Users</button>
                            </div>
                            <div className="dashboard-card">
                                <h3>Job Seeker Management</h3>
                                <p>Manage job seekers and their profiles</p>
                                <button className="dashboard-button" onClick={() => navigate('/jobseekermanagement')}>Manage Job Seekers</button>
                            </div>
                            <div className="dashboard-card">
                                <h3>Analytics</h3>
                                <p>View platform analytics and reports</p>
                                <button className="dashboard-button" onClick={() => navigate('/analytics')}>View Analytics</button>
                            </div>
                        </div>
                    </div>
                );
            default:
                return (
                    <div className="dashboard-content">
                        <h2>Welcome to Your Dashboard</h2>
                        <p>Your role-specific dashboard content will be available soon.</p>
                    </div>
                );
        }
    };

    return (
        <div className="dashboard">
            {/* Accessible Skip Link */}
            <a
                href="#dashboard-main"
                className="skip-link"
                onClick={(e) => {
                    e.preventDefault();
                    const el = document.getElementById('dashboard-main');
                    if (el) {
                        el.focus();
                        el.scrollIntoView({ behavior: 'smooth' });
                    }
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        const el = document.getElementById('dashboard-main');
                        if (el) {
                            el.focus();
                            el.scrollIntoView({ behavior: 'smooth' });
                        }
                    }
                }}
            >
                Skip to main content
            </a>
            <AdminHeader 
                brandingLogo={event?.logoUrl || event?.logo || ''}
                secondaryLogo={booth?.logoUrl || booth?.companyLogo || ''}
            />

            <div className="dashboard-layout">
                {toast.visible && (
                    <div className={`toast ${toast.type}`} role="status" aria-live="polite">{toast.message}</div>
                )}
                <AdminSidebar active={(
                    user?.role === 'JobSeeker' ? (
                        activeSection === 'survey' ? 'survey' :
                            activeSection === 'delete-account' ? 'delete-account' :
                                activeSection === 'edit-profile' ? 'edit-profile' :
                                    activeSection === 'view-profile' ? 'view-profile' : 'my-account'
                    ) : (
                        activeSection === 'manage-booths' ? 'booths' :
                            activeSection === 'branding' ? 'branding' :
                                activeSection === 'jobseekers' ? 'jobseekers' :
                                    activeSection === 'analytics' ? 'analytics' :
                                        activeSection === 'users' ? 'users' : 'events'
                    )
                )} />

                <main id="dashboard-main" className="dashboard-main" tabIndex={-1} role="main" aria-label="Dashboard main content">
                    {(user?.role !== 'JobSeeker' && activeSection === 'branding') ? (
                        <div className="dashboard-content">
                            <h2>Branding – Header Logo</h2>
                            <div className="alert-box" style={{ background: '#f3f4f6', borderColor: '#e5e7eb', color: '#111827' }}>
                                <p>Upload a PNG, SVG, or JPG. The logo displays in the top-left. Recommended height ~28-36px.</p>
                            </div>
                            <div className="upload-card" style={{ maxWidth: 520 }}>
                                <h4>Current Logo</h4>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <img src={brandingLogo || DEFAULT_ICON} alt="Current header logo" style={{ height: 36, objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', padding: 6 }} />
                                    <button className="dashboard-button" style={{ width: 'auto' }} onClick={() => saveBrandingLogo(DEFAULT_ICON)}>Use Default Icon</button>
                                </div>
                                <div className="upload-actions" style={{ marginTop: '1rem' }}>
                                    <label className="dashboard-button" style={{ width: 'auto', cursor: 'pointer' }}>
                                        Choose Image
                                        <input type="file" accept="image/*" onChange={(e) => onPickLogoFile(e.target.files?.[0])} style={{ display: 'none' }} />
                                    </label>
                                </div>
                            </div>
                        </div>
                    ) : (user?.role !== 'JobSeeker' && activeSection === 'manage-booths') ? (
                        <div className="dashboard-content">
                            <h2>Booth Management</h2>
                            {boothMode === 'list' ? (
                                <>
                                    <div className="upload-actions" style={{ margin: '0 0 1rem 0', display: 'flex', gap: '0.5rem' }}>
                                        <button className="dashboard-button" style={{ width: 'auto' }} onClick={() => setBoothMode('create')}>Create Booth</button>
                                    </div>
                                    <GridComponent
                                        dataSource={booths}
                                        allowPaging={true}
                                        pageSettings={{ pageSize: 10 }}
                                        allowSorting={true}
                                        allowFiltering={true}
                                        filterSettings={{ type: 'Menu' }}
                                        showColumnMenu={true}
                                        showColumnChooser={true}
                                        allowResizing={true}
                                        allowReordering={true}
                                        toolbar={['Search', 'ColumnChooser']}
                                        selectionSettings={{ type: 'Multiple' }}
                                    >
                                        <ColumnsDirective>
                                            <ColumnDirective type='checkbox' width='40' />
                                            <ColumnDirective field='name' headerText='Booth Name' width='220' clipMode='EllipsisWithTooltip' />
                                            <ColumnDirective headerText='Logo' width='110' template={(props) => props.logo ? (<img src={props.logo} alt="logo" style={{ height: 28 }} />) : null} />
                                            <ColumnDirective field='recruitersCount' headerText='Recruiters' width='120' textAlign='Center' />
                                            <ColumnDirective field='events' headerText='Event Title' width='200' template={(p) => (p.events || []).join(', ')} />
                                            <ColumnDirective field='eventDate' headerText='Event Date' width='190' template={(p) => p.eventDate ? new Date(p.eventDate).toLocaleString() : ''} />
                                            <ColumnDirective field='customInviteText' headerText='Custom URL' width='200' />
                                            <ColumnDirective field='expireLinkTime' headerText='Expire Date' width='190' template={(p) => p.expireLinkTime ? new Date(p.expireLinkTime).toLocaleString() : ''} />
                                            <ColumnDirective headerText='Action' width='360' allowSorting={false} allowFiltering={false} template={(p) => (
                                                <div className='ajf-grid-actions'>
                                                    <button className='ajf-btn ajf-btn-dark'>Job Seekers Report</button>
                                                    <button className='ajf-btn ajf-btn-outline'>Placeholder</button>
                                                    <button className='ajf-btn ajf-btn-dark'>Invite Link</button>
                                                    <button className='ajf-btn ajf-btn-dark'>Edit</button>
                                                </div>
                                            )} />
                                        </ColumnsDirective>
                                        <GridInject services={[Page, Sort, Filter, GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu]} />
                                    </GridComponent>
                                </>
                            ) : (
                                <form className="account-form" onSubmit={handleCreateBooth} style={{ maxWidth: 720 }}>
                                    <div className="upload-actions" style={{ margin: '0 0 1rem 0' }}>
                                        <button type="button" className="dashboard-button" style={{ width: 'auto' }} onClick={() => setBoothMode('list')}>Back to List</button>
                                    </div>
                                    <div className="form-group">
                                        <label>Booth Name</label>
                                        <input type="text" value={boothForm.boothName} onChange={(e) => setBoothField('boothName', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Booth Logo</label>
                                        <div className="upload-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <label className="dashboard-button" style={{ width: 'auto', cursor: 'pointer' }}>
                                                Choose file
                                                <input type="file" accept="image/*" onChange={(e) => onPickBoothLogo(e.target.files?.[0])} style={{ display: 'none' }} />
                                            </label>
                                            {boothForm.boothLogo && <img src={boothForm.boothLogo} alt="Booth logo" style={{ height: 40, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', padding: 4 }} />}
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label>Waiting Area Content</label>
                                        <TabComponent heightAdjustMode="Auto">
                                            <TabItemsDirective>
                                                <TabItemDirective header={{ text: 'First Placeholder' }} content={() => (
                                                    <RTE value={boothForm.firstHtml} change={(e) => setBoothField('firstHtml', e?.value)}>
                                                        <RTEInject services={[HtmlEditor, RTEToolbar, QuickToolbar, RteLink, RteImage]} />
                                                    </RTE>
                                                )} />
                                                <TabItemDirective header={{ text: 'Second Placeholder' }} content={() => (
                                                    <RTE value={boothForm.secondHtml} change={(e) => setBoothField('secondHtml', e?.value)}>
                                                        <RTEInject services={[HtmlEditor, RTEToolbar, QuickToolbar, RteLink, RteImage]} />
                                                    </RTE>
                                                )} />
                                                <TabItemDirective header={{ text: 'Third Placeholder' }} content={() => (
                                                    <RTE value={boothForm.thirdHtml} change={(e) => setBoothField('thirdHtml', e?.value)}>
                                                        <RTEInject services={[HtmlEditor, RTEToolbar, QuickToolbar, RteLink, RteImage]} />
                                                    </RTE>
                                                )} />
                                            </TabItemsDirective>
                                        </TabComponent>
                                    </div>

                                    <div className="form-group">
                                        <label>Recruiters Count*</label>
                                        <input type="number" min="1" value={boothForm.recruitersCount} onChange={(e) => setBoothField('recruitersCount', Number(e.target.value))} />
                                        <span className="muted">Enter the maximum number of interviewers allowed for this booth.</span>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Event Date</label>
                                            <DateTimePickerComponent value={boothForm.eventDate ? new Date(boothForm.eventDate) : null} change={(e) => setBoothField('eventDate', e?.value ? new Date(e.value).toISOString() : '')} placeholder="Select date & time" />
                                        </div>
                                        <div className="form-group">
                                            <label>Select Event</label>
                                            <MultiSelectComponent className="ajf-input" placeholder="Choose your Event" value={boothForm.eventIds} change={(e) => setBoothField('eventIds', e?.value || [])} dataSource={[{ id: 'evt_demo_1', text: 'Event Demo test' }, { id: 'evt_demo_2', text: 'Demonstration' }]} fields={{ value: 'id', text: 'text' }} mode="Box" />
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label>Custom invite text</label>
                                        <input type="text" value={boothForm.customInviteText} onChange={(e) => setBoothField('customInviteText', e.target.value)} />
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Expire Link Time</label>
                                            <DateTimePickerComponent value={boothForm.expireLinkTime ? new Date(boothForm.expireLinkTime) : null} enabled={boothForm.enableExpiry} change={(e) => setBoothField('expireLinkTime', e?.value ? new Date(e.value).toISOString() : '')} placeholder="Select expiry" />
                                        </div>
                                        <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <label style={{ margin: 0 }}>Enable Expiry Link Time</label>
                                            <input type="checkbox" checked={boothForm.enableExpiry} onChange={(e) => setBoothField('enableExpiry', e.target.checked)} />
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label>Company Page</label>
                                        <input type="url" placeholder="https://example.com" value={boothForm.companyPage} onChange={(e) => setBoothField('companyPage', e.target.value)} />
                                    </div>

                                    <div className="form-group">
                                        <label>Job Seeker Queue Link</label>
                                        <input type="text" value={boothQueueLink} readOnly />
                                    </div>

                                    <button type="submit" className="dashboard-button" disabled={boothSaving}>{boothSaving ? 'Saving…' : 'Create Booth'}</button>
                                </form>
                            )}
                        </div>
                    ) : (
                        getDashboardContent()
                    )}
                </main>
            </div>

            {/* Mobile overlay */}
            <div className="mobile-overlay" aria-hidden="true" />
        </div>
    );
};

export default Dashboard;

// Inline component for delete confirmation
function DeleteAccountPanel({ onDeleted }) {
    const [confirm, setConfirm] = useState(false);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');

    const getToken = () => localStorage.getItem('token');

    const handleDelete = async () => {
        setWorking(true);
        setError('');
        try {
            const res = await fetch('/api/users/me', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${getToken()}`
                }
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Failed to delete account');
            }
            // Clear tokens client-side
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            if (typeof onDeleted === 'function') onDeleted();
        } catch (e) {
            setError(e.message || 'Failed to delete account');
        } finally {
            setWorking(false);
        }
    };

    return (
        <div className="delete-account-panel">
            <div className="delete-account-checkbox-container">
                {error && <div className="alert-box" style={{ background: '#ffe8e8', borderColor: '#f5c2c7' }}>{error}</div>}
                <p>Please confirm that you want to delete your account. This will deactivate your profile and sign you out.</p>
                <label className="checkbox-label">
                    <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
                    <span>I understand that this action cannot be undone.</span>
                </label>
                <button className="dashboard-button" disabled={!confirm || working} onClick={handleDelete}>
                    {working ? 'Deleting…' : 'Delete My Account'}
                </button>
            </div>
        </div>
    );
}
