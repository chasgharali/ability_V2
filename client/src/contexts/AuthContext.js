import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Check for existing token on mount
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            // Verify token with backend
            verifyToken(token);
        } else {
            setLoading(false);
        }
    }, []);

    const verifyToken = async (token) => {
        try {
            const response = await axios.get('/api/auth/me', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUser(response.data.user);
        } catch (error) {
            console.error('Token verification failed:', error);
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
        } finally {
            setLoading(false);
        }
    };

    const login = async (email, password) => {
        try {
            setError(null);
            const response = await axios.post('/api/auth/login', {
                email,
                password
            });

            const { tokens, user } = response.data;
            localStorage.setItem('token', tokens.accessToken);
            localStorage.setItem('refreshToken', tokens.refreshToken);
            setUser(user);
            return { success: true };
        } catch (error) {
            const errorMessage = error.response?.data?.message || 'Login failed';
            setError(errorMessage);
            return { success: false, error: errorMessage };
        }
    };

    const register = async (userData) => {
        try {
            setError(null);
            const response = await axios.post('/api/auth/register', userData);

            const { tokens, user } = response.data;
            localStorage.setItem('token', tokens.accessToken);
            localStorage.setItem('refreshToken', tokens.refreshToken);
            setUser(user);
            return { success: true };
        } catch (error) {
            const errorMessage = error.response?.data?.message || 'Registration failed';
            setError(errorMessage);
            return { success: false, error: errorMessage };
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        setUser(null);
        setError(null);
    };

    const value = {
        user,
        loading,
        error,
        login,
        register,
        logout,
        isAuthenticated: !!user
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
