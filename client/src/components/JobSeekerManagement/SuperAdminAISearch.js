import React from 'react';
import '../Dashboard/Dashboard.css';
import './JobSeekerManagement.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import AdvancedJobSeekerSearch from './AdvancedJobSeekerSearch';

export default function SuperAdminAISearch() {
  return (
    <div className="dashboard">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="ai-search" />
        <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
          <div className="dashboard-content">
            <div className="page-header" style={{ paddingLeft: '20px', paddingRight: '20px' }}>
              <h1>Advanced AI Search</h1>
              <p>Search job seekers globally across organizations</p>
            </div>
            <div style={{ marginBottom: 16, paddingLeft: '20px', paddingRight: '20px' }}>
              <AdvancedJobSeekerSearch mode="global" />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
