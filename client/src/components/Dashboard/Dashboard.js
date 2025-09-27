import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { MdAccountCircle, MdEvent, MdPerson, MdSettings, MdHelp, MdLogout, MdRefresh, MdExpandMore, MdExpandLess, MdMenu, MdClose } from 'react-icons/md';
import './Dashboard.css';

const Dashboard = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [activeSection, setActiveSection] = useState('my-account');
    const [expandedSections, setExpandedSections] = useState({
        'my-account': true,
        'registrations': true,
        'upcoming-events': true
    });
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const getRoleDisplayName = (role) => {
        const roleNames = {
            'JobSeeker': 'JobSeeker',
            'Admin': 'Administrator',
            'AdminEvent': 'Event Administrator',
            'BoothAdmin': 'Booth Administrator',
            'Recruiter': 'Recruiter',
            'Interpreter': 'Interpreter',
            'GlobalInterpreter': 'Global Interpreter',
            'Support': 'Support Staff',
            'GlobalSupport': 'Global Support Staff'
        };
        return roleNames[role] || role;
    };

    const toggleSection = (section) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    const toggleMobileMenu = () => {
        setIsMobileMenuOpen(!isMobileMenuOpen);
    };

    const closeMobileMenu = () => {
        setIsMobileMenuOpen(false);
    };

    const getDashboardContent = () => {
        switch (user.role) {
            case 'JobSeeker':
                return (
                    <div className="dashboard-content">
                        <h2>My Account</h2>

                        <div className="alert-box">
                            <p>• Welcome to your job seeker dashboard</p>
                        </div>

                        <div className="account-section">
                            <h3>Account Information</h3>
                            <p className="section-note">An asterisk (*) indicates a required field.</p>

                            <form className="account-form">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="firstName">First Name *</label>
                                        <input type="text" id="firstName" defaultValue={user.name?.split(' ')[0] || ''} />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="lastName">Last Name *</label>
                                        <input type="text" id="lastName" defaultValue={user.name?.split(' ')[1] || ''} />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="email">Email *</label>
                                        <input type="email" id="email" defaultValue={user.email} />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="phone">Phone</label>
                                        <input type="tel" id="phone" />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="state">State</label>
                                        <input type="text" id="state" />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="city">City</label>
                                        <input type="text" id="city" />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="country">Country *</label>
                                    <select id="country">
                                        <option value="US">United States</option>
                                        <option value="CA">Canada</option>
                                        <option value="MX">Mexico</option>
                                        <option value="GB">United Kingdom</option>
                                        <option value="IE">Ireland</option>
                                        <option value="FR">France</option>
                                        <option value="DE">Germany</option>
                                        <option value="IT">Italy</option>
                                        <option value="ES">Spain</option>
                                        <option value="NL">Netherlands</option>
                                        <option value="BE">Belgium</option>
                                        <option value="CH">Switzerland</option>
                                        <option value="AT">Austria</option>
                                        <option value="SE">Sweden</option>
                                        <option value="NO">Norway</option>
                                        <option value="DK">Denmark</option>
                                        <option value="FI">Finland</option>
                                        <option value="PL">Poland</option>
                                        <option value="CZ">Czech Republic</option>
                                        <option value="HU">Hungary</option>
                                        <option value="RO">Romania</option>
                                        <option value="BG">Bulgaria</option>
                                        <option value="HR">Croatia</option>
                                        <option value="SI">Slovenia</option>
                                        <option value="SK">Slovakia</option>
                                        <option value="EE">Estonia</option>
                                        <option value="LV">Latvia</option>
                                        <option value="LT">Lithuania</option>
                                        <option value="GR">Greece</option>
                                        <option value="PT">Portugal</option>
                                        <option value="AU">Australia</option>
                                        <option value="NZ">New Zealand</option>
                                        <option value="JP">Japan</option>
                                        <option value="KR">South Korea</option>
                                        <option value="CN">China</option>
                                        <option value="IN">India</option>
                                        <option value="SG">Singapore</option>
                                        <option value="HK">Hong Kong</option>
                                        <option value="TW">Taiwan</option>
                                        <option value="TH">Thailand</option>
                                        <option value="MY">Malaysia</option>
                                        <option value="ID">Indonesia</option>
                                        <option value="PH">Philippines</option>
                                        <option value="VN">Vietnam</option>
                                        <option value="BR">Brazil</option>
                                        <option value="AR">Argentina</option>
                                        <option value="CL">Chile</option>
                                        <option value="CO">Colombia</option>
                                        <option value="PE">Peru</option>
                                        <option value="VE">Venezuela</option>
                                        <option value="EC">Ecuador</option>
                                        <option value="UY">Uruguay</option>
                                        <option value="PY">Paraguay</option>
                                        <option value="BO">Bolivia</option>
                                        <option value="GY">Guyana</option>
                                        <option value="SR">Suriname</option>
                                        <option value="ZA">South Africa</option>
                                        <option value="NG">Nigeria</option>
                                        <option value="KE">Kenya</option>
                                        <option value="EG">Egypt</option>
                                        <option value="MA">Morocco</option>
                                        <option value="TN">Tunisia</option>
                                        <option value="DZ">Algeria</option>
                                        <option value="LY">Libya</option>
                                        <option value="SD">Sudan</option>
                                        <option value="ET">Ethiopia</option>
                                        <option value="GH">Ghana</option>
                                        <option value="UG">Uganda</option>
                                        <option value="TZ">Tanzania</option>
                                        <option value="ZM">Zambia</option>
                                        <option value="ZW">Zimbabwe</option>
                                        <option value="BW">Botswana</option>
                                        <option value="NA">Namibia</option>
                                        <option value="MW">Malawi</option>
                                        <option value="MZ">Mozambique</option>
                                        <option value="MG">Madagascar</option>
                                        <option value="MU">Mauritius</option>
                                        <option value="SC">Seychelles</option>
                                        <option value="RE">Réunion</option>
                                        <option value="YT">Mayotte</option>
                                        <option value="KM">Comoros</option>
                                        <option value="DJ">Djibouti</option>
                                        <option value="SO">Somalia</option>
                                        <option value="ER">Eritrea</option>
                                        <option value="SS">South Sudan</option>
                                        <option value="CF">Central African Republic</option>
                                        <option value="TD">Chad</option>
                                        <option value="NE">Niger</option>
                                        <option value="ML">Mali</option>
                                        <option value="BF">Burkina Faso</option>
                                        <option value="CI">Côte d'Ivoire</option>
                                        <option value="LR">Liberia</option>
                                        <option value="SL">Sierra Leone</option>
                                        <option value="GN">Guinea</option>
                                        <option value="GW">Guinea-Bissau</option>
                                        <option value="GM">Gambia</option>
                                        <option value="SN">Senegal</option>
                                        <option value="MR">Mauritania</option>
                                        <option value="CV">Cape Verde</option>
                                        <option value="ST">São Tomé and Príncipe</option>
                                        <option value="GQ">Equatorial Guinea</option>
                                        <option value="GA">Gabon</option>
                                        <option value="CG">Republic of the Congo</option>
                                        <option value="CD">Democratic Republic of the Congo</option>
                                        <option value="AO">Angola</option>
                                        <option value="CM">Cameroon</option>
                                        <option value="RU">Russia</option>
                                        <option value="KZ">Kazakhstan</option>
                                        <option value="UZ">Uzbekistan</option>
                                        <option value="TM">Turkmenistan</option>
                                        <option value="TJ">Tajikistan</option>
                                        <option value="KG">Kyrgyzstan</option>
                                        <option value="AF">Afghanistan</option>
                                        <option value="PK">Pakistan</option>
                                        <option value="BD">Bangladesh</option>
                                        <option value="LK">Sri Lanka</option>
                                        <option value="MV">Maldives</option>
                                        <option value="BT">Bhutan</option>
                                        <option value="NP">Nepal</option>
                                        <option value="MM">Myanmar</option>
                                        <option value="LA">Laos</option>
                                        <option value="KH">Cambodia</option>
                                        <option value="BN">Brunei</option>
                                        <option value="TL">East Timor</option>
                                        <option value="FJ">Fiji</option>
                                        <option value="PG">Papua New Guinea</option>
                                        <option value="SB">Solomon Islands</option>
                                        <option value="VU">Vanuatu</option>
                                        <option value="NC">New Caledonia</option>
                                        <option value="PF">French Polynesia</option>
                                        <option value="WS">Samoa</option>
                                        <option value="TO">Tonga</option>
                                        <option value="KI">Kiribati</option>
                                        <option value="TV">Tuvalu</option>
                                        <option value="NR">Nauru</option>
                                        <option value="PW">Palau</option>
                                        <option value="MH">Marshall Islands</option>
                                        <option value="FM">Micronesia</option>
                                        <option value="AS">American Samoa</option>
                                        <option value="GU">Guam</option>
                                        <option value="MP">Northern Mariana Islands</option>
                                        <option value="VI">U.S. Virgin Islands</option>
                                        <option value="PR">Puerto Rico</option>
                                        <option value="GT">Guatemala</option>
                                        <option value="BZ">Belize</option>
                                        <option value="SV">El Salvador</option>
                                        <option value="HN">Honduras</option>
                                        <option value="NI">Nicaragua</option>
                                        <option value="CR">Costa Rica</option>
                                        <option value="PA">Panama</option>
                                        <option value="CU">Cuba</option>
                                        <option value="JM">Jamaica</option>
                                        <option value="HT">Haiti</option>
                                        <option value="DO">Dominican Republic</option>
                                        <option value="TT">Trinidad and Tobago</option>
                                        <option value="BB">Barbados</option>
                                        <option value="AG">Antigua and Barbuda</option>
                                        <option value="BS">Bahamas</option>
                                        <option value="DM">Dominica</option>
                                        <option value="GD">Grenada</option>
                                        <option value="KN">Saint Kitts and Nevis</option>
                                        <option value="LC">Saint Lucia</option>
                                        <option value="VC">Saint Vincent and the Grenadines</option>
                                        <option value="IS">Iceland</option>
                                        <option value="GL">Greenland</option>
                                        <option value="FO">Faroe Islands</option>
                                        <option value="SJ">Svalbard and Jan Mayen</option>
                                        <option value="AX">Åland Islands</option>
                                        <option value="AD">Andorra</option>
                                        <option value="LI">Liechtenstein</option>
                                        <option value="MC">Monaco</option>
                                        <option value="SM">San Marino</option>
                                        <option value="VA">Vatican City</option>
                                        <option value="MT">Malta</option>
                                        <option value="CY">Cyprus</option>
                                        <option value="LU">Luxembourg</option>
                                        <option value="MD">Moldova</option>
                                        <option value="BY">Belarus</option>
                                        <option value="UA">Ukraine</option>
                                        <option value="GE">Georgia</option>
                                        <option value="AM">Armenia</option>
                                        <option value="AZ">Azerbaijan</option>
                                        <option value="TR">Turkey</option>
                                        <option value="IL">Israel</option>
                                        <option value="PS">Palestine</option>
                                        <option value="JO">Jordan</option>
                                        <option value="LB">Lebanon</option>
                                        <option value="SY">Syria</option>
                                        <option value="IQ">Iraq</option>
                                        <option value="IR">Iran</option>
                                        <option value="KW">Kuwait</option>
                                        <option value="SA">Saudi Arabia</option>
                                        <option value="AE">United Arab Emirates</option>
                                        <option value="QA">Qatar</option>
                                        <option value="BH">Bahrain</option>
                                        <option value="OM">Oman</option>
                                        <option value="YE">Yemen</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="password">Change Password</label>
                                    <div className="password-input-container">
                                        <input type="password" id="password" />
                                        <button type="button" className="password-toggle">
                                            <MdRefresh />
                                        </button>
                                    </div>
                                </div>

                                <button type="submit" className="update-button">Update Account</button>
                            </form>
                        </div>

                        <div className="accessibility-section">
                            <h3>Accessibility Options</h3>
                            <p className="section-note">During the job fair, I will use the following</p>

                            <div className="checkbox-group">
                                <label className="checkbox-label">
                                    <input type="checkbox" />
                                    <span>Screen Magnifier</span>
                                </label>
                                <label className="checkbox-label">
                                    <input type="checkbox" />
                                    <span>Screen Reader</span>
                                </label>
                                <label className="checkbox-label">
                                    <input type="checkbox" />
                                    <span>American Sign Language (ASL)</span>
                                </label>
                                <label className="checkbox-label">
                                    <input type="checkbox" />
                                    <span>Captions</span>
                                </label>
                                <label className="checkbox-label">
                                    <input type="checkbox" />
                                    <span>Others</span>
                                </label>
                            </div>

                            <div className="checkbox-group">
                                <label className="checkbox-label">
                                    <input type="checkbox" />
                                    <span>Subscribe to Job Seeker Announcements</span>
                                </label>
                            </div>
                        </div>
                    </div>
                );
            case 'Recruiter':
                return (
                    <div className="dashboard-content">
                        <h2>Recruiter Dashboard</h2>
                        <div className="dashboard-cards">
                            <div className="dashboard-card">
                                <h3>Active Booths</h3>
                                <p>Manage your recruitment booths</p>
                                <button className="dashboard-button">View Booths</button>
                            </div>
                            <div className="dashboard-card">
                                <h3>Queue Management</h3>
                                <p>View and manage job seeker queues</p>
                                <button className="dashboard-button">Manage Queue</button>
                            </div>
                            <div className="dashboard-card">
                                <h3>Interview Schedule</h3>
                                <p>Schedule and conduct interviews</p>
                                <button className="dashboard-button">Schedule Interview</button>
                            </div>
                        </div>
                    </div>
                );
            case 'Admin':
            case 'AdminEvent':
                return (
                    <div className="dashboard-content">
                        <h2>Administrator Dashboard</h2>
                        <div className="dashboard-cards">
                            <div className="dashboard-card">
                                <h3>Event Management</h3>
                                <p>Create and manage job fair events</p>
                                <button className="dashboard-button">Manage Events</button>
                            </div>
                            <div className="dashboard-card">
                                <h3>User Management</h3>
                                <p>Manage users and permissions</p>
                                <button className="dashboard-button">Manage Users</button>
                            </div>
                            <div className="dashboard-card">
                                <h3>Analytics</h3>
                                <p>View platform analytics and reports</p>
                                <button className="dashboard-button">View Analytics</button>
                            </div>
                        </div>
                    </div>
                );
            default:
                return (
                    <div className="dashboard-content">
                        <h2>Welcome to Your Dashboard</h2>
                        <p>Your role-specific dashboard content will be available soon.</p>
                    </div>
                );
        }
    };

    return (
        <div className="dashboard">
            <header className="dashboard-header">
                <div className="dashboard-header-content">
                    <div className="header-left">
                        <button
                            className="mobile-menu-toggle"
                            onClick={toggleMobileMenu}
                            aria-label="Toggle navigation menu"
                        >
                            {isMobileMenuOpen ? <MdClose /> : <MdMenu />}
                        </button>
                        <h1>ABILITYJOBFAIR</h1>
                    </div>
                    <div className="user-info">
                        <span className="user-name">{user.name} / {getRoleDisplayName(user.role)}</span>
                        <div className="connection-status">
                            <MdRefresh className="refresh-icon" />
                            <span className="connection-text">Connection: Active</span>
                            <div className="connection-dot"></div>
                        </div>
                        <button onClick={handleLogout} className="logout-button">
                            <MdLogout />
                        </button>
                    </div>
                </div>
            </header>

            <div className="dashboard-layout">
                <nav className={`dashboard-sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
                    <div className="sidebar-section">
                        <button
                            className="sidebar-header"
                            onClick={() => toggleSection('my-account')}
                        >
                            <span>My Account</span>
                            {expandedSections['my-account'] ? <MdExpandLess /> : <MdExpandMore />}
                        </button>
                        {expandedSections['my-account'] && (
                            <div className="sidebar-items">
                                <button
                                    className={`sidebar-item ${activeSection === 'survey' ? 'active' : ''}`}
                                    onClick={() => {
                                        setActiveSection('survey');
                                        closeMobileMenu();
                                    }}
                                >
                                    Survey
                                </button>
                                <button
                                    className={`sidebar-item ${activeSection === 'delete-account' ? 'active' : ''}`}
                                    onClick={() => {
                                        setActiveSection('delete-account');
                                        closeMobileMenu();
                                    }}
                                >
                                    Delete My Account
                                </button>
                                <button
                                    className={`sidebar-item ${activeSection === 'edit-profile' ? 'active' : ''}`}
                                    onClick={() => {
                                        setActiveSection('edit-profile');
                                        closeMobileMenu();
                                    }}
                                >
                                    Edit Profile & Resume
                                </button>
                                <button
                                    className={`sidebar-item ${activeSection === 'view-profile' ? 'active' : ''}`}
                                    onClick={() => {
                                        setActiveSection('view-profile');
                                        closeMobileMenu();
                                    }}
                                >
                                    View My Profile
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="sidebar-section">
                        <button
                            className="sidebar-header"
                            onClick={() => toggleSection('registrations')}
                        >
                            <span>My Current Registrations</span>
                            {expandedSections['registrations'] ? <MdExpandLess /> : <MdExpandMore />}
                        </button>
                        {expandedSections['registrations'] && (
                            <div className="sidebar-items">
                                <button
                                    className="sidebar-item"
                                    onClick={closeMobileMenu}
                                >
                                    ABILITY Job Fair - Testing with Friends Event
                                </button>
                                <button
                                    className="sidebar-item"
                                    onClick={closeMobileMenu}
                                >
                                    2 Test Event - ABILITY Job Fair
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="sidebar-section">
                        <button
                            className="sidebar-header"
                            onClick={() => toggleSection('upcoming-events')}
                        >
                            <span>Upcoming Events</span>
                            {expandedSections['upcoming-events'] ? <MdExpandLess /> : <MdExpandMore />}
                        </button>
                        {expandedSections['upcoming-events'] && (
                            <div className="sidebar-items">
                                <button
                                    className="sidebar-item"
                                    onClick={closeMobileMenu}
                                >
                                    Event Demo test
                                </button>
                                <button
                                    className="sidebar-item"
                                    onClick={closeMobileMenu}
                                >
                                    Demonstration
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="sidebar-section">
                        <button
                            className="sidebar-item"
                            onClick={closeMobileMenu}
                        >
                            Trouble Shooting
                        </button>
                        <button
                            className="sidebar-item"
                            onClick={closeMobileMenu}
                        >
                            Instructions
                        </button>
                    </div>
                </nav>

                <main className="dashboard-main">
                    {getDashboardContent()}
                </main>
            </div>

            {/* Mobile overlay */}
            {isMobileMenuOpen && (
                <div
                    className="mobile-overlay"
                    onClick={closeMobileMenu}
                    aria-hidden="true"
                />
            )}
        </div>
    );
};

export default Dashboard;
