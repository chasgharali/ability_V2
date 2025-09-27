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
            // Small delay to ensure the new page has rendered
            const timer = setTimeout(() => {
                // Find the main content area
                const mainContent = document.getElementById('main-content');
                if (mainContent) {
                    mainContent.focus();
                } else {
                    // Fallback: focus the first heading or the body
                    const firstHeading = document.querySelector('h1, h2, h3, h4, h5, h6');
                    if (firstHeading) {
                        (firstHeading as HTMLElement).focus();
                    } else {
                        document.body.focus();
                    }
                }
            }, 100);

            previousPathRef.current = location.pathname;

            return () => clearTimeout(timer);
        }
    }, [location.pathname]);

    return null;
};

export default FocusManager;
