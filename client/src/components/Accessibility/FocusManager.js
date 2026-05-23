import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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

// Write a message to the persistent route-announcement live region so JAWS/NVDA
// speak it without disrupting focus. Safe to call from any component.
export const announceToScreenReader = (message) => {
    const el = document.getElementById('route-announcement');
    if (!el || !message) return;
    // Clear then set so identical consecutive messages are still announced.
    el.textContent = '';
    requestAnimationFrame(() => { el.textContent = message; });
};

// Global route observer — placed as the first child of AppLayout so its DOM
// node precedes the skip link. On route change:
//   1. Scroll to top (including dashboard's own scroll container).
//   2. After 400 ms (Helmet/React settle), focus #route-announcement while it
//      is EMPTY so JAWS/NVDA don't read stale content on the focus event.
//   3. In the next animation frame, write the new page title so the live region
//      announces it via aria-live — no focus-read, no old-title prefix.
//   4. Because #route-announcement is the first DOM child of AppLayout (before
//      the skip link), pressing Tab after focus lands on the skip link, which
//      then becomes visible via :focus-visible.
export const GlobalRouteObserver = () => {
    const location = useLocation();
    const previousPathRef = useRef('');
    const regionRef = useRef(null);

    useEffect(() => {
        if (previousPathRef.current === location.pathname) return;
        previousPathRef.current = location.pathname;

        // Always start each new route at the top of the page.
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        const mainContent = document.getElementById('main-content');
        if (mainContent) mainContent.scrollTop = 0;

        const timer = setTimeout(() => {
            const el = regionRef.current;
            if (!el) return;
            // Clear first — focus an empty element so JAWS/NVDA read nothing
            // on focus (prevents the old document-title being spoken).
            el.textContent = '';
            el.focus({ preventScroll: true });
            // Set the new title AFTER focus in the next frame.  The aria-live
            // region announces it without re-triggering a focus read.
            requestAnimationFrame(() => {
                el.textContent = document.title || '';
            });
        }, 400);

        return () => clearTimeout(timer);
    }, [location.pathname]);

    return (
        <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
            id="route-announcement"
            tabIndex={-1}
            ref={regionRef}
        />
    );
};

// Backward-compatible export name.
export const RouteFocusManager = GlobalRouteObserver;
