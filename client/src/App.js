import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { AccessibilityAnnouncer } from './components/Accessibility/AccessibilityAnnouncer';
import { FocusManager } from './components/Accessibility/FocusManager';
import LoginPage from './components/Auth/LoginPage';
import RegisterPage from './components/Auth/RegisterPage';
import VerifyEmailSent from './components/Auth/VerifyEmailSent';
import VerifyEmailSuccess from './components/Auth/VerifyEmailSuccess';
import Dashboard from './components/Dashboard/Dashboard';
import BoothManagement from './components/BoothManagement/BoothManagement';
import EventManagement from './components/EventManagement/EventManagement';
import BrandingHeaderLogo from './components/Branding/BrandingHeaderLogo';
import UpcomingEvents from './components/Events/UpcomingEvents';
import RegisteredEvents from './components/Events/RegisteredEvents';
import EventDetail from './components/Events/EventDetail';
import RegisteredEventDetail from './components/Events/RegisteredEventDetail';
import RegistrationWizard from './components/Events/RegistrationWizard';
import TermsConditionsList from './components/TermsConditions/TermsConditionsList';
import TermsConditionsForm from './components/TermsConditions/TermsConditionsForm';
import TermsConditionsView from './components/TermsConditions/TermsConditionsView';
import UserManagement from './components/UserManagement/UserManagement';
import InterpreterCategories from './components/InterpreterCategories/InterpreterCategories';
import BoothQueueEntry from './components/BoothQueue/BoothQueueEntry';
import BoothQueueWaiting from './components/BoothQueue/BoothQueueWaiting';
import BoothQueueManagement from './components/BoothQueue/BoothQueueManagement';
import { MdPerson, MdBusiness } from 'react-icons/md';
import './App.css';

// Landing page component
const LandingPage = () => {
    const handleSkipToContent = (e) => {
        e.preventDefault();
        const loginTypes = document.querySelector('.login-types');
        if (loginTypes) {
            const firstButton = loginTypes.querySelector('a');
            if (firstButton) {
                firstButton.focus();
            }
        }
    };

    return (
        <main className="landing-page">
            <a href="#login-types" className="skip-link" onClick={handleSkipToContent}>
                Skip to login options
            </a>
            <div className="landing-container">
                <h1>Choose Your Login Type</h1>

                <div id="login-types" className="login-types">
                    {/* Job Seeker Section */}
                    <div className="login-type-card">
                        <div className="login-type-icon">
                            <MdPerson className="icon" />
                        </div>
                        <div className="login-type-content">
                            <h2>Job Seeker</h2>
                            <p>Looking for your next career opportunity? Access virtual job fairs and connect with employers.</p>
                            <a href="/login" className="login-type-button">
                                Sign in as Job Seeker
                            </a>
                        </div>
                    </div>

                    {/* Company & Staff Section */}
                    <div className="login-type-card">
                        <div className="login-type-icon">
                            <MdBusiness className="icon" />
                        </div>
                        <div className="login-type-content">
                            <h2>Company & Staff</h2>
                            <p>Recruiters, admins, and support staff. Manage booths, conduct interviews, and support job seekers.</p>
                            <a href="/login" className="login-type-button">
                                Sign in as Company/Staff
                            </a>
                        </div>
                    </div>
                </div>

                {/* Registration Link */}
                <div className="registration-link">
                    <p>New to job fairs? <a href="/register" className="register-link">Register as a job seeker</a></p>
                </div>
            </div>
        </main>
    );
};

// Component to conditionally render header and footer
const AppLayout = ({ children }) => {
    const location = useLocation();
    const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
    const isLandingPage = location.pathname === '/';

    return (
        <div className="App">
            <main id="main-content" role="main">
                {children}
            </main>

            <AccessibilityAnnouncer />
            <FocusManager />
        </div>
    );
};

function App() {
    const RequireAuth = ({ children }) => {
        const { user, loading } = useAuth();
        if (loading) return null; // could render a spinner if desired
        if (!user) return <Navigate to="/login" replace />;
        return children;
    };
    return (
        <ThemeProvider>
            <AuthProvider>
                <SocketProvider>
                    <ToastProvider>
                        <Router>
                            <AppLayout>
                                <Routes>
                                <Route path="/" element={<LandingPage />} />
                                <Route path="/login" element={<LoginPage />} />
                                <Route path="/register" element={<RegisterPage />} />
                                <Route path="/verify-email-sent" element={<VerifyEmailSent />} />
                                <Route path="/email-verified" element={<VerifyEmailSuccess />} />
                                <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
                                <Route path="/dashboard/my-account" element={<RequireAuth><Dashboard /></RequireAuth>} />
                                <Route path="/dashboard/survey" element={<RequireAuth><Dashboard /></RequireAuth>} />
                                <Route path="/dashboard/edit-profile" element={<RequireAuth><Dashboard /></RequireAuth>} />
                                <Route path="/dashboard/view-profile" element={<RequireAuth><Dashboard /></RequireAuth>} />
                                <Route path="/dashboard/delete-account" element={<RequireAuth><Dashboard /></RequireAuth>} />
                                <Route path="/boothmanagement" element={<RequireAuth><BoothManagement /></RequireAuth>} />
                                <Route path="/eventmanagement" element={<RequireAuth><EventManagement /></RequireAuth>} />
                                <Route path="/branding" element={<RequireAuth><BrandingHeaderLogo /></RequireAuth>} />
                                <Route path="/users" element={<RequireAuth><UserManagement /></RequireAuth>} />
                                {/* Job Seeker event flow */}
                                <Route path="/events/upcoming" element={<RequireAuth><UpcomingEvents /></RequireAuth>} />
                                <Route path="/events/registered" element={<RequireAuth><RegisteredEvents /></RequireAuth>} />
                                <Route path="/events/registered/:slug" element={<RequireAuth><RegisteredEventDetail /></RequireAuth>} />
                                <Route path="/event/:slug" element={<RequireAuth><EventDetail /></RequireAuth>} />
                                <Route path="/event/:slug/register" element={<RegistrationWizard />} />
                                <Route path="/terms-conditions" element={<RequireAuth><TermsConditionsList /></RequireAuth>} />
                                <Route path="/terms-conditions/create" element={<RequireAuth><TermsConditionsForm /></RequireAuth>} />
                                <Route path="/terms-conditions/:id" element={<RequireAuth><TermsConditionsView /></RequireAuth>} />
                                <Route path="/terms-conditions/:id/edit" element={<RequireAuth><TermsConditionsForm /></RequireAuth>} />
                                <Route path="/interpreter-categories" element={<RequireAuth><InterpreterCategories /></RequireAuth>} />
                                {/* Booth Queue Routes */}
                                <Route path="/booth-queue/:eventSlug/:boothId/entry" element={<RequireAuth><BoothQueueEntry /></RequireAuth>} />
                                <Route path="/booth-queue/:eventSlug/:boothId/waiting" element={<RequireAuth><BoothQueueWaiting /></RequireAuth>} />
                                <Route path="/booth-queue/manage/:boothId" element={<RequireAuth><BoothQueueManagement /></RequireAuth>} />
                                </Routes>
                            </AppLayout>
                        </Router>
                    </ToastProvider>
                </SocketProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}

export default App;
