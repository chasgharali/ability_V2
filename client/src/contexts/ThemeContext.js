import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState('high-contrast');
    const [fontSize, setFontSize] = useState('normal');
    const [reducedMotion, setReducedMotion] = useState(false);

    // Load theme preferences from sessionStorage on mount
    useEffect(() => {
        const savedTheme = sessionStorage.getItem('theme');
        const savedFontSize = sessionStorage.getItem('fontSize');
        const savedReducedMotion = sessionStorage.getItem('reducedMotion');

        if (savedTheme) setTheme(savedTheme);
        if (savedFontSize) setFontSize(savedFontSize);
        if (savedReducedMotion === 'true') setReducedMotion(true);

        // Check for user's system preferences
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setReducedMotion(true);
        }
    }, []);

    // Apply theme changes to document
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.setAttribute('data-font-size', fontSize);
        document.documentElement.setAttribute('data-reduced-motion', reducedMotion);
    }, [theme, fontSize, reducedMotion]);

    const toggleTheme = () => {
        const newTheme = theme === 'high-contrast' ? 'grayscale' : 'high-contrast';
        setTheme(newTheme);
        sessionStorage.setItem('theme', newTheme);
    };

    const setFontSizePreference = (size) => {
        setFontSize(size);
        sessionStorage.setItem('fontSize', size);
    };

    const toggleReducedMotion = () => {
        const newValue = !reducedMotion;
        setReducedMotion(newValue);
        sessionStorage.setItem('reducedMotion', newValue.toString());
    };

    const resetPreferences = () => {
        setTheme('high-contrast');
        setFontSize('normal');
        setReducedMotion(false);
        sessionStorage.removeItem('theme');
        sessionStorage.removeItem('fontSize');
        sessionStorage.removeItem('reducedMotion');
    };

    const value = {
        theme,
        fontSize,
        reducedMotion,
        toggleTheme,
        setFontSizePreference,
        toggleReducedMotion,
        resetPreferences,
        isHighContrast: theme === 'high-contrast',
        isGrayscale: theme === 'grayscale'
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};
