export const normalizeRoleKey = (role) => {
  if (!role) return 'participant';
  const value = String(role).trim().toLowerCase();

  if (value === 'globalinterpreter') return 'interpreter';
  if (value === 'job seeker' || value === 'job_seeker' || value === 'job-seeker') return 'jobseeker';
  if (value === 'recruiter' || value === 'jobseeker' || value === 'interpreter') return value;
  return 'participant';
};

export const formatRoleLabel = (role) => {
  const normalized = normalizeRoleKey(role);
  if (normalized === 'recruiter') return 'Recruiter';
  if (normalized === 'jobseeker') return 'Job Seeker';
  if (normalized === 'interpreter') return 'Interpreter';
  return 'Participant';
};

export const getRoleFromIdentity = (identity = '') => {
  const normalized = String(identity || '').toLowerCase();
  if (normalized.startsWith('recruiter_')) return 'recruiter';
  if (normalized.startsWith('jobseeker_')) return 'jobseeker';
  if (normalized.startsWith('interpreter_')) return 'interpreter';
  return 'participant';
};

/** Twilio identity: `{role}_{userId}_{suffix}`. Never use substring includes on userId — it repeats across roles. */
export const extractUserIdFromTwilioIdentity = (identity = '') => {
  const m = String(identity || '').match(/^(?:recruiter|jobseeker|interpreter)_([^_]+)_/i);
  return m ? m[1] : null;
};

export const normalizeCallInfoParticipants = (callData = {}, currentUser = null) => {
  const participants = callData.participants || {};
  const normalized = {
    ...callData,
    participants: {
      recruiter: participants.recruiter || callData.recruiter || null,
      jobSeeker: participants.jobSeeker || callData.jobSeeker || null,
      interpreters: Array.isArray(participants.interpreters) ? participants.interpreters : []
    }
  };

  if (!normalized.userRole && currentUser?.role) {
    normalized.userRole = normalizeRoleKey(currentUser.role);
  } else if (normalized.userRole) {
    normalized.userRole = normalizeRoleKey(normalized.userRole);
  }

  return normalized;
};
