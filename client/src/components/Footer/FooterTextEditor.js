import React, { useEffect, useState } from 'react';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import settingsAPI from '../../services/settings';
import '../Dashboard/Dashboard.css';

const DEFAULT_FOOTER_TEXT = `© ${new Date().getFullYear()} ABILITY Job Fair. All rights reserved.`;

export default function FooterTextEditor() {
    const [footerText, setFooterText] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchFooterText();
    }, []);

    const fetchFooterText = async () => {
        try {
            setLoading(true);
            const response = await settingsAPI.getSetting('footer_text');
            if (response.success && typeof response.value === 'string') {
                setFooterText(response.value);
            }
        } catch {
            // Setting not created yet — use empty field with default preview
        } finally {
            setLoading(false);
        }
    };

    const showMessage = (text) => {
        setMessage(text);
        setTimeout(() => setMessage(''), 2500);
    };

    const handleSave = async () => {
        const trimmed = footerText.trim();
        if (!trimmed) {
            showMessage('Footer text cannot be empty.');
            return;
        }

        try {
            setSaving(true);
            await settingsAPI.setSetting(
                'footer_text',
                trimmed,
                'Copyright text shown in the site footer'
            );
            setFooterText(trimmed);
            showMessage('Footer text saved.');
        } catch (error) {
            console.error('Failed to save footer text:', error);
            showMessage('Failed to save footer text.');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        try {
            setSaving(true);
            await settingsAPI.deleteSetting('footer_text');
            setFooterText('');
            showMessage('Footer text reset to default.');
        } catch (error) {
            if (error.response?.status === 404) {
                setFooterText('');
                showMessage('Footer text reset to default.');
                return;
            }
            console.error('Failed to reset footer text:', error);
            showMessage('Failed to reset footer text.');
        } finally {
            setSaving(false);
        }
    };

    const previewText = footerText.trim() || DEFAULT_FOOTER_TEXT;

    return (
        <div className="dashboard">
            <a href="#main-content" className="skip-link">Skip to main content</a>
            <AdminHeader />
            <div className="dashboard-layout">
                <AdminSidebar active="footer-text" />
                <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
                    <div className="dashboard-content">
                        <h1>Footer – Copyright Text</h1>
                        {message && (
                            <div
                                className="alert-box"
                                role="status"
                                aria-live="polite"
                                style={{ background: '#f3f4f6', borderColor: '#e5e7eb', color: '#111827' }}
                            >
                                {message}
                            </div>
                        )}
                        <div
                            className="alert-box"
                            style={{ background: '#f3f4f6', borderColor: '#e5e7eb', color: '#111827' }}
                        >
                            <p>
                                This text appears on the left side of the site footer for all authenticated users.
                                Use Reset to default to restore the standard copyright line.
                            </p>
                        </div>
                        <div className="upload-card" style={{ maxWidth: 640 }}>
                            <label htmlFor="footerText" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                                Copyright text
                            </label>
                            <input
                                id="footerText"
                                type="text"
                                className="dashboard-input"
                                value={footerText}
                                onChange={(e) => setFooterText(e.target.value)}
                                placeholder={DEFAULT_FOOTER_TEXT}
                                maxLength={200}
                                disabled={loading || saving}
                                style={{ width: '100%', marginBottom: '0.75rem' }}
                            />
                            <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                                {footerText.trim().length}/200 characters
                            </p>
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    className="dashboard-button"
                                    style={{ width: 'auto' }}
                                    onClick={handleSave}
                                    disabled={loading || saving}
                                >
                                    {saving ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                    type="button"
                                    className="dashboard-button"
                                    style={{ width: 'auto', background: '#fff', color: '#374151', border: '1px solid #d1d5db' }}
                                    onClick={handleReset}
                                    disabled={loading || saving}
                                >
                                    Reset to default
                                </button>
                            </div>
                            <div style={{ marginTop: '1.5rem' }}>
                                <h4 style={{ margin: '0 0 0.5rem' }}>Preview</h4>
                                <div
                                    style={{
                                        background: '#2c3e50',
                                        color: 'rgba(255, 255, 255, 0.72)',
                                        padding: '0.75rem 1rem',
                                        borderRadius: 6,
                                        fontSize: '0.8rem'
                                    }}
                                    aria-live="polite"
                                >
                                    {previewText}
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
