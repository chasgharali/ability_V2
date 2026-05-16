import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { TabComponent, TabItemDirective, TabItemsDirective } from '@syncfusion/ej2-react-navigations';
import '../Dashboard/Dashboard.css';
import './JobSeekerQualifications.css';

const API_BASE = '/api/jobseeker-qualifications';

const JobSeekerQualifications = () => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const toastRef = useRef(null);
    const fetchInProgress = useRef(false);

    // Redirect if not authenticated or not authorized
    useEffect(() => {
        if (!loading) {
            if (!user) {
                navigate('/login', { replace: true });
            } else if (!['Admin', 'GlobalSupport'].includes(user.role)) {
                navigate('/dashboard', { replace: true });
            }
        }
    }, [user, loading, navigate]);

    const [loadingData, setLoadingData] = useState(true);
    const [events, setEvents] = useState([]);
    const [selectedEvent, setSelectedEvent] = useState('');
    const [pendingEvent, setPendingEvent] = useState('');
    const [report, setReport] = useState({
        totalJobSeekers: 0,
        sections: {}
    });

    // Syncfusion Toast
    const showToast = useCallback((message, type = 'Success', duration = 3000) => {
        if (toastRef.current) {
            toastRef.current.show({
                title: type,
                content: message,
                cssClass: `e-toast-${type.toLowerCase()}`,
                showProgressBar: true,
                timeOut: duration
            });
        }
    }, []);

    // Load report data
    const loadReport = useCallback(async (eventId = '') => {
        if (fetchInProgress.current) return;
        if (!user || !['Admin', 'GlobalSupport'].includes(user.role)) return;

        fetchInProgress.current = true;

        try {
            setLoadingData(true);
            const token = localStorage.getItem('token');
            const queryParams = eventId ? `?eventId=${eventId}` : '';
            
            const response = await fetch(`${API_BASE}/report${queryParams}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (!response.ok) {
                throw new Error('Failed to load report');
            }
            
            const data = await response.json();
            setReport(data);
        } catch (error) {
            console.error('Error loading qualifications report:', error);
            showToast(`Failed to load report: ${error.message}`, 'Error', 5000);
        } finally {
            fetchInProgress.current = false;
            setLoadingData(false);
        }
    }, [user, showToast]);

    // Load events
    useEffect(() => {
        const loadEvents = async () => {
            try {
                const token = localStorage.getItem('token');
                const response = await fetch(`${API_BASE}/events`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await response.json();
                setEvents(data.events || []);
            } catch (error) {
                console.error('Error loading events:', error);
            }
        };
        if (user) loadEvents();
    }, [user]);

    // Load report on initial mount
    useEffect(() => {
        if (!user || !['Admin', 'GlobalSupport'].includes(user.role)) return;
        loadReport();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    // Apply filter when "Go" button is clicked
    const handleApplyFilter = async () => {
        const newEvent = pendingEvent;
        setSelectedEvent(newEvent);
        await loadReport(newEvent);
    };

    // Clear filter
    const handleClearFilter = async () => {
        setPendingEvent('');
        setSelectedEvent('');
        await loadReport('');
    };

    // Render table for a section
    const renderSectionTable = (sectionKey) => {
        const section = report.sections?.[sectionKey];
        if (!section) return <div style={{ padding: '20px' }}>No data available</div>;

        const { title, data, totalResponses, totalUsers } = section;

        return (
            <div style={{ padding: '20px' }}>
                <h3 style={{ marginBottom: '16px' }}>Distribution of '{title}'</h3>
                <table className="qualifications-table">
                    <thead>
                        <tr>
                            <th>{title}</th>
                            <th style={{ textAlign: 'right' }}>Count</th>
                            <th style={{ textAlign: 'right' }}>% of Total Job Seekers</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data && data.length > 0 ? (
                            <>
                                {data.map((item, idx) => (
                                    <tr key={idx} className={idx % 2 === 0 ? '' : 'alt-row'}>
                                        <td>{item.name}</td>
                                        <td style={{ textAlign: 'right' }}>{item.count}</td>
                                        <td style={{ textAlign: 'right' }}>{item.percentage}%</td>
                                    </tr>
                                ))}
                                <tr className="total-row">
                                    <td>Total Responses</td>
                                    <td style={{ textAlign: 'right' }}>{totalResponses}</td>
                                    <td style={{ textAlign: 'right' }}>-</td>
                                </tr>
                            </>
                        ) : (
                            <tr>
                                <td colSpan="3" style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                                    No data available for this category
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
                <div style={{ marginTop: '12px', fontSize: '14px', color: '#6b7280' }}>
                    Total Job Seekers: {totalUsers}
                </div>
            </div>
        );
    };

    // Export CSV
    const handleExport = async () => {
        try {
            setLoadingData(true);
            const token = localStorage.getItem('token');
            const queryParams = selectedEvent ? `?eventId=${selectedEvent}` : '';
            
            const response = await fetch(`${API_BASE}/export/csv${queryParams}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (!response.ok) {
                throw new Error('Failed to export report');
            }
            
            // Get filename from response headers or use default
            const contentDisposition = response.headers.get('content-disposition');
            let filename = 'jobseeker-qualifications-report.csv';
            if (contentDisposition) {
                const matches = contentDisposition.match(/filename="?([^"]+)"?/);
                if (matches && matches[1]) {
                    filename = matches[1];
                }
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showToast('Report exported successfully', 'Success');
        } catch (error) {
            console.error('Export error:', error);
            showToast(`Failed to export: ${error.message}`, 'Error', 5000);
        } finally {
            setLoadingData(false);
        }
    };

    if (loading || !user) {
        return <div>Loading...</div>;
    }

    const eventOptions = [{ _id: '', name: 'All Events (Full Report)' }, ...events];

    // Define tab sections
    const tabSections = [
        { key: 'educationLevel', header: 'Highest Education' },
        { key: 'primaryExperience', header: 'Primary Job Functions' },
        { key: 'employmentTypes', header: 'Employment Types' },
        { key: 'workLevel', header: 'Experience Level' },
        { key: 'languages', header: 'Languages' },
        { key: 'veteranStatus', header: 'Veteran/Military Status' },
        { key: 'accessibilityNeeds', header: 'Accessibility Needs' }
    ];

    return (
        <div className="dashboard-container">
            <a href="#main-content" className="skip-link">Skip to main content</a>
            <AdminHeader />
            <div className="dashboard-layout">
                <AdminSidebar active="jobseeker-qualifications" />
                <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
                    <div className="dashboard-content">
                        <div className="jobseeker-qualifications-container">
                            {/* Page Header */}
                            <div className="page-header">
                                <h1>Job Seeker Qualifications Report</h1>
                                <p className="page-subtitle">
                                    View count and percentage statistics for job seeker qualifications
                                    {selectedEvent && events.find(e => e._id === selectedEvent) && (
                                        <span> - Filtered by: <strong>{events.find(e => e._id === selectedEvent)?.name}</strong></span>
                                    )}
                                </p>
                                <div className="header-actions">
                                    <ButtonComponent 
                                        cssClass="e-primary"
                                        onClick={handleExport}
                                        disabled={loadingData}
                                        aria-label="Export qualifications report to CSV"
                                    >
                                        {loadingData ? 'Exporting...' : 'Export Report CSV'}
                                    </ButtonComponent>
                                </div>
                            </div>

                            {/* Statistics Summary */}
                            <div className="stats-summary">
                                <div className="stat-card large">
                                    <h3>Total Job Seekers</h3>
                                    <div className="stat-value">{report.totalJobSeekers}</div>
                                    <p className="stat-description">
                                        {selectedEvent ? 'Registered for selected event' : 'In the system'}
                                    </p>
                                </div>
                            </div>

                            {/* Filters */}
                            <div className="filters-section">
                                <div className="filter-row">
                                    <div className="filter-field">
                                        <label>Filter by Event</label>
                                        <DropDownListComponent
                                            dataSource={eventOptions}
                                            fields={{ value: '_id', text: 'name' }}
                                            value={pendingEvent}
                                            change={(e) => setPendingEvent(e.value || '')}
                                            placeholder="Select Event"
                                            popupHeight="300px"
                                            width="100%"
                                        />
                                    </div>
                                    <div className="filter-actions">
                                        <ButtonComponent
                                            cssClass="e-primary"
                                            onClick={handleApplyFilter}
                                            disabled={loadingData}
                                            aria-label="Apply filter"
                                        >
                                            Go
                                        </ButtonComponent>
                                        <ButtonComponent
                                            cssClass="e-outline e-primary"
                                            onClick={handleClearFilter}
                                            disabled={loadingData}
                                            aria-label="Clear filter"
                                        >
                                            Clear
                                        </ButtonComponent>
                                    </div>
                                </div>
                            </div>

                            {/* Loading Overlay */}
                            {loadingData && (
                                <div className="loading-container">
                                    <div className="loading-spinner" aria-label="Loading report data" role="status" aria-live="polite"></div>
                                    <div className="loading-text">Loading report data...</div>
                                </div>
                            )}

                            {/* Tabs */}
                            {!loadingData && (
                                <div className="tabs-container">
                                    <TabComponent>
                                        <TabItemsDirective>
                                            {tabSections.map((section) => (
                                                <TabItemDirective
                                                    key={section.key}
                                                    header={{ text: section.header }}
                                                    content={() => renderSectionTable(section.key)}
                                                />
                                            ))}
                                        </TabItemsDirective>
                                    </TabComponent>
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>

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
};

export default JobSeekerQualifications;
