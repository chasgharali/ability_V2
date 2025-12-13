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

    // Refresh auth token function
    const refreshAuthToken = async () => {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            const response = await axios.post('/api/auth/refresh', {
                refreshToken: refreshToken
            });

            const { tokens } = response.data;
            localStorage.setItem('token', tokens.accessToken);
            localStorage.setItem('refreshToken', tokens.refreshToken);
            
            return tokens.accessToken;
        } catch (error) {
            // Refresh failed, clear auth and redirect to login
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            setUser(null);
            window.location.href = '/login';
            throw error;
        }
    };

    // Set up axios interceptor for automatic token refresh
    useEffect(() => {
        let isRefreshingToken = false;
        let failedQueue = [];

        const processQueue = (error, token = null) => {
            failedQueue.forEach(prom => {
                if (error) {
                    prom.reject(error);
                } else {
                    prom.resolve(token);
                }
            });
            failedQueue = [];
        };

        // Request interceptor - add token to requests
        const requestInterceptor = axios.interceptors.request.use(
            (config) => {
                const token = localStorage.getItem('token');
                if (token) {
                    config.headers.Authorization = `Bearer ${token}`;
                }
                return config;
            },
            (error) => {
                return Promise.reject(error);
            }
        );

        // Response interceptor - handle 401 errors and refresh token
        const responseInterceptor = axios.interceptors.response.use(
            (response) => {
                return response;
            },
            async (error) => {
                const originalRequest = error.config;

                // Don't intercept refresh token requests to avoid infinite loops
                if (originalRequest.url?.includes('/auth/refresh')) {
                    return Promise.reject(error);
                }

                // If error is 401 and we haven't tried to refresh yet
                if (error.response?.status === 401 && !originalRequest._retry) {
                    if (isRefreshingToken) {
                        // If already refreshing, queue this request
                        return new Promise((resolve, reject) => {
                            failedQueue.push({ resolve, reject });
                        })
                            .then(token => {
                                originalRequest.headers.Authorization = `Bearer ${token}`;
                                return axios(originalRequest);
                            })
                            .catch(err => {
                                return Promise.reject(err);
                            });
                    }

                    originalRequest._retry = true;
                    isRefreshingToken = true;

                    try {
                        const newToken = await refreshAuthToken();
                        processQueue(null, newToken);
                        originalRequest.headers.Authorization = `Bearer ${newToken}`;
                        return axios(originalRequest);
                    } catch (refreshError) {
                        processQueue(refreshError, null);
                        return Promise.reject(refreshError);
                    } finally {
                        isRefreshingToken = false;
                    }
                }

                return Promise.reject(error);
            }
        );

        // Cleanup interceptors on unmount
        return () => {
            axios.interceptors.request.eject(requestInterceptor);
            axios.interceptors.response.eject(responseInterceptor);
        };
    }, []);

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

    // Update current user's profile
    const updateProfile = async (profileData) => {
        try {
            setError(null);
            const token = localStorage.getItem('token');
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
            const token = localStorage.getItem('token');
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
            localStorage.setItem('token', tokens.accessToken);
            localStorage.setItem('refreshToken', tokens.refreshToken);
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
        updateProfile,
        changePassword,
        refreshAuthToken,
        isAuthenticated: !!user
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
