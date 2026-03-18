import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { useAuth } from './contexts/AuthContext';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { RoleMessagesProvider } from './contexts/RoleMessagesContext';
import { AccessibilityAnnouncer } from './components/Accessibility/AccessibilityAnnouncer';
import { GlobalRouteObserver } from './components/Accessibility/FocusManager';
import ChatPanel from './components/Chat/ChatPanel';
import LoginPage from './components/Auth/LoginPage';
import RegisterPage from './components/Auth/RegisterPage';
import ForgotPassword from './components/Auth/ForgotPassword';
import ResetPassword from './components/Auth/ResetPassword';
import VerifyEmailSent from './components/Auth/VerifyEmailSent';
import VerifyEmailSuccess from './components/Auth/VerifyEmailSuccess';
import EmailChangeVerified from './components/Auth/EmailChangeVerified';
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
import RegisteredJobSeekerManagement from './components/JobSeekerManagement/RegisteredJobSeekerManagement';
import MeetingRecords from './components/MeetingRecords/MeetingRecords';
import MeetingRecordDetail from './components/MeetingRecords/MeetingRecordDetail';
import JobSeekerInterests from './components/JobSeekerInterests/JobSeekerInterests';
import JobSeekerSurvey from './components/JobSeekerSurvey/JobSeekerSurvey';
import JobSeekerQualifications from './components/JobSeekerQualifications/JobSeekerQualifications';
import InterpreterCategories from './components/InterpreterCategories/InterpreterCategories';
import BoothQueueEntry from './components/BoothQueue/BoothQueueEntry';
import BoothQueueWaiting from './components/BoothQueue/BoothQueueWaiting';
import BoothQueueManagement from './components/BoothQueue/BoothQueueManagement';
import VideoCall from './components/VideoCall/VideoCall';
import QueueInviteResolver from './components/BoothQueue/QueueInviteResolver';
import LandingPage from './components/Landing/LandingPage';
import Analytics from './components/Analytics/Analytics';
import NoteManagement from './components/Notes/NoteManagement';
import NoteForm from './components/Notes/NoteForm';
import NoteView from './components/Notes/NoteView';
import NoteViewUser from './components/Notes/NoteViewUser';
import RoleMessageManagement from './components/RoleMessages/RoleMessageManagement';
import OrganizationManagement from './components/OrganizationManagement/OrganizationManagement';
import UserOrgAssignment from './components/UserManagement/UserOrgAssignment';
import './App.css';

// Component to conditionally render header and footer
const AppLayout = ({ children }) => {
    const { user } = useAuth();

    // Roles that should have access to Team Chat
    const chatEnabledRoles = new Set(
        ['Recruiter', 'BoothAdmin', 'Support', 'GlobalSupport', 'Interpreter', 'GlobalInterpreter']
            .map(role => role.toLowerCase())
    );
    const showChat = user && user.role && chatEnabledRoles.has(user.role.toLowerCase());

    return (
        <div className="App">
            {children}

            {/* Show ChatPanel for authenticated users with chat-enabled roles */}
            {showChat && <ChatPanel />}

            <AccessibilityAnnouncer />
            <GlobalRouteObserver />
        </div>
    );
};

function App() {
    const RequireAuth = ({ children }) => {
        const { user, loading } = useAuth();
        const location = useLocation();
        
        if (loading) return null; // could render a spinner if desired
        
        if (!user) {
            // Check if this is a queue invite link - store it for redirect after login
            if (location.pathname.startsWith('/queue/')) {
                const inviteSlug = location.pathname.replace('/queue/', '');
                localStorage.setItem('pendingQueueInvite', inviteSlug);
            }
            // Pass the original location so login can redirect back
            return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
        }
        return children;
    };

    // Route that shows full JobSeekerManagement for SuperAdmin, and RegisteredJobSeekerManagement for Admin
    const JobSeekerManagementRouter = () => {
        const { user } = useAuth();
        if (user?.role === 'SuperAdmin') return <JobSeekerManagement />;
        if (user?.role === 'Admin' || user?.role === 'AdminEvent') return <RegisteredJobSeekerManagement />;
        return <JobSeekerManagement />;
    };

    const RequireRole = ({ children, allowedRoles }) => {
        const { user, loading } = useAuth();
        const location = useLocation();
        
        if (loading) return null;
        
        if (!user) {
            return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
        }
        
        if (allowedRoles && !allowedRoles.includes(user.role)) {
            // Redirect unauthorized users to dashboard
            return <Navigate to="/dashboard" replace />;
        }
        
        return children;
    };
    return (
        <HelmetProvider>
        <ThemeProvider>
            <AuthProvider>
                <RoleMessagesProvider>
                    <SocketProvider>
                        <ToastProvider>
                        <Router>
                            <AppLayout>
                                <Routes>
                                    <Route path="/" element={<LandingPage />} />
                                    <Route path="/login" element={<LoginPage />} />
                                    <Route path="/register" element={<RegisterPage />} />
                                    <Route path="/forgot-password" element={<ForgotPassword />} />
                                    <Route path="/reset-password" element={<ResetPassword />} />
                                    <Route path="/verify-email-sent" element={<VerifyEmailSent />} />
                                    <Route path="/email-verified" element={<VerifyEmailSuccess />} />
                                    <Route path="/email-change-verified" element={<EmailChangeVerified />} />
                                    <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
                                    <Route path="/dashboard/my-account" element={<RequireAuth><Dashboard /></RequireAuth>} />
                                    <Route path="/dashboard/survey" element={<RequireAuth><Dashboard /></RequireAuth>} />
                                    <Route path="/dashboard/edit-profile" element={<RequireAuth><Dashboard /></RequireAuth>} />
                                    <Route path="/dashboard/view-profile" element={<RequireAuth><Dashboard /></RequireAuth>} />
                                    <Route path="/dashboard/delete-account" element={<RequireAuth><Dashboard /></RequireAuth>} />
                                    <Route path="/boothmanagement" element={<RequireAuth><RequireRole allowedRoles={['Admin', 'AdminEvent', 'GlobalSupport']}><BoothManagement /></RequireRole></RequireAuth>} />
                                    <Route path="/eventmanagement" element={<RequireAuth><EventManagement /></RequireAuth>} />
                                    <Route
                                        path="/branding"
                                        element={
                                            <RequireAuth>
                                                <RequireRole allowedRoles={['Admin', 'GlobalSupport', 'SuperAdmin']}>
                                                    <BrandingHeaderLogo />
                                                </RequireRole>
                                            </RequireAuth>
                                        }
                                    />
                                    <Route path="/usermanagement" element={<RequireAuth><UserManagement /></RequireAuth>} />
                                    <Route path="/jobseekermanagement" element={
                                        <RequireAuth>
                                            {/* SuperAdmin sees all job seekers; Admin sees only their org's registered job seekers */}
                                            <JobSeekerManagementRouter />
                                        </RequireAuth>
                                    } />
                                    <Route path="/meeting-records" element={<RequireAuth><MeetingRecords /></RequireAuth>} />
                                    <Route path="/meeting-records/:id" element={<RequireAuth><MeetingRecordDetail /></RequireAuth>} />
                                    <Route path="/jobseeker-interests" element={<RequireAuth><JobSeekerInterests /></RequireAuth>} />
                                    <Route path="/jobseeker-survey" element={<RequireAuth><JobSeekerSurvey /></RequireAuth>} />
                                    <Route path="/jobseeker-qualifications" element={<RequireAuth><JobSeekerQualifications /></RequireAuth>} />
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
                                    {/* Notes Routes */}
                                    <Route path="/notes" element={<RequireAuth><NoteManagement /></RequireAuth>} />
                                    <Route path="/notes/create" element={<RequireAuth><NoteForm /></RequireAuth>} />
                                    <Route path="/notes/:id" element={<RequireAuth><NoteView /></RequireAuth>} />
                                    <Route path="/notes/:id/edit" element={<RequireAuth><NoteForm /></RequireAuth>} />
                                    <Route path="/troubleshooting" element={<RequireAuth><NoteViewUser type="troubleshooting" /></RequireAuth>} />
                                    <Route path="/instructions" element={<RequireAuth><NoteViewUser type="instruction" /></RequireAuth>} />
                                    <Route path="/role-messages" element={<RequireAuth><RoleMessageManagement /></RequireAuth>} />
                                    {/* Organization Management (SuperAdmin) */}
                                    <Route path="/organizations" element={<RequireAuth><RequireRole allowedRoles={['SuperAdmin']}><OrganizationManagement /></RequireRole></RequireAuth>} />
                                    <Route path="/org-users" element={<RequireAuth><RequireRole allowedRoles={['SuperAdmin']}><UserOrgAssignment /></RequireRole></RequireAuth>} />
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
                </RoleMessagesProvider>
            </AuthProvider>
        </ThemeProvider>
        </HelmetProvider>
    );
}

export default App;
