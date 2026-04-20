import {
  extractUserIdFromTwilioIdentity,
  formatRoleLabel,
  getRoleFromIdentity,
  normalizeCallInfoParticipants,
  normalizeRoleKey
} from './videoCallRoles';

describe('videoCallRoles helpers', () => {
  test('normalizes role variants', () => {
    expect(normalizeRoleKey('Interpreter')).toBe('interpreter');
    expect(normalizeRoleKey('GlobalInterpreter')).toBe('interpreter');
    expect(normalizeRoleKey('job seeker')).toBe('jobseeker');
    expect(normalizeRoleKey('Recruiter')).toBe('recruiter');
    expect(normalizeRoleKey('')).toBe('participant');
  });

  test('formats labels from mixed role values', () => {
    expect(formatRoleLabel('recruiter')).toBe('Recruiter');
    expect(formatRoleLabel('JobSeeker')).toBe('Job Seeker');
    expect(formatRoleLabel('globalinterpreter')).toBe('Interpreter');
    expect(formatRoleLabel('unknown')).toBe('Participant');
  });

  test('extracts role from twilio identity prefix', () => {
    expect(getRoleFromIdentity('recruiter_123_456')).toBe('recruiter');
    expect(getRoleFromIdentity('interpreter_abc')).toBe('interpreter');
    expect(getRoleFromIdentity('jobseeker_abc')).toBe('jobseeker');
    expect(getRoleFromIdentity('sid_without_prefix')).toBe('participant');
  });

  test('extracts user id from twilio identity (strict segment, not substring)', () => {
    expect(extractUserIdFromTwilioIdentity('recruiter_507f1f77bcf86cd799439011_173')).toBe(
      '507f1f77bcf86cd799439011'
    );
    expect(extractUserIdFromTwilioIdentity('jobseeker_507f1f77bcf86cd799439011_99')).toBe(
      '507f1f77bcf86cd799439011'
    );
    expect(extractUserIdFromTwilioIdentity('interpreter_abc123_suffix')).toBe('abc123');
    expect(extractUserIdFromTwilioIdentity('wrong')).toBe(null);
  });

  test('normalizes invitation payload participants shape', () => {
    const normalized = normalizeCallInfoParticipants({
      callId: 'call-1',
      recruiter: { _id: 'r1' },
      jobSeeker: { _id: 'j1' }
    }, { role: 'JobSeeker' });

    expect(normalized.participants.recruiter?._id).toBe('r1');
    expect(normalized.participants.jobSeeker?._id).toBe('j1');
    expect(normalized.participants.interpreters).toEqual([]);
    expect(normalized.userRole).toBe('jobseeker');
  });
});
