import React, { createContext, useContext, useState, useEffect } from 'react';

const AccessibilityAnnouncerContext = createContext();

export const useAccessibilityAnnouncer = () => {
    const context = useContext(AccessibilityAnnouncerContext);
    if (!context) {
        throw new Error('useAccessibilityAnnouncer must be used within an AccessibilityAnnouncerProvider');
    }
    return context;
};

export const AccessibilityAnnouncer = ({ children }) => {
    const [announcements, setAnnouncements] = useState([]);

    const announce = (message, priority = 'polite') => {
        const id = Date.now() + Math.random();
        const announcement = { id, message, priority };

        setAnnouncements(prev => [...prev, announcement]);

        // Remove announcement after it's been read
        setTimeout(() => {
            setAnnouncements(prev => prev.filter(a => a.id !== id));
        }, 1000);
    };

    const announceUrgent = (message) => {
        announce(message, 'assertive');
    };

    const announcePolite = (message) => {
        announce(message, 'polite');
    };

    const value = {
        announce,
        announceUrgent,
        announcePolite
    };

    return (
        <AccessibilityAnnouncerContext.Provider value={value}>
            {children}

            {/* Live regions for screen reader announcements */}
            <div
                aria-live="polite"
                aria-atomic="true"
                className="sr-only"
                id="announcements-polite"
            >
                {announcements
                    .filter(a => a.priority === 'polite')
                    .map(a => (
                        <div key={a.id}>{a.message}</div>
                    ))
                }
            </div>

            <div
                aria-live="assertive"
                aria-atomic="true"
                className="sr-only"
                id="announcements-assertive"
            >
                {announcements
                    .filter(a => a.priority === 'assertive')
                    .map(a => (
                        <div key={a.id}>{a.message}</div>
                    ))
                }
            </div>
        </AccessibilityAnnouncerContext.Provider>
    );
};
