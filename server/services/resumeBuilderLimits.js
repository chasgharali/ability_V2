const Settings = require('../models/Settings');
const Resume = require('../models/Resume');
const User = require('../models/User');

const SETTING_MAX_RESUMES = 'resume_builder_max_resumes';
const SETTING_MAX_UPDATES = 'resume_builder_max_updates';
const SETTING_AI_ENABLED = 'resume_builder_ai_enabled';
const SETTING_UPLOAD_PARSE_ENABLED = 'resume_builder_upload_parse_enabled';

const DEFAULT_MAX_RESUMES = 2;
const DEFAULT_MAX_UPDATES = 3;
const DEFAULT_AI_ENABLED = false;
const DEFAULT_UPLOAD_PARSE_ENABLED = true;

function parseLimit(value, defaultValue) {
  if (value === null || value === undefined) return defaultValue;
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) return defaultValue;
  return n;
}

function parseBoolean(value, defaultValue) {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return defaultValue;
}

async function getResumeBuilderLimits() {
  const [maxResumesRaw, maxUpdatesRaw, aiEnabledRaw, uploadParseEnabledRaw] = await Promise.all([
    Settings.getSetting(SETTING_MAX_RESUMES),
    Settings.getSetting(SETTING_MAX_UPDATES),
    Settings.getSetting(SETTING_AI_ENABLED),
    Settings.getSetting(SETTING_UPLOAD_PARSE_ENABLED)
  ]);
  return {
    maxResumes: parseLimit(maxResumesRaw, DEFAULT_MAX_RESUMES),
    maxUpdates: parseLimit(maxUpdatesRaw, DEFAULT_MAX_UPDATES),
    aiEnabled: parseBoolean(aiEnabledRaw, DEFAULT_AI_ENABLED),
    uploadParseEnabled: parseBoolean(uploadParseEnabledRaw, DEFAULT_UPLOAD_PARSE_ENABLED)
  };
}

async function getUsageForUser(userId) {
  const [user, resumeCount] = await Promise.all([
    User.findById(userId).select('resumeBuilderUsage').lean(),
    Resume.countDocuments({ userId })
  ]);
  return {
    resumeCount,
    updateCount: user?.resumeBuilderUsage?.updateCount || 0
  };
}

function isResumeLimitReached(limits, usage) {
  return limits.maxResumes > 0 && usage.resumeCount >= limits.maxResumes;
}

function isUpdateLimitReached(limits, usage) {
  return limits.maxUpdates > 0 && usage.updateCount >= limits.maxUpdates;
}

function buildLimitPayload(limits, usage) {
  const resumesRemaining = limits.maxResumes > 0
    ? Math.max(0, limits.maxResumes - usage.resumeCount)
    : null;
  const updatesRemaining = limits.maxUpdates > 0
    ? Math.max(0, limits.maxUpdates - usage.updateCount)
    : null;
  return {
    limits,
    usage,
    resumesRemaining,
    updatesRemaining,
    canCreateResume: !isResumeLimitReached(limits, usage),
    canUpdateResume: !isUpdateLimitReached(limits, usage)
  };
}

async function getResumeBuilderStatus(userId) {
  const [limits, usage] = await Promise.all([
    getResumeBuilderLimits(),
    getUsageForUser(userId)
  ]);
  return buildLimitPayload(limits, usage);
}

async function incrementUpdateCount(userId) {
  await User.findByIdAndUpdate(userId, {
    $inc: { 'resumeBuilderUsage.updateCount': 1 }
  });
}

function limitError(status, code, message, payload) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.payload = payload;
  return err;
}

async function assertCanCreateResume(userId) {
  const status = await getResumeBuilderStatus(userId);
  if (!status.canCreateResume) {
    throw limitError(
      403,
      'RESUME_LIMIT_REACHED',
      status.limits.maxResumes === 1
        ? 'You can only have 1 resume. Delete your existing resume to create a new one.'
        : `You have reached the maximum of ${status.limits.maxResumes} resumes.`,
      status
    );
  }
  return status;
}

async function assertCanUpdateResume(userId) {
  const status = await getResumeBuilderStatus(userId);
  if (!status.canUpdateResume) {
    throw limitError(
      403,
      'UPDATE_LIMIT_REACHED',
      status.limits.maxUpdates === 1
        ? 'You have used your only resume update. Contact support if you need more changes.'
        : `You have reached the maximum of ${status.limits.maxUpdates} resume updates.`,
      status
    );
  }
  return status;
}

function validateLimitSettingValue(value) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) {
    return { error: 'Value must be a non-negative integer (0 = unlimited)' };
  }
  return { value: n };
}

function validateAiEnabledSettingValue(value) {
  if (typeof value === 'boolean') {
    return { value };
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return { value: true };
    if (normalized === 'false') return { value: false };
  }
  return { error: 'Value must be a boolean (true/false)' };
}

module.exports = {
  SETTING_MAX_RESUMES,
  SETTING_MAX_UPDATES,
  SETTING_AI_ENABLED,
  SETTING_UPLOAD_PARSE_ENABLED,
  DEFAULT_MAX_RESUMES,
  DEFAULT_MAX_UPDATES,
  DEFAULT_AI_ENABLED,
  DEFAULT_UPLOAD_PARSE_ENABLED,
  getResumeBuilderLimits,
  getResumeBuilderStatus,
  incrementUpdateCount,
  assertCanCreateResume,
  assertCanUpdateResume,
  validateLimitSettingValue,
  validateAiEnabledSettingValue
};
