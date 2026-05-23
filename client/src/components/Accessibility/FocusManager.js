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
//   1. Wait 400 ms for Helmet to update document.title
//   2. Write the page title directly to the live region
//   3. Focus the live region so JAWS/NVDA read it (announces title, not skip link)
//   4. User then presses Tab → first natural tabindex element = skip link
//      (skip link only becomes visible via :focus-visible on that Tab press)
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

        const timer = setTimeout(() => {
            const el = regionRef.current;
            if (!el) return;
            const title = document.title || '';
            // Clear then populate in the same animation frame so JAWS/NVDA
            // always pick up the update, then move focus to the element.
            el.textContent = '';
            requestAnimationFrame(() => {
                el.textContent = title;
                el.focus();
            });
        }, 400);

        return () => clearTimeout(timer);
    }, [location.pathname]);

    // tabIndex={-1} lets the element receive programmatic focus without
    // appearing in the natural Tab sequence itself.
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
