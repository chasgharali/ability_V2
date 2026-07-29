/**
 * Time gates that decide whether a job seeker may join or keep using a booth queue.
 * Mirrored in server/utils/availability.js — keep both copies in sync so the
 * blocked-state copy is identical on the server and in the UI.
 */

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const isBoothLinkExpired = (booth, now = new Date()) => {
  const expire = toDate(booth?.expireLinkTime);
  return !!expire && now > expire;
};

export const isBoothClosed = (booth, now = new Date()) => {
  const close = toDate(booth?.closeTime);
  return !!close && now >= close;
};

/** Demo events are not time-bound, matching the isEventVisible convention on the server. */
export const isEventEnded = (event, now = new Date()) => {
  if (!event || event.isDemo) return false;
  const end = toDate(event.end);
  return !!end && now > end;
};

export const formatAvailabilityDate = (value) => {
  const date = toDate(value);
  if (!date) return '';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};
