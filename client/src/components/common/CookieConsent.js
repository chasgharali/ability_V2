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
            <h2 id="cookie-consent-title" className="cookie-consent-title">
                Cookie preferences
            </h2>
            <p id="cookie-consent-description" className="cookie-consent-text">
                We use cookies to improve site performance and your experience. You can accept all
                cookies or reject non-essential cookies.
            </p>
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
