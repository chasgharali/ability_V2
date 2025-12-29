import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { jobSeekerSurveyAPI } from '../../services/jobSeekerSurvey';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { TabComponent, TabItemDirective, TabItemsDirective } from '@syncfusion/ej2-react-navigations';
import '../Dashboard/Dashboard.css';
import './JobSeekerSurvey.css';

const JobSeekerSurvey = () => {
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

    const [surveys, setSurveys] = useState([]);
    const [loadingData, setLoadingData] = useState(true);
    const [events, setEvents] = useState([]);
    const [booths, setBooths] = useState([]);
    const [selectedEvent, setSelectedEvent] = useState('');
    const [selectedBooth, setSelectedBooth] = useState('');
    const [pendingEvent, setPendingEvent] = useState('');
    const [pendingBooth, setPendingBooth] = useState('');
    const [stats, setStats] = useState({
        totalWithSurvey: 0,
        totalJobSeekers: 0,
        distinctRaces: 0,
        distinctGenders: 0,
        distinctAgeGroups: 0,
        distinctCountriesOfOrigin: 0
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

    // Load survey data
    const loadSurveys = useCallback(async () => {
        if (fetchInProgress.current) return;
        if (!user || !['Admin', 'GlobalSupport'].includes(user.role)) return;

        fetchInProgress.current = true;

        try {
            setLoadingData(true);
            const response = await jobSeekerSurveyAPI.getSurveys({ eventId: selectedEvent, boothId: selectedBooth });
            setSurveys(response.surveys || []);
            
            // Load stats
            try {
                const statsResponse = await jobSeekerSurveyAPI.getStats();
                setStats(statsResponse);
            } catch (error) {
                console.error('Error loading stats:', error);
            }
        } catch (error) {
            console.error('Error loading survey data:', error);
            showToast(`Failed to load survey data: ${error.message}`, 'Error', 5000);
        } finally {
            fetchInProgress.current = false;
            setLoadingData(false);
        }
    }, [user, selectedEvent, selectedBooth, showToast]);

    // Load events and booths
    useEffect(() => {
        const loadFilters = async () => {
            try {
                const [eventsRes, boothsRes] = await Promise.all([
                    fetch('/api/events', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
                    fetch('/api/booths', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
                ]);
                const eventsData = await eventsRes.json();
                const boothsData = await boothsRes.json();
                setEvents(eventsData.events || eventsData || []);
                setBooths(boothsData.booths || boothsData || []);
            } catch (error) {
                console.error('Error loading filters:', error);
            }
        };
        if (user) loadFilters();
    }, [user]);

    // Load surveys when filters change
    useEffect(() => {
        if (!user || !['Admin', 'GlobalSupport'].includes(user.role)) return;
        // Only load on initial mount
        loadSurveys();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    // Apply filters when "Go" button is clicked
    const handleApplyFilters = async () => {
        const newEvent = pendingEvent;
        const newBooth = pendingBooth;
        
        setSelectedEvent(newEvent);
        setSelectedBooth(newBooth);
        
        // Trigger reload with new filters
        if (user && ['Admin', 'GlobalSupport'].includes(user.role)) {
            if (fetchInProgress.current) return;
            fetchInProgress.current = true;

            try {
                setLoadingData(true);
                const response = await jobSeekerSurveyAPI.getSurveys({ eventId: newEvent, boothId: newBooth });
                setSurveys(response.surveys || []);
                
                // Load stats
                try {
                    const statsResponse = await jobSeekerSurveyAPI.getStats();
                    setStats(statsResponse);
                } catch (error) {
                    console.error('Error loading stats:', error);
                }
            } catch (error) {
                console.error('Error loading survey data:', error);
                showToast(`Failed to load survey data: ${error.message}`, 'Error', 5000);
            } finally {
                fetchInProgress.current = false;
                setLoadingData(false);
            }
        }
    };

    // Clear filters
    const handleClearFilters = async () => {
        setPendingEvent('');
        setPendingBooth('');
        setSelectedEvent('');
        setSelectedBooth('');
        
        if (user && ['Admin', 'GlobalSupport'].includes(user.role)) {
            if (fetchInProgress.current) return;
            fetchInProgress.current = true;

            try {
                setLoadingData(true);
                const response = await jobSeekerSurveyAPI.getSurveys({ eventId: '', boothId: '' });
                setSurveys(response.surveys || []);
                
                // Load stats
                try {
                    const statsResponse = await jobSeekerSurveyAPI.getStats();
                    setStats(statsResponse);
                } catch (error) {
                    console.error('Error loading stats:', error);
                }
            } catch (error) {
                console.error('Error loading survey data:', error);
                showToast(`Failed to load survey data: ${error.message}`, 'Error', 5000);
            } finally {
                fetchInProgress.current = false;
                setLoadingData(false);
            }
        }
    };

    // Calculate statistics for each field
    const calculateStats = (field) => {
        const counts = {};
        let total = 0;

        surveys.forEach(survey => {
            let value;
            // For 'country', check both survey.country and top-level country
            if (field === 'country') {
                value = survey.country || survey.survey?.country;
            } else {
                value = survey.survey?.[field];
            }
            
            if (field === 'race' && Array.isArray(value)) {
                value.forEach(v => {
                    if (v && v.trim()) {
                        counts[v] = (counts[v] || 0) + 1;
                        total++;
                    }
                });
            } else if (value && typeof value === 'string' && value.trim()) {
                counts[value] = (counts[value] || 0) + 1;
                total++;
            }
        });

        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        return { counts: sorted, total };
    };

    // Render table for a field
    const renderFieldTab = (field, title) => {
        const { counts, total } = calculateStats(field);

        return (
            <div style={{ padding: '20px' }}>
                <h3 style={{ marginBottom: '16px' }}>Distribution of '{title}'</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e5e7eb' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f3f4f6' }}>
                            <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #e5e7eb', fontWeight: 600 }}>{title}</th>
                            <th style={{ padding: '12px', textAlign: 'right', border: '1px solid #e5e7eb', fontWeight: 600 }}>Count of {title}</th>
                            <th style={{ padding: '12px', textAlign: 'right', border: '1px solid #e5e7eb', fontWeight: 600 }}>% of {title}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {counts.map(([name, count], idx) => (
                            <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                                <td style={{ padding: '10px 12px', border: '1px solid #e5e7eb' }}>{name}</td>
                                <td style={{ padding: '10px 12px', textAlign: 'right', border: '1px solid #e5e7eb' }}>{count}</td>
                                <td style={{ padding: '10px 12px', textAlign: 'right', border: '1px solid #e5e7eb' }}>
                                    {total > 0 ? ((count / total) * 100).toFixed(2) : 0}%
                                </td>
                            </tr>
                        ))}
                        <tr style={{ backgroundColor: '#f3f4f6', fontWeight: 600 }}>
                            <td style={{ padding: '10px 12px', border: '1px solid #e5e7eb' }}>Grand Total</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', border: '1px solid #e5e7eb' }}>{total}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', border: '1px solid #e5e7eb' }}>100.00%</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    };

    // Export CSV
    const handleExport = async () => {
        try {
            setLoadingData(true);
            
            // Use the same data that's displayed on screen
            if (!surveys || surveys.length === 0) {
                showToast('No data to export', 'Warning', 3000);
                return;
            }

            // Helper function to calculate stats for a field (same as frontend)
            const calculateStats = (field) => {
                const counts = {};
                let total = 0;

                surveys.forEach(survey => {
                    let value;
                    if (field === 'country') {
                        value = survey.country || survey.survey?.country;
                    } else {
                        value = survey.survey?.[field];
                    }
                    
                    if (field === 'race' && Array.isArray(value)) {
                        value.forEach(v => {
                            if (v && v.trim()) {
                                counts[v] = (counts[v] || 0) + 1;
                                total++;
                            }
                        });
                    } else if (value && typeof value === 'string' && value.trim()) {
                        counts[value] = (counts[value] || 0) + 1;
                        total++;
                    }
                });

                const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                return { counts: sorted, total };
            };

            // Helper function to escape CSV fields
            const escapeCSV = (value) => {
                if (value === null || value === undefined || value === '') {
                    return '';
                }
                const stringValue = String(value);
                if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
                    return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
            };

            // Build CSV sections
            const sections = [
                { field: 'countryOfOrigin', title: 'Country of Origin' },
                { field: 'country', title: 'Country' },
                { field: 'race', title: 'Race' },
                { field: 'genderIdentity', title: 'Gender' },
                { field: 'ageGroup', title: 'Age Group' }
            ];

            const csvLines = [];
            
            sections.forEach((section, idx) => {
                const { counts, total } = calculateStats(section.field);
                
                // Add section header
                if (idx > 0) csvLines.push(''); // Empty line between sections
                csvLines.push(`Distribution of '${section.title}'`);
                csvLines.push(`${section.title},Count of ${section.title},% of ${section.title}`);
                
                // Add data rows
                counts.forEach(([name, count]) => {
                    const percentage = total > 0 ? ((count / total) * 100).toFixed(2) : 0;
                    csvLines.push(`${escapeCSV(name)},${count},${percentage}%`);
                });
                
                // Add grand total
                csvLines.push(`Grand Total,${total},100.00%`);
            });

            // Build CSV content
            const csvContent = csvLines.join('\r\n');
            
            // Add BOM for Excel compatibility
            const BOM = '\uFEFF';
            const finalContent = BOM + csvContent;

            // Create and download file
            const blob = new Blob([finalContent], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `job-seeker-survey-data-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showToast('Survey data exported successfully', 'Success');
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

    const eventOptions = [{ _id: '', name: 'All Events' }, ...events];
    const boothOptions = [{ _id: '', name: 'All Booths' }, ...(pendingEvent ? booths.filter(b => b.eventId === pendingEvent) : booths)];

    return (
        <div className="dashboard-container">
            <AdminHeader />
            <div className="dashboard-layout">
                <AdminSidebar active="jobseeker-survey" />
                <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
                    <div className="dashboard-content">
                        <div className="jobseeker-survey-container">
                            {/* Page Header */}
                            <div className="page-header">
                                <h1>Job Seeker Survey Data</h1>
                                <div className="header-actions" style={{ marginTop: '1rem', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                    <ButtonComponent 
                                        cssClass="e-primary"
                                        onClick={handleExport}
                                        disabled={loadingData}
                                        aria-label="Export survey data to CSV"
                                    >
                                        {loadingData ? 'Exporting...' : 'Export Survey Report'}
                                    </ButtonComponent>
                                </div>
                            </div>

                            {/* Statistics Cards */}
                            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px', paddingLeft: '20px', paddingRight: '20px' }}>
                                <div className="stat-card" style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                    <h3 style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Total with Survey</h3>
                                    <div className="stat-value" style={{ fontSize: '32px', fontWeight: 600, color: '#111827' }}>{stats.totalWithSurvey}</div>
                                </div>
                                <div className="stat-card" style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                    <h3 style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Total Job Seekers</h3>
                                    <div className="stat-value" style={{ fontSize: '32px', fontWeight: 600, color: '#111827' }}>{stats.totalJobSeekers}</div>
                                </div>
                                <div className="stat-card" style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                    <h3 style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Distinct Races</h3>
                                    <div className="stat-value" style={{ fontSize: '32px', fontWeight: 600, color: '#111827' }}>{stats.distinctRaces}</div>
                                </div>
                                <div className="stat-card" style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                    <h3 style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Distinct Genders</h3>
                                    <div className="stat-value" style={{ fontSize: '32px', fontWeight: 600, color: '#111827' }}>{stats.distinctGenders}</div>
                                </div>
                                <div className="stat-card" style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                    <h3 style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Distinct Age Groups</h3>
                                    <div className="stat-value" style={{ fontSize: '32px', fontWeight: 600, color: '#111827' }}>{stats.distinctAgeGroups}</div>
                                </div>
                                <div className="stat-card" style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                    <h3 style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Distinct Countries</h3>
                                    <div className="stat-value" style={{ fontSize: '32px', fontWeight: 600, color: '#111827' }}>{stats.distinctCountriesOfOrigin}</div>
                                </div>
                            </div>

                            {/* Filters */}
                            <div style={{ marginBottom: 24, paddingLeft: '20px', paddingRight: '20px', display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                                <div style={{ width: '250px' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Event</label>
                                    <DropDownListComponent
                                        dataSource={eventOptions}
                                        fields={{ value: '_id', text: 'name' }}
                                        value={pendingEvent}
                                        change={(e) => {
                                            setPendingEvent(e.value || '');
                                            setPendingBooth('');
                                        }}
                                        placeholder="Select Event"
                                        popupHeight="300px"
                                        width="100%"
                                    />
                                </div>
                                <div style={{ width: '250px' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Booth</label>
                                    <DropDownListComponent
                                        dataSource={boothOptions}
                                        fields={{ value: '_id', text: 'name' }}
                                        value={pendingBooth}
                                        change={(e) => setPendingBooth(e.value || '')}
                                        placeholder="Select Booth"
                                        popupHeight="300px"
                                        width="100%"
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <ButtonComponent
                                        cssClass="e-primary"
                                        onClick={handleApplyFilters}
                                        disabled={loadingData}
                                        aria-label="Apply filters"
                                        style={{ minWidth: '80px', height: '44px' }}
                                    >
                                        Go
                                    </ButtonComponent>
                                    <ButtonComponent
                                        cssClass="e-outline e-primary"
                                        onClick={handleClearFilters}
                                        disabled={loadingData}
                                        aria-label="Clear filters"
                                        style={{ minWidth: '80px', height: '44px' }}
                                    >
                                        Clear
                                    </ButtonComponent>
                                </div>
                            </div>

                            {/* Loading Overlay */}
                            {loadingData && (
                                <div style={{ textAlign: 'center', padding: '40px' }}>
                                    <div className="jsi-loading-spinner" aria-label="Loading survey data" role="status" aria-live="polite"></div>
                                    <div className="jsi-loading-text">Loading survey data...</div>
                                </div>
                            )}

                            {/* Tabs */}
                            {!loadingData && (
                                <TabComponent>
                                    <TabItemsDirective>
                                        <TabItemDirective header={{ text: 'Country of Origin' }} content={() => renderFieldTab('countryOfOrigin', 'CountryOfOrigin')} />
                                        <TabItemDirective header={{ text: 'Country' }} content={() => renderFieldTab('country', 'Country')} />
                                        <TabItemDirective header={{ text: 'Race' }} content={() => renderFieldTab('race', 'Race')} />
                                        <TabItemDirective header={{ text: 'Gender' }} content={() => renderFieldTab('genderIdentity', 'Gender')} />
                                        <TabItemDirective header={{ text: 'Age Group' }} content={() => renderFieldTab('ageGroup', 'AgeGroup')} />
                                    </TabItemsDirective>
                                </TabComponent>
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

export default JobSeekerSurvey;
