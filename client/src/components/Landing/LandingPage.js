import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { MdPerson, MdBusiness } from 'react-icons/md';
import PublicBrandHeader from '../Layout/PublicBrandHeader';
import './LandingPage.css';

const LandingPage = () => {
    const navigate = useNavigate();

    const handleLogin = (userType) => {
        navigate('/login', { state: { userType } });
    };

    return (
        <>
            <Helmet>
                <title>Choose Your Login Type - abilityconnect</title>
            </Helmet>
            <a href="#landing-options" className="skip-link">Skip to login options</a>
            <PublicBrandHeader />
            <main className="landing-page-container" id="landing-options" tabIndex={-1} aria-label="main content">
                <div className="landing-card">
                    <h1 className="landing-title">Choose Your Login Type</h1>
                    <div className="login-options">
                        <div className="login-option-card">
                            <MdPerson className="login-option-icon" aria-hidden="true" />
                            <h2 className="login-option-title">Job Seeker</h2>
                            <p className="login-option-description">Looking for your next career opportunity? Access virtual job fairs and connect with employers.</p>
                            <button onClick={() => handleLogin('jobseeker')} className="login-option-button">
                                Sign in as Job Seeker
                            </button>
                        </div>
                        <div className="login-option-card">
                            <MdBusiness className="login-option-icon" aria-hidden="true" />
                            <h2 className="login-option-title">Company &amp; Staff</h2>
                            <p className="login-option-description">Recruiters, admins, and support staff. Manage booths, conduct interviews, and support job seekers.</p>
                            <button onClick={() => handleLogin('company')} className="login-option-button">
                                Sign in as Company/Staff
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </>
    );
};

export default LandingPage;
