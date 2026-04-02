import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { legalPagesAPI } from '../../services/legalPages';
import { MdArrowBack } from 'react-icons/md';
import './Legal.css';

const PAGE_LABELS = {
    'terms-of-use': 'Terms of Use',
    'privacy-policy': 'Privacy Policy'
};

const LegalPageView = ({ type }) => {
    const [page, setPage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();
    const pageLabel = PAGE_LABELS[type] || type;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await legalPagesAPI.getByType(type);
            setPage(data.page);
        } catch (err) {
            if (err.response?.status === 404) {
                setError('This page has not been published yet.');
            } else {
                setError('Failed to load this page. Please try again later.');
            }
        } finally {
            setLoading(false);
        }
    }, [type]);

    useEffect(() => {
        load();
    }, [load]);

    const handleBack = () => {
        // Legal pages are often opened in a new tab; in that case there may be no
        // usable browser history entry to go back to.
        if (window.history.length > 1) {
            navigate(-1);
            return;
        }
        navigate('/');
    };

    return (
        <div className="legal-view-wrapper">
            <a href="#legal-main" className="skip-link">Skip to main content</a>

            <header className="legal-view-header" role="banner">
                <div className="legal-view-header-inner">
                    <button
                        type="button"
                        className="legal-back-btn"
                        onClick={handleBack}
                        aria-label="Go back"
                    >
                        <MdArrowBack aria-hidden="true" />
                        Back
                    </button>
                    <span className="legal-view-logo-text">ABILITY Job Fair</span>
                </div>
            </header>

            <main id="legal-main" className="legal-view-main" tabIndex={-1} aria-label={pageLabel}>
                {loading && (
                    <div className="legal-view-loading" aria-live="polite" aria-busy="true">
                        Loading {pageLabel}...
                    </div>
                )}

                {!loading && error && (
                    <div className="legal-view-error" role="alert">
                        <h1>{pageLabel}</h1>
                        <p>{error}</p>
                    </div>
                )}

                {!loading && page && (
                    <article className="legal-view-article">
                        <h1 className="legal-view-title">{page.title}</h1>
                        {page.updatedAt && (
                            <p className="legal-view-meta">
                                Last updated:{' '}
                                <time dateTime={page.updatedAt}>
                                    {new Date(page.updatedAt).toLocaleDateString('en-US', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </time>
                            </p>
                        )}
                        <div
                            className="legal-view-content"
                            dangerouslySetInnerHTML={{ __html: page.content || '<p>No content available.</p>' }}
                        />
                    </article>
                )}
            </main>

            <footer className="legal-view-footer" role="contentinfo">
                <p>&copy; {new Date().getFullYear()} ABILITY Job Fair. All rights reserved.</p>
            </footer>
        </div>
    );
};

export default LegalPageView;
