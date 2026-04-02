import React from 'react';
import { Link } from 'react-router-dom';
import './AppFooter.css';

/**
 * Global application footer shown to all authenticated users.
 * Provides accessible links to the Terms of Use and Privacy Policy pages.
 */
const AppFooter = () => {
    const year = new Date().getFullYear();

    return (
        <footer className="app-footer" role="contentinfo" aria-label="Site footer">
            <div className="app-footer-inner">
                <p className="app-footer-copy">
                    &copy; {year} ABILITY Job Fair. All rights reserved.
                </p>
                <nav className="app-footer-nav" aria-label="Legal links">
                    <ul className="app-footer-links">
                        <li>
                            <Link
                                to="/legal/terms-of-use"
                                className="app-footer-link"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Terms of Use
                                <span className="app-footer-sr-only"> (opens in a new tab)</span>
                            </Link>
                        </li>
                        <li aria-hidden="true" className="app-footer-sep">|</li>
                        <li>
                            <Link
                                to="/legal/privacy-policy"
                                className="app-footer-link"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Privacy Policy
                                <span className="app-footer-sr-only"> (opens in a new tab)</span>
                            </Link>
                        </li>
                    </ul>
                </nav>
            </div>
        </footer>
    );
};

export default AppFooter;
