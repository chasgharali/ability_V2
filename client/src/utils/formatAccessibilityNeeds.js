const ACCESSIBILITY_FIELDS = [
  { field: 'usesScreenMagnifier', label: 'Screen Magnifier' },
  { field: 'usesScreenReader', label: 'Screen Reader' },
  { field: 'needsASL', label: 'Sign Language Interpreter' },
  { field: 'needsCaptions', label: 'Captions' },
  { field: 'needsOther', label: 'Other Accommodations' }
];

export function formatAccessibilityNeeds(person = {}) {
  const needs = ACCESSIBILITY_FIELDS
    .filter(({ field }) => person[field] === true)
    .map(({ label }) => label);
  return needs.length > 0 ? needs.join(', ') : 'None';
}
