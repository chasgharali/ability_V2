import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { MdAccountCircle, MdEvent, MdPerson, MdSettings, MdHelp, MdLogout, MdRefresh, MdExpandMore, MdExpandLess, MdMenu, MdClose } from 'react-icons/md';
import './Dashboard.css';
import SurveyForm from './SurveyForm';
import EditProfileResume from './EditProfileResume';
import ViewProfile from './ViewProfile';

const Dashboard = () => {
    const { user, logout, loading, updateProfile } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [activeSection, setActiveSection] = useState('my-account');
    const [expandedSections, setExpandedSections] = useState({
        'my-account': true,
        'registrations': true,
        'upcoming-events': true
    });
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [brandingLogo, setBrandingLogo] = useState(() => {
        try { return localStorage.getItem('ajf_branding_logo') || ''; } catch { return ''; }
    });
    // Simple monochrome default icon (SVG data URL)
    const DEFAULT_ICON = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="180" height="36" viewBox="0 0 180 36" fill="none"><path d="M18 2 L6 22 h8 l-4 12 16-24 h-8 l4-8 z" fill="%23000000"/><text x="34" y="24" fill="%23000000" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700">ABILITYJOBFAIR</text></svg>';
    // Local form state for Account Information
    const [formData, setFormData] = useState({
        firstName: user?.name?.split(' ')[0] || '',
        lastName: user?.name?.split(' ').slice(1).join(' ') || '',
        email: user?.email || '',
        phone: user?.phoneNumber || '',
        state: user?.state || '',
        city: user?.city || '',
        country: user?.country || 'US',
        password: ''
    });
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [saveError, setSaveError] = useState('');
    const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
    const [errors, setErrors] = useState({});
    const [accessibility, setAccessibility] = useState({
        usesScreenMagnifier: user?.usesScreenMagnifier || false,
        usesScreenReader: user?.usesScreenReader || false,
        needsASL: user?.needsASL || false,
        needsCaptions: user?.needsCaptions || false,
        needsOther: user?.needsOther || false,
        subscribeAnnouncements: user?.subscribeAnnouncements || false
    });

    const handleAccessibilityToggle = async (key, value) => {
        setAccessibility(prev => ({ ...prev, [key]: value }));
        try {
            const result = await updateProfile({ [key]: value });
            if (result.success) {
                showToast('Saved accessibility preference', 'success');
            } else {
                showToast(result.error || 'Failed to save preference', 'error');
                // Revert if server failed
                setAccessibility(prev => ({ ...prev, [key]: !value }));
            }
        } catch (e) {
            showToast('Failed to save preference', 'error');
            setAccessibility(prev => ({ ...prev, [key]: !value }));
        }
    };

    // Sync section based on URL path
    useEffect(() => {
        if (location.pathname.endsWith('/survey')) {
            setActiveSection('survey');
        } else if (location.pathname.endsWith('/edit-profile')) {
            setActiveSection('edit-profile');
        } else if (location.pathname.endsWith('/view-profile')) {
            setActiveSection('view-profile');
        } else if (location.pathname.endsWith('/delete-account')) {
            setActiveSection('delete-account');
        } else {
            setActiveSection('my-account');
        }
    }, [location.pathname]);

    useEffect(() => {
        // When user loads/changes, sync form
        if (user) {
            setFormData(prev => ({
                ...prev,
                firstName: (user?.name || '').split(' ')[0] || '',
                lastName: (user?.name || '').split(' ').slice(1).join(' ') || '',
                email: user?.email || '',
                phone: user?.phoneNumber || '',
                state: user?.state || '',
                city: user?.city || '',
                country: user?.country || 'US'
            }));
            setAccessibility({
                usesScreenMagnifier: user?.usesScreenMagnifier || false,
                usesScreenReader: user?.usesScreenReader || false,
                needsASL: user?.needsASL || false,
                needsCaptions: user?.needsCaptions || false,
                needsOther: user?.needsOther || false,
                subscribeAnnouncements: user?.subscribeAnnouncements || false
            });
        }
    }, [user]);

    // Admin: branding logo helpers
    const saveBrandingLogo = (dataUrl) => {
        try {
            if (dataUrl) {
                localStorage.setItem('ajf_branding_logo', dataUrl);
            } else {
                localStorage.removeItem('ajf_branding_logo');
            }
            setBrandingLogo(dataUrl || '');
            showToast(dataUrl ? 'Header logo updated' : 'Header logo removed', 'success');
        } catch (e) {
            showToast('Failed to save header logo', 'error');
        }
    };

    const onPickLogoFile = async (file) => {
        if (!file) return;
        if (!/^image\//.test(file.type)) {
            showToast('Please select an image file', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result;
            saveBrandingLogo(dataUrl);
        };
        reader.onerror = () => showToast('Failed to read file', 'error');
        reader.readAsDataURL(file);
    };

    const showToast = (message, type = 'success') => {
        setToast({ visible: true, message, type });
        setTimeout(() => setToast({ visible: false, message: '', type }), 2500);
    };

    const handleFieldChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setErrors(prev => ({ ...prev, [name]: '' }));
    };

    const validate = () => {
        const nextErrors = {};
        if (!formData.firstName.trim()) nextErrors.firstName = 'First name is required';
        if (!formData.lastName.trim()) nextErrors.lastName = 'Last name is required';
        if (!formData.country) nextErrors.country = 'Country is required';
        const phone = (formData.phone || '').trim();
        if (phone) {
            // Simple international phone validation: + and digits, 7-15 length
            const phoneOk = /^\+?[0-9\-\s()]{7,20}$/.test(phone);
            if (!phoneOk) nextErrors.phone = 'Enter a valid phone number';
        }
        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleUpdateSubmit = async (e) => {
        e.preventDefault();
        setSaveMessage('');
        setSaveError('');
        setSaving(true);
        if (!validate()) {
            setSaving(false);
            showToast('Please fix the highlighted fields', 'error');
            return;
        }
        const fullName = `${formData.firstName} ${formData.lastName}`.trim();
        try {
            // Always send current values so backend persists accessibility reliably
            const payload = {
                name: fullName || user?.name || '',
                state: formData.state || '',
                city: formData.city || '',
                country: formData.country || 'US',
                usesScreenMagnifier: !!accessibility.usesScreenMagnifier,
                usesScreenReader: !!accessibility.usesScreenReader,
                needsASL: !!accessibility.needsASL,
                needsCaptions: !!accessibility.needsCaptions,
                needsOther: !!accessibility.needsOther,
                subscribeAnnouncements: !!accessibility.subscribeAnnouncements
            };
            const phoneTrimmed = (formData.phone || '').trim();
            if (phoneTrimmed) {
                payload.phoneNumber = phoneTrimmed;
            }

            const result = await updateProfile(payload);
            if (result.success) {
                setSaveMessage('Account updated successfully.');
                showToast('Account updated successfully', 'success');
                // Sync form with latest user data from server
                const updated = result.user;
                setFormData(prev => ({
                    ...prev,
                    firstName: (updated?.name || '').split(' ')[0] || '',
                    lastName: (updated?.name || '').split(' ').slice(1).join(' ') || '',
                    email: updated?.email || prev.email,
                    phone: updated?.phoneNumber || '',
                    state: updated?.state || '',
                    city: updated?.city || '',
                    country: updated?.country || 'US'
                }));
                setAccessibility({
                    usesScreenMagnifier: updated?.usesScreenMagnifier || false,
                    usesScreenReader: updated?.usesScreenReader || false,
                    needsASL: updated?.needsASL || false,
                    needsCaptions: updated?.needsCaptions || false,
                    needsOther: updated?.needsOther || false,
                    subscribeAnnouncements: updated?.subscribeAnnouncements || false
                });
            } else {
                setSaveError(result.error || 'Failed to update account.');
                showToast(result.error || 'Failed to update account', 'error');
            }
        } catch (err) {
            setSaveError('Failed to update account.');
            showToast('Failed to update account', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Handle loading state
    if (loading) {
        return (
            <div className="dashboard-loading">
                <div className="loading-spinner">
                    <MdRefresh className="spinning" />
                </div>
                <p>Loading your dashboard...</p>
            </div>
        );
    }

    // Handle case where user is not authenticated
    if (!user) {
        navigate('/login');
        return null;
    }

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
        switch (user?.role) {
            case 'JobSeeker':
                if (activeSection === 'survey') {
                    return <SurveyForm />;
                }
                if (activeSection === 'edit-profile') {
                    return <EditProfileResume />;
                }
                if (activeSection === 'view-profile') {
                    return <ViewProfile />;
                }
                if (activeSection === 'delete-account') {
                    return (
                        <div className="dashboard-content">
                            <h2>Delete My Account</h2>
                            <div className="alert-box" style={{ background: '#fff3cd', borderColor: '#ffeeba' }}>
                                <p><strong>Warning:</strong> Deleting your account will deactivate your access. This action cannot be undone.</p>
                            </div>
                            <DeleteAccountPanel onDeleted={() => { logout(); navigate('/'); }} />
                        </div>
                    );
                }
                return (
                    <div className="dashboard-content">
                        <h2>My Account</h2>

                        <div className="alert-box">
                            <p>• Welcome to your job seeker dashboard</p>
                        </div>

                        <div className="account-grid">
                            <div className="account-section">
                                <h3>Account Information</h3>
                                <p className="section-note">An asterisk (*) indicates a required field.</p>

                                <form className="account-form" onSubmit={handleUpdateSubmit}>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="firstName">First Name *</label>
                                        <input type="text" id="firstName" name="firstName" value={formData.firstName} onChange={handleFieldChange} aria-invalid={!!errors.firstName} />
                                        {errors.firstName && <span className="error-text">{errors.firstName}</span>}
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="lastName">Last Name *</label>
                                        <input type="text" id="lastName" name="lastName" value={formData.lastName} onChange={handleFieldChange} aria-invalid={!!errors.lastName} />
                                        {errors.lastName && <span className="error-text">{errors.lastName}</span>}
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="email">Email *</label>
                                        <input type="email" id="email" name="email" value={formData.email} readOnly />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="phone">Phone</label>
                                        <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleFieldChange} aria-invalid={!!errors.phone} />
                                        {errors.phone && <span className="error-text">{errors.phone}</span>}
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="state">State</label>
                                        <input type="text" id="state" name="state" value={formData.state} onChange={handleFieldChange} />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="city">City</label>
                                        <input type="text" id="city" name="city" value={formData.city} onChange={handleFieldChange} />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="country">Country *</label>
                                    <select id="country" name="country" value={formData.country} onChange={handleFieldChange} aria-invalid={!!errors.country}>
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
                                    <input type="checkbox" checked={accessibility.usesScreenMagnifier} onChange={(e) => handleAccessibilityToggle('usesScreenMagnifier', e.target.checked)} />
                                    <span>Screen Magnifier</span>
                                </label>
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={accessibility.usesScreenReader} onChange={(e) => handleAccessibilityToggle('usesScreenReader', e.target.checked)} />
                                    <span>Screen Reader</span>
                                </label>
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={accessibility.needsASL} onChange={(e) => handleAccessibilityToggle('needsASL', e.target.checked)} />
                                    <span>American Sign Language (ASL)</span>
                                </label>
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={accessibility.needsCaptions} onChange={(e) => handleAccessibilityToggle('needsCaptions', e.target.checked)} />
                                    <span>Captions</span>
                                </label>
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={accessibility.needsOther} onChange={(e) => handleAccessibilityToggle('needsOther', e.target.checked)} />
                                    <span>Others</span>
                                </label>
                            </div>

                            <div className="checkbox-group">
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={accessibility.subscribeAnnouncements} onChange={(e) => handleAccessibilityToggle('subscribeAnnouncements', e.target.checked)} />
                                    <span>Subscribe to Job Seeker Announcements</span>
                                </label>
                            </div>
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
            {/* Accessible Skip Link */}
            <a
                href="#dashboard-main"
                className="skip-link"
                onClick={(e) => {
                    // Ensure focus moves to main content for screen readers/keyboard users
                    const el = document.getElementById('dashboard-main');
                    if (el) {
                        el.focus();
                    }
                }}
            >
                Skip to main content
            </a>
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
                        <img src={brandingLogo || DEFAULT_ICON} alt="Site logo" className="header-logo" />
                    </div>
                    <div className="user-info">
                        <span className="user-name">{user?.name || 'User'} / {getRoleDisplayName(user?.role || 'Guest')}</span>
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
                {toast.visible && (
                    <div className={`toast ${toast.type}`} role="status" aria-live="polite">{toast.message}</div>
                )}
                <nav className={`dashboard-sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
                    {user?.role === 'JobSeeker' ? (
                        <>
                            <div className="sidebar-section">
                                <button
                                    className="sidebar-header"
                                    onClick={() => { setActiveSection('my-account'); navigate('/dashboard/my-account'); closeMobileMenu(); }}
                                    aria-label="Go to My Account"
                                >
                                    <span>My Account</span>
                                    <span
                                        className="icon-button"
                                        onClick={(e) => { e.stopPropagation(); toggleSection('my-account'); }}
                                        aria-label={expandedSections['my-account'] ? 'Collapse My Account menu' : 'Expand My Account menu'}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); e.stopPropagation(); toggleSection('my-account'); } }}
                                    >
                                        {expandedSections['my-account'] ? <MdExpandLess /> : <MdExpandMore />}
                                    </span>
                                </button>
                                {expandedSections['my-account'] && (
                                    <div className="sidebar-items">
                                        <button className={`sidebar-item ${activeSection === 'survey' ? 'active' : ''}`}
                                            onClick={() => { setActiveSection('survey'); navigate('/dashboard/survey'); closeMobileMenu(); }}>Survey</button>
                                        <button className={`sidebar-item ${activeSection === 'delete-account' ? 'active' : ''}`}
                                            onClick={() => { setActiveSection('delete-account'); navigate('/dashboard/delete-account'); closeMobileMenu(); }}>Delete My Account</button>
                                        <button className={`sidebar-item ${activeSection === 'edit-profile' ? 'active' : ''}`}
                                            onClick={() => { setActiveSection('edit-profile'); navigate('/dashboard/edit-profile'); closeMobileMenu(); }}>Edit Profile & Resume</button>
                                        <button className={`sidebar-item ${activeSection === 'view-profile' ? 'active' : ''}`}
                                            onClick={() => { setActiveSection('view-profile'); navigate('/dashboard/view-profile'); closeMobileMenu(); }}>View My Profile</button>
                                    </div>
                                )}
                            </div>

                            <div className="sidebar-section">
                                <button className="sidebar-header" onClick={() => toggleSection('registrations')}>
                                    <span>My Current Registrations</span>
                                    {expandedSections['registrations'] ? <MdExpandLess /> : <MdExpandMore />}
                                </button>
                                {expandedSections['registrations'] && (
                                    <div className="sidebar-items">
                                        <button className="sidebar-item" onClick={closeMobileMenu}>ABILITY Job Fair - Testing with Friends Event</button>
                                        <button className="sidebar-item" onClick={closeMobileMenu}>2 Test Event - ABILITY Job Fair</button>
                                    </div>
                                )}
                            </div>

                            <div className="sidebar-section">
                                <button className="sidebar-header" onClick={() => toggleSection('upcoming-events')}>
                                    <span>Upcoming Events</span>
                                    {expandedSections['upcoming-events'] ? <MdExpandLess /> : <MdExpandMore />}
                                </button>
                                {expandedSections['upcoming-events'] && (
                                    <div className="sidebar-items">
                                        <button className="sidebar-item" onClick={closeMobileMenu}>Event Demo test</button>
                                        <button className="sidebar-item" onClick={closeMobileMenu}>Demonstration</button>
                                    </div>
                                )}
                            </div>

                            <div className="sidebar-section">
                                <button className="sidebar-item" onClick={closeMobileMenu}>Trouble Shooting</button>
                                <button className="sidebar-item" onClick={closeMobileMenu}>Instructions</button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="sidebar-section">
                                <button className="sidebar-header" onClick={() => { setActiveSection('admin'); closeMobileMenu(); }}>
                                    <span>Administration</span>
                                </button>
                                <div className="sidebar-items">
                                    <button className="sidebar-item" onClick={() => { setActiveSection('manage-events'); closeMobileMenu(); }}>Event Management</button>
                                    <button className="sidebar-item" onClick={() => { setActiveSection('manage-booths'); closeMobileMenu(); }}>Booth Management</button>
                                    <button className="sidebar-item" onClick={() => { setActiveSection('jobseekers'); closeMobileMenu(); }}>Job Seeker Management</button>
                                    <button className="sidebar-item" onClick={() => { setActiveSection('branding'); closeMobileMenu(); }}>Branding – Header Logo</button>
                                </div>
                            </div>

                            <div className="sidebar-section">
                                <button className="sidebar-header" onClick={() => { setActiveSection('tools'); closeMobileMenu(); }}>
                                    <span>Tools</span>
                                </button>
                                <div className="sidebar-items">
                                    <button className="sidebar-item" onClick={() => { setActiveSection('users'); closeMobileMenu(); }}>User Management</button>
                                    <button className="sidebar-item" onClick={() => { setActiveSection('analytics'); closeMobileMenu(); }}>Analytics</button>
                                </div>
                            </div>

                            <div className="sidebar-section">
                                <button className="sidebar-item" onClick={closeMobileMenu}>Trouble Shooting</button>
                                <button className="sidebar-item" onClick={closeMobileMenu}>Instructions</button>
                            </div>
                        </>
                    )}
                </nav>

                <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
                    {(user?.role !== 'JobSeeker' && activeSection === 'branding') ? (
                        <div className="dashboard-content">
                            <h2>Branding – Header Logo</h2>
                            <div className="alert-box" style={{background:'#f3f4f6', borderColor:'#e5e7eb', color:'#111827'}}>
                                <p>Upload a PNG, SVG, or JPG. The logo displays in the top-left. Recommended height ~28-36px.</p>
                            </div>
                            <div className="upload-card" style={{maxWidth: 520}}>
                                <h4>Current Logo</h4>
                                <div style={{display:'flex', alignItems:'center', gap:'1rem'}}>
                                    <img src={brandingLogo || DEFAULT_ICON} alt="Current header logo" style={{height:36, objectFit:'contain', border:'1px solid #e5e7eb', borderRadius:6, background:'#fff', padding:6}} />
                                    <button className="dashboard-button" style={{width:'auto'}} onClick={() => saveBrandingLogo(DEFAULT_ICON)}>Use Default Icon</button>
                                </div>
                                <div className="upload-actions" style={{marginTop:'1rem'}}>
                                    <label className="dashboard-button" style={{width:'auto', cursor:'pointer'}}>
                                        Choose Image
                                        <input type="file" accept="image/*" onChange={(e)=> onPickLogoFile(e.target.files?.[0])} style={{display:'none'}} />
                                    </label>
                                </div>
                            </div>
                        </div>
                    ) : (
                        getDashboardContent()
                    )}
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

// Inline component for delete confirmation
function DeleteAccountPanel({ onDeleted }) {
    const [confirm, setConfirm] = useState(false);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');

    const getToken = () => localStorage.getItem('token');

    const handleDelete = async () => {
        setWorking(true);
        setError('');
        try {
            const res = await fetch('/api/users/me', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${getToken()}`
                }
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Failed to delete account');
            }
            // Clear tokens client-side
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            if (typeof onDeleted === 'function') onDeleted();
        } catch (e) {
            setError(e.message || 'Failed to delete account');
        } finally {
            setWorking(false);
        }
    };

    return (
        <div className="account-section">
            {error && <div className="alert-box" style={{ background: '#ffe8e8' }}>{error}</div>}
            <p>Please confirm that you want to delete your account. This will deactivate your profile and sign you out.</p>
            <label className="checkbox-label">
                <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
                <span>I understand that this action cannot be undone.</span>
            </label>
            <div style={{ marginTop: '1rem' }}>
                <button className="dashboard-button" disabled={!confirm || working} onClick={handleDelete}>
                    {working ? 'Deleting…' : 'Delete My Account'}
                </button>
            </div>
        </div>
    );
}
