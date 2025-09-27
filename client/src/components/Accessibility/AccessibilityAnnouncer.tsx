import React, { createContext, useContext, useState, ReactNode } from 'react';

// Types
interface AccessibilityAnnouncerContextType {
    announce: (message: string, priority?: 'polite' | 'assertive') => void;
}

// Create context
const AccessibilityAnnouncerContext = createContext<AccessibilityAnnouncerContextType | undefined>(undefined);

// Provider component
interface AccessibilityAnnouncerProviderProps {
    children: ReactNode;
}

export const AccessibilityAnnouncerProvider: React.FC<AccessibilityAnnouncerProviderProps> = ({ children }) => {
    const [announcements, setAnnouncements] = useState<Array<{ id: string; message: string; priority: 'polite' | 'assertive' }>>([]);

    const announce = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
        const id = Date.now().toString();
        setAnnouncements(prev => [...prev, { id, message, priority }]);

        // Remove announcement after 5 seconds
        setTimeout(() => {
            setAnnouncements(prev => prev.filter(announcement => announcement.id !== id));
        }, 5000);
    };

    const value: AccessibilityAnnouncerContextType = {
        announce,
    };

    return (
        <AccessibilityAnnouncerContext.Provider value={value}>
            {children}
            {/* Live regions for screen reader announcements */}
            <div aria-live="polite" aria-atomic="true" className="sr-only">
                {announcements
                    .filter(announcement => announcement.priority === 'polite')
                    .map(announcement => (
                        <div key={announcement.id}>{announcement.message}</div>
                    ))}
            </div>
            <div aria-live="assertive" aria-atomic="true" className="sr-only">
                {announcements
                    .filter(announcement => announcement.priority === 'assertive')
                    .map(announcement => (
                        <div key={announcement.id}>{announcement.message}</div>
                    ))}
            </div>
        </AccessibilityAnnouncerContext.Provider>
    );
};

// Hook to use accessibility announcer
export const useAccessibilityAnnouncer = (): AccessibilityAnnouncerContextType => {
    const context = useContext(AccessibilityAnnouncerContext);
    if (context === undefined) {
        throw new Error('useAccessibilityAnnouncer must be used within an AccessibilityAnnouncerProvider');
    }
    return context;
};

// Main component that wraps the provider
const AccessibilityAnnouncer: React.FC<{ children: ReactNode }> = ({ children }) => {
    return (
        <AccessibilityAnnouncerProvider>
            {children}
        </AccessibilityAnnouncerProvider>
    );
};

export default AccessibilityAnnouncer;
