import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

const FocusManagerContext = createContext();
const MENU_NAV_STATE_KEY = 'ability:menu-navigation-state';

export const useFocusManager = () => {
    const context = useContext(FocusManagerContext);
    if (!context) {
        throw new Error('useFocusManager must be used within a FocusManagerProvider');
    }
    return context;
};

export const FocusManager = ({ children }) => {
    const [focusHistory, setFocusHistory] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const modalRef = useRef(null);
    const previousActiveElement = useRef(null);

    // Save focus when modal opens
    const openModal = (modalElement) => {
        previousActiveElement.current = document.activeElement;
        setIsModalOpen(true);
        modalRef.current = modalElement;

        // Focus the modal
        if (modalElement) {
            const focusableElements = modalElement.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (focusableElements.length > 0) {
                focusableElements[0].focus();
            }
        }
    };

    // Restore focus when modal closes
    const closeModal = () => {
        setIsModalOpen(false);
        modalRef.current = null;

        if (previousActiveElement.current) {
            previousActiveElement.current.focus();
            previousActiveElement.current = null;
        }
    };

    // Trap focus within modal
    useEffect(() => {
        if (!isModalOpen || !modalRef.current) return;

        const modal = modalRef.current;
        const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        const handleTabKey = (e) => {
            if (e.key !== 'Tab') return;

            if (e.shiftKey) {
                // Shift + Tab
                if (document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                }
            } else {
                // Tab
                if (document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        };

        const handleEscapeKey = (e) => {
            if (e.key === 'Escape') {
                closeModal();
            }
        };

        modal.addEventListener('keydown', handleTabKey);
        document.addEventListener('keydown', handleEscapeKey);

        return () => {
            modal.removeEventListener('keydown', handleTabKey);
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [isModalOpen]);

    // Save focus history for navigation
    const saveFocus = (element) => {
        if (element && element !== document.activeElement) {
            setFocusHistory(prev => [...prev.slice(-4), element]);
        }
    };

    // Restore previous focus
    const restorePreviousFocus = () => {
        if (focusHistory.length > 0) {
            const previousElement = focusHistory[focusHistory.length - 1];
            if (previousElement && document.contains(previousElement)) {
                previousElement.focus();
                setFocusHistory(prev => prev.slice(0, -1));
            }
        }
    };

    // Focus management for dynamic content
    const focusElement = (selector) => {
        const element = document.querySelector(selector);
        if (element) {
            element.focus();
            return true;
        }
        return false;
    };

    const focusFirstFocusable = (container) => {
        const focusableElements = container.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
            return true;
        }
        return false;
    };

    const value = {
        isModalOpen,
        openModal,
        closeModal,
        saveFocus,
        restorePreviousFocus,
        focusElement,
        focusFirstFocusable
    };

    return (
        <FocusManagerContext.Provider value={value}>
            {children}
        </FocusManagerContext.Provider>
    );
};

// Global route observer:
// On SPA route change, focus the skip link so the first Tab lands on the header,
// then the sidebar, then main content (correct DOM order for JAWS/NVDA).
// Also announces the new page title via a stable aria-live region.
export const GlobalRouteObserver = () => {
    const location = useLocation();
    const previousPathRef = useRef('');
    const [announcement, setAnnouncement] = useState('');

    const focusSkipLink = useCallback(() => {
        const skipLink = document.querySelector('.skip-link');
        if (skipLink) {
            skipLink.focus();
        }
    }, []);

    useEffect(() => {
        if (previousPathRef.current === location.pathname) return;
        previousPathRef.current = location.pathname;

        // Focus skip link so Tab order begins from the top of the page.
        // 150 ms gives React time to commit the new route's DOM.
        const focusTimer = setTimeout(focusSkipLink, 150);

        // Announce page title after Helmet has had time to update document.title.
        const titleTimer = setTimeout(() => {
            if (document.title) {
                // Clear first so repeated navigations to the same title re-trigger the announcement.
                setAnnouncement('');
                requestAnimationFrame(() => setAnnouncement(document.title));
            }
        }, 400);

        return () => {
            clearTimeout(focusTimer);
            clearTimeout(titleTimer);
        };
    }, [location.pathname, focusSkipLink]);

    // This live region stays mounted for the entire session so JAWS/NVDA
    // register it on page load and reliably speak subsequent updates.
    return (
        <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
            id="route-announcement"
        >
            {announcement}
        </div>
    );
};

// Backward-compatible export name.
export const RouteFocusManager = GlobalRouteObserver;
