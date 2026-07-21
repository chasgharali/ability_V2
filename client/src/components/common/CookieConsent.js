import React, { useEffect, useMemo, useRef, useState } from 'react';
import './CookieConsent.css';

const COOKIE_CONSENT_STORAGE_KEY = 'ability_cookie_consent';
const CONSENT_ACCEPTED = 'accepted';
const CONSENT_REJECTED = 'rejected';

const getStoredConsent = () => {
    try {
        return localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    } catch (error) {
        return null;
    }
};

function CookieConsent() {
    const [consent, setConsent] = useState(() => getStoredConsent());
    const [dismissed, setDismissed] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const dialogRef = useRef(null);
    // The element focused before the banner grabbed focus, so we can hand
    // focus back to a sensible place instead of letting it fall to <body>
    // once the banner unmounts (WCAG 2.4.3 focus order).
    const previouslyFocusedElementRef = useRef(null);

    const isVisible = useMemo(
        () => !dismissed && consent !== CONSENT_ACCEPTED && consent !== CONSENT_REJECTED,
        [consent, dismissed]
    );

    const restoreFocus = () => {
        const previouslyFocused = previouslyFocusedElementRef.current;
        previouslyFocusedElementRef.current = null;

        const canRefocus =
            previouslyFocused &&
            previouslyFocused !== document.body &&
            typeof previouslyFocused.focus === 'function' &&
            document.contains(previouslyFocused);

        if (canRefocus) {
            previouslyFocused.focus();
        }
    };

    const saveConsent = (value, message) => {
        try {
            localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, value);
        } catch (error) {
            // If storage is unavailable, avoid blocking the UI.
        }
        setStatusMessage(message);
        restoreFocus();
        setConsent(value);
    };

    const closeWithoutDeciding = () => {
        setStatusMessage('Cookie preferences closed. You can choose again next time you visit.');
        restoreFocus();
        setDismissed(true);
    };

    const handleDialogKeyDown = (event) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            closeWithoutDeciding();
        }
    };

    useEffect(() => {
        if (!isVisible) {
            return;
        }

        previouslyFocusedElementRef.current = document.activeElement;
        dialogRef.current?.focus();
    }, [isVisible]);

    // Clear the announcement after it's had time to be read, so the live
    // region doesn't keep stale text sitting in the DOM indefinitely.
    useEffect(() => {
        if (!statusMessage) {
            return undefined;
        }

        const timeoutId = setTimeout(() => setStatusMessage(''), 5000);
        return () => clearTimeout(timeoutId);
    }, [statusMessage]);

    // While the fixed cookie banner is shown, reserve space at the bottom of every
    // scroll container so keyboard-focused elements scroll into view above the banner
    // instead of being hidden behind it (WCAG 2.4.7 / W3C technique C43).
    useEffect(() => {
        if (!isVisible) {
            return undefined;
        }

        const root = document.documentElement;
        const footer = document.querySelector('.app-footer');

        const updateOffsets = () => {
            const banner = dialogRef.current;
            if (!banner) {
                return;
            }
            // Pin the banner flush above the footer's actual rendered height,
            // which can exceed the static --app-footer-height when its content
            // wraps at narrow viewports.
            const footerHeight = footer ? Math.ceil(footer.getBoundingClientRect().height) : 0;
            root.style.setProperty('--cookie-consent-bottom', `${footerHeight}px`);
            // Height of the viewport region the banner + footer overlap, plus
            // breathing room. Computed from heights (not the banner's current
            // top) so it stays correct in the same frame the banner is moved.
            const bannerHeight = Math.round(banner.getBoundingClientRect().height);
            const offset = bannerHeight + footerHeight + 16;
            root.style.setProperty('--cookie-consent-scroll-offset', `${offset}px`);
        };

        root.classList.add('cookie-consent-active');
        updateOffsets();

        const resizeObserver =
            typeof ResizeObserver !== 'undefined'
                ? new ResizeObserver(updateOffsets)
                : null;
        if (resizeObserver) {
            if (dialogRef.current) {
                resizeObserver.observe(dialogRef.current);
            }
            if (footer) {
                resizeObserver.observe(footer);
            }
        }
        window.addEventListener('resize', updateOffsets);

        return () => {
            resizeObserver?.disconnect();
            window.removeEventListener('resize', updateOffsets);
            root.classList.remove('cookie-consent-active');
            root.style.removeProperty('--cookie-consent-scroll-offset');
            root.style.removeProperty('--cookie-consent-bottom');
        };
    }, [isVisible]);

    return (
        <>
            {/* Persists across mount/unmount of the banner so the outcome of an
                action (accept/reject/close) is still announced to screen reader
                users even though the dialog itself is removed from the DOM. */}
            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {statusMessage}
            </div>
            {isVisible && (
                <section
                    ref={dialogRef}
                    className="cookie-consent-banner"
                    role="dialog"
                    aria-labelledby="cookie-consent-title"
                    aria-describedby="cookie-consent-description"
                    aria-modal="false"
                    tabIndex="-1"
                    onKeyDown={handleDialogKeyDown}
                >
                    <div className="cookie-consent-content">
                        <h2 id="cookie-consent-title" className="cookie-consent-title">
                            Cookie preferences
                        </h2>
                        <p id="cookie-consent-description" className="cookie-consent-text">
                            We use cookies to improve site performance and your experience. You
                            can accept all cookies or reject non-essential cookies.
                        </p>
                    </div>
                    <div
                        className="cookie-consent-actions"
                        role="group"
                        aria-label="Cookie consent choices"
                    >
                        <button
                            type="button"
                            className="cookie-consent-button cookie-consent-button-secondary"
                            onClick={() =>
                                saveConsent(
                                    CONSENT_REJECTED,
                                    'Cookie preferences saved. Non-essential cookies rejected.'
                                )
                            }
                        >
                            Reject Non-Essential
                        </button>
                        <button
                            type="button"
                            className="cookie-consent-button cookie-consent-button-primary"
                            onClick={() =>
                                saveConsent(
                                    CONSENT_ACCEPTED,
                                    'Cookie preferences saved. All cookies accepted.'
                                )
                            }
                        >
                            Accept All
                        </button>
                    </div>
                    <button
                        type="button"
                        className="cookie-consent-close"
                        aria-label="Close cookie preferences"
                        onClick={closeWithoutDeciding}
                    >
                        <svg
                            aria-hidden="true"
                            focusable="false"
                            viewBox="0 0 16 16"
                            width="12"
                            height="12"
                        >
                            <path
                                d="M2.5 2.5L13.5 13.5M13.5 2.5L2.5 13.5"
                                stroke="currentColor"
                                strokeWidth="1.75"
                                strokeLinecap="round"
                            />
                        </svg>
                    </button>
                </section>
            )}
        </>
    );
}

export default CookieConsent;
