import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import settingsAPI from '../../services/settings';
import './AppFooter.css';

const getDefaultFooterText = () =>
    `\u00A9 ${new Date().getFullYear()} ABILITY Job Fair. All rights reserved.`;

/**
 * Global application footer shown to all authenticated users.
 * Provides accessible links to the Terms of Use and Privacy Policy pages.
 */
const AppFooter = () => {
    const [footerText, setFooterText] = useState(getDefaultFooterText);

    useEffect(() => {
        let cancelled = false;

        async function loadFooterText() {
            try {
                const response = await settingsAPI.getSetting('footer_text');
                if (!cancelled && response.success && typeof response.value === 'string' && response.value.trim()) {
                    setFooterText(response.value.trim());
                }
            } catch {
                // Use default when setting is not configured
            }
        }

        loadFooterText();
        return () => { cancelled = true; };
    }, []);

    return (
        <footer className="app-footer" role="contentinfo" aria-label="Site footer">
            <div className="app-footer-inner">
                <p className="app-footer-copy">
                    {footerText}
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
