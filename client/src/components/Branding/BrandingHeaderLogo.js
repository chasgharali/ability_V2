import React, { useEffect, useState } from 'react';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import '../Dashboard/Dashboard.css';
import settingsAPI from '../../services/settings';
import { uploadImageToS3 } from '../../services/uploads';

const DEFAULT_ICON = 'https://upload.wikimedia.org/wikipedia/commons/7/70/Example.png';

export default function BrandingHeaderLogo() {
  const [brandingLogo, setBrandingLogo] = useState('');
  const [brandingLogoAlt, setBrandingLogoAlt] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Fetch logo on mount
  useEffect(() => {
    fetchLogo();
  }, []);

  const fetchLogo = async () => {
    try {
      setLoading(true);
      const logoResponse = await settingsAPI.getSetting('branding_logo');
      if (logoResponse.success && logoResponse.value) {
        setBrandingLogo(logoResponse.value);
      }
      
      const altResponse = await settingsAPI.getSetting('branding_logo_alt');
      if (altResponse.success && altResponse.value) {
        setBrandingLogoAlt(altResponse.value);
      }
    } catch (error) {
      // Setting doesn't exist yet, that's okay
      console.log('No branding logo set yet');
    } finally {
      setLoading(false);
    }
  };

  const saveBrandingLogo = async (logoUrl) => {
    try {
      if (logoUrl) {
        await settingsAPI.setSetting('branding_logo', logoUrl, 'Header logo for the application');
      } else {
        await settingsAPI.deleteSetting('branding_logo');
      }
      setBrandingLogo(logoUrl || '');
      setMessage(logoUrl ? 'Header logo updated' : 'Header logo removed');
      setTimeout(() => setMessage(''), 2000);
    } catch (e) {
      console.error('Failed to save header logo:', e);
      setMessage('Failed to save header logo');
      setTimeout(() => setMessage(''), 2000);
    }
  };

  const saveBrandingLogoAlt = async () => {
    try {
      if (brandingLogoAlt.trim()) {
        await settingsAPI.setSetting('branding_logo_alt', brandingLogoAlt.trim(), 'Alt text for header logo');
      } else {
        await settingsAPI.deleteSetting('branding_logo_alt');
      }
      setMessage('Alt text updated');
      setTimeout(() => setMessage(''), 2000);
    } catch (e) {
      console.error('Failed to save alt text:', e);
      setMessage('Failed to save alt text');
      setTimeout(() => setMessage(''), 2000);
    }
  };

  const onPickLogoFile = async (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setMessage('Please select an image file');
      return;
    }

    try {
      setUploading(true);
      setMessage('Uploading logo...');
      const { downloadUrl } = await uploadImageToS3(file, { variant: 'public' });
      if (!downloadUrl) {
        throw new Error('Upload did not return a logo URL');
      }
      await saveBrandingLogo(downloadUrl);
    } catch (error) {
      console.error('Failed to upload branding logo:', error);
      setMessage('Failed to upload logo to storage');
      setTimeout(() => setMessage(''), 2000);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="dashboard">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="branding" />
        <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
          <div className="dashboard-content">
            <h1>Branding – Header Logo</h1>
            {message && <div className="alert-box" style={{ background: '#f3f4f6', borderColor: '#e5e7eb', color: '#111827' }}>{message}</div>}
            <div className="alert-box" style={{ background: '#f3f4f6', borderColor: '#e5e7eb', color: '#111827' }}>
              <p>Upload a PNG, SVG, or JPG. The logo displays in the top-left. Recommended height ~28-36px.</p>
            </div>
            <div className="upload-card" style={{ maxWidth: 520 }}>
              <h4>Current Logo</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <img src={brandingLogo || DEFAULT_ICON} alt="Current header logo" style={{ height: 36, objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', padding: 6 }} />
                <button className="dashboard-button" style={{ width: 'auto' }} disabled={loading || uploading} onClick={() => saveBrandingLogo(DEFAULT_ICON)}>Use Default Icon</button>
              </div>
              <div className="upload-actions" style={{ marginTop: '1rem' }}>
                <label className="dashboard-button" style={{ width: 'auto', cursor: loading || uploading ? 'not-allowed' : 'pointer', opacity: loading || uploading ? 0.7 : 1 }}>
                  {loading ? 'Loading...' : uploading ? 'Uploading...' : 'Choose Image'}
                  <input type="file" accept="image/*" disabled={loading || uploading} onChange={(e) => onPickLogoFile(e.target.files?.[0])} style={{ display: 'none' }} />
                </label>
              </div>
              
              <div style={{ marginTop: '1.5rem' }}>
                <label htmlFor="brandingLogoAlt" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                  Logo Alt Text (for screen readers)
                </label>
                <input
                  id="brandingLogoAlt"
                  type="text"
                  className="dashboard-input"
                  value={brandingLogoAlt}
                  onChange={(e) => setBrandingLogoAlt(e.target.value)}
                  placeholder="e.g., Company Logo, Site Logo"
                  maxLength={200}
                  style={{ width: '100%', marginBottom: '0.5rem' }}
                />
                <button className="dashboard-button" style={{ width: 'auto' }} onClick={saveBrandingLogoAlt}>
                  Save Alt Text
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

    </div>
  );
}
