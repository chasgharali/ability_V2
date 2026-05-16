import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRecruiterBooth } from '../../hooks/useRecruiterBooth';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import AdvancedJobSeekerSearch from './AdvancedJobSeekerSearch';
import '../Dashboard/Dashboard.css';
import './JobSeekerManagement.css';

export default function AISearchPage() {
  const { user } = useAuth();
  const { booth, event } = useRecruiterBooth();

  const isSuperAdmin = user?.role === 'SuperAdmin';
  const mode = isSuperAdmin ? 'global' : 'meeting';

  return (
    <div className="dashboard">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <AdminHeader
        brandingLogo={event?.logoUrl || event?.logo || ''}
        brandingLogoAlt={event?.logoAltText || ''}
        secondaryLogo={booth?.logoUrl || booth?.companyLogo || ''}
        secondaryLogoAlt={booth?.logoAltText || ''}
      />
      <div className="dashboard-layout">
        <AdminSidebar active="ai-search" />
        <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
          <div className="dashboard-content">
            <div className="page-header" style={{ paddingLeft: '20px', paddingRight: '20px' }}>
              <h1>Advanced AI Search</h1>
              <p>
                {isSuperAdmin
                  ? 'Search job seekers globally across organizations'
                  : 'Search job seekers visible in your meeting scope'}
              </p>
            </div>
            <div style={{ marginBottom: 16, paddingLeft: '20px', paddingRight: '20px' }}>
              <AdvancedJobSeekerSearch mode={mode} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
