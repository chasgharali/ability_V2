import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

// Types
interface ThemeContextType {
    theme: 'light' | 'dark' | 'high-contrast';
    toggleTheme: () => void;
    setTheme: (theme: 'light' | 'dark' | 'high-contrast') => void;
    fontSize: 'small' | 'medium' | 'large';
    setFontSize: (size: 'small' | 'medium' | 'large') => void;
    reducedMotion: boolean;
    setReducedMotion: (reduced: boolean) => void;
}

// Create context
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Provider component
interface ThemeProviderProps {
    children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
    const [theme, setThemeState] = useState<'light' | 'dark' | 'high-contrast'>('high-contrast');
    const [fontSize, setFontSizeState] = useState<'small' | 'medium' | 'large'>('medium');
    const [reducedMotion, setReducedMotionState] = useState(false);

    // Load preferences from localStorage on mount
    useEffect(() => {
        const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'high-contrast';
        const savedFontSize = localStorage.getItem('fontSize') as 'small' | 'medium' | 'large';
        const savedReducedMotion = localStorage.getItem('reducedMotion') === 'true';

        if (savedTheme) {
            setThemeState(savedTheme);
        }
        if (savedFontSize) {
            setFontSizeState(savedFontSize);
        }
        setReducedMotionState(savedReducedMotion);

        // Check for system preferences
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            setReducedMotionState(true);
        }
    }, []);

    // Apply theme to document
    useEffect(() => {
        const root = document.documentElement;

        // Remove existing theme classes
        root.classList.remove('theme-light', 'theme-dark', 'theme-high-contrast');

        // Add current theme class
        root.classList.add(`theme-${theme}`);

        // Save to localStorage
        localStorage.setItem('theme', theme);
    }, [theme]);

    // Apply font size to document
    useEffect(() => {
        const root = document.documentElement;

        // Remove existing font size classes
        root.classList.remove('font-small', 'font-medium', 'font-large');

        // Add current font size class
        root.classList.add(`font-${fontSize}`);

        // Save to localStorage
        localStorage.setItem('fontSize', fontSize);
    }, [fontSize]);

    // Apply reduced motion to document
    useEffect(() => {
        const root = document.documentElement;

        if (reducedMotion) {
            root.classList.add('reduced-motion');
        } else {
            root.classList.remove('reduced-motion');
        }

        // Save to localStorage
        localStorage.setItem('reducedMotion', reducedMotion.toString());
    }, [reducedMotion]);

    // Toggle theme
    const toggleTheme = () => {
        const themes: ('light' | 'dark' | 'high-contrast')[] = ['light', 'dark', 'high-contrast'];
        const currentIndex = themes.indexOf(theme);
        const nextIndex = (currentIndex + 1) % themes.length;
        setThemeState(themes[nextIndex]);
    };

    // Set theme
    const setTheme = (newTheme: 'light' | 'dark' | 'high-contrast') => {
        setThemeState(newTheme);
    };

    // Set font size
    const setFontSize = (size: 'small' | 'medium' | 'large') => {
        setFontSizeState(size);
    };

    // Set reduced motion
    const setReducedMotion = (reduced: boolean) => {
        setReducedMotionState(reduced);
    };

    const value: ThemeContextType = {
        theme,
        toggleTheme,
        setTheme,
        fontSize,
        setFontSize,
        reducedMotion,
        setReducedMotion,
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

// Hook to use theme context
export const useTheme = (): ThemeContextType => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

export default ThemeContext;
