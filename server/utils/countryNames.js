/**
 * Map from ISO 3166-1 alpha-2 country codes to full country names.
 * Used to normalize country/countryOfOrigin in survey data so "US" and "United States" display consistently.
 * Aligned with client/src/constants/options.js COUNTRY_OF_ORIGIN_LIST.
 */
const CODE_TO_NAME = {
  US: 'United States', CA: 'Canada', AF: 'Afghanistan', AX: 'Åland Islands', AL: 'Albania', DZ: 'Algeria',
  AS: 'American Samoa', AD: 'Andorra', AO: 'Angola', AI: 'Anguilla', AQ: 'Antarctica', AG: 'Antigua and Barbuda',
  AR: 'Argentina', AM: 'Armenia', AW: 'Aruba', AU: 'Australia', AT: 'Austria', AZ: 'Azerbaijan', BS: 'Bahamas',
  BH: 'Bahrain', BD: 'Bangladesh', BB: 'Barbados', BY: 'Belarus', BE: 'Belgium', BZ: 'Belize', BJ: 'Benin',
  BM: 'Bermuda', BT: 'Bhutan', BO: 'Bolivia', BQ: 'Bonaire, Sint Eustatius and Saba', BA: 'Bosnia and Herzegovina',
  BW: 'Botswana', BV: 'Bouvet Island', BR: 'Brazil', IO: 'British Indian Ocean Territory', BN: 'Brunei',
  BG: 'Bulgaria', BF: 'Burkina Faso', BI: 'Burundi', KH: 'Cambodia', CM: 'Cameroon', CV: 'Cape Verde',
  KY: 'Cayman Islands', CF: 'Central African Republic', TD: 'Chad', CL: 'Chile', CN: 'China', CX: 'Christmas Island',
  CC: 'Cocos (Keeling) Islands', CO: 'Colombia', KM: 'Comoros', CG: 'Congo', CD: 'Congo (DRC)', CK: 'Cook Islands',
  CR: 'Costa Rica', CI: "Cote d'Ivoire", HR: 'Croatia (Hrvatska)', CU: 'Cuba', CW: 'Curaçao', CY: 'Cyprus',
  CZ: 'Czech Republic', DK: 'Denmark', DJ: 'Djibouti', DM: 'Dominica', DO: 'Dominican Republic', EC: 'Ecuador',
  EG: 'Egypt', SV: 'El Salvador', GQ: 'Equatorial Guinea', ER: 'Eritrea', EE: 'Estonia', ET: 'Ethiopia',
  FK: 'Falkland Islands (Islas Malvinas)', FO: 'Faroe Islands', FJ: 'Fiji Islands', FI: 'Finland', FR: 'France',
  GF: 'French Guiana', PF: 'French Polynesia', TF: 'French Southern and Antarctic Lands', GA: 'Gabon', GM: 'Gambia',
  GE: 'Georgia', DE: 'Germany', GH: 'Ghana', GI: 'Gibraltar', GR: 'Greece', GL: 'Greenland', GD: 'Grenada',
  GP: 'Guadeloupe', GU: 'Guam', GT: 'Guatemala', GG: 'Guernsey', GN: 'Guinea', GW: 'Guinea-Bissau', GY: 'Guyana',
  HT: 'Haiti', HM: 'Heard Island and McDonald Islands', HN: 'Honduras', HK: 'Hong Kong SAR', HU: 'Hungary',
  IS: 'Iceland', IN: 'India', ID: 'Indonesia', IR: 'Iran', IQ: 'Iraq', IE: 'Ireland', IM: 'Isle of Man',
  IL: 'Israel', IT: 'Italy', JM: 'Jamaica', JP: 'Japan', JE: 'Jersey', JO: 'Jordan', KZ: 'Kazakhstan', KE: 'Kenya',
  KI: 'Kiribati', KR: 'Korea', KW: 'Kuwait', KG: 'Kyrgyzstan', LA: 'Laos', LV: 'Latvia', LB: 'Lebanon',
  LS: 'Lesotho', LR: 'Liberia', LY: 'Libya', LI: 'Liechtenstein', LT: 'Lithuania', LU: 'Luxembourg', MO: 'Macao SAR',
  MK: 'Macedonia', MG: 'Madagascar', MW: 'Malawi', MY: 'Malaysia', MV: 'Maldives', ML: 'Mali', MT: 'Malta',
  MH: 'Marshall Islands', MQ: 'Martinique', MR: 'Mauritania', MU: 'Mauritius', YT: 'Mayotte', MX: 'Mexico',
  FM: 'Micronesia', MD: 'Moldova', MC: 'Monaco', MN: 'Mongolia', ME: 'Montenegro', MS: 'Montserrat', MA: 'Morocco',
  MZ: 'Mozambique', MM: 'Myanmar', NA: 'Namibia', NR: 'Nauru', NP: 'Nepal', NL: 'Netherlands', NC: 'New Caledonia',
  NZ: 'New Zealand', NI: 'Nicaragua', NE: 'Niger', NG: 'Nigeria', NU: 'Niue', NF: 'Norfolk Island', KP: 'North Korea',
  MP: 'Northern Mariana Islands', NO: 'Norway', OM: 'Oman', PK: 'Pakistan', PW: 'Palau', PS: 'Palestine',
  PA: 'Panama', PG: 'Papua New Guinea', PY: 'Paraguay', PE: 'Peru', PH: 'Philippines', PN: 'Pitcairn Islands',
  PL: 'Poland', PT: 'Portugal', PR: 'Puerto Rico', QA: 'Qatar', RE: 'Reunion', RO: 'Romania', RU: 'Russia',
  RW: 'Rwanda', BL: 'Saint Barthélemy', SH: 'St. Helena', KN: 'St. Kitts and Nevis', LC: 'St. Lucia',
  MF: 'Saint Martin (French part)', PM: 'St. Pierre and Miquelon', VC: 'St. Vincent and the Grenadines',
  WS: 'Samoa', SM: 'San Marino', ST: 'Sao Tome and Principe', SA: 'Saudi Arabia', SN: 'Senegal', RS: 'Serbia',
  SC: 'Seychelles', SL: 'Sierra Leone', SG: 'Singapore', SX: 'Sint Maarten (Dutch part)', SK: 'Slovakia',
  SI: 'Slovenia', SB: 'Solomon Islands', SO: 'Somalia', ZA: 'South Africa', GS: 'South Georgia and the South Sandwich Islands',
  SS: 'South Sudan', ES: 'Spain', LK: 'Sri Lanka', SD: 'Sudan', SR: 'Suriname', SJ: 'Svalbard and Jan Mayen',
  SZ: 'Swaziland', SE: 'Sweden', CH: 'Switzerland', SY: 'Syria', TW: 'Taiwan', TJ: 'Tajikistan', TZ: 'Tanzania',
  TH: 'Thailand', TL: 'East Timor', TG: 'Togo', TK: 'Tokelau', TO: 'Tonga', TT: 'Trinidad and Tobago', TN: 'Tunisia',
  TR: 'Turkey', TM: 'Turkmenistan', TC: 'Turks and Caicos Islands', TV: 'Tuvalu', UG: 'Uganda', UA: 'Ukraine',
  AE: 'United Arab Emirates', GB: 'United Kingdom', UM: 'United States Minor Outlying Islands', UY: 'Uruguay',
  UZ: 'Uzbekistan', VU: 'Vanuatu', VA: 'Vatican City', VE: 'Venezuela', VN: 'Viet Nam', VI: 'Virgin Islands',
  VG: 'Virgin Islands (British)', WF: 'Wallis and Futuna', EH: 'Western Sahara', YE: 'Yemen', ZM: 'Zambia', ZW: 'Zimbabwe'
};

/**
 * Returns the full country name for display. If the value is a 2-letter ISO code, returns the full name;
 * otherwise returns the value as-is (so "United States" remains "United States").
 * Used when aggregating and displaying country/countryOfOrigin so "US" and "United States" are merged and shown as "United States".
 */
function toCountryDisplayName(val) {
  if (!val || typeof val !== 'string') return val;
  const s = val.trim();
  if (s.length === 2) {
    const name = CODE_TO_NAME[s.toUpperCase()];
    if (name) return name;
  }
  return s;
}

module.exports = { CODE_TO_NAME, toCountryDisplayName };
