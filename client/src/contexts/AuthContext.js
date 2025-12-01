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
        const token = sessionStorage.getItem('token');
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
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('refreshToken');
        } finally {
            setLoading(false);
        }
    };

    // Update current user's profile
    const updateProfile = async (profileData) => {
        try {
            setError(null);
            const token = sessionStorage.getItem('token');
            const response = await axios.put('/api/auth/profile', profileData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Update local user with server's canonical data
            setUser(response.data.user);
            return { success: true, user: response.data.user };
        } catch (error) {
            const errorMessage = error.response?.data?.message || 'Profile update failed';
            setError(errorMessage);
            return { success: false, error: errorMessage };
        }
    };

    // Change password
    const changePassword = async (currentPassword, newPassword) => {
        try {
            setError(null);
            const token = sessionStorage.getItem('token');
            const response = await axios.post('/api/auth/change-password', { currentPassword, newPassword }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return { success: true, message: response.data?.message || 'Password changed successfully' };
        } catch (error) {
            const errorMessage = error.response?.data?.message || 'Password change failed';
            setError(errorMessage);
            return { success: false, error: errorMessage };
        }
    };

    const login = async (email, password, loginType) => {
        try {
            setError(null);
            const response = await axios.post('/api/auth/login', {
                email,
                password,
                loginType
            });

            const { tokens, user } = response.data;
            sessionStorage.setItem('token', tokens.accessToken);
            sessionStorage.setItem('refreshToken', tokens.refreshToken);
            setUser(user);
            return { success: true };
        } catch (error) {
            const status = error.response?.status;
            const data = error.response?.data || {};
            let errorMessage;

            if (status === 401) {
                errorMessage = 'Invalid email or password';
            } else if (status === 403 && (data?.error === 'Role not allowed' || /Please use the (Company|Job) Seeker login/i.test(data?.message || ''))) {
                errorMessage = data?.message || 'This account type is not allowed on the selected login. Try the other login tab.';
            } else if (status === 403 || data?.error === 'Account deactivated' || /deactivated/i.test(data?.message || '')) {
                errorMessage = 'Your account has been deactivated. Please contact support.';
            } else {
                errorMessage = data?.message || 'Login failed';
            }
            setError(errorMessage);
            return { success: false, error: errorMessage };
        }
    };

    const register = async (userData) => {
        try {
            setError(null);
            const response = await axios.post('/api/auth/register', userData);

            const { tokens, user } = response.data;
            sessionStorage.setItem('token', tokens.accessToken);
            sessionStorage.setItem('refreshToken', tokens.refreshToken);
            setUser(user);
            return { success: true };
        } catch (error) {
            const errorMessage = error.response?.data?.message || 'Registration failed';
            setError(errorMessage);
            return { success: false, error: errorMessage };
        }
    };

    const logout = () => {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('refreshToken');
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
        updateProfile,
        changePassword,
        isAuthenticated: !!user
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
