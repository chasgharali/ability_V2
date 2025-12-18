import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { jobSeekerSurveyAPI } from '../../services/jobSeekerSurvey';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import { GridComponent, ColumnsDirective, ColumnDirective, Inject as GridInject, Page, Sort, Filter, Toolbar as GridToolbar, Resize, Reorder, ColumnChooser, ColumnMenu } from '@syncfusion/ej2-react-grids';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import '../Dashboard/Dashboard.css';
import './JobSeekerSurvey.css';

const JobSeekerSurvey = () => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const toastRef = useRef(null);
    const gridRef = useRef(null);
    const searchInputRef = useRef(null);
    const fetchInProgress = useRef(false);

    // Redirect if not authenticated or not authorized
    useEffect(() => {
        if (!loading) {
            if (!user) {
                navigate('/login', { replace: true });
            } else if (!['Admin', 'GlobalSupport'].includes(user.role)) {
                navigate('/dashboard', { replace: true });
            }
        }
    }, [user, loading, navigate]);

    const [surveys, setSurveys] = useState([]);
    const [loadingData, setLoadingData] = useState(true);
    const [stats, setStats] = useState({
        totalWithSurvey: 0,
        totalJobSeekers: 0,
        distinctRaces: 0,
        distinctGenders: 0,
        distinctAgeGroups: 0,
        distinctCountriesOfOrigin: 0
    });

    // Load filters from sessionStorage
    const loadFiltersFromSession = () => {
        try {
            const savedFilters = sessionStorage.getItem('jobSeekerSurvey_filters');
            const savedSearchQuery = sessionStorage.getItem('jobSeekerSurvey_searchQuery') || '';
            if (savedFilters) {
                const parsed = JSON.parse(savedFilters);
                return {
                    race: parsed.race || '',
                    genderIdentity: parsed.genderIdentity || '',
                    ageGroup: parsed.ageGroup || '',
                    countryOfOrigin: parsed.countryOfOrigin || '',
                    search: savedSearchQuery,
                    page: 1,
                    limit: 50,
                    sortBy: parsed.sortBy || 'survey.updatedAt',
                    sortOrder: parsed.sortOrder || 'desc'
                };
            }
        } catch (error) {
            console.error('Error loading filters from sessionStorage:', error);
        }
        return {
            race: '',
            genderIdentity: '',
            ageGroup: '',
            countryOfOrigin: '',
            search: '',
            page: 1,
            limit: 50,
            sortBy: 'survey.updatedAt',
            sortOrder: 'desc'
        };
    };

    const [filters, setFilters] = useState(loadFiltersFromSession);
    // Pending filters - not applied until "Go" button is clicked
    const [pendingFilters, setPendingFilters] = useState({
        race: loadFiltersFromSession().race || '',
        genderIdentity: loadFiltersFromSession().genderIdentity || '',
        ageGroup: loadFiltersFromSession().ageGroup || '',
        countryOfOrigin: loadFiltersFromSession().countryOfOrigin || ''
    });
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 0,
        totalSurveys: 0,
        hasNext: false,
        hasPrev: false
    });

    // Load search input value from sessionStorage
    useEffect(() => {
        const savedSearchQuery = sessionStorage.getItem('jobSeekerSurvey_searchQuery') || '';
        if (searchInputRef.current && savedSearchQuery) {
            searchInputRef.current.value = savedSearchQuery;
        }
    }, []);

    // Syncfusion Toast
    const showToast = useCallback((message, type = 'Success', duration = 3000) => {
        if (toastRef.current) {
            toastRef.current.show({
                title: type,
                content: message,
                cssClass: `e-toast-${type.toLowerCase()}`,
                showProgressBar: true,
                timeOut: duration
            });
        }
    }, []);

    // Sync header and content horizontal scrolling and match widths
    useEffect(() => {
        let scrollSyncActive = false;

        const syncScroll = () => {
            const grids = document.querySelectorAll('.jobseeker-survey-container .e-grid, .data-grid-container .e-grid');
            grids.forEach(grid => {
                const header = grid.querySelector('.e-gridheader');
                const content = grid.querySelector('.e-content');
                if (!header || !content) return;

                // Force enable scrolling on header
                header.style.overflowX = 'auto';
                header.style.overflowY = 'hidden';
                header.style.position = 'relative';
                header.style.display = 'block';
                header.style.width = '100%';

                // Match header table width to content table width for synchronized scrolling
                const matchTableWidths = () => {
                    const contentTable = content.querySelector('table');
                    const headerTable = header.querySelector('table');
                    const headerContent = header.querySelector('.e-headercontent');
                    
                    if (contentTable && headerTable) {
                        // Force layout recalculation
                        void contentTable.offsetWidth;
                        void headerTable.offsetWidth;
                        
                        // Get content table's full scroll width (includes all columns)
                        const contentScrollWidth = contentTable.scrollWidth || contentTable.offsetWidth;
                        const headerContainerWidth = header.offsetWidth || header.clientWidth;
                        
                        // Always set header table width to match content table exactly
                        if (contentScrollWidth > 0) {
                            headerTable.style.width = contentScrollWidth + 'px';
                            headerTable.style.minWidth = contentScrollWidth + 'px';
                            headerTable.style.maxWidth = 'none';
                            
                            if (headerContent) {
                                headerContent.style.width = contentScrollWidth + 'px';
                                headerContent.style.minWidth = contentScrollWidth + 'px';
                                headerContent.style.maxWidth = 'none';
                            }

                            // Match individual column widths from content to header
                            const headerRow = headerTable.querySelector('thead tr');
                            const contentRows = contentTable.querySelectorAll('tbody tr');
                            
                            if (headerRow && contentRows.length > 0) {
                                const headerCells = headerRow.querySelectorAll('th');
                                const firstContentRow = contentRows[0];
                                const contentCells = firstContentRow.querySelectorAll('td');
                                
                                if (headerCells.length === contentCells.length) {
                                    headerCells.forEach((headerCell, index) => {
                                        const contentCell = contentCells[index];
                                        if (headerCell && contentCell) {
                                            const cellWidth = contentCell.getBoundingClientRect().width;
                                            if (cellWidth > 0) {
                                                headerCell.style.width = cellWidth + 'px';
                                                headerCell.style.minWidth = cellWidth + 'px';
                                                headerCell.style.maxWidth = cellWidth + 'px';
                                            }
                                        }
                                    });
                                }
                            }
                        }
                        
                        // Enable scrolling if content is scrollable
                        if (contentScrollWidth > headerContainerWidth) {
                            header.style.overflowX = 'auto';
                            header.style.overflowY = 'hidden';
                        }
                    }
                };
                
                // Match widths with multiple attempts to catch grid render timing
                matchTableWidths();
                setTimeout(matchTableWidths, 50);
                setTimeout(matchTableWidths, 200);
                setTimeout(matchTableWidths, 500);
                setTimeout(matchTableWidths, 1000);

                // Sync scroll positions
                const syncContentToHeader = () => {
                    if (!scrollSyncActive) {
                        scrollSyncActive = true;
                        header.scrollLeft = content.scrollLeft;
                        requestAnimationFrame(() => {
                            scrollSyncActive = false;
                        });
                    }
                };

                const syncHeaderToContent = () => {
                    if (!scrollSyncActive) {
                        scrollSyncActive = true;
                        content.scrollLeft = header.scrollLeft;
                        requestAnimationFrame(() => {
                            scrollSyncActive = false;
                        });
                    }
                };

                // Remove old listeners
                content.removeEventListener('scroll', syncContentToHeader);
                header.removeEventListener('scroll', syncHeaderToContent);

                // Add new listeners
                content.addEventListener('scroll', syncContentToHeader, { passive: true });
                header.addEventListener('scroll', syncHeaderToContent, { passive: true });

                // Initial sync
                header.scrollLeft = content.scrollLeft;
            });
        };

        // Run immediately and after delays
        syncScroll();
        const timer1 = setTimeout(syncScroll, 100);
        const timer2 = setTimeout(syncScroll, 500);
        const timer3 = setTimeout(syncScroll, 1000);
        
        const observer = new MutationObserver(() => {
            setTimeout(syncScroll, 50);
        });
        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
            clearTimeout(timer3);
            observer.disconnect();
        };
    }, [surveys, loadingData]);

    // Load survey data
    const loadSurveys = useCallback(async () => {
        if (fetchInProgress.current) return;
        if (!user || !['Admin', 'GlobalSupport'].includes(user.role)) return;

        let cancelled = false;
        fetchInProgress.current = true;

        try {
            setLoadingData(true);

            // Load surveys with filters
            const response = await jobSeekerSurveyAPI.getSurveys(filters);

            if (cancelled) return;

            setSurveys(response.surveys || []);
            setPagination(response.pagination || {
                currentPage: 1,
                totalPages: 0,
                totalSurveys: 0,
                hasNext: false,
                hasPrev: false
            });

            // Load stats
            try {
                const statsResponse = await jobSeekerSurveyAPI.getStats();
                setStats(statsResponse);
            } catch (error) {
                console.error('Error loading stats:', error);
            }
        } catch (error) {
            console.error('Error loading survey data:', error);
            showToast(`Failed to load survey data: ${error.message}`, 'Error', 5000);
        } finally {
            fetchInProgress.current = false;
            setLoadingData(false);
        }

        return () => {
            cancelled = true;
        };
    }, [user, filters, showToast]);

    // Initialize pending filters from saved filters on mount
    useEffect(() => {
        const savedFilters = loadFiltersFromSession();
        setPendingFilters({
            race: savedFilters.race || '',
            genderIdentity: savedFilters.genderIdentity || '',
            ageGroup: savedFilters.ageGroup || '',
            countryOfOrigin: savedFilters.countryOfOrigin || ''
        });
    }, []);

    // Load surveys on mount and when filters change
    useEffect(() => {
        if (!user || !['Admin', 'GlobalSupport'].includes(user.role)) return;
        loadSurveys();
    }, [user, filters, loadSurveys]);

    // Handle pending filter changes (don't apply yet, just update local state)
    const handlePendingFilterChange = (key, value) => {
        setPendingFilters(prev => ({
            ...prev,
            [key]: value || ''
        }));
    };

    // Apply filters when "Go" button is clicked
    const handleApplyFilters = () => {
        setFilters(prev => {
            const newFilters = {
                ...prev,
                race: pendingFilters.race,
                genderIdentity: pendingFilters.genderIdentity,
                ageGroup: pendingFilters.ageGroup,
                countryOfOrigin: pendingFilters.countryOfOrigin,
                page: 1
            };
            // Save filters to sessionStorage
            try {
                const filtersToSave = {
                    race: newFilters.race,
                    genderIdentity: newFilters.genderIdentity,
                    ageGroup: newFilters.ageGroup,
                    countryOfOrigin: newFilters.countryOfOrigin,
                    sortBy: newFilters.sortBy,
                    sortOrder: newFilters.sortOrder
                };
                sessionStorage.setItem('jobSeekerSurvey_filters', JSON.stringify(filtersToSave));
            } catch (error) {
                console.error('Error saving filters to sessionStorage:', error);
            }
            return newFilters;
        });
    };

    // Clear all filters
    const handleClearFilters = () => {
        setPendingFilters({
            race: '',
            genderIdentity: '',
            ageGroup: '',
            countryOfOrigin: ''
        });
        setFilters(prev => {
            const newFilters = {
                ...prev,
                race: '',
                genderIdentity: '',
                ageGroup: '',
                countryOfOrigin: '',
                page: 1
            };
            try {
                sessionStorage.removeItem('jobSeekerSurvey_filters');
            } catch (error) {
                console.error('Error clearing filters from sessionStorage:', error);
            }
            return newFilters;
        });
    };

    // Handle search
    const handleSearch = () => {
        const query = (searchInputRef.current?.value || '').trim();
        setFilters(prev => ({
            ...prev,
            search: query,
            page: 1
        }));
        try {
            if (query) {
                sessionStorage.setItem('jobSeekerSurvey_searchQuery', query);
            } else {
                sessionStorage.removeItem('jobSeekerSurvey_searchQuery');
            }
        } catch (error) {
            console.error('Error saving search query:', error);
        }
    };

    // Clear search
    const handleClearSearch = () => {
        if (searchInputRef.current) {
            searchInputRef.current.value = '';
        }
        setFilters(prev => ({
            ...prev,
            search: '',
            page: 1
        }));
        try {
            sessionStorage.removeItem('jobSeekerSurvey_searchQuery');
        } catch (error) {
            console.error('Error clearing search query:', error);
        }
    };

    // Pagination handlers
    const goToPage = (page) => {
        setFilters(prev => {
            const newFilters = { ...prev, page };
            return newFilters;
        });
    };

    const handlePageSizeChange = (limit) => {
        setFilters(prev => {
            const newFilters = { ...prev, limit, page: 1 };
            return newFilters;
        });
    };

    // Export CSV
    const handleExport = async () => {
        try {
            setLoadingData(true);
            const blob = await jobSeekerSurveyAPI.exportCSV(filters);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `job-seeker-survey-data-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showToast('Survey data exported successfully', 'Success');
        } catch (error) {
            console.error('Export error:', error);
            showToast(`Failed to export: ${error.message}`, 'Error', 5000);
        } finally {
            setLoadingData(false);
        }
    };

    // Grid templates
    const nameTemplate = (props) => {
        return (
            <div style={{ padding: '8px' }}>
                <div style={{ fontWeight: 500 }}>{props.name || 'N/A'}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>{props.email || ''}</div>
            </div>
        );
    };

    const raceTemplate = (props) => {
        const race = props.survey?.race || [];
        return (
            <div style={{ padding: '8px' }}>
                {Array.isArray(race) && race.length > 0 ? race.join(', ') : 'N/A'}
            </div>
        );
    };

    const genderTemplate = (props) => {
        return (
            <div style={{ padding: '8px' }}>
                {props.survey?.genderIdentity || 'N/A'}
            </div>
        );
    };

    const ageGroupTemplate = (props) => {
        return (
            <div style={{ padding: '8px' }}>
                {props.survey?.ageGroup || 'N/A'}
            </div>
        );
    };

    const countryTemplate = (props) => {
        return (
            <div style={{ padding: '8px' }}>
                {props.survey?.countryOfOrigin || 'N/A'}
            </div>
        );
    };

    const disabilitiesTemplate = (props) => {
        const disabilities = props.survey?.disabilities || [];
        const otherDisability = props.survey?.otherDisability || '';
        const allDisabilities = [...disabilities];
        if (otherDisability) {
            allDisabilities.push(otherDisability);
        }
        return (
            <div style={{ padding: '8px' }}>
                {allDisabilities.length > 0 ? allDisabilities.join(', ') : 'N/A'}
            </div>
        );
    };

    const locationTemplate = (props) => {
        const parts = [];
        if (props.city) parts.push(props.city);
        if (props.state) parts.push(props.state);
        if (props.country) parts.push(props.country);
        return (
            <div style={{ padding: '8px' }}>
                {parts.length > 0 ? parts.join(', ') : 'N/A'}
            </div>
        );
    };

    const dateTemplate = (props) => {
        const date = props.survey?.updatedAt || props.createdAt;
        if (!date) return <div style={{ padding: '8px' }}>N/A</div>;
        try {
            const dateObj = new Date(date);
            return (
                <div style={{ padding: '8px' }}>
                    {dateObj.toLocaleDateString()} {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
            );
        } catch (error) {
            return <div style={{ padding: '8px' }}>N/A</div>;
        }
    };

    // Get unique filter options from surveys
    const getUniqueValues = (field) => {
        const values = new Set();
        surveys.forEach(survey => {
            const value = survey.survey?.[field];
            if (value) {
                if (Array.isArray(value)) {
                    value.forEach(v => {
                        if (v && v.trim()) values.add(v.trim());
                    });
                } else if (typeof value === 'string' && value.trim()) {
                    values.add(value.trim());
                }
            }
        });
        return Array.from(values).sort();
    };

    const raceOptions = [{ value: '', text: 'All Races' }, ...getUniqueValues('race').map(r => ({ value: r, text: r }))];
    const genderOptions = [{ value: '', text: 'All Genders' }, ...getUniqueValues('genderIdentity').map(g => ({ value: g, text: g }))];
    const ageGroupOptions = [{ value: '', text: 'All Age Groups' }, ...getUniqueValues('ageGroup').map(a => ({ value: a, text: a }))];
    const countryOptions = [{ value: '', text: 'All Countries' }, ...getUniqueValues('countryOfOrigin').map(c => ({ value: c, text: c }))];

    if (loading || !user) {
        return <div>Loading...</div>;
    }

    return (
        <div className="dashboard-container">
            <AdminHeader />
            <div className="dashboard-layout">
                <AdminSidebar active="jobseeker-survey" />
                <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
                    <div className="dashboard-content">
                        <div className="jobseeker-survey-container">
                            {/* Page Header */}
                            <div className="page-header">
                                <h1>Job Seeker Survey Data</h1>
                                <div className="header-actions" style={{ marginTop: '1rem', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                    <ButtonComponent 
                                        cssClass="e-primary"
                                        onClick={handleExport}
                                        disabled={loadingData}
                                        aria-label="Export survey data to CSV"
                                    >
                                        {loadingData ? 'Exporting...' : 'Export Survey Report'}
                                    </ButtonComponent>
                                </div>
                            </div>

                            {/* Statistics Cards */}
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <h3>Total with Survey</h3>
                                    <div className="stat-value">{stats.totalWithSurvey}</div>
                                </div>
                                <div className="stat-card">
                                    <h3>Total Job Seekers</h3>
                                    <div className="stat-value">{stats.totalJobSeekers}</div>
                                </div>
                                <div className="stat-card">
                                    <h3>Distinct Races</h3>
                                    <div className="stat-value">{stats.distinctRaces}</div>
                                </div>
                                <div className="stat-card">
                                    <h3>Distinct Genders</h3>
                                    <div className="stat-value">{stats.distinctGenders}</div>
                                </div>
                                <div className="stat-card">
                                    <h3>Distinct Age Groups</h3>
                                    <div className="stat-value">{stats.distinctAgeGroups}</div>
                                </div>
                                <div className="stat-card">
                                    <h3>Distinct Countries</h3>
                                    <div className="stat-value">{stats.distinctCountriesOfOrigin}</div>
                                </div>
                            </div>

                            {/* Filters Row */}
                            <div style={{ marginBottom: 12, paddingLeft: '20px', paddingRight: '20px' }}>
                                <div className="jsi-filters-row" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                                    {/* Race Filter */}
                                    <div style={{ width: '200px', flexShrink: 0 }}>
                                        <DropDownListComponent
                                            dataSource={raceOptions}
                                            fields={{ value: 'value', text: 'text' }}
                                            value={pendingFilters.race}
                                            change={(e) => handlePendingFilterChange('race', e.value || '')}
                                            placeholder="All Races"
                                            cssClass="filter-dropdown"
                                            popupHeight="300px"
                                            width="100%"
                                        />
                                    </div>
                                    {/* Gender Filter */}
                                    <div style={{ width: '200px', flexShrink: 0 }}>
                                        <DropDownListComponent
                                            dataSource={genderOptions}
                                            fields={{ value: 'value', text: 'text' }}
                                            value={pendingFilters.genderIdentity}
                                            change={(e) => handlePendingFilterChange('genderIdentity', e.value || '')}
                                            placeholder="All Genders"
                                            cssClass="filter-dropdown"
                                            popupHeight="300px"
                                            width="100%"
                                        />
                                    </div>
                                    {/* Age Group Filter */}
                                    <div style={{ width: '200px', flexShrink: 0 }}>
                                        <DropDownListComponent
                                            dataSource={ageGroupOptions}
                                            fields={{ value: 'value', text: 'text' }}
                                            value={pendingFilters.ageGroup}
                                            change={(e) => handlePendingFilterChange('ageGroup', e.value || '')}
                                            placeholder="All Age Groups"
                                            cssClass="filter-dropdown"
                                            popupHeight="300px"
                                            width="100%"
                                        />
                                    </div>
                                    {/* Country Filter */}
                                    <div style={{ width: '200px', flexShrink: 0 }}>
                                        <DropDownListComponent
                                            dataSource={countryOptions}
                                            fields={{ value: 'value', text: 'text' }}
                                            value={pendingFilters.countryOfOrigin}
                                            change={(e) => handlePendingFilterChange('countryOfOrigin', e.value || '')}
                                            placeholder="All Countries"
                                            cssClass="filter-dropdown"
                                            popupHeight="300px"
                                            width="100%"
                                        />
                                    </div>
                                    {/* Go and Clear Buttons */}
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <ButtonComponent
                                            cssClass="e-primary e-small"
                                            onClick={handleApplyFilters}
                                            disabled={loadingData}
                                            aria-label="Apply filters"
                                            style={{ minWidth: '70px', height: '44px' }}
                                        >
                                            Go
                                        </ButtonComponent>
                                        <ButtonComponent
                                            cssClass="e-outline e-primary e-small"
                                            onClick={handleClearFilters}
                                            disabled={loadingData}
                                            aria-label="Clear filters"
                                            style={{ minWidth: '70px', height: '44px' }}
                                        >
                                            Clear
                                        </ButtonComponent>
                                    </div>
                                </div>
                                {/* Search Section - Moved below filters on left side */}
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <div style={{ marginBottom: 0 }}>
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            defaultValue=""
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleSearch();
                                                }
                                            }}
                                            placeholder="Search by name or email..."
                                            style={{ width: '300px', marginBottom: 0, padding: '10px 12px', borderRadius: '10px', border: '1px solid #d1d5db', fontSize: '14px' }}
                                        />
                                    </div>
                                    <ButtonComponent
                                        cssClass="e-primary e-small"
                                        onClick={handleSearch}
                                        disabled={loadingData}
                                        aria-label="Search survey data"
                                        style={{ minWidth: '80px', height: '44px' }}
                                    >
                                        Search
                                    </ButtonComponent>
                                    {((searchInputRef.current && searchInputRef.current.value) || filters.search) && (
                                        <ButtonComponent
                                            cssClass="e-outline e-primary e-small"
                                            onClick={handleClearSearch}
                                            disabled={loadingData}
                                            aria-label="Clear search"
                                            style={{ minWidth: '70px', height: '44px' }}
                                        >
                                            Clear
                                        </ButtonComponent>
                                    )}
                                </div>
                            </div>

                            {/* Data Grid */}
                            <div className="data-grid-container" style={{ position: 'relative' }}>
                                {loadingData && (
                                    <div className="jsi-grid-loading-overlay">
                                        <div className="jsi-loading-container">
                                            <div className="jsi-loading-spinner" aria-label="Loading survey data" role="status" aria-live="polite"></div>
                                            <div className="jsi-loading-text">Loading survey data...</div>
                                        </div>
                                    </div>
                                )}
                                <GridComponent
                                    ref={gridRef}
                                    dataSource={surveys.map(s => ({
                                        ...s,
                                        id: s._id,
                                        race: s.survey?.race || [],
                                        genderIdentity: s.survey?.genderIdentity || '',
                                        ageGroup: s.survey?.ageGroup || '',
                                        countryOfOrigin: s.survey?.countryOfOrigin || '',
                                        disabilities: s.survey?.disabilities || []
                                    }))}
                                    allowPaging={false}
                                    allowSorting={true}
                                    allowFiltering={true}
                                    filterSettings={{ 
                                        type: 'Menu',
                                        showFilterBarStatus: true,
                                        immediateModeDelay: 0
                                    }}
                                    showColumnMenu={true}
                                    showColumnChooser={true}
                                    allowResizing={true}
                                    allowReordering={true}
                                    toolbar={['ColumnChooser']}
                                    enableHover={true}
                                >
                                    <ColumnsDirective>
                                        <ColumnDirective field='id' headerText='' width='0' isPrimaryKey={true} visible={false} showInColumnChooser={false} />
                                        <ColumnDirective field='name' headerText='Name' width='200' clipMode='EllipsisWithTooltip' template={nameTemplate} allowFiltering={true} />
                                        <ColumnDirective field='race' headerText='Race' width='180' clipMode='EllipsisWithTooltip' template={raceTemplate} allowFiltering={true} />
                                        <ColumnDirective field='genderIdentity' headerText='Gender' width='140' clipMode='EllipsisWithTooltip' template={genderTemplate} allowFiltering={true} />
                                        <ColumnDirective field='ageGroup' headerText='Age Group' width='140' clipMode='EllipsisWithTooltip' template={ageGroupTemplate} allowFiltering={true} />
                                        <ColumnDirective field='countryOfOrigin' headerText='Country of Origin' width='200' clipMode='EllipsisWithTooltip' template={countryTemplate} allowFiltering={true} />
                                        <ColumnDirective field='disabilities' headerText='Disabilities' width='250' clipMode='EllipsisWithTooltip' template={disabilitiesTemplate} allowFiltering={true} />
                                        <ColumnDirective field='city' headerText='Location' width='180' clipMode='EllipsisWithTooltip' template={locationTemplate} allowFiltering={true} />
                                        <ColumnDirective field='survey.updatedAt' headerText='Survey Updated' width='180' clipMode='EllipsisWithTooltip' template={dateTemplate} allowFiltering={true} />
                                    </ColumnsDirective>
                                    <GridInject services={[Page, Sort, Filter, GridToolbar, Resize, Reorder, ColumnChooser, ColumnMenu]} />
                                </GridComponent>
                                
                                {/* Custom Pagination Footer */}
                                {(pagination.totalPages || 1) > 0 && (
                                    <div className="custom-pagination" style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '16px',
                                        backgroundColor: '#f9fafb',
                                        borderTop: '1px solid #e5e7eb',
                                        marginTop: '0'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ fontSize: '14px', color: '#374151' }}>
                                                Rows per page:
                                            </span>
                                            <select
                                                value={filters.limit}
                                                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #d1d5db',
                                                    fontSize: '14px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <option value={50}>50</option>
                                                <option value={100}>100</option>
                                                <option value={200}>200</option>
                                            </select>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '14px', color: '#374151' }}>
                                                Page {pagination.currentPage || filters.page} of {pagination.totalPages || 1} ({pagination.totalSurveys || surveys.length} total)
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button
                                                onClick={() => goToPage(1)}
                                                disabled={(pagination.currentPage || filters.page) <= 1 || loadingData}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #d1d5db',
                                                    backgroundColor: (pagination.currentPage || filters.page) <= 1 ? '#f3f4f6' : '#fff',
                                                    cursor: (pagination.currentPage || filters.page) <= 1 ? 'not-allowed' : 'pointer',
                                                    fontSize: '14px',
                                                    color: (pagination.currentPage || filters.page) <= 1 ? '#9ca3af' : '#374151'
                                                }}
                                            >
                                                ⟨⟨
                                            </button>
                                            <button
                                                onClick={() => goToPage((pagination.currentPage || filters.page) - 1)}
                                                disabled={(pagination.currentPage || filters.page) <= 1 || loadingData}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #d1d5db',
                                                    backgroundColor: (pagination.currentPage || filters.page) <= 1 ? '#f3f4f6' : '#fff',
                                                    cursor: (pagination.currentPage || filters.page) <= 1 ? 'not-allowed' : 'pointer',
                                                    fontSize: '14px',
                                                    color: (pagination.currentPage || filters.page) <= 1 ? '#9ca3af' : '#374151'
                                                }}
                                            >
                                                ⟨ Prev
                                            </button>
                                            <input
                                                type="number"
                                                min="1"
                                                max={pagination.totalPages || 1}
                                                value={pagination.currentPage || filters.page}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    if (val >= 1 && val <= (pagination.totalPages || 1)) {
                                                        goToPage(val);
                                                    }
                                                }}
                                                style={{
                                                    width: '60px',
                                                    padding: '6px 8px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #d1d5db',
                                                    fontSize: '14px',
                                                    textAlign: 'center'
                                                }}
                                            />
                                            <button
                                                onClick={() => goToPage((pagination.currentPage || filters.page) + 1)}
                                                disabled={(pagination.currentPage || filters.page) >= (pagination.totalPages || 1) || loadingData}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #d1d5db',
                                                    backgroundColor: (pagination.currentPage || filters.page) >= (pagination.totalPages || 1) ? '#f3f4f6' : '#fff',
                                                    cursor: (pagination.currentPage || filters.page) >= (pagination.totalPages || 1) ? 'not-allowed' : 'pointer',
                                                    fontSize: '14px',
                                                    color: (pagination.currentPage || filters.page) >= (pagination.totalPages || 1) ? '#9ca3af' : '#374151'
                                                }}
                                            >
                                                Next ⟩
                                            </button>
                                            <button
                                                onClick={() => goToPage(pagination.totalPages || filters.page)}
                                                disabled={(pagination.currentPage || filters.page) >= (pagination.totalPages || 1) || loadingData}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #d1d5db',
                                                    backgroundColor: (pagination.currentPage || filters.page) >= (pagination.totalPages || 1) ? '#f3f4f6' : '#fff',
                                                    cursor: (pagination.currentPage || filters.page) >= (pagination.totalPages || 1) ? 'not-allowed' : 'pointer',
                                                    fontSize: '14px',
                                                    color: (pagination.currentPage || filters.page) >= (pagination.totalPages || 1) ? '#9ca3af' : '#374151'
                                                }}
                                            >
                                                ⟩⟩
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            {/* Syncfusion ToastComponent */}
            <ToastComponent
                ref={(toast) => toastRef.current = toast}
                position={{ X: 'Right', Y: 'Bottom' }}
                showProgressBar={true}
                timeOut={3000}
                newestOnTop={true}
            />
        </div>
    );
};

export default JobSeekerSurvey;

