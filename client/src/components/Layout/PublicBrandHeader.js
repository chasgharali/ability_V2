import React, { useEffect, useState } from 'react';
import settingsAPI from '../../services/settings';
import './PublicBrandHeader.css';

const PublicBrandHeader = () => {
    const [brandingLogo, setBrandingLogo] = useState('');
    const [brandingLogoAlt, setBrandingLogoAlt] = useState('ABILITY Job Fair');

    useEffect(() => {
        const fetchBranding = async () => {
            try {
                const logoRes = await settingsAPI.getSetting('branding_logo');
                if (logoRes.success && logoRes.value) {
                    setBrandingLogo(logoRes.value);
                }

                const altRes = await settingsAPI.getSetting('branding_logo_alt');
                if (altRes.success && altRes.value) {
                    setBrandingLogoAlt(altRes.value);
                }
            } catch {
                // Keep fallback branding text when settings are unavailable.
            }
        };

        fetchBranding();
    }, []);

    return (
        <header className="public-brand-header" role="banner">
            <div className="public-brand-header-inner">
                {brandingLogo ? (
                    <img
                        src={brandingLogo}
                        alt={brandingLogoAlt}
                        className="public-brand-logo"
                    />
                ) : (
                    <span className="public-brand-logo-text">{brandingLogoAlt}</span>
                )}
            </div>
        </header>
    );
};

export default PublicBrandHeader;
