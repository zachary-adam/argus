export const SEVERITY_COLORS = {
  critical: '#BE1E3A',
  high: '#C2691C',
  medium: '#9A7517',
  low: '#3D7C66',
} as const

export const CATEGORY_COLORS: Record<string, string> = {
  conflict:      '#7D2E46',   // deep rose — distinct from critical (#BE1E3A)
  political:     '#3E3080',   // indigo
  economic:      '#2B5F7A',   // slate-teal — distinct from accent (#1C5D7A)
  social:        '#8A3870',   // plum
  environmental: '#2E6842',   // forest — distinct from low (#3D7C66)
  cyber:         '#24406B',   // navy
  earthquake:    '#704A22',   // umber
  wildfire:      '#7A3E12',   // rust — distinct from high (#C2691C)
  disaster:      '#5E3E1C',   // dark clay
  humanitarian:  '#4A6280',   // steel-blue — distinct from accent (#1C5D7A)
  health:        '#8A2258',   // burgundy-rose
}

export { CHOKEPOINTS } from './chokepointBoxes'

export const SANCTIONED_COUNTRIES = ['RU', 'IR', 'KP', 'SY', 'CU', 'VE', 'BY', 'MM', 'SD', 'LY']

export const MILITARY_CALLSIGN_PREFIXES = [
  'RCH', 'REACH', 'RAF', 'IAF', 'RRR', 'CNV', 'DUKE', 'JAKE',
  'EVAC', 'MEDEVAC', 'USAF', 'ARMY', 'NAVY', 'GHOST', 'REAPER',
  'PREDATOR', 'SENTRY', 'AWACS', 'RIVET', 'COBRA', 'VIPER',
]

export const PRIORITY_COUNTRIES = [
  'Russia', 'China', 'Iran', 'Ukraine', 'Israel', 'Yemen', 'Sudan',
  'Myanmar', 'Pakistan', 'North Korea', 'Syria', 'Ethiopia', 'Somalia',
  'Mali', 'Nigeria', 'Venezuela', 'Taiwan', 'Afghanistan', 'Saudi Arabia',
  'Turkey', 'Iraq', 'Lebanon', 'Libya', 'Egypt', 'India', 'Palestine',
  'Colombia', 'Mexico', 'Philippines', 'Thailand',
]

export const FREEDOM_SCORES: Record<string, number> = {
  US: 83, GB: 93, DE: 94, FR: 89, JP: 96, AU: 97, CA: 98,
  SE: 100, NO: 100, NZ: 99, CH: 96, NL: 98, DK: 97, FI: 100,
  RU: 19, CN: 9, IR: 16, KP: 3, SY: 2, BY: 11, CU: 13,
  SA: 7, AE: 17, EG: 26, TR: 33, PK: 37, BD: 40, VN: 19,
  UA: 61, MM: 14, AF: 25, IQ: 29, LB: 42, LY: 13, SD: 8,
  YE: 11, SO: 8, ET: 27, ML: 30, NG: 45, VE: 16, MX: 60,
  IN: 67, IL: 76, PH: 55, ID: 59, BR: 73, ZA: 79, TH: 31,
}

export const FRAGILITY_SCORES: Record<string, number> = {
  SO: 113, YE: 112, SS: 111, SY: 110, CD: 109, CF: 108,
  SD: 107, AF: 106, ET: 100, ML: 95, NG: 90, MM: 89,
  IQ: 85, PK: 80, KP: 79, LB: 78, LY: 77, VE: 70,
  MX: 65, IN: 60, EG: 58, IR: 75, RU: 72, CN: 50,
  UA: 65, TR: 55, IL: 48, SA: 55, PH: 68, ID: 52,
  BR: 60, ZA: 65, BD: 72, VN: 45, TH: 60, GH: 55,
  KE: 68, TZ: 50, UZ: 55, KZ: 50,
}


export const COUNTRY_NEIGHBORS: Record<string, string[]> = {
  'Ukraine': ['Russia', 'Belarus', 'Poland', 'Romania', 'Moldova'],
  'Russia': ['Ukraine', 'Belarus', 'Georgia', 'Finland', 'China'],
  'Israel': ['Palestine', 'Lebanon', 'Syria', 'Egypt', 'Jordan'],
  'Iran': ['Iraq', 'Afghanistan', 'Pakistan', 'Turkey', 'Azerbaijan'],
  'Sudan': ['South Sudan', 'Ethiopia', 'Egypt', 'Libya', 'Chad'],
  'Myanmar': ['Thailand', 'India', 'China', 'Bangladesh', 'Laos'],
  'Syria': ['Turkey', 'Iraq', 'Lebanon', 'Israel', 'Jordan'],
  'Yemen': ['Saudi Arabia', 'Oman'],
  'Ethiopia': ['Somalia', 'Sudan', 'South Sudan', 'Kenya', 'Eritrea'],
  'Somalia': ['Ethiopia', 'Kenya', 'Djibouti'],
  'Nigeria': ['Niger', 'Chad', 'Cameroon', 'Benin'],
  'Mali': ['Niger', 'Algeria', 'Mauritania', 'Senegal', 'Burkina Faso'],
  'Pakistan': ['India', 'Afghanistan', 'Iran', 'China'],
  'Afghanistan': ['Pakistan', 'Iran', 'Tajikistan', 'Uzbekistan'],
  'Iraq': ['Syria', 'Iran', 'Turkey', 'Kuwait', 'Saudi Arabia', 'Jordan'],
  'Lebanon': ['Syria', 'Israel'],
  'North Korea': ['South Korea', 'China', 'Russia'],
  'Taiwan': ['China', 'Philippines', 'Japan'],
  'Colombia': ['Venezuela', 'Ecuador', 'Peru', 'Panama', 'Brazil'],
  'Venezuela': ['Colombia', 'Brazil', 'Guyana'],
}
