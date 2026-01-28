/**
 * Value -> display label maps for job seeker profile dropdown fields.
 * Aligned with client/src/constants/options.js for CSV export.
 */

const WORK_LEVEL_MAP = {
  'entry_level': 'Entry Level',
  'experienced_non-manager': 'Experienced (non-Manager)',
  'manager_supervisor_executive': 'Manager / Supervisor of Staff Executive (VP, SVP, Department Head, etc.)',
  'senior_executive': 'Senior Executive (CEO, CIO, CFO, etc.)'
};

const EDUCATION_LEVEL_MAP = {
  'some_high_school': 'Some High School',
  'ged': 'General Educational Development (GED)',
  'high_school': 'High School',
  'certification': 'Certification',
  'vocational': 'Vocational',
  'some_college': 'Some College',
  'associates_degree': "Associate's Degree",
  'bachelors_degree': "Bachelor's Degree",
  'some_post-graduate': 'Some Post-Graduate',
  'masters_degree': "Master's Degree",
  'doctorate': 'Doctorate',
  'post-doctorate': 'Post-Doctorate',
  'international': 'International'
};

const JOB_TYPE_MAP = {
  'full-time': 'Full-Time',
  'part-time': 'Part-Time',
  'contract': 'Contract',
  'temporary': 'Temporary',
  'temporary-to-hire': 'Temporary-to-Hire',
  'internship': 'Internship',
  'volunteer': 'Volunteer'
};

const SECURITY_CLEARANCE_MAP = {
  'none': 'None',
  'active_confidential': 'Active - Confidential',
  'active_secret': 'Active - Secret',
  'active_top_secret': 'Active - Top Secret',
  'active_top_secret_sci': 'Active TS/SCI',
  'active_sci_sap': 'Active - SCI / SAP',
  'inactive_confidential': 'Inactive - Confidential',
  'inactive_secret': 'Inactive - Secret',
  'inactive_top_secret': 'Inactive - Top Secret',
  'inactive_sci_sap': 'Inactive - SCI/SAP',
  'inactive_top_secret_sci': 'Inactive TS/SCI'
};

const VETERAN_STATUS_MAP = {
  'none': 'None',
  'active_duty': 'Active Duty',
  'reserve': 'Reserve',
  'national_guard': 'National Guard',
  'inactive_reserve': 'Inactive Reserve',
  'inactive_national_guard': 'Inactive National Guard',
  'retired_military': 'US Retired Military Veteran',
  'us_veteran': 'US Veteran'
};

function getLabel(map, value) {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value).trim();
  const lower = s.toLowerCase();
  if (lower in map) return map[lower];
  const key = lower.replace(/\s+/g, '_');
  if (key in map) return map[key];
  return s;
}

function getWorkLevelLabel(value) {
  return getLabel(WORK_LEVEL_MAP, value);
}

function getEducationLevelLabel(value) {
  return getLabel(EDUCATION_LEVEL_MAP, value);
}

function getEmploymentTypesLabel(values) {
  if (!values || !Array.isArray(values)) return '';
  return values.map(v => getLabel(JOB_TYPE_MAP, v)).filter(Boolean).join('; ');
}

function getClearanceLabel(value) {
  return getLabel(SECURITY_CLEARANCE_MAP, value);
}

function getVeteranStatusLabel(value) {
  return getLabel(VETERAN_STATUS_MAP, value);
}

module.exports = {
  getWorkLevelLabel,
  getEducationLevelLabel,
  getEmploymentTypesLabel,
  getClearanceLabel,
  getVeteranStatusLabel
};
