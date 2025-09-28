import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AccessibilityAnnouncer } from './components/Accessibility/AccessibilityAnnouncer';
import { FocusManager } from './components/Accessibility/FocusManager';
import LoginPage from './components/Auth/LoginPage';
import RegisterPage from './components/Auth/RegisterPage';
import Dashboard from './components/Dashboard/Dashboard';
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
    return (
        <ThemeProvider>
            <AuthProvider>
                <SocketProvider>
                    <Router>
                        <AppLayout>
                            <Routes>
                                <Route path="/" element={<LandingPage />} />
                                <Route path="/login" element={<LoginPage />} />
                                <Route path="/register" element={<RegisterPage />} />
                                <Route path="/dashboard" element={<Dashboard />} />
                                <Route path="/dashboard/my-account" element={<Dashboard />} />
                                <Route path="/dashboard/survey" element={<Dashboard />} />
                            </Routes>
                        </AppLayout>
                    </Router>
                </SocketProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}

export default App;
