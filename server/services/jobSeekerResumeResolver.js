const User = require('../models/User');
const RegisteredJobSeeker = require('../models/RegisteredJobSeeker');
const Resume = require('../models/Resume');

const EMPTY = { resumeUrl: null, resumeId: null, title: null, source: null };

function toId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
}

function trimUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  return trimmed || null;
}

function pickDefaultResume(resumes) {
  if (!resumes?.length) return null;
  const sorted = [...resumes].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });
  return sorted[0];
}

function resolveFromParts({ userResumeUrl, registration, builderResume }) {
  const userUrl = trimUrl(userResumeUrl);
  if (userUrl) {
    return { resumeUrl: userUrl, resumeId: null, title: null, source: 'user_upload' };
  }

  const regUrl = trimUrl(registration?.resumeUrl);
  if (regUrl) {
    return {
      resumeUrl: regUrl,
      resumeId: toId(registration?.resumeId) || null,
      title: null,
      source: 'registration_url'
    };
  }

  const regResumeId = toId(registration?.resumeId);
  if (regResumeId) {
    return {
      resumeUrl: null,
      resumeId: regResumeId,
      title: registration?.resumeTitle || null,
      source: 'registration_id'
    };
  }

  if (builderResume) {
    return {
      resumeUrl: null,
      resumeId: toId(builderResume._id),
      title: builderResume.title || null,
      source: 'resume_builder'
    };
  }

  return { ...EMPTY };
}

/**
 * Resolve the best resume for one job seeker (optionally scoped to an event).
 * @param {string|ObjectId} userId
 * @param {{ eventId?: string|ObjectId, userResumeUrl?: string|null }} options
 */
async function resolveJobSeekerResume(userId, options = {}) {
  const uid = toId(userId);
  if (!uid) return { ...EMPTY };

  const eventId = toId(options.eventId);
  let userResumeUrl = options.userResumeUrl;

  if (userResumeUrl === undefined) {
    const user = await User.findById(uid).select('resumeUrl').lean();
    userResumeUrl = user?.resumeUrl || null;
  }

  let registration = null;
  if (eventId) {
    registration = await RegisteredJobSeeker.findOne({ jobSeekerId: uid, eventId })
      .select('resumeId resumeUrl')
      .populate('resumeId', 'title')
      .lean();
    if (registration?.resumeId && typeof registration.resumeId === 'object') {
      registration = {
        resumeId: registration.resumeId._id,
        resumeUrl: registration.resumeUrl,
        resumeTitle: registration.resumeId.title
      };
    }
  }

  const userUrl = trimUrl(userResumeUrl);
  const regUrl = trimUrl(registration?.resumeUrl);
  const regResumeId = toId(registration?.resumeId);

  let builderResume = null;
  if (!userUrl && !regUrl && !regResumeId) {
    builderResume = await Resume.findOne({ userId: uid })
      .sort({ isDefault: -1, updatedAt: -1 })
      .select('_id title isDefault updatedAt')
      .lean();
  }

  return resolveFromParts({ userResumeUrl, registration, builderResume });
}

/**
 * Batch-resolve resumes for many (userId, eventId?) pairs without N+1 queries.
 * @param {Array<{ userId: string|ObjectId, eventId?: string|ObjectId, userResumeUrl?: string|null }>} pairs
 * @returns {Promise<Map<string, object>>} Map keyed by `${userId}_${eventId||''}`
 */
async function batchResolveJobSeekerResumes(pairs) {
  const map = new Map();
  if (!pairs?.length) return map;

  const normalized = pairs
    .map((p) => ({
      userId: toId(p.userId),
      eventId: toId(p.eventId) || '',
      userResumeUrl: p.userResumeUrl
    }))
    .filter((p) => p.userId);

  if (!normalized.length) return map;

  const userIds = [...new Set(normalized.map((p) => p.userId))];
  const needsUserFetch = normalized.some((p) => p.userResumeUrl === undefined);

  const userUrlMap = new Map();
  if (needsUserFetch) {
    const users = await User.find({ _id: { $in: userIds } }).select('_id resumeUrl').lean();
    users.forEach((u) => userUrlMap.set(String(u._id), u.resumeUrl || null));
  }

  const regPairs = normalized.filter((p) => p.eventId);
  const regMap = new Map();
  if (regPairs.length) {
    const orConditions = regPairs.map((p) => ({ jobSeekerId: p.userId, eventId: p.eventId }));
    const regDocs = await RegisteredJobSeeker.find({ $or: orConditions })
      .select('jobSeekerId eventId resumeId resumeUrl')
      .populate('resumeId', 'title')
      .lean();
    regDocs.forEach((d) => {
      const key = `${d.jobSeekerId}_${d.eventId}`;
      let resumeId = d.resumeId;
      let resumeTitle = null;
      if (resumeId && typeof resumeId === 'object') {
        resumeTitle = resumeId.title || null;
        resumeId = resumeId._id;
      }
      regMap.set(key, { resumeId, resumeUrl: d.resumeUrl, resumeTitle });
    });
  }

  const needsBuilder = new Set();
  normalized.forEach((p) => {
    const userUrl = trimUrl(p.userResumeUrl !== undefined ? p.userResumeUrl : userUrlMap.get(p.userId));
    const reg = p.eventId ? regMap.get(`${p.userId}_${p.eventId}`) : null;
    const regUrl = trimUrl(reg?.resumeUrl);
    const regResumeId = toId(reg?.resumeId);
    if (!userUrl && !regUrl && !regResumeId) {
      needsBuilder.add(p.userId);
    }
  });

  const builderMap = new Map();
  if (needsBuilder.size) {
    const builderIds = [...needsBuilder];
    const allResumes = await Resume.find({ userId: { $in: builderIds } })
      .select('_id userId title isDefault updatedAt')
      .lean();
    const byUser = new Map();
    allResumes.forEach((r) => {
      const uid = String(r.userId);
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid).push(r);
    });
    byUser.forEach((resumes, uid) => {
      builderMap.set(uid, pickDefaultResume(resumes));
    });
  }

  normalized.forEach((p) => {
    const key = `${p.userId}_${p.eventId || ''}`;
    const userResumeUrl = p.userResumeUrl !== undefined ? p.userResumeUrl : userUrlMap.get(p.userId);
    const registration = p.eventId ? regMap.get(`${p.userId}_${p.eventId}`) : null;
    const builderResume = builderMap.get(p.userId) || null;
    map.set(key, resolveFromParts({ userResumeUrl, registration, builderResume }));
  });

  return map;
}

function pairKey(userId, eventId) {
  return `${toId(userId)}_${toId(eventId) || ''}`;
}

module.exports = {
  resolveJobSeekerResume,
  batchResolveJobSeekerResumes,
  pairKey,
  EMPTY_RESUME: EMPTY
};
