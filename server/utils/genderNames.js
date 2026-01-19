/**
 * Map from gender value (snake_case / lowercase) and display variants to a single display label.
 * Aligned with client GENDER_LIST and SurveyForm options. Merges "male"/"Male", "female"/"female",
 * "prefer_not_to_answer"/"Prefer not to say", "nonbinary"/"Non-binary", etc.
 */
const GENDER_TO_DISPLAY = {
  female: 'Female',
  Female: 'Female',
  male: 'Male',
  Male: 'Male',
  nonbinary: 'Non-binary',
  Nonbinary: 'Non-binary',
  'non-binary': 'Non-binary',
  'Non-binary': 'Non-binary',
  prefer_not_to_answer: 'Prefer not to answer',
  'Prefer not to answer': 'Prefer not to answer',
  'Prefer not to say': 'Prefer not to answer',
  genderqueer: 'Genderqueer',
  Genderqueer: 'Genderqueer',
  transgender_female: 'Transgender Female',
  'Transgender Female': 'Transgender Female',
  transgender_male: 'Transgender Male',
  'Transgender Male': 'Transgender Male',
  notlisted: 'Not listed',
  'Not listed': 'Not listed',
  i_will_specify: 'I will specify',
  'I will specify': 'I will specify',
  other: 'Other',
  Other: 'Other'
};

/**
 * Returns the display label for gender. Merges snake_case, lowercase, and phrasing
 * variants (e.g. "Prefer not to say" / "prefer_not_to_answer") into one label.
 */
function toGenderDisplayName(val) {
  if (!val || typeof val !== 'string') return val;
  const s = val.trim();
  if (s in GENDER_TO_DISPLAY) return GENDER_TO_DISPLAY[s];
  const lower = s.toLowerCase();
  if (lower in GENDER_TO_DISPLAY) return GENDER_TO_DISPLAY[lower];
  return s;
}

module.exports = { GENDER_TO_DISPLAY, toGenderDisplayName };
