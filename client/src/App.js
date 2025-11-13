import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { AccessibilityAnnouncer } from './components/Accessibility/AccessibilityAnnouncer';
import { FocusManager } from './components/Accessibility/FocusManager';
import ChatPanel from './components/Chat/ChatPanel';
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
import JobSeekerManagement from './components/JobSeekerManagement/JobSeekerManagement';
import MeetingRecords from './components/MeetingRecords/MeetingRecords';
import MeetingRecordDetail from './components/MeetingRecords/MeetingRecordDetail';
import JobSeekerInterests from './components/JobSeekerInterests/JobSeekerInterests';
import InterpreterCategories from './components/InterpreterCategories/InterpreterCategories';
import BoothQueueEntry from './components/BoothQueue/BoothQueueEntry';
import BoothQueueWaiting from './components/BoothQueue/BoothQueueWaiting';
import BoothQueueManagement from './components/BoothQueue/BoothQueueManagement';
import VideoCall from './components/VideoCall/VideoCall';
import QueueInviteResolver from './components/BoothQueue/QueueInviteResolver';
import LandingPage from './components/Landing/LandingPage';
import Analytics from './components/Analytics/Analytics';
import './App.css';

// Component to conditionally render header and footer
const AppLayout = ({ children }) => {
    const { user } = useAuth();
    
    // Roles that should have access to Team Chat
    const chatEnabledRoles = ['Recruiter', 'BoothAdmin', 'Support', 'GlobalSupport', 'Admin', 'Interpreter'];
    const showChat = user && chatEnabledRoles.includes(user.role);
    
    return (
        <div className="App">
            <main id="main-content" role="main">
                {children}
            </main>

            {/* Show ChatPanel for authenticated users (excluding JobSeekers) */}
            {showChat && <ChatPanel />}

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
                                <Route path="/usermanagement" element={<RequireAuth><UserManagement /></RequireAuth>} />
                                <Route path="/jobseekermanagement" element={<RequireAuth><JobSeekerManagement /></RequireAuth>} />
                                <Route path="/meeting-records" element={<RequireAuth><MeetingRecords /></RequireAuth>} />
                                <Route path="/meeting-records/:id" element={<RequireAuth><MeetingRecordDetail /></RequireAuth>} />
                                <Route path="/jobseeker-interests" element={<RequireAuth><JobSeekerInterests /></RequireAuth>} />
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
                                <Route path="/analytics" element={<RequireAuth><Analytics /></RequireAuth>} />
                                {/* Booth Queue Routes */}
                                <Route path="/queue/:inviteSlug" element={<RequireAuth><QueueInviteResolver /></RequireAuth>} />
                                <Route path="/booth-queue/:eventSlug/:boothId/entry" element={<RequireAuth><BoothQueueEntry /></RequireAuth>} />
                                <Route path="/booth-queue/:eventSlug/:boothId/waiting" element={<RequireAuth><BoothQueueWaiting /></RequireAuth>} />
                                <Route path="/booth-queue/manage/:boothId" element={<RequireAuth><BoothQueueManagement /></RequireAuth>} />
                                <Route path="/video-call/:callId" element={<RequireAuth><VideoCall /></RequireAuth>} />
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
