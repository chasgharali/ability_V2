/**
 * Map from race value (snake_case) and display name to a single display label.
 * Aligned with client/src/constants/options.js RACE_LIST.
 * Merges "black_african_american" and "Black or African American" into "Black or African American".
 */
const RACE_TO_DISPLAY = {
  american_indian_alaska_native_indigenous: 'American Indian, Alaska Native or Indigenous',
  'American Indian, Alaska Native or Indigenous': 'American Indian, Alaska Native or Indigenous',
  black_african_american: 'Black or African American',
  'Black or African American': 'Black or African American',
  east_asian: 'East Asian',
  'East Asian': 'East Asian',
  hispanic_latino_latina_latine: 'Hispanic or Latino, Latina or Latine',
  'Hispanic or Latino, Latina or Latine': 'Hispanic or Latino, Latina or Latine',
  native_hawaiian_pacific_islander: 'Native Hawaiian or Other Pacific Islander',
  'Native Hawaiian or Other Pacific Islander': 'Native Hawaiian or Other Pacific Islander',
  south_asian: 'South Asian',
  'South Asian': 'South Asian',
  southeast_asian: 'Southeast Asian',
  'Southeast Asian': 'Southeast Asian',
  west_asian: 'West Asian',
  'West Asian': 'West Asian',
  white_caucasian: 'White/Caucasian',
  'White/Caucasian': 'White/Caucasian',
  prefer_not_to_answer: 'Prefer not to answer',
  'Prefer not to answer': 'Prefer not to answer',
  i_will_specify: 'I will specify',
  'I will specify': 'I will specify'
};

/**
 * Returns the display label for race. Merges snake_case (e.g. black_african_american)
 * and human-readable (e.g. Black or African American) into the human-readable form.
 */
function toRaceDisplayName(val) {
  if (!val || typeof val !== 'string') return val;
  const s = val.trim();
  if (s in RACE_TO_DISPLAY) return RACE_TO_DISPLAY[s];
  const lower = s.toLowerCase();
  if (lower in RACE_TO_DISPLAY) return RACE_TO_DISPLAY[lower];
  return s;
}

module.exports = { RACE_TO_DISPLAY, toRaceDisplayName };
