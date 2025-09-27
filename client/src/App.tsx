import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';

// Context providers
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { ThemeProvider } from './contexts/ThemeContext';

// Layout components
import Layout from './components/Layout/Layout';
import ProtectedRoute from './components/Auth/ProtectedRoute';

// Page components
import HomePage from './pages/HomePage';
import LoginPage from './pages/Auth/LoginPage';
import RegisterPage from './pages/Auth/RegisterPage';
import EventsPage from './pages/Events/EventsPage';
import EventDetailPage from './pages/Events/EventDetailPage';
import BoothPage from './pages/Booth/BoothPage';
import QueuePage from './pages/Queue/QueuePage';
import CallPage from './pages/Call/CallPage';
import ProfilePage from './pages/Profile/ProfilePage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import NotFoundPage from './pages/NotFoundPage';

// Accessibility components
import AccessibilityAnnouncer from './components/Accessibility/AccessibilityAnnouncer';
import FocusManager from './components/Accessibility/FocusManager';

// Create React Query client
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 5 * 60 * 1000, // 5 minutes
        },
    },
});

function App() {
    return (
        <HelmetProvider>
            <QueryClientProvider client={queryClient}>
                <ThemeProvider>
                    <AuthProvider>
                        <SocketProvider>
                            <Router>
                                <div className="App">
                                    {/* Accessibility components */}
                                    <AccessibilityAnnouncer />
                                    <FocusManager />

                                    {/* Main application */}
                                    <Layout>
                                        <Routes>
                                            {/* Public routes */}
                                            <Route path="/" element={<HomePage />} />
                                            <Route path="/login" element={<LoginPage />} />
                                            <Route path="/register" element={<RegisterPage />} />

                                            {/* Protected routes */}
                                            <Route path="/events" element={
                                                <ProtectedRoute>
                                                    <EventsPage />
                                                </ProtectedRoute>
                                            } />

                                            <Route path="/events/:id" element={
                                                <ProtectedRoute>
                                                    <EventDetailPage />
                                                </ProtectedRoute>
                                            } />

                                            <Route path="/booths/:id" element={
                                                <ProtectedRoute>
                                                    <BoothPage />
                                                </ProtectedRoute>
                                            } />

                                            <Route path="/queue/:id" element={
                                                <ProtectedRoute>
                                                    <QueuePage />
                                                </ProtectedRoute>
                                            } />

                                            <Route path="/call/:id" element={
                                                <ProtectedRoute>
                                                    <CallPage />
                                                </ProtectedRoute>
                                            } />

                                            <Route path="/profile" element={
                                                <ProtectedRoute>
                                                    <ProfilePage />
                                                </ProtectedRoute>
                                            } />

                                            <Route path="/dashboard" element={
                                                <ProtectedRoute allowedRoles={['Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Support', 'GlobalSupport']}>
                                                    <DashboardPage />
                                                </ProtectedRoute>
                                            } />

                                            {/* Catch all route */}
                                            <Route path="*" element={<NotFoundPage />} />
                                        </Routes>
                                    </Layout>

                                    {/* Toast notifications */}
                                    <Toaster
                                        position="top-right"
                                        toastOptions={{
                                            duration: 4000,
                                            style: {
                                                background: '#000',
                                                color: '#fff',
                                                fontSize: '1rem',
                                                padding: '1rem',
                                                borderRadius: '8px',
                                                maxWidth: '400px',
                                            },
                                            success: {
                                                iconTheme: {
                                                    primary: '#4ade80',
                                                    secondary: '#000',
                                                },
                                            },
                                            error: {
                                                iconTheme: {
                                                    primary: '#ef4444',
                                                    secondary: '#000',
                                                },
                                            },
                                        }}
                                    />
                                </div>
                            </Router>
                        </SocketProvider>
                    </AuthProvider>
                </ThemeProvider>
            </QueryClientProvider>
        </HelmetProvider>
    );
}

export default App;
