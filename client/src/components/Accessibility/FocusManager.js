import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const FocusManagerContext = createContext();

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

const getPageHeadingText = () => {
    const mainArea = document.getElementById('dashboard-main');
    const heading = (mainArea || document).querySelector('h1, h2, h3');
    return heading ? heading.textContent.trim() : '';
};

const announcePageLoaded = (headingText) => {
    const politeRegion = document.getElementById('announcements-polite');
    if (!politeRegion || !headingText) return;

    const messageNode = document.createElement('div');
    messageNode.textContent = `Page loaded: ${headingText}`;
    politeRegion.appendChild(messageNode);

    // Keep this aligned with existing announcer timing.
    setTimeout(() => {
        if (politeRegion.contains(messageNode)) {
            politeRegion.removeChild(messageNode);
        }
    }, 1000);
};

const focusPageHeadingOrMain = () => {
    const mainArea = document.getElementById('dashboard-main');
    const heading = (mainArea || document).querySelector('h1, h2, h3');
    if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus();
        return true;
    }

    const mainEl = mainArea || document.querySelector('main');
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

    useEffect(() => {
        if (previousPathRef.current === '') {
            previousPathRef.current = location.pathname;
            return;
        }

        if (previousPathRef.current !== location.pathname) {
            let hasAnnounced = false;
            const attemptFocus = () => {
                const headingText = getPageHeadingText();
                if (!hasAnnounced && headingText) {
                    announcePageLoaded(headingText);
                    hasAnnounced = true;
                }
                focusPageHeadingOrMain();
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
