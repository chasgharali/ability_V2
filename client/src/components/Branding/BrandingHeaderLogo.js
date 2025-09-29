import React, { useMemo, useState } from 'react';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import '../Dashboard/Dashboard.css';

const DEFAULT_ICON = 'https://upload.wikimedia.org/wikipedia/commons/7/70/Example.png';

export default function BrandingHeaderLogo() {
  const [brandingLogo, setBrandingLogo] = useState(() => {
    try { return localStorage.getItem('ajf_branding_logo') || ''; } catch { return ''; }
  });
  const [message, setMessage] = useState('');

  const saveBrandingLogo = (dataUrl) => {
    try {
      if (dataUrl) {
        localStorage.setItem('ajf_branding_logo', dataUrl);
      } else {
        localStorage.removeItem('ajf_branding_logo');
      }
      setBrandingLogo(dataUrl || '');
      setMessage(dataUrl ? 'Header logo updated' : 'Header logo removed');
      setTimeout(() => setMessage(''), 2000);
    } catch (e) {
      setMessage('Failed to save header logo');
      setTimeout(() => setMessage(''), 2000);
    }
  };

  const onPickLogoFile = async (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { setMessage('Please select an image file'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      saveBrandingLogo(dataUrl);
    };
    reader.onerror = () => setMessage('Failed to read file');
    reader.readAsDataURL(file);
  };

  return (
    <div className="dashboard">
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="branding" />
        <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
          <div className="dashboard-content">
            <h2>Branding – Header Logo</h2>
            {message && <div className="alert-box" style={{ background: '#f3f4f6', borderColor: '#e5e7eb', color: '#111827' }}>{message}</div>}
            <div className="alert-box" style={{ background: '#f3f4f6', borderColor: '#e5e7eb', color: '#111827' }}>
              <p>Upload a PNG, SVG, or JPG. The logo displays in the top-left. Recommended height ~28-36px.</p>
            </div>
            <div className="upload-card" style={{ maxWidth: 520 }}>
              <h4>Current Logo</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <img src={brandingLogo || DEFAULT_ICON} alt="Current header logo" style={{ height: 36, objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', padding: 6 }} />
                <button className="dashboard-button" style={{ width: 'auto' }} onClick={() => saveBrandingLogo(DEFAULT_ICON)}>Use Default Icon</button>
              </div>
              <div className="upload-actions" style={{ marginTop: '1rem' }}>
                <label className="dashboard-button" style={{ width: 'auto', cursor: 'pointer' }}>
                  Choose Image
                  <input type="file" accept="image/*" onChange={(e) => onPickLogoFile(e.target.files?.[0])} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Mobile overlay */}
      <div className="mobile-overlay" aria-hidden="true" />
    </div>
  );
}
