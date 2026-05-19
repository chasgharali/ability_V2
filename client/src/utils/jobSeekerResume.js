/**
 * Resolve resume references for a job seeker from API payloads and nested metadata.
 * Priority matches server jobSeekerResumeResolver:
 * user upload URL → registration URL → registration resumeId → profile fields → resolvedResume (builder default)
 */

function ensureArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function pickResolved(jobSeeker) {
  const r = jobSeeker?.resolvedResume;
  if (!r || (!r.resumeId && !r.resumeUrl)) return null;
  return {
    resumeId: r.resumeId ? String(r.resumeId) : null,
    resumeUrl: r.resumeUrl || null,
    title: r.title || null,
    source: r.source || null
  };
}

export function getResolvedResumeRefs(jobSeeker, metadata) {
  const profile = metadata?.profile || {};
  const registrations = Array.isArray(jobSeeker?.registrations) ? jobSeeker.registrations : [];

  const fromServer = pickResolved(jobSeeker);
  if (fromServer) {
    return {
      ...fromServer,
      hasResume: true
    };
  }

  const regWithResumeId = registrations.find((r) => r?.resumeId?._id || r?.resumeId);
  const resumeId =
    regWithResumeId?.resumeId?._id ||
    regWithResumeId?.resumeId ||
    profile.resumeId ||
    null;

  const regWithResumeUrl = registrations.find((r) => r?.resumeUrl);
  const resumeUrl =
    regWithResumeUrl?.resumeUrl ||
    jobSeeker?.resumeUrl ||
    profile.resumeUrl ||
    null;

  const normalizedId = resumeId ? String(resumeId) : null;
  const normalizedUrl = resumeUrl || null;

  return {
    resumeId: normalizedId,
    resumeUrl: normalizedUrl,
    title: regWithResumeId?.resumeId?.title || null,
    source: null,
    hasResume: !!(normalizedId || normalizedUrl)
  };
}

export { ensureArray };
