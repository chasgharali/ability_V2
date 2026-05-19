import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import DataGrid from '../UI/DataGrid';
import CopyToOrganizationModal from '../UI/CopyToOrganizationModal';
import { termsConditionsAPI } from '../../services/termsConditions';
import { listOrganizations } from '../../services/organizations';
import { MdAdd, MdEdit, MdDelete, MdVisibility, MdCheckCircle, MdCancel } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import './TermsConditions.css';

const TermsConditionsList = () => {
    const [terms, setTerms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedRows, setSelectedRows] = useState([]);
    const [processingIds, setProcessingIds] = useState(new Set());
    const [successMessage, setSuccessMessage] = useState(null);
    const [organizations, setOrganizations] = useState([]);
    const [copyModalOpen, setCopyModalOpen] = useState(false);
    const [selectedTermId, setSelectedTermId] = useState(null);
    const navigate = useNavigate();
    const { user } = useAuth();

    // Fetch terms and conditions
    const fetchTerms = async () => {
        try {
            setLoading(true);
            if (user?.role === 'Admin') {
                await termsConditionsAPI.syncDefaults();
            }
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
        if (user?.role) {
            fetchTerms();
        }
    }, [user?.role]);

    useEffect(() => {
        const fetchOrganizations = async () => {
            if (user?.role !== 'SuperAdmin') return;
            try {
                const response = await listOrganizations({ limit: 100, isActive: 'true' });
                setOrganizations(response.organizations || []);
            } catch (err) {
                console.error('Error fetching organizations:', err);
            }
        };
        fetchOrganizations();
    }, [user?.role]);

    // Handle delete terms
    const handleDelete = async (termId, termTitle) => {
        if (!window.confirm(`Are you sure you want to delete "${termTitle}"? This action cannot be undone.`)) {
            return;
        }

        try {
            setProcessingIds(prev => new Set(prev).add(termId));
            setError(null);
            setSuccessMessage(null);
            
            // Store the term ID as string for consistent comparison
            const termIdStr = String(termId);
            
            // Remove from list optimistically
            setTerms(prev => prev.filter(term => String(term._id) !== termIdStr));
            
            // Delete the term on the server
            const response = await termsConditionsAPI.delete(termIdStr);
            
            // Always refresh from server to verify deletion
            await fetchTerms();
            
            setSuccessMessage(`"${termTitle}" deleted successfully`);
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            // If error, refresh list to restore accurate state
            await fetchTerms();
            
            const errorMessage = err?.response?.data?.message || 
                               err?.response?.data?.error || 
                               err?.message || 
                               'Failed to delete terms and conditions';
            
            setError(errorMessage);
            console.error('Error deleting terms:', err);
            console.error('Error response:', err?.response?.data);
            console.error('Term ID attempted:', termId);
            
            // Clear error after 5 seconds
            setTimeout(() => setError(null), 5000);
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(termId);
                return next;
            });
        }
    };

    // Handle activate/deactivate terms
    const handleToggleActive = async (termId, currentIsActive, termTitle) => {
        if (processingIds.has(termId)) return;
        
        const action = currentIsActive ? 'deactivate' : 'activate';
        
        try {
            setProcessingIds(prev => new Set(prev).add(termId));
            setError(null);
            setSuccessMessage(null);
            
            // Optimistically update the UI
            setTerms(prev => prev.map(term => 
                term._id === termId 
                    ? { ...term, isActive: !currentIsActive }
                    : term
            ));
            
            let response;
            if (currentIsActive) {
                response = await termsConditionsAPI.deactivate(termId);
            } else {
                response = await termsConditionsAPI.activate(termId);
            }
            
            // Update with server response if available
            if (response?.terms) {
                setTerms(prev => prev.map(term => 
                    term._id === termId 
                        ? { ...term, isActive: response.terms.isActive }
                        : term
                ));
            } else {
                // Refresh the list to ensure consistency
                await fetchTerms();
            }
            
            setSuccessMessage(`"${termTitle}" ${action}d successfully`);
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            // Revert optimistic update on error
            setTerms(prev => prev.map(term => 
                term._id === termId 
                    ? { ...term, isActive: currentIsActive }
                    : term
            ));
            
            const errorMessage = err?.response?.data?.message || 
                               err?.response?.data?.error || 
                               err?.message || 
                               `Failed to ${action} terms and conditions`;
            
            setError(errorMessage);
            console.error(`Error ${action}ing terms:`, err);
            
            // Refresh list to get accurate state
            await fetchTerms();
            
            // Clear error after 5 seconds
            setTimeout(() => setError(null), 5000);
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(termId);
                return next;
            });
        }
    };

    const handleSetDefault = async (termId) => {
        try {
            setError(null);
            setSuccessMessage(null);
            await termsConditionsAPI.setDefault(termId);
            await fetchTerms();
            setSuccessMessage('Terms marked as default and copied to organizations.');
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to set default terms');
        }
    };

    const handleUnsetDefault = async (termId) => {
        try {
            setError(null);
            setSuccessMessage(null);
            await termsConditionsAPI.unsetDefault(termId);
            await fetchTerms();
            setSuccessMessage('Terms removed from platform defaults.');
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to unset default terms');
        }
    };

    const handleCopyToOrganization = async (targetOrganizationId, overwrite) => {
        if (!selectedTermId) return;
        const selectedOrganization = organizations.find((org) => org._id === targetOrganizationId);
        try {
            setError(null);
            setSuccessMessage(null);
            await termsConditionsAPI.copyToOrganization(selectedTermId, targetOrganizationId, overwrite);
            await fetchTerms();
            setSuccessMessage(`Terms copied to ${selectedOrganization?.name || 'selected organization'}.`);
            setCopyModalOpen(false);
            setSelectedTermId(null);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to copy terms to organization');
        }
    };

    const getCopyRecipientLabel = (recipient) =>
        recipient.organizationName || recipient.adminName || recipient.adminEmail || 'Organization';

    const renderCopyRecipients = (row) => {
        const recipients = Array.isArray(row.copyRecipients) ? row.copyRecipients : [];
        if (!recipients.length) return <span className="muted">-</span>;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {recipients.slice(0, 2).map((recipient) => (
                    <span key={recipient.organizationId || recipient.adminUserId || recipient.adminEmail} className="role-badge">
                        {getCopyRecipientLabel(recipient)}
                    </span>
                ))}
                {recipients.length > 2 && (
                    <span className="muted">+{recipients.length - 2} more</span>
                )}
            </div>
        );
    };

    // DataGrid columns configuration
    const columns = [
        {
            key: 'title',
            label: 'Title',
            render: (row) => (
                <div className="terms-title-cell">
                    <strong>{row.title}</strong>
                    <span className={`status-badge ${row.isActive ? 'active' : 'inactive'}`} style={{
                        marginLeft: '0.5rem',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        backgroundColor: row.isActive ? '#d4edda' : '#f8d7da',
                        color: row.isActive ? '#155724' : '#721c24',
                        border: `1px solid ${row.isActive ? '#c3e6cb' : '#f5c6cb'}`
                    }}>
                        {row.isActive ? 'Active' : 'Inactive'}
                    </span>
                </div>
            )
        },
        {
            key: 'version',
            label: 'Version'
        },
        {
            key: 'templateStatus',
            label: 'Template',
            render: (row) => {
                if (row.isPlatformDefault) return <span className="role-badge">Platform Default</span>;
                if (row.sourceTemplateId) {
                    return row.lastSyncedAt
                        ? <span className="role-badge">Org Copy</span>
                        : <span className="role-badge">Customized</span>;
                }
                return <span className="muted">-</span>;
            }
        },
        {
            key: 'copyRecipients',
            label: 'Sent To Organizations',
            render: (row) => renderCopyRecipients(row)
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
                        className="action-btn action-btn--icon view-btn"
                        onClick={() => navigate(`/terms-conditions/${row._id}`)}
                        title="View Details"
                        aria-label={`View details for ${row.title}`}
                    >
                        <MdVisibility />
                    </button>
                    {['Admin', 'AdminEvent', 'SuperAdmin'].includes(user?.role) && (
                        <>
                            <button
                                className="action-btn action-btn--icon edit-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/terms-conditions/${row._id}/edit`);
                                }}
                                title="Edit"
                                aria-label={`Edit ${row.title}`}
                                disabled={processingIds.has(row._id)}
                            >
                                <MdEdit />
                            </button>
                            {user?.role === 'SuperAdmin' && (
                                <>
                                    <button
                                        className={`action-btn action-btn--text action-btn--default-toggle ${
                                            row.isPlatformDefault ? 'action-btn--unset-default' : 'action-btn--set-default'
                                        }`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (row.isPlatformDefault) {
                                                handleUnsetDefault(row._id);
                                            } else {
                                                handleSetDefault(row._id);
                                            }
                                        }}
                                        title={row.isPlatformDefault ? 'Remove default template' : 'Set as default template'}
                                        aria-label={`${row.isPlatformDefault ? 'Unset default for' : 'Set default for'} ${row.title}`}
                                        disabled={processingIds.has(row._id)}
                                    >
                                        {row.isPlatformDefault ? 'Un-default' : 'Set Default'}
                                    </button>
                                    <button
                                        className="action-btn action-btn--text"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedTermId(row._id);
                                            setCopyModalOpen(true);
                                        }}
                                        title="Copy to organization"
                                        aria-label={`Copy ${row.title} to organization`}
                                        disabled={processingIds.has(row._id)}
                                    >
                                        Copy
                                    </button>
                                </>
                            )}
                            <button
                                className="action-btn action-btn--icon toggle-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleActive(row._id, row.isActive, row.title);
                                }}
                                title={row.isActive ? 'Deactivate' : 'Activate'}
                                aria-label={`${row.isActive ? 'Deactivate' : 'Activate'} ${row.title}`}
                                disabled={processingIds.has(row._id)}
                                style={{ 
                                    opacity: processingIds.has(row._id) ? 0.6 : 1,
                                    cursor: processingIds.has(row._id) ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {processingIds.has(row._id) ? (
                                    <span style={{ fontSize: '0.8rem' }}>...</span>
                                ) : row.isActive ? (
                                    <MdCancel />
                                ) : (
                                    <MdCheckCircle />
                                )}
                            </button>
                            {!row.isActive && (
                                <button
                                    className="action-btn action-btn--icon delete-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(row._id, row.title);
                                    }}
                                    title="Delete"
                                    aria-label={`Delete ${row.title}`}
                                    disabled={processingIds.has(row._id)}
                                    style={{ 
                                        opacity: processingIds.has(row._id) ? 0.6 : 1,
                                        cursor: processingIds.has(row._id) ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {processingIds.has(row._id) ? (
                                        <span style={{ fontSize: '0.8rem' }}>...</span>
                                    ) : (
                                        <MdDelete />
                                    )}
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
                <a href="#main-content" className="skip-link">Skip to main content</a>
                <AdminHeader />
                <div className="dashboard-layout">
                    <AdminSidebar active="terms-conditions" />
                    <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
                        <div className="loading">Loading terms and conditions...</div>
                    </main>
                </div>
            </div>
        );
    }


    return (
        <div className="dashboard">
            <a href="#main-content" className="skip-link">Skip to main content</a>
            <AdminHeader />
            <div className="dashboard-layout">
                <AdminSidebar active="terms-conditions" />
                <CopyToOrganizationModal
                    isOpen={copyModalOpen}
                    organizations={organizations}
                    title="Copy Terms to Organization"
                    description="Select an organization and choose whether to overwrite existing copy."
                    onCancel={() => {
                        setCopyModalOpen(false);
                        setSelectedTermId(null);
                    }}
                    onConfirm={handleCopyToOrganization}
                />
                <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
                    <div className="bm-header">
                        <h1>Terms & Conditions Management</h1>
                        <div className="bm-header-actions">
                            {['Admin', 'AdminEvent', 'SuperAdmin'].includes(user?.role) && (
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
                        {(error || successMessage) && (
                            <div className={`terms-message ${error ? 'terms-error-message' : 'terms-success-message'}`} style={{
                                marginBottom: '1.5rem',
                                padding: '1rem 1.5rem',
                                borderRadius: '8px',
                                backgroundColor: error ? '#f8d7da' : '#d4edda',
                                color: error ? '#721c24' : '#155724',
                                border: `1px solid ${error ? '#f5c6cb' : '#c3e6cb'}`
                            }}>
                                {error || successMessage}
                            </div>
                        )}
                        {error && !terms.length && loading === false ? (
                            <div className="error">
                                <h3>Error Loading Terms</h3>
                                <p>{error}</p>
                                <button onClick={fetchTerms} className="dashboard-button" style={{ width: 'auto' }}>Retry</button>
                            </div>
                        ) : (
                            <>
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
                            </>
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
        </div>
    );
};

export default TermsConditionsList;
