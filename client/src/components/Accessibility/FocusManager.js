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

const focusPageMainContainer = () => {
    const mainEl = document.getElementById('main-content')
        || document.getElementById('dashboard-main')
        || document.querySelector('main');
    if (mainEl) {
        mainEl.setAttribute('tabindex', '-1');
        mainEl.focus();
        return true;
    }

    return false;
};

// Global route observer:
// on SPA route change, announce the new page title and reset focus to a hidden
// top anchor so the first Tab lands on the skip link.
export const GlobalRouteObserver = () => {
    const location = useLocation();
    const previousPathRef = useRef('');

    const isMenuInitiatedNavigation = () => {
        try {
            const raw = sessionStorage.getItem(MENU_NAV_STATE_KEY);
            if (!raw) return false;
            const state = JSON.parse(raw);
            if (!state || state.source !== 'sidebar-menu') return false;
            const isMatchingPath = state.path === location.pathname;
            const isFresh = Date.now() - Number(state.timestamp || 0) < 15000;
            return isMatchingPath && isFresh;
        } catch {
            return false;
        }
    };

    useEffect(() => {
        if (previousPathRef.current === '') {
            previousPathRef.current = location.pathname;
            return;
        }

        if (previousPathRef.current !== location.pathname) {
            const menuInitiatedNav = isMenuInitiatedNavigation();
            const attemptFocus = () => {
                // Move focus to the page's main landmark instead of the heading.
                // This avoids placing visible focus styles on headings while still
                // giving screen-reader users a reliable post-navigation anchor.
                if (!menuInitiatedNav) {
                    focusPageMainContainer();
                }
            };

            const timers = [120, 420, 900].map((delay) => setTimeout(attemptFocus, delay));

            previousPathRef.current = location.pathname;
            return () => timers.forEach((timer) => clearTimeout(timer));
        }
    }, [location.pathname]);

    return null;
};

// Backward-compatible export name.
export const RouteFocusManager = GlobalRouteObserver;
