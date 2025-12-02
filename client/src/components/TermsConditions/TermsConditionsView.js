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
    const [toggleLoading, setToggleLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState(null);
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    // Fetch terms details
    const fetchTerms = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
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
        if (!terms || toggleLoading) return;
        
        const wasActive = terms.isActive;
        const action = wasActive ? 'deactivate' : 'activate';
        
        try {
            setToggleLoading(true);
            setError(null);
            setSuccessMessage(null);
            
            let response;
            if (wasActive) {
                response = await termsConditionsAPI.deactivate(id);
            } else {
                response = await termsConditionsAPI.activate(id);
            }
            
            // Update terms state directly from response or refresh
            if (response?.terms) {
                setTerms(response.terms);
            } else {
                // Fallback: refresh the terms data
                await fetchTerms();
            }
            
            // Show success message
            setSuccessMessage(`Terms and conditions ${action}d successfully`);
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            const errorMessage = err?.response?.data?.message || 
                               err?.response?.data?.error || 
                               err?.message || 
                               `Failed to ${action} terms and conditions`;
            
            setError(errorMessage);
            console.error(`Error ${action}ing terms:`, err);
            console.error('Error details:', err?.response?.data);
            
            // Clear error after 5 seconds
            setTimeout(() => setError(null), 5000);
        } finally {
            setToggleLoading(false);
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

    if (error && !terms) {
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
                                        disabled={toggleLoading}
                                        className={`dashboard-button ${terms.isActive ? 'secondary' : 'primary'}`}
                                        style={{ width: 'auto', opacity: toggleLoading ? 0.6 : 1, cursor: toggleLoading ? 'not-allowed' : 'pointer' }}
                                    >
                                        {toggleLoading ? (
                                            <>
                                                <span>Processing...</span>
                                            </>
                                        ) : terms.isActive ? (
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
