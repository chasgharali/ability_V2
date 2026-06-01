import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getJobSeekerParseStatus,
  triggerBatchParse,
  aiSearchJobSeekers,
  aiSearchJobSeekersStream,
  getGlobalParseStatus,
  triggerGlobalBatchParse,
  aiSearchJobSeekersGlobal,
  aiSearchJobSeekersGlobalStream,
  aiSearchMeetingRecords
} from '../../services/organizations';
import { aiSearchJobSeekerInterests } from '../../services/jobSeekerInterests';
import { openResumeInNewTab } from '../../utils/resumeViewer';
import { getResolvedResumeRefs } from '../../utils/jobSeekerResume';
import './AdvancedJobSeekerSearch.css';

const POLL_INTERVAL_MS = 4000;

/**
 * Adapter that picks the right backend endpoints based on `mode`.
 *   - 'org'      → org-scoped (Admin / AdminEvent)
 *   - 'global'   → SuperAdmin global jobseekers
 *   - 'meeting'   → Admin / Recruiter meeting records
 *   - 'interests' → Admin / Recruiter job seeker interests
 *
 * Meeting and interests modes do not expose parse controls — parsing is done elsewhere.
 */
function getApi(mode, orgId) {
  if (mode === 'global') {
    return {
      supportsParse: true,
      supportsStream: true,
      getStatus: () => getGlobalParseStatus(),
      triggerParse: () => triggerGlobalBatchParse(false),
      runSearch: (q, p) => aiSearchJobSeekersGlobal(q, p),
      runSearchStream: (q, p) => aiSearchJobSeekersGlobalStream(q, p)
    };
  }
  if (mode === 'meeting') {
    return {
      supportsParse: false,
      supportsStream: false,
      getStatus: null,
      triggerParse: null,
      runSearch: (q, p) => aiSearchMeetingRecords(q, p),
      runSearchStream: null
    };
  }
  if (mode === 'interests') {
    return {
      supportsParse: false,
      supportsStream: false,
      getStatus: null,
      triggerParse: null,
      runSearch: (q, p) => aiSearchJobSeekerInterests(q, p),
      runSearchStream: null
    };
  }
  // 'org' (default)
  return {
    supportsParse: true,
    supportsStream: true,
    getStatus: () => getJobSeekerParseStatus(orgId),
    triggerParse: () => triggerBatchParse(orgId),
    runSearch: (q, p) => aiSearchJobSeekers(orgId, q, p),
    runSearchStream: (q, p) => aiSearchJobSeekersStream(orgId, q, p)
  };
}

export default function AdvancedJobSeekerSearch({ orgId, mode = 'org', onViewJobSeeker }) {
  const navigate = useNavigate();
  const api = getApi(mode, orgId);
  const [parseStatus, setParseStatus] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState('');

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [results, setResults] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastQuery, setLastQuery] = useState('');

  // Streaming stage state
  const [searchStage, setSearchStage] = useState('idle');
  const [streamedCriteria, setStreamedCriteria] = useState(null);
  const [streamedTotal, setStreamedTotal] = useState(null);

  const pollRef = useRef(null);
  const textareaRef = useRef(null);
  const streamAbortRef = useRef(false);

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
      } else if (e.response?.status === 429 || data?.code === 'RATE_LIMITED') {
        setSearchError('AI search is temporarily busy. Please wait a few seconds and try again.');
      } else {
        setSearchError(data?.error || 'Search failed. Please try again.');
      }
    } finally {
      setIsSearching(false);
    }
  }, [api, mode]);

  const runSearchStream = useCallback(async (searchQuery, searchPage = 1) => {
    if (!searchQuery?.trim() || !api.supportsStream) return;
    streamAbortRef.current = false;
    setIsSearching(true);
    setSearchError('');
    setSearchStage('analyzing');
    setStreamedCriteria(null);
    setStreamedTotal(null);
    try {
      for await (const { event, data } of api.runSearchStream(searchQuery, { page: searchPage, limit: 20 })) {
        if (streamAbortRef.current) break;
        if (event === 'stage') {
          setSearchStage(data.stage);
          if (data.total != null) setStreamedTotal(data.total);
        } else if (event === 'criteria') {
          setStreamedCriteria(data.criteria);
          setSearchStage('searching');
        } else if (event === 'results') {
          setResults(data.results || []);
          setTotal(data.total || 0);
          setTotalPages(data.totalPages || 1);
          setPage(searchPage);
          setLastQuery(searchQuery);
          setSearchStage('complete');
        } else if (event === 'error') {
          const d = data || {};
          if (d.code === 'SENSITIVE_QUERY') {
            setSearchError(
              `That search isn't allowed. AI search can only filter by role, ` +
              `skills, location, education and work level — not by disability, ` +
              `accessibility, race, gender, age, or other protected attributes.`
            );
          } else if (d.code === 'RATE_LIMITED') {
            setSearchError('AI search is temporarily busy. Please wait a few seconds and try again.');
          } else {
            setSearchError(d.error || 'Search failed. Please try again.');
          }
          break;
        } else if (event === 'done') {
          break;
        }
      }
    } catch (e) {
      if (!streamAbortRef.current) {
        setSearchError('Search failed. Please try again.');
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
    if (api.supportsStream) {
      runSearchStream(q, 1);
    } else {
      runSearch(q, 1);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch(e);
    }
  };

  const handlePageChange = (newPage) => {
    if (api.supportsStream) {
      runSearchStream(lastQuery, newPage);
    } else {
      runSearch(lastQuery, newPage);
    }
  };

  // Meeting mode examples focus on searchable meeting-record content.
  // Org/global examples remain role/skills/location oriented.
  const exampleQueries = mode === 'meeting'
    ? [
      'completed meetings where recruiter feedback mentions React experience',
      'interviews with follow-up needed and low ratings',
      'meeting notes mentioning bilingual customer service',
      'chat messages discussing warehouse entry-level roles',
      'records with transcript notes about nursing experience'
    ]
    : mode === 'interests'
      ? [
        'job seekers interested in software engineering booths',
        'high interest level with notes mentioning remote work',
        'interests expressed for healthcare companies',
        'React developer interested in technology employers',
        'entry level candidates with notes about customer service'
      ]
      : [
        'developer from New York with 10 years of experience',
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
            {mode === 'meeting'
              ? 'Describe interview outcomes, notes, chat messages, status, role, skills, or location. We combine meeting-record content with AI profile/resume matching for job seekers visible to your role.'
              : mode === 'interests'
                ? 'Describe booth interests, company names, notes, role, skills, or location. We combine interest records with AI profile/resume matching for job seekers visible to your role.'
                : 'Describe the role, skills, experience, or location in plain English. We search across parsed resumes and public profile fields. Disability, accessibility, and other protected attributes are never indexed or searchable.'
            }
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
                placeholder={mode === 'meeting'
                  ? 'e.g. React developer from Tidewater with strong recruiter feedback'
                  : mode === 'interests'
                    ? 'e.g. software engineers interested in remote-friendly employers'
                    : 'e.g. senior security guard in Denver with 5+ years experience'
                }
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
                  onClick={() => { streamAbortRef.current = true; setResults(null); setQuery(''); setLastQuery(''); setSearchStage('idle'); setStreamedCriteria(null); setStreamedTotal(null); }}
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

      {/* Streaming stage indicator */}
      {isSearching && api.supportsStream && (
        <div className="ai-stream-stages" role="status" aria-live="polite" aria-label="Search progress">
          <StreamStage
            label="Analyzing your query"
            active={searchStage === 'analyzing'}
            done={['searching', 'ranking', 'complete'].includes(searchStage)}
          />
          {streamedCriteria && (
            <div className="ai-stream-criteria">
              {streamedCriteria.roleKeywords?.length > 0 && (
                <span className="ai-criteria-chip ai-criteria-chip--role">
                  {streamedCriteria.roleKeywords.join(', ')}
                </span>
              )}
              {streamedCriteria.location && (
                <span className="ai-criteria-chip ai-criteria-chip--location">
                  {[streamedCriteria.location.city, streamedCriteria.location.state, streamedCriteria.location.country].filter(Boolean).join(', ')}
                </span>
              )}
              {streamedCriteria.education && (
                <span className="ai-criteria-chip ai-criteria-chip--education">
                  {streamedCriteria.education}
                </span>
              )}
              {streamedCriteria.workLevel && (
                <span className="ai-criteria-chip ai-criteria-chip--level">
                  {streamedCriteria.workLevel}
                </span>
              )}
            </div>
          )}
          <StreamStage
            label={streamedTotal != null && searchStage !== 'analyzing'
              ? `Found ${streamedTotal} candidate${streamedTotal !== 1 ? 's' : ''}, ranking results…`
              : 'Searching profiles…'}
            active={searchStage === 'searching' || searchStage === 'ranking'}
            done={searchStage === 'complete'}
          />
        </div>
      )}

      {/* Non-streaming spinner (meeting/interests modes) */}
      {isSearching && !api.supportsStream && (
        <div className="ai-stream-stages" role="status" aria-live="polite">
          <StreamStage label="Searching…" active done={false} />
        </div>
      )}

      {/* Results */}
      {results !== null && (
        <div className="ai-results-section">
          <div className="ai-results-header">
            <h3 className="ai-results-count">
              {total === 0
                ? 'No results found'
                : mode === 'meeting'
                  ? `${total} meeting record${total !== 1 ? 's' : ''} found`
                  : mode === 'interests'
                    ? `${total} interest${total !== 1 ? 's' : ''} found`
                    : `${total} job seeker${total !== 1 ? 's' : ''} found`
              }
            </h3>
            {total > 0 && (
              <p className="ai-results-subtext">
                Showing page {page} of {totalPages}
              </p>
            )}
          </div>

          {total === 0 && (
            <div className="ai-no-results">
              <p>
                {mode === 'meeting'
                  ? 'No meeting records matched your search. Try broader terms based on notes, feedback, participants, or status.'
                  : mode === 'interests'
                    ? 'No job seeker interests matched your search. Try broader terms based on company, notes, booth, or profile skills.'
                    : 'No job seekers matched your search. Try broader terms or check that profiles have been indexed.'
                }
              </p>
            </div>
          )}

          <div className="ai-results-grid" role="list">
            {results.map(result => (
              mode === 'meeting'
                ? (
                  <MeetingRecordCard
                    key={result.meetingRecordId || result._id}
                    meetingRecord={result}
                    onViewDetails={(meetingRecordId) => navigate(`/meeting-records/${meetingRecordId}`)}
                  />
                )
                : mode === 'interests'
                  ? (
                    <JobSeekerInterestCard
                      key={result.interestId || result._id}
                      interest={result}
                      onViewJobSeeker={onViewJobSeeker}
                    />
                  )
                  : <JobSeekerCard key={result._id} jobSeeker={result} />
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

function StreamStage({ label, active, done }) {
  return (
    <div className={`ai-stream-stage${active ? ' ai-stream-stage--active' : ''}${done ? ' ai-stream-stage--done' : ''}`}>
      <span className="ai-stream-stage-dot" aria-hidden="true" />
      <span className="ai-stream-stage-label">{label}</span>
    </div>
  );
}

function JobSeekerInterestCard({ interest, onViewJobSeeker }) {
  const jobSeekerName = interest.jobSeeker?.name || 'N/A';
  const eventName = interest.event?.name || 'N/A';
  const boothName = interest.booth?.name || 'N/A';
  const company = interest.company || 'N/A';
  const dateExpressed = interest.createdAt
    ? new Date(interest.createdAt).toLocaleString()
    : 'N/A';

  let metadata = interest.jobSeeker?.metadata;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
  }
  const { resumeId, resumeUrl, hasResume } = getResolvedResumeRefs(interest.jobSeeker, metadata);

  const handleViewJobSeeker = () => {
    if (!interest.jobSeeker || !onViewJobSeeker) return;
    onViewJobSeeker(interest.jobSeeker, interest.event?._id || interest.event);
  };

  const handleViewResume = () => {
    if (hasResume) openResumeInNewTab(resumeId || null, resumeUrl || null);
  };

  return (
    <article className="ai-result-card" role="listitem">
      <div className="ai-card-header">
        <div className="ai-card-identity">
          <h4 className="ai-card-name">{jobSeekerName}</h4>
          <p className="ai-card-title">{eventName} · {boothName}</p>
          <p className="ai-card-location">Company: {company}</p>
        </div>
        <div className="ai-card-badges">
          {interest.interestLevel && (
            <span className="ai-badge ai-badge--events">{interest.interestLevel} interest</span>
          )}
        </div>
      </div>

      <div className="ai-card-meta">
        <div className="ai-card-details">
          <span className="ai-detail-chip">Expressed: {dateExpressed}</span>
        </div>
      </div>

      {interest.snippetText && (
        <p className="ai-card-summary ai-card-summary--detail">
          <strong>{interest.snippetLabel || 'Notes'}:</strong> {interest.snippetText}
        </p>
      )}
      {interest.semanticEvidence && interest.semanticEvidence !== interest.snippetText && (
        <p className="ai-card-summary ai-card-summary--detail">
          <strong>Profile evidence:</strong> {interest.semanticEvidence}
        </p>
      )}

      <div className="ai-card-footer">
        {onViewJobSeeker && interest.jobSeeker && (
          <button
            type="button"
            className="ai-resume-btn"
            onClick={handleViewJobSeeker}
            aria-label={`View job seeker details for ${jobSeekerName}`}
          >
            View Job Seeker Detail
          </button>
        )}
        {hasResume && (
          <button
            type="button"
            className="ai-resume-btn"
            onClick={handleViewResume}
            aria-label={`View resume for ${jobSeekerName}`}
          >
            View Resume
          </button>
        )}
      </div>
    </article>
  );
}

function MeetingRecordCard({ meetingRecord, onViewDetails }) {
  const jobSeekerName = meetingRecord.jobSeeker?.name || 'N/A';
  const recruiterName = meetingRecord.recruiter?.name || 'N/A';
  const boothName = meetingRecord.booth?.name || 'N/A';
  const eventName = meetingRecord.event?.name || 'N/A';
  const formattedStart = meetingRecord.startTime ? new Date(meetingRecord.startTime).toLocaleString() : 'N/A';
  const duration = Number.isFinite(meetingRecord.duration) ? `${meetingRecord.duration}m` : 'N/A';
  const rating = meetingRecord.recruiterRating ?? meetingRecord.feedbackRating ?? null;

  const resumeId = meetingRecord.jobSeekerResumeId || meetingRecord.resolvedResume?.resumeId || null;
  const resumeUrl = meetingRecord.jobSeekerResumeUrl || meetingRecord.resolvedResume?.resumeUrl || meetingRecord.jobSeeker?.resumeUrl || null;
  const hasResume = !!(resumeId || resumeUrl);

  return (
    <article className="ai-result-card" role="listitem">
      <div className="ai-card-header">
        <div className="ai-card-identity">
          <h4 className="ai-card-name">{jobSeekerName}</h4>
          <p className="ai-card-title">{eventName} · {boothName}</p>
        </div>
        <div className="ai-card-badges">
          {meetingRecord.status && (
            <span className="ai-badge ai-badge--events">{meetingRecord.status}</span>
          )}
          {rating != null && (
            <span className="ai-badge">{rating}/5</span>
          )}
        </div>
      </div>

      <div className="ai-card-meta">
        <div className="ai-card-details">
          <span className="ai-detail-chip">Recruiter: {recruiterName}</span>
          <span className="ai-detail-chip">Started: {formattedStart}</span>
          <span className="ai-detail-chip">Duration: {duration}</span>
        </div>
      </div>

      {meetingRecord.snippetText && (
        <p className="ai-card-summary ai-card-summary--detail">
          <strong>{meetingRecord.snippetLabel || 'Notes'}:</strong> {meetingRecord.snippetText}
        </p>
      )}
      {meetingRecord.semanticEvidence && meetingRecord.semanticEvidence !== meetingRecord.snippetText && (
        <p className="ai-card-summary ai-card-summary--detail">
          <strong>Profile evidence:</strong> {meetingRecord.semanticEvidence}
        </p>
      )}

      <div className="ai-card-footer">
        <button
          type="button"
          className="ai-resume-btn"
          onClick={() => onViewDetails(meetingRecord.meetingRecordId || meetingRecord._id)}
          aria-label={`View details for meeting record of ${jobSeekerName}`}
        >
          View Details
        </button>
        {hasResume && (
          <button
            type="button"
            className="ai-resume-btn"
            onClick={() => openResumeInNewTab(resumeId || null, resumeUrl || null)}
            aria-label={`View resume for ${jobSeekerName}`}
          >
            View Resume
          </button>
        )}
      </div>
    </article>
  );
}

function JobSeekerCard({ jobSeeker }) {
  const ai = jobSeeker.aiProfile || {};
  const location = [jobSeeker.city, jobSeeker.state, jobSeeker.country].filter(Boolean).join(', ');
  const eventsLabel = ai.totalEventsRegistered
    ? `${ai.totalEventsRegistered} event${ai.totalEventsRegistered !== 1 ? 's' : ''}`
    : null;

  let metadata = jobSeeker.metadata;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
  }
  const { resumeId, resumeUrl, hasResume } = getResolvedResumeRefs(jobSeeker, metadata);

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
      {ai.ragEvidence && (
        <p className="ai-card-summary">
          <strong>AI evidence:</strong> {ai.ragEvidence}
        </p>
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
