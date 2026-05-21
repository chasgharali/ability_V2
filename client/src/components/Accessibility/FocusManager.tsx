import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// Focus management component for accessibility
const FocusManager: React.FC = () => {
    const location = useLocation();
    const previousPathRef = useRef<string>('');

    useEffect(() => {
        // Skip focus management on initial load
        if (previousPathRef.current === '') {
            previousPathRef.current = location.pathname;
            return;
        }

        // Only manage focus if the path has actually changed
        if (previousPathRef.current !== location.pathname) {
            const timer = setTimeout(() => {
                // Focus the skip link so it becomes visible. The user can then
                // press Enter to jump to the page heading, or press Tab to
                // continue through the normal tab order (logo, logout, sidebar).
                const skipLink = document.querySelector('.skip-link') as HTMLElement;
                if (skipLink) {
                    skipLink.focus();
                } else {
                    const mainArea = document.getElementById('main-content')
                        || document.getElementById('dashboard-main')
                        || document.querySelector('main');
                    if (mainArea) {
                        (mainArea as HTMLElement).setAttribute('tabindex', '-1');
                        (mainArea as HTMLElement).focus();
                    }
                }
            }, 350);

            previousPathRef.current = location.pathname;

            return () => clearTimeout(timer);
        }
    }, [location.pathname]);

    return null;
};

export default FocusManager;
