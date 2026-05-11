import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getJobSeekerParseStatus,
  triggerBatchParse,
  aiSearchJobSeekers,
  getGlobalParseStatus,
  triggerGlobalBatchParse,
  aiSearchJobSeekersGlobal,
  aiSearchMeetingRecords
} from '../../services/organizations';
import { openResumeInNewTab } from '../../utils/resumeViewer';
import './AdvancedJobSeekerSearch.css';

const POLL_INTERVAL_MS = 4000;

/**
 * Adapter that picks the right backend endpoints based on `mode`.
 *   - 'org'      → org-scoped (Admin / AdminEvent)
 *   - 'global'   → SuperAdmin global jobseekers
 *   - 'meeting'  → Admin / Recruiter meeting records
 *
 * Meeting mode does not expose parse controls — parsing is done elsewhere.
 */
function getApi(mode, orgId) {
  if (mode === 'global') {
    return {
      supportsParse: true,
      getStatus: () => getGlobalParseStatus(),
      triggerParse: () => triggerGlobalBatchParse(false),
      runSearch: (q, p) => aiSearchJobSeekersGlobal(q, p)
    };
  }
  if (mode === 'meeting') {
    return {
      supportsParse: false,
      getStatus: null,
      triggerParse: null,
      runSearch: (q, p) => aiSearchMeetingRecords(q, p)
    };
  }
  // 'org' (default)
  return {
    supportsParse: true,
    getStatus: () => getJobSeekerParseStatus(orgId),
    triggerParse: () => triggerBatchParse(orgId),
    runSearch: (q, p) => aiSearchJobSeekers(orgId, q, p)
  };
}

export default function AdvancedJobSeekerSearch({ orgId, mode = 'org' }) {
  const api = getApi(mode, orgId);
  const [parseStatus, setParseStatus] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState('');

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [results, setResults] = useState(null);
  const [criteria, setCriteria] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastQuery, setLastQuery] = useState('');

  const pollRef = useRef(null);
  const textareaRef = useRef(null);

  const loadParseStatus = useCallback(async () => {
    if (!api.supportsParse) return;
    if (mode === 'org' && !orgId) return;
    try {
      const s = await api.getStatus();
      setParseStatus(s);
    } catch (e) {
      // non-fatal — status banner is informational only
    }
  }, [api, mode, orgId]);

  useEffect(() => {
    loadParseStatus();
  }, [loadParseStatus]);

  // Poll parse status while a batch is running
  useEffect(() => {
    if (!isParsing || !api.supportsParse) {
      clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const s = await api.getStatus();
        setParseStatus(s);
        if (s.unparsed === 0) {
          setIsParsing(false);
          clearInterval(pollRef.current);
        }
      } catch {
        // ignore poll errors
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [isParsing, api]);

  const handleParse = async () => {
    if (!api.supportsParse) return;
    setParseError('');
    setIsParsing(true);
    try {
      await api.triggerParse();
      await loadParseStatus();
    } catch (e) {
      setParseError(e.response?.data?.error || 'Failed to start parsing');
      setIsParsing(false);
    }
  };

  const runSearch = useCallback(async (searchQuery, searchPage = 1) => {
    if (!searchQuery?.trim()) return;
    setIsSearching(true);
    setSearchError('');
    try {
      const res = await api.runSearch(searchQuery, { page: searchPage, limit: 20 });
      setResults(res.results || []);
      setCriteria(res.criteria || null);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
      setPage(searchPage);
      setLastQuery(searchQuery);
    } catch (e) {
      const data = e.response?.data;
      // Surface the privacy guardrail clearly to the user.
      if (data?.code === 'SENSITIVE_QUERY') {
        setSearchError(
          `That search isn't allowed. AI search can only filter by role, ` +
          `skills, location, education and work level — not by disability, ` +
          `accessibility, race, gender, age, or other protected attributes.`
        );
      } else {
        setSearchError(data?.error || 'Search failed. Please try again.');
      }
    } finally {
      setIsSearching(false);
    }
  }, [api]);

  const handleSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setPage(1);
    runSearch(q, 1);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch(e);
    }
  };

  const handlePageChange = (newPage) => {
    runSearch(lastQuery, newPage);
  };

  // Examples are intentionally limited to role / skills / location / level.
  // The backend rejects disability, accessibility, race, gender, and age
  // filters (see SENSITIVE_QUERY_PATTERNS in aiSearchService.js).
  const exampleQueries = [
    'developer from Pakistan with 10 years of experience',
    'senior security guard in Denver',
    'bilingual customer service in Texas',
    'warehouse worker entry level',
    'registered nurse with 5+ years in California'
  ];

  const applyExample = (ex) => {
    setQuery(ex);
    textareaRef.current?.focus();
  };

  return (
    <div className="ai-search-container">
      {/* Parse Status Banner */}
      {parseStatus && parseStatus.total > 0 && (
        <div className={`parse-status-banner${parseStatus.unparsed === 0 ? ' parse-status-banner--done' : ''}`} role="status">
          <div className="parse-status-top">
            <div className="parse-status-content">
              <span className="parse-status-icon" aria-hidden="true">
                {parseStatus.unparsed === 0 ? '✓' : '⚡'}
              </span>
              <div className="parse-status-info">
                <span className="parse-status-text">
                  {parseStatus.unparsed === 0
                    ? <>All <strong>{parseStatus.total}</strong> profiles are indexed for AI search</>
                    : <><strong>{parseStatus.unparsed}</strong> of <strong>{parseStatus.total}</strong> job seekers not yet indexed</>
                  }
                </span>
                {isParsing && (
                  <span className="parse-status-progress">
                    Indexing in progress… {parseStatus.parsed} done
                  </span>
                )}
              </div>
            </div>
            <button
              className={`parse-btn${parseStatus.unparsed === 0 ? ' parse-btn--secondary' : ''}`}
              onClick={handleParse}
              disabled={isParsing}
              aria-label={isParsing ? 'Indexing profiles, please wait' : parseStatus.unparsed === 0 ? 'Re-index all profiles' : 'Start indexing profiles'}
            >
              {isParsing ? (
                <><span className="parse-btn-spinner" aria-hidden="true" />Indexing…</>
              ) : (
                parseStatus.unparsed === 0 ? 'Re-index All' : 'Index Profiles Now'
              )}
            </button>
          </div>

          {/* Progress bar */}
          {parseStatus.total > 0 && (
            <div className="parse-progress-bar-wrap" aria-hidden="true">
              <div
                className="parse-progress-bar"
                style={{ width: `${Math.round((parseStatus.parsed / parseStatus.total) * 100)}%` }}
              />
            </div>
          )}

          {/* Stats row */}
          <div className="parse-stats-row">
            <div className="parse-stat">
              <span className="parse-stat-value">{parseStatus.total}</span>
              <span className="parse-stat-label">Total</span>
            </div>
            <div className="parse-stat parse-stat--indexed">
              <span className="parse-stat-value">{parseStatus.parsed}</span>
              <span className="parse-stat-label">Indexed</span>
            </div>
            <div className="parse-stat parse-stat--pending">
              <span className="parse-stat-value">{parseStatus.unparsed}</span>
              <span className="parse-stat-label">Pending</span>
            </div>
            <div className="parse-stat">
              <span className="parse-stat-value">
                {parseStatus.total > 0 ? `${Math.round((parseStatus.parsed / parseStatus.total) * 100)}%` : '0%'}
              </span>
              <span className="parse-stat-label">Complete</span>
            </div>
          </div>

          {/* Recently indexed names */}
          {parseStatus.recentlyIndexed?.length > 0 && (
            <div className="parse-recent">
              <span className="parse-recent-label">Recently indexed:</span>
              <div className="parse-recent-list">
                {parseStatus.recentlyIndexed.map(u => (
                  <span key={u._id} className="parse-recent-chip" title={u.email}>
                    <span className="parse-recent-avatar">{u.name?.charAt(0)?.toUpperCase() || '?'}</span>
                    <span className="parse-recent-name">{u.name}</span>
                    {u.currentTitle && <span className="parse-recent-title">· {u.currentTitle}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {parseError && <p className="parse-error">{parseError}</p>}
        </div>
      )}

      {/* Search Panel */}
      <div className="ai-search-panel">
        <div className="ai-search-panel-hero">
          <div className="ai-search-hero-eyebrow">
            <span className="ai-search-hero-spark" aria-hidden="true">✦</span>
            AI-Powered Search
          </div>
          <h2 className="ai-search-title">Advanced AI Search</h2>
          <p className="ai-search-subtitle">
            Describe the role, skills, experience, or location in plain English. We search across parsed resumes and public profile fields. Disability, accessibility, and other protected attributes are never indexed or searchable.
          </p>
        </div>

        <div className="ai-search-body">
          <form className="ai-search-form" onSubmit={handleSearch} noValidate>
            <div className="ai-search-input-wrap">
              <label htmlFor="ai-search-query" className="sr-only">Search query</label>
              <textarea
                id="ai-search-query"
                ref={textareaRef}
                className="ai-search-textarea"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. security guard in Denver with ADHD, or bilingual nurse needing ASL in California…"
                rows={3}
                aria-describedby="ai-search-hint"
                disabled={isSearching}
              />
              <p id="ai-search-hint" className="ai-search-hint">
                Press <kbd>Enter</kbd> to search &middot; <kbd>Shift+Enter</kbd> for new line
              </p>
            </div>

            <div className="ai-search-actions">
              <button
                type="submit"
                className="ai-search-btn"
                disabled={isSearching || !query.trim()}
                aria-label="Run AI search"
              >
                {isSearching ? (
                  <>
                    <span className="parse-btn-spinner" aria-hidden="true" />
                    Searching…
                  </>
                ) : (
                  <>
                    <span className="ai-search-btn-icon" aria-hidden="true">✦</span>
                    Search
                  </>
                )}
              </button>
              {results !== null && (
                <button
                  type="button"
                  className="ai-search-btn ai-search-btn--clear"
                  onClick={() => { setResults(null); setQuery(''); setCriteria(null); setLastQuery(''); }}
                  aria-label="Clear search results"
                >
                  Clear results
                </button>
              )}
            </div>
          </form>

          {/* Example Queries */}
          {results === null && !isSearching && (
            <div className="ai-search-examples">
              <p className="ai-search-examples-label">Try an example:</p>
              <div className="ai-search-examples-list" role="list">
                {exampleQueries.map(ex => (
                  <button
                    key={ex}
                    type="button"
                    className="ai-search-example-chip"
                    onClick={() => applyExample(ex)}
                    role="listitem"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search Error */}
      {searchError && (
        <div className="ai-search-error" role="alert">
          <strong>Search error:</strong> {searchError}
        </div>
      )}

      {/* Interpreted Criteria — only non-sensitive structured filters */}
      {criteria && (
        criteria.location?.city ||
        criteria.location?.state ||
        criteria.location?.country ||
        criteria.educationLevel ||
        criteria.workLevel ||
        criteria.minYearsExperience != null ||
        criteria.maxYearsExperience != null ||
        criteria.employmentTypes?.length ||
        criteria.languages?.length ||
        criteria.roleKeywords?.length ||
        criteria.skillKeywords?.length
      ) && (
        <div className="ai-criteria-box" aria-label="How AI interpreted your query">
          <p className="ai-criteria-label">AI interpreted your query as:</p>
          <div className="ai-criteria-tags">
            {criteria.roleKeywords?.map(r => (
              <span key={`role-${r}`} className="ai-tag ai-tag--title">💼 {r}</span>
            ))}
            {criteria.skillKeywords?.map(s => (
              <span key={`skill-${s}`} className="ai-tag ai-tag--skill">🔧 {s}</span>
            ))}
            {criteria.location?.city && (
              <span className="ai-tag ai-tag--location">📍 {criteria.location.city}{criteria.location.state ? `, ${criteria.location.state}` : ''}</span>
            )}
            {criteria.location?.country && !criteria.location?.city && (
              <span className="ai-tag ai-tag--location">🌍 {criteria.location.country}</span>
            )}
            {criteria.educationLevel && (
              <span className="ai-tag">🎓 {criteria.educationLevel}</span>
            )}
            {criteria.workLevel && (
              <span className="ai-tag">📊 {criteria.workLevel}</span>
            )}
            {criteria.minYearsExperience != null && (
              <span className="ai-tag">⏱ {criteria.minYearsExperience}+ years</span>
            )}
            {criteria.employmentTypes?.map(et => (
              <span key={et} className="ai-tag">{et}</span>
            ))}
            {criteria.languages?.map(l => (
              <span key={l} className="ai-tag">🗣 {l}</span>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {results !== null && (
        <div className="ai-results-section">
          <div className="ai-results-header">
            <h3 className="ai-results-count">
              {total === 0 ? 'No results found' : `${total} job seeker${total !== 1 ? 's' : ''} found`}
            </h3>
            {total > 0 && (
              <p className="ai-results-subtext">
                Showing page {page} of {totalPages}
              </p>
            )}
          </div>

          {total === 0 && (
            <div className="ai-no-results">
              <p>No job seekers matched your search. Try broader terms or check that profiles have been indexed.</p>
            </div>
          )}

          <div className="ai-results-grid" role="list">
            {results.map(js => (
              <JobSeekerCard key={js._id} jobSeeker={js} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="ai-pagination" role="navigation" aria-label="Search result pages">
              <button
                className="ai-page-btn"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1 || isSearching}
                aria-label="Previous page"
              >
                ← Prev
              </button>
              <span className="ai-page-info">Page {page} of {totalPages}</span>
              <button
                className="ai-page-btn"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages || isSearching}
                aria-label="Next page"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function JobSeekerCard({ jobSeeker }) {
  const ai = jobSeeker.aiProfile || {};
  const location = [jobSeeker.city, jobSeeker.state, jobSeeker.country].filter(Boolean).join(', ');
  const eventsLabel = ai.totalEventsRegistered
    ? `${ai.totalEventsRegistered} event${ai.totalEventsRegistered !== 1 ? 's' : ''}`
    : null;

  const registrations = Array.isArray(jobSeeker.registrations) ? jobSeeker.registrations : [];

  // Deterministic priority:
  // 1) any registration resumeId (resume builder doc)
  // 2) any registration resumeUrl (uploaded/generated file)
  // 3) user-level resumeUrl
  const regWithResumeId = registrations.find(r => r?.resumeId?._id || r?.resumeId);
  const resumeId = regWithResumeId?.resumeId?._id || regWithResumeId?.resumeId || null;

  const regWithResumeUrl = registrations.find(r => r?.resumeUrl);
  const resumeUrl = regWithResumeUrl?.resumeUrl || jobSeeker.resumeUrl || null;
  const hasResume = !!(resumeId || resumeUrl);

  const handleViewResume = () => {
    if (hasResume) openResumeInNewTab(resumeId, resumeUrl);
  };

  return (
    <article className="ai-result-card" role="listitem">
      <div className="ai-card-header">
        <div className="ai-card-avatar" aria-hidden="true">
          {jobSeeker.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div className="ai-card-identity">
          <h4 className="ai-card-name">{jobSeeker.name}</h4>
          {ai.currentTitle && <p className="ai-card-title">{ai.currentTitle}</p>}
          {location && (
            <p className="ai-card-location">
              <span aria-hidden="true">📍</span> {location}
            </p>
          )}
        </div>
        <div className="ai-card-badges">
          {jobSeeker.isActive === false && (
            <span className="ai-badge ai-badge--inactive">Inactive</span>
          )}
          {eventsLabel && (
            <span className="ai-badge ai-badge--events" title={ai.eventNames?.join(', ')}>
              {eventsLabel}
            </span>
          )}
        </div>
      </div>

      {ai.summary && (
        <p className="ai-card-summary">{ai.summary}</p>
      )}

      <div className="ai-card-meta">
        {ai.skills?.length > 0 && (
          <div className="ai-card-section">
            <span className="ai-card-section-label">Skills</span>
            <div className="ai-card-tags">
              {ai.skills.slice(0, 6).map(s => (
                <span key={s} className="ai-mini-tag">{s}</span>
              ))}
              {ai.skills.length > 6 && (
                <span className="ai-mini-tag ai-mini-tag--more">+{ai.skills.length - 6}</span>
              )}
            </div>
          </div>
        )}

        {/* Note: disability and accessibility data is intentionally not
            displayed in search results. Recruiters/admins access that
            information only through consented disclosure flows
            (interpreter requests, etc.), never via AI search. */}

        <div className="ai-card-details">
          {ai.educationLevel && (
            <span className="ai-detail-chip">🎓 {ai.educationLevel}</span>
          )}
          {ai.workLevel && (
            <span className="ai-detail-chip">📊 {ai.workLevel}</span>
          )}
          {ai.yearsOfExperience != null && (
            <span className="ai-detail-chip">⏱ {ai.yearsOfExperience}y exp</span>
          )}
          {ai.workLanguages?.length > 0 && (
            <span className="ai-detail-chip">🗣 {ai.workLanguages.join(', ')}</span>
          )}
        </div>
      </div>

      <div className="ai-card-footer">
        <div className="ai-card-contact">
          <a href={`mailto:${jobSeeker.email}`} className="ai-contact-link" aria-label={`Email ${jobSeeker.name}`}>
            {jobSeeker.email}
          </a>
          {jobSeeker.phoneNumber && (
            <a href={`tel:${jobSeeker.phoneNumber}`} className="ai-contact-link" aria-label={`Call ${jobSeeker.name}`}>
              {jobSeeker.phoneNumber}
            </a>
          )}
        </div>
        {hasResume && (
          <button
            className="ai-resume-btn"
            onClick={handleViewResume}
            aria-label={`View resume for ${jobSeeker.name}`}
          >
            View Resume
          </button>
        )}
      </div>

      {ai.parsedAt && (
        <p className="ai-card-parsed-at">
          Indexed {new Date(ai.parsedAt).toLocaleDateString()}
        </p>
      )}
    </article>
  );
}
