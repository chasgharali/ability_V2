import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import { termsConditionsAPI } from '../../services/termsConditions';
import { MdEdit, MdArrowBack, MdCheckCircle, MdCancel } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import './TermsConditions.css';

const TermsConditionsView = () => {
    const [terms, setTerms] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    // Fetch terms details
    const fetchTerms = useCallback(async () => {
        try {
            setLoading(true);
            const data = await termsConditionsAPI.getById(id);
            setTerms(data.terms);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to fetch terms and conditions');
            console.error('Error fetching terms:', err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchTerms();
    }, [fetchTerms]);

    // Handle activate/deactivate
    const handleToggleActive = async () => {
        try {
            if (terms.isActive) {
                await termsConditionsAPI.deactivate(id);
            } else {
                await termsConditionsAPI.activate(id);
            }
            // Refresh the terms data
            await fetchTerms();
        } catch (err) {
            setError(err.response?.data?.message || err.message || `Failed to ${terms.isActive ? 'deactivate' : 'activate'} terms and conditions`);
            console.error(`Error ${terms.isActive ? 'deactivating' : 'activating'} terms:`, err);
        }
    };

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

    if (!terms) {
        return (
            <div className="dashboard">
                <AdminHeader />
                <div className="dashboard-layout">
                    <AdminSidebar active="terms-conditions" />
                    <main id="dashboard-main" className="dashboard-main">
                        <div className="error">
                            <h3>Terms Not Found</h3>
                            <p>The requested terms and conditions could not be found.</p>
                            <button onClick={() => navigate('/terms-conditions')} className="dashboard-button" style={{ width: 'auto' }}>
                                Back to List
                            </button>
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
                        <h2>Terms & Conditions</h2>
                        <div className="bm-header-actions">
                            <button
                                onClick={() => navigate('/terms-conditions')}
                                className="dashboard-button"
                                style={{ width: 'auto' }}
                            >
                                <MdArrowBack />
                                Back to List
                            </button>
                            {['Admin', 'AdminEvent'].includes(user?.role) && (
                                <>
                                    <button
                                        onClick={() => navigate(`/terms-conditions/${id}/edit`)}
                                        className="dashboard-button"
                                        style={{ width: 'auto' }}
                                    >
                                        <MdEdit />
                                        Edit
                                    </button>
                                    <button
                                        onClick={handleToggleActive}
                                        className={`dashboard-button ${terms.isActive ? 'secondary' : 'primary'}`}
                                        style={{ width: 'auto' }}
                                    >
                                        {terms.isActive ? (
                                            <>
                                                <MdCancel />
                                                Deactivate
                                            </>
                                        ) : (
                                            <>
                                                <MdCheckCircle />
                                                Activate
                                            </>
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="dashboard-content-area">
                        <div className="terms-meta">
                            <div className="terms-title-section">
                                <h2>{terms.title}</h2>
                                <div className="terms-badges">
                                    <span className={`status-badge ${terms.isActive ? 'active' : 'inactive'}`}>
                                        {terms.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                    <span className="version-badge">Version {terms.version}</span>
                                </div>
                            </div>

                            <div className="terms-info">
                                <div className="info-item">
                                    <strong>Created:</strong> {new Date(terms.createdAt).toLocaleDateString()}
                                </div>
                                <div className="info-item">
                                    <strong>Last Updated:</strong> {new Date(terms.updatedAt).toLocaleDateString()}
                                </div>
                                {terms.createdBy && (
                                    <div className="info-item">
                                        <strong>Created By:</strong> {terms.createdBy.name || terms.createdBy.email}
                                    </div>
                                )}
                                {terms.updatedBy && (
                                    <div className="info-item">
                                        <strong>Last Updated By:</strong> {terms.updatedBy.name || terms.updatedBy.email}
                                    </div>
                                )}
                                {terms.usage && (
                                    <div className="info-item">
                                        <strong>Usage:</strong> Used in {terms.usage.totalEvents || 0} event(s)
                                        {terms.usage.lastUsed && (
                                            <span> • Last used: {new Date(terms.usage.lastUsed).toLocaleDateString()}</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="terms-content">
                            <h3>Content</h3>
                            <div
                                className="terms-html-content"
                                dangerouslySetInnerHTML={{ __html: terms.content }}
                            />
                        </div>
                    </div>
                </main>
            </div>
            <div className="mobile-overlay" aria-hidden="true" />
        </div>
    );
};

export default TermsConditionsView;
