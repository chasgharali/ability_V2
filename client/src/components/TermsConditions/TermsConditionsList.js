import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import DataGrid from '../UI/DataGrid';
import { termsConditionsAPI } from '../../services/termsConditions';
import { MdAdd, MdEdit, MdDelete, MdVisibility, MdCheckCircle, MdCancel } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import './TermsConditions.css';

const TermsConditionsList = () => {
    const [terms, setTerms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedRows, setSelectedRows] = useState([]);
    const navigate = useNavigate();
    const { user } = useAuth();

    // Fetch terms and conditions
    const fetchTerms = async () => {
        try {
            setLoading(true);
            const data = await termsConditionsAPI.getAll();
            setTerms(data.terms || []);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to fetch terms and conditions');
            console.error('Error fetching terms:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTerms();
    }, []);

    // Handle delete terms
    const handleDelete = async (termId) => {
        if (!window.confirm('Are you sure you want to delete this terms and conditions?')) {
            return;
        }

        try {
            await termsConditionsAPI.delete(termId);
            // Refresh the list
            await fetchTerms();
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to delete terms and conditions');
            console.error('Error deleting terms:', err);
        }
    };

    // Handle activate/deactivate terms
    const handleToggleActive = async (termId, isActive) => {
        try {
            if (isActive) {
                await termsConditionsAPI.deactivate(termId);
            } else {
                await termsConditionsAPI.activate(termId);
            }
            // Refresh the list
            await fetchTerms();
        } catch (err) {
            setError(err.response?.data?.message || err.message || `Failed to ${isActive ? 'deactivate' : 'activate'} terms and conditions`);
            console.error(`Error ${isActive ? 'deactivating' : 'activating'} terms:`, err);
        }
    };

    // DataGrid columns configuration
    const columns = [
        {
            key: 'title',
            label: 'Title',
            render: (row) => (
                <div className="terms-title-cell">
                    <strong>{row.title}</strong>
                    {row.isActive && <span className="active-badge">Active</span>}
                </div>
            )
        },
        {
            key: 'version',
            label: 'Version'
        },
        {
            key: 'contentPreview',
            label: 'Preview',
            render: (row) => (
                <div className="terms-preview">
                    {row.contentPreview || 'No preview available'}
                </div>
            )
        },
        {
            key: 'usage',
            label: 'Usage',
            render: (row) => (
                <div className="terms-usage">
                    <div>Events: {row.usage?.totalEvents || 0}</div>
                    {row.usage?.lastUsed && (
                        <div className="last-used">
                            Last used: {new Date(row.usage.lastUsed).toLocaleDateString()}
                        </div>
                    )}
                </div>
            )
        },
        {
            key: 'createdAt',
            label: 'Created',
            render: (row) => new Date(row.createdAt).toLocaleDateString()
        },
        {
            key: 'actions',
            label: 'Actions',
            render: (row) => (
                <div className="terms-actions">
                    <button
                        className="action-btn view-btn"
                        onClick={() => navigate(`/terms-conditions/${row._id}`)}
                        title="View Details"
                        aria-label={`View details for ${row.title}`}
                    >
                        <MdVisibility />
                    </button>
                    {['Admin', 'AdminEvent'].includes(user?.role) && (
                        <>
                            <button
                                className="action-btn edit-btn"
                                onClick={() => navigate(`/terms-conditions/${row._id}/edit`)}
                                title="Edit"
                                aria-label={`Edit ${row.title}`}
                            >
                                <MdEdit />
                            </button>
                            <button
                                className="action-btn toggle-btn"
                                onClick={() => handleToggleActive(row._id, row.isActive)}
                                title={row.isActive ? 'Deactivate' : 'Activate'}
                                aria-label={`${row.isActive ? 'Deactivate' : 'Activate'} ${row.title}`}
                            >
                                {row.isActive ? <MdCancel /> : <MdCheckCircle />}
                            </button>
                            {!row.isActive && (
                                <button
                                    className="action-btn delete-btn"
                                    onClick={() => handleDelete(row._id)}
                                    title="Delete"
                                    aria-label={`Delete ${row.title}`}
                                >
                                    <MdDelete />
                                </button>
                            )}
                        </>
                    )}
                </div>
            )
        }
    ];

    if (loading) {
        return (
            <div className="dashboard">
                <AdminHeader />
                <div className="dashboard-layout">
                    <AdminSidebar active="terms-conditions" />
                    <main id="dashboard-main" className="dashboard-main">
                        <div className="loading">Loading terms and conditions...</div>
                    </main>
                </div>
                <div className="mobile-overlay" aria-hidden="true" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="dashboard">
                <AdminHeader />
                <div className="dashboard-layout">
                    <AdminSidebar active="terms-conditions" />
                    <main id="dashboard-main" className="dashboard-main">
                        <div className="error">
                            <h3>Error</h3>
                            <p>{error}</p>
                            <button onClick={fetchTerms} className="dashboard-button" style={{ width: 'auto' }}>Retry</button>
                        </div>
                    </main>
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
                        <h2>Terms & Conditions Management</h2>
                        <div className="bm-header-actions">
                            {['Admin', 'AdminEvent'].includes(user?.role) && (
                                <button
                                    onClick={() => navigate('/terms-conditions/create')}
                                    className="dashboard-button"
                                    aria-label="Create new terms and conditions"
                                    style={{ width: 'auto' }}
                                >
                                    <MdAdd />
                                    Create New Terms
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="dashboard-content-area">
                        <DataGrid
                            data={terms}
                            columns={columns}
                            onRowSelect={setSelectedRows}
                            onRowClick={(row) => navigate(`/terms-conditions/${row._id}`)}
                            searchable={true}
                            sortable={true}
                            selectable={false}
                            aria-label="Terms and conditions list"
                        />
                        {terms.length === 0 && (
                            <div className="muted" style={{ marginTop: '0.75rem' }}>
                                No terms and conditions have been created yet.
                            </div>
                        )}
                    </div>

                    {selectedRows.length > 0 && (
                        <div className="bulk-actions">
                            <p>{selectedRows.length} item(s) selected</p>
                            <button
                                onClick={() => {
                                    console.log('Bulk actions for:', selectedRows);
                                }}
                                className="dashboard-button"
                                style={{ width: 'auto' }}
                            >
                                Bulk Actions
                            </button>
                        </div>
                    )}
                </main>
            </div>
            <div className="mobile-overlay" aria-hidden="true" />
        </div>
    );
};

export default TermsConditionsList;
