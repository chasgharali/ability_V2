import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../Dashboard/Dashboard.css';
import './MeetingRecords.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import DataGrid from '../UI/DataGrid';
import { Select, DateTimePicker } from '../UI/FormComponents';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';
import { meetingRecordsAPI } from '../../services/meetingRecords';
import { listUsers } from '../../services/users';
import { listEvents } from '../../services/events';
import { useRecruiterBooth } from '../../hooks/useRecruiterBooth';

export default function MeetingRecords() {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const { booth, event } = useRecruiterBooth();
    
    useEffect(() => {
        if (!loading) {
            if (!user) {
                navigate('/login', { replace: true });
            } else if (!['Admin', 'GlobalSupport', 'Recruiter'].includes(user.role)) {
                navigate('/dashboard', { replace: true });
            }
        }
    }, [user, loading, navigate]);

    const [meetingRecords, setMeetingRecords] = useState([]);
    const [recruiters, setRecruiters] = useState([]);
    const [events, setEvents] = useState([]);
    const [loadingData, setLoadingData] = useState(true);
    const toast = useToast();
    const [filtersExpanded, setFiltersExpanded] = useState(false);
    const [selectedRecords, setSelectedRecords] = useState([]);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectAllPages, setSelectAllPages] = useState(false);
    const [allRecordIds, setAllRecordIds] = useState([]);

    // Filters
    const [filters, setFilters] = useState({
        recruiterId: '',
        eventId: '',
        status: '',
        startDate: '',
        endDate: '',
        page: 1,
        limit: 10,
        sortBy: 'startTime',
        sortOrder: 'desc'
    });

    // Pagination
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        totalRecords: 0,
        hasNext: false,
        hasPrev: false
    });

    // Statistics
    const [stats, setStats] = useState({
        totalMeetings: 0,
        completedMeetings: 0,
        averageDuration: 0,
        averageRating: 0,
        totalWithRating: 0,
        totalWithInterpreter: 0
    });

    const showToast = (message, type = 'info') => {
        toast.show(message, { type, duration: 3000 });
    };

    const loadMeetingRecords = useCallback(async () => {
        try {
            setLoadingData(true);
            const response = await meetingRecordsAPI.getMeetingRecords(filters);
            setMeetingRecords(response.meetingRecords);
            setPagination(response.pagination);
            // Reset select all pages when data changes
            setSelectAllPages(false);
        } catch (error) {
            console.error('Error loading meeting records:', error);
            showToast('Failed to load meeting records', 'error');
        } finally {
            setLoadingData(false);
        }
    }, [filters]);

    const loadStats = useCallback(async () => {
        try {
            const statsData = await meetingRecordsAPI.getStats(filters);
            setStats(statsData);
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }, [filters]);

    const loadRecruiters = useCallback(async () => {
        try {
            if (['Admin', 'GlobalSupport'].includes(user?.role)) {
                const response = await listUsers({ role: 'Recruiter', limit: 1000 });
                setRecruiters(response.users || []);
            }
        } catch (error) {
            console.error('Error loading recruiters:', error);
        }
    }, [user?.role]);

    const loadEvents = useCallback(async () => {
        try {
            const response = await listEvents({ limit: 1000 });
            setEvents(response.events || []);
        } catch (error) {
            console.error('Error loading events:', error);
        }
    }, []);

    useEffect(() => {
        if (user) {
            loadMeetingRecords();
            loadStats();
            loadRecruiters();
            loadEvents();
        }
    }, [user, filters, loadMeetingRecords, loadStats, loadRecruiters, loadEvents]);

    const handleFilterChange = (field, value) => {
        setFilters(prev => ({
            ...prev,
            [field]: value,
            page: 1 // Reset to first page when filters change
        }));
    };

    const handlePageChange = (page) => {
        setFilters(prev => ({ ...prev, page }));
    };

    const handleExport = async () => {
        try {
            const blob = await meetingRecordsAPI.exportCSV(filters);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'meeting-records.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            showToast('Meeting records exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting meeting records:', error);
            showToast('Failed to export meeting records', 'error');
        }
    };

    const clearFilters = () => {
        setFilters({
            recruiterId: '',
            eventId: '',
            status: '',
            startDate: '',
            endDate: '',
            page: 1,
            limit: 10,
            sortBy: 'startTime',
            sortOrder: 'desc'
        });
    };

    const formatDuration = (minutes) => {
        if (!minutes || minutes === 0 || isNaN(minutes)) return 'N/A';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}m`;
    };

    const formatDateTime = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString();
    };

    const renderStars = (rating) => {
        if (!rating) return 'No rating';
        return '★'.repeat(rating) + '☆'.repeat(5 - rating);
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            // Select all on current page
            setSelectedRecords(meetingRecords.map(r => r._id));
        } else {
            // Deselect all
            setSelectedRecords([]);
            setSelectAllPages(false);
        }
    };

    const handleSelectAllPages = async () => {
        try {
            // Fetch all record IDs (without pagination)
            const allFilters = { ...filters, page: 1, limit: 99999 };
            const response = await meetingRecordsAPI.getMeetingRecords(allFilters);
            const allIds = response.meetingRecords.map(r => r._id);
            setAllRecordIds(allIds);
            setSelectedRecords(allIds);
            setSelectAllPages(true);
            showToast(`Selected all ${allIds.length} records across all pages`, 'info');
        } catch (error) {
            console.error('Error fetching all records:', error);
            showToast('Failed to select all records', 'error');
        }
    };

    const handleSelectRecord = (recordId) => {
        setSelectedRecords(prev => {
            if (prev.includes(recordId)) {
                return prev.filter(id => id !== recordId);
            } else {
                return [...prev, recordId];
            }
        });
    };

    const handleBulkDelete = async () => {
        if (selectedRecords.length === 0) {
            showToast('Please select records to delete', 'warning');
            return;
        }

        const confirmMsg = `Are you sure you want to delete ${selectedRecords.length} meeting record(s)? This action cannot be undone.`;
        if (!window.confirm(confirmMsg)) {
            return;
        }

        try {
            setIsDeleting(true);
            const response = await meetingRecordsAPI.bulkDelete(selectedRecords);
            showToast(response.message || 'Records deleted successfully', 'success');
            setSelectedRecords([]);
            await loadMeetingRecords();
            await loadStats();
        } catch (error) {
            console.error('Error deleting records:', error);
            showToast(error.response?.data?.message || 'Failed to delete records', 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const columns = [
        // Checkbox column for Admin/GlobalSupport only
        ...(['Admin', 'GlobalSupport'].includes(user?.role) ? [{
            label: (
                <input
                    type="checkbox"
                    checked={selectedRecords.length === meetingRecords.length && meetingRecords.length > 0}
                    onChange={handleSelectAll}
                    aria-label="Select all records"
                />
            ),
            render: (row) => (
                <input
                    type="checkbox"
                    checked={selectedRecords.includes(row._id)}
                    onChange={() => handleSelectRecord(row._id)}
                    aria-label={`Select record for ${row.jobseekerId?.name || 'Unknown'}`}
                />
            )
        }] : []),
        {
            label: 'Event',
            render: (row) => row.eventId?.name || 'N/A'
        },
        {
            label: 'Booth',
            render: (row) => row.boothId?.name || 'N/A'
        },
        {
            label: 'Recruiter',
            render: (row) => row.recruiterId?.name || 'N/A'
        },
        {
            label: 'Job Seeker',
            render: (row) => row.jobseekerId?.name || 'N/A'
        },
        {
            label: 'Location',
            render: (row) => {
                const jobSeeker = row.jobseekerId;
                if (jobSeeker?.city && jobSeeker?.state) {
                    return `${jobSeeker.city}, ${jobSeeker.state}`;
                }
                return 'N/A';
            }
        },
        {
            label: 'Start Time',
            render: (row) => formatDateTime(row.startTime)
        },
        {
            label: 'Duration',
            render: (row) => formatDuration(row.duration)
        },
        {
            label: 'Status',
            render: (row) => {
                const statusLabels = {
                    'scheduled': 'Scheduled',
                    'active': 'Active',
                    'completed': 'Completed',
                    'cancelled': 'Cancelled',
                    'failed': 'Failed',
                    'left_with_message': 'Left Message'
                };
                return (
                    <span className={`status-badge status-${row.status}`}>
                        {statusLabels[row.status] || row.status}
                    </span>
                );
            }
        },
        {
            label: 'Rating',
            render: (row) => (
                <div className="rating-display">
                    <span className="stars">{renderStars(row.recruiterRating)}</span>
                    {row.recruiterRating && (
                        <span className="rating-number">({row.recruiterRating}/5)</span>
                    )}
                </div>
            )
        },
        {
            label: 'Messages',
            render: (row) => row.jobSeekerMessages?.length || 0
        },
        {
            label: 'Interpreter',
            render: (row) => row.interpreterId?.name || 'None'
        },
        {
            label: 'Actions',
            render: (row) => (
                <div className="action-buttons">
                    <button 
                        className="btn-view"
                        onClick={() => navigate(`/meeting-records/${row._id}`)}
                    >
                        View Details
                    </button>
                </div>
            )
        }
    ];

    if (loading || !user) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
            </div>
        );
    }

    return (
        <div className="dashboard">
            <AdminHeader 
                brandingLogo={event?.logoUrl || event?.logo || ''}
                secondaryLogo={booth?.logoUrl || booth?.companyLogo || ''}
            />
            <div className="dashboard-layout">
                <AdminSidebar active="meeting-records" />
                <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
                    <div className="dashboard-content">
                        <div className="meeting-records-container">
                        <div className="page-header">
                            <h1>Meeting Records</h1>
                            <div className="header-actions">
                                {['Admin', 'GlobalSupport'].includes(user?.role) && selectedRecords.length > 0 && (
                                    <button 
                                        className="btn-delete-selected"
                                        onClick={handleBulkDelete}
                                        disabled={isDeleting}
                                        style={{
                                            background: '#dc3545',
                                            color: 'white',
                                            padding: '10px 20px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            cursor: isDeleting ? 'not-allowed' : 'pointer',
                                            fontWeight: '600',
                                            marginRight: '10px',
                                            opacity: isDeleting ? 0.6 : 1
                                        }}
                                    >
                                        {isDeleting ? 'Deleting...' : `Delete Selected (${selectedRecords.length})`}
                                    </button>
                                )}
                                <button 
                                    className="btn-export"
                                    onClick={handleExport}
                                    disabled={loadingData}
                                >
                                    Export CSV
                                </button>
                            </div>
                        </div>

                        {/* Statistics Cards */}
                        <div className="stats-grid">
                            <div className="stat-card">
                                <h3>Total Meetings</h3>
                                <div className="stat-value">{stats.totalMeetings}</div>
                            </div>
                            <div className="stat-card">
                                <h3>Completed</h3>
                                <div className="stat-value">{stats.completedMeetings}</div>
                            </div>
                            <div className="stat-card">
                                <h3>Avg Duration</h3>
                                <div className="stat-value">{formatDuration(Math.round(stats.averageDuration))}</div>
                            </div>
                            <div className="stat-card">
                                <h3>Avg Rating</h3>
                                <div className="stat-value">
                                    {stats.averageRating ? `${stats.averageRating.toFixed(1)}/5` : 'N/A'}
                                </div>
                            </div>
                        </div>

                        {/* Filters */}
                        <div className="filters-section">
                            <div 
                                className="filters-header" 
                                onClick={() => setFiltersExpanded(!filtersExpanded)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setFiltersExpanded(!filtersExpanded);
                                    }
                                }}
                                role="button"
                                tabIndex={0}
                                aria-expanded={filtersExpanded}
                                aria-controls="filters-content"
                            >
                                <h3>
                                    Filters
                                    {(filters.recruiterId || filters.eventId || filters.status || filters.startDate || filters.endDate) && (
                                        <span className="active-filters-indicator">●</span>
                                    )}
                                </h3>
                                <span className={`filter-toggle ${filtersExpanded ? 'expanded' : ''}`}>
                                    {filtersExpanded ? '▼' : '▶'}
                                </span>
                            </div>
                            {filtersExpanded && (
                                <div id="filters-content" className="filters-grid">
                                {['Admin', 'GlobalSupport'].includes(user.role) && (
                                    <Select
                                        label="Recruiter"
                                        value={filters.recruiterId}
                                        onChange={(e) => handleFilterChange('recruiterId', e.target.value)}
                                        options={[
                                            { value: '', label: 'All Recruiters' },
                                            ...recruiters.map(r => ({ value: r._id, label: r.name }))
                                        ]}
                                    />
                                )}
                                <Select
                                    label="Event"
                                    value={filters.eventId}
                                    onChange={(e) => handleFilterChange('eventId', e.target.value)}
                                    options={[
                                        { value: '', label: 'All Events' },
                                        ...events.map(e => ({ value: e._id, label: e.name }))
                                    ]}
                                />
                                <Select
                                    label="Status"
                                    value={filters.status}
                                    onChange={(e) => handleFilterChange('status', e.target.value)}
                                    options={[
                                        { value: '', label: 'All Statuses' },
                                        { value: 'scheduled', label: 'Scheduled' },
                                        { value: 'active', label: 'Active' },
                                        { value: 'completed', label: 'Completed' },
                                        { value: 'cancelled', label: 'Cancelled' },
                                        { value: 'failed', label: 'Failed' },
                                        { value: 'left_with_message', label: 'Left Message' }
                                    ]}
                                />
                                <DateTimePicker
                                    label="Start Date"
                                    value={filters.startDate}
                                    onChange={(value) => handleFilterChange('startDate', value)}
                                />
                                <DateTimePicker
                                    label="End Date"
                                    value={filters.endDate}
                                    onChange={(value) => handleFilterChange('endDate', value)}
                                />
                                <div className="filter-actions">
                                    <button 
                                        className="btn-clear-filters"
                                        onClick={clearFilters}
                                    >
                                        Clear Filters
                                    </button>
                                </div>
                            </div>
                            )}
                        </div>

                        {/* Select All Pages Banner */}
                        {selectedRecords.length === meetingRecords.length && meetingRecords.length > 0 && !selectAllPages && pagination.totalRecords > meetingRecords.length && (
                            <div style={{
                                background: '#e3f2fd',
                                padding: '12px 20px',
                                borderRadius: '8px',
                                marginBottom: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                border: '1px solid #90caf9'
                            }}>
                                <span style={{ color: '#1565c0', fontWeight: '500' }}>
                                    All {meetingRecords.length} records on this page are selected.
                                </span>
                                <button
                                    onClick={handleSelectAllPages}
                                    style={{
                                        background: '#1976d2',
                                        color: 'white',
                                        border: 'none',
                                        padding: '8px 16px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: '600',
                                        fontSize: '14px'
                                    }}
                                >
                                    Select all {pagination.totalRecords} records
                                </button>
                            </div>
                        )}

                        {selectAllPages && (
                            <div style={{
                                background: '#c8e6c9',
                                padding: '12px 20px',
                                borderRadius: '8px',
                                marginBottom: '16px',
                                border: '1px solid #81c784'
                            }}>
                                <span style={{ color: '#2e7d32', fontWeight: '600' }}>
                                    ✓ All {selectedRecords.length} records across all pages are selected.
                                </span>
                            </div>
                        )}

                        {/* Data Grid */}
                        <div className="data-grid-container">
                            <DataGrid
                                columns={columns}
                                data={meetingRecords}
                                loading={loadingData}
                                emptyMessage="No meeting records found"
                                selectable={false}
                            />
                            
                            {/* Pagination Footer */}
                            {pagination.totalPages > 1 && (
                                <div className="table-footer-pagination">
                                    <div className="pagination-info">
                                        Showing {((pagination.currentPage - 1) * filters.limit) + 1} to {Math.min(pagination.currentPage * filters.limit, pagination.totalRecords)} of {pagination.totalRecords} rows
                                    </div>
                                    <div className="pagination-controls">
                                        <button
                                            className="pagination-btn"
                                            disabled={!pagination.hasPrev}
                                            onClick={() => handlePageChange(pagination.currentPage - 1)}
                                            aria-label="Previous page"
                                        >
                                            Previous
                                        </button>
                                        <span className="pagination-page-info">
                                            Page {pagination.currentPage} of {pagination.totalPages}
                                        </span>
                                        <button
                                            className="pagination-btn"
                                            disabled={!pagination.hasNext}
                                            onClick={() => handlePageChange(pagination.currentPage + 1)}
                                            aria-label="Next page"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        </div>
                    </div>
                </main>
            </div>

        </div>
    );
}
