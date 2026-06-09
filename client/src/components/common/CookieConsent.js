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
    const dialogRef = useRef(null);

    const isVisible = useMemo(
        () => consent !== CONSENT_ACCEPTED && consent !== CONSENT_REJECTED,
        [consent]
    );

    const saveConsent = (value) => {
        try {
            localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, value);
        } catch (error) {
            // If storage is unavailable, avoid blocking the UI.
        }
        setConsent(value);
    };

    useEffect(() => {
        if (!isVisible) {
            return;
        }

        dialogRef.current?.focus();
    }, [isVisible]);

    // While the fixed cookie banner is shown, reserve space at the bottom of every
    // scroll container so keyboard-focused elements scroll into view above the banner
    // instead of being hidden behind it (WCAG 2.4.7 / W3C technique C43).
    useEffect(() => {
        if (!isVisible) {
            return undefined;
        }

        const root = document.documentElement;

        const updateScrollOffset = () => {
            const banner = dialogRef.current;
            if (!banner) {
                return;
            }
            // Height of the viewport region the banner overlaps, plus breathing room.
            const overlap = window.innerHeight - banner.getBoundingClientRect().top;
            const offset = Math.max(0, Math.round(overlap)) + 16;
            root.style.setProperty('--cookie-consent-scroll-offset', `${offset}px`);
        };

        root.classList.add('cookie-consent-active');
        updateScrollOffset();

        const resizeObserver =
            typeof ResizeObserver !== 'undefined'
                ? new ResizeObserver(updateScrollOffset)
                : null;
        if (resizeObserver && dialogRef.current) {
            resizeObserver.observe(dialogRef.current);
        }
        window.addEventListener('resize', updateScrollOffset);

        return () => {
            resizeObserver?.disconnect();
            window.removeEventListener('resize', updateScrollOffset);
            root.classList.remove('cookie-consent-active');
            root.style.removeProperty('--cookie-consent-scroll-offset');
        };
    }, [isVisible]);

    if (!isVisible) {
        return null;
    }

    return (
        <section
            ref={dialogRef}
            className="cookie-consent-banner"
            role="dialog"
            aria-labelledby="cookie-consent-title"
            aria-describedby="cookie-consent-description"
            aria-modal="false"
            tabIndex="-1"
        >
            <div className="cookie-consent-content">
                <h2 id="cookie-consent-title" className="cookie-consent-title">
                    Cookie preferences
                </h2>
                <p id="cookie-consent-description" className="cookie-consent-text">
                    We use cookies to improve site performance and your experience. You can accept
                    all cookies or reject non-essential cookies.
                </p>
            </div>
            <div className="cookie-consent-actions">
                <button
                    type="button"
                    className="cookie-consent-button cookie-consent-button-secondary"
                    onClick={() => saveConsent(CONSENT_REJECTED)}
                >
                    Reject Non-Essential
                </button>
                <button
                    type="button"
                    className="cookie-consent-button cookie-consent-button-primary"
                    onClick={() => saveConsent(CONSENT_ACCEPTED)}
                >
                    Accept All
                </button>
            </div>
        </section>
    );
}

export default CookieConsent;
