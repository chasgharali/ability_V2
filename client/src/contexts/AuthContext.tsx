import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

// Types
interface User {
    _id: string;
    name: string;
    email: string;
    role: string;
    avatarUrl?: string;
    isActive: boolean;
    languages?: string[];
    isAvailable?: boolean;
    assignedBooth?: string;
    createdAt: string;
}

interface AuthState {
    user: User | null;
    token: string | null;
    refreshToken: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
}

interface AuthContextType extends AuthState {
    login: (email: string, password: string) => Promise<void>;
    register: (userData: RegisterData) => Promise<void>;
    logout: () => void;
    refreshAuthToken: () => Promise<void>;
    updateProfile: (userData: Partial<User>) => Promise<void>;
    clearError: () => void;
}

interface RegisterData {
    name: string;
    email: string;
    password: string;
    role?: string;
    phoneNumber?: string;
    languages?: string[];
}

// Action types
type AuthAction =
    | { type: 'AUTH_START' }
    | { type: 'AUTH_SUCCESS'; payload: { user: User; token: string; refreshToken: string } }
    | { type: 'AUTH_FAILURE'; payload: string }
    | { type: 'AUTH_LOGOUT' }
    | { type: 'AUTH_REFRESH'; payload: { token: string; refreshToken: string } }
    | { type: 'UPDATE_USER'; payload: User }
    | { type: 'CLEAR_ERROR' };

// Initial state
const initialState: AuthState = {
    user: null,
    token: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
};

// Reducer
const authReducer = (state: AuthState, action: AuthAction): AuthState => {
    switch (action.type) {
        case 'AUTH_START':
            return {
                ...state,
                isLoading: true,
                error: null,
            };
        case 'AUTH_SUCCESS':
            return {
                ...state,
                user: action.payload.user,
                token: action.payload.token,
                refreshToken: action.payload.refreshToken,
                isAuthenticated: true,
                isLoading: false,
                error: null,
            };
        case 'AUTH_FAILURE':
            return {
                ...state,
                user: null,
                token: null,
                refreshToken: null,
                isAuthenticated: false,
                isLoading: false,
                error: action.payload,
            };
        case 'AUTH_LOGOUT':
            return {
                ...state,
                user: null,
                token: null,
                refreshToken: null,
                isAuthenticated: false,
                isLoading: false,
                error: null,
            };
        case 'AUTH_REFRESH':
            return {
                ...state,
                token: action.payload.token,
                refreshToken: action.payload.refreshToken,
                error: null,
            };
        case 'UPDATE_USER':
            return {
                ...state,
                user: action.payload,
                error: null,
            };
        case 'CLEAR_ERROR':
            return {
                ...state,
                error: null,
            };
        default:
            return state;
    }
};

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider component
interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [state, dispatch] = useReducer(authReducer, initialState);
    const navigate = useNavigate();

    // Check for existing auth on mount
    useEffect(() => {
        const checkAuth = async () => {
            const token = localStorage.getItem('token');
            const refreshToken = localStorage.getItem('refreshToken');

            if (token && refreshToken) {
                try {
                    // Set token in API headers
                    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

                    // Verify token and get user info
                    const response = await api.get('/auth/me');
                    dispatch({
                        type: 'AUTH_SUCCESS',
                        payload: {
                            user: response.data.user,
                            token,
                            refreshToken,
                        },
                    });
                } catch (error) {
                    // Token is invalid, try to refresh
                    try {
                        await refreshAuthToken();
                    } catch (refreshError) {
                        // Refresh failed, clear auth
                        localStorage.removeItem('token');
                        localStorage.removeItem('refreshToken');
                        dispatch({ type: 'AUTH_LOGOUT' });
                    }
                }
            } else {
                dispatch({ type: 'AUTH_LOGOUT' });
            }
        };

        checkAuth();
    }, []);

    // Auto-refresh token
    useEffect(() => {
        if (state.token && state.refreshToken) {
            const interval = setInterval(() => {
                refreshAuthToken().catch(() => {
                    // Refresh failed, logout user
                    logout();
                });
            }, 14 * 60 * 1000); // Refresh every 14 minutes

            return () => clearInterval(interval);
        }
    }, [state.token, state.refreshToken]);

    // Login function
    const login = async (email: string, password: string): Promise<void> => {
        dispatch({ type: 'AUTH_START' });

        try {
            const response = await api.post('/auth/login', { email, password });
            const { user, tokens } = response.data;

            // Store tokens
            localStorage.setItem('token', tokens.accessToken);
            localStorage.setItem('refreshToken', tokens.refreshToken);

            // Set token in API headers
            api.defaults.headers.common['Authorization'] = `Bearer ${tokens.accessToken}`;

            dispatch({
                type: 'AUTH_SUCCESS',
                payload: {
                    user,
                    token: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                },
            });

            toast.success(`Welcome back, ${user.name}!`);

            // Navigate based on role
            if (['Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Support', 'GlobalSupport'].includes(user.role)) {
                navigate('/dashboard');
            } else {
                navigate('/events');
            }
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || 'Login failed';
            dispatch({ type: 'AUTH_FAILURE', payload: errorMessage });
            toast.error(errorMessage);
            throw error;
        }
    };

    // Register function
    const register = async (userData: RegisterData): Promise<void> => {
        dispatch({ type: 'AUTH_START' });

        try {
            const response = await api.post('/auth/register', userData);
            const { user, tokens } = response.data;

            // Store tokens
            localStorage.setItem('token', tokens.accessToken);
            localStorage.setItem('refreshToken', tokens.refreshToken);

            // Set token in API headers
            api.defaults.headers.common['Authorization'] = `Bearer ${tokens.accessToken}`;

            dispatch({
                type: 'AUTH_SUCCESS',
                payload: {
                    user,
                    token: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                },
            });

            toast.success(`Welcome to Ability V2, ${user.name}!`);
            navigate('/events');
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || 'Registration failed';
            dispatch({ type: 'AUTH_FAILURE', payload: errorMessage });
            toast.error(errorMessage);
            throw error;
        }
    };

    // Logout function
    const logout = (): void => {
        // Clear tokens
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');

        // Clear API headers
        delete api.defaults.headers.common['Authorization'];

        dispatch({ type: 'AUTH_LOGOUT' });
        toast.success('Logged out successfully');
        navigate('/');
    };

    // Refresh auth token
    const refreshAuthToken = async (): Promise<void> => {
        if (!state.refreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            const response = await api.post('/auth/refresh', {
                refreshToken: state.refreshToken,
            });

            const { tokens } = response.data;

            // Store new tokens
            localStorage.setItem('token', tokens.accessToken);
            localStorage.setItem('refreshToken', tokens.refreshToken);

            // Set new token in API headers
            api.defaults.headers.common['Authorization'] = `Bearer ${tokens.accessToken}`;

            dispatch({
                type: 'AUTH_REFRESH',
                payload: {
                    token: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                },
            });
        } catch (error) {
            // Refresh failed, logout user
            logout();
            throw error;
        }
    };

    // Update profile
    const updateProfile = async (userData: Partial<User>): Promise<void> => {
        try {
            const response = await api.put('/auth/profile', userData);
            const { user } = response.data;

            dispatch({ type: 'UPDATE_USER', payload: user });
            toast.success('Profile updated successfully');
        } catch (error: any) {
            const errorMessage = error.response?.data?.message || 'Profile update failed';
            toast.error(errorMessage);
            throw error;
        }
    };

    // Clear error
    const clearError = (): void => {
        dispatch({ type: 'CLEAR_ERROR' });
    };

    const value: AuthContextType = {
        ...state,
        login,
        register,
        logout,
        refreshAuthToken,
        updateProfile,
        clearError,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// Hook to use auth context
export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export default AuthContext;
