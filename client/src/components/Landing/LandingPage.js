import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MdPerson, MdBusiness } from 'react-icons/md';
import './LandingPage.css';

const LandingPage = () => {
    const navigate = useNavigate();

    const handleLogin = (userType) => {
        navigate('/login', { state: { userType } });
    };

    return (
        <main className="landing-page-container">
            <div className="landing-card">
                <h1 className="landing-title">Choose Your Login Type</h1>
                <div className="login-options">
                    <div className="login-option-card">
                        <MdPerson className="login-option-icon" />
                        <h2 className="login-option-title">Job Seeker</h2>
                        <p className="login-option-description">Looking for your next career opportunity? Access virtual job fairs and connect with employers.</p>
                        <button onClick={() => handleLogin('jobseeker')} className="login-option-button">
                            Sign in as Job Seeker
                        </button>
                    </div>
                    <div className="login-option-card">
                        <MdBusiness className="login-option-icon" />
                        <h2 className="login-option-title">Company & Staff</h2>
                        <p className="login-option-description">Recruiters, admins, and support staff. Manage booths, conduct interviews, and support job seekers.</p>
                        <button onClick={() => handleLogin('company')} className="login-option-button">
                            Sign in as Company/Staff
                        </button>
                    </div>
                </div>
            </div>
        </main>
    );
};

export default LandingPage;
