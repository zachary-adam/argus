export const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  AF: 'Afghanistan',  AL: 'Albania',       DZ: 'Algeria',       AO: 'Angola',
  AR: 'Argentina',    AM: 'Armenia',        AU: 'Australia',     AZ: 'Azerbaijan',
  BD: 'Bangladesh',   BY: 'Belarus',        BI: 'Burundi',       BO: 'Bolivia',
  BA: 'Bosnia and Herzegovina', BR: 'Brazil', BF: 'Burkina Faso', KH: 'Cambodia',
  CM: 'Cameroon',     CA: 'Canada',         CF: 'Central African Republic',
  TD: 'Chad',         CL: 'Chile',          CN: 'China',         CO: 'Colombia',
  CD: 'Democratic Republic of the Congo',   CG: 'Republic of the Congo',
  CR: 'Costa Rica',   HR: 'Croatia',        CU: 'Cuba',          EG: 'Egypt',
  SV: 'El Salvador',  ET: 'Ethiopia',       FR: 'France',        GE: 'Georgia',
  DE: 'Germany',      GH: 'Ghana',          GR: 'Greece',        GT: 'Guatemala',
  GN: 'Guinea',       HT: 'Haiti',          HN: 'Honduras',      IN: 'India',
  ID: 'Indonesia',    IR: 'Iran',           IQ: 'Iraq',          IL: 'Israel',
  IT: 'Italy',        JM: 'Jamaica',        JP: 'Japan',         JO: 'Jordan',
  KZ: 'Kazakhstan',   KE: 'Kenya',          KP: 'North Korea',   KR: 'South Korea',
  KW: 'Kuwait',       KG: 'Kyrgyzstan',     LA: 'Laos',          LB: 'Lebanon',
  LY: 'Libya',        MK: 'North Macedonia', ML: 'Mali',          MX: 'Mexico',
  MD: 'Moldova',      MA: 'Morocco',        MZ: 'Mozambique',    MM: 'Myanmar',
  NP: 'Nepal',        NI: 'Nicaragua',      NE: 'Niger',         NG: 'Nigeria',
  PK: 'Pakistan',     PS: 'Palestine',      PA: 'Panama',        PY: 'Paraguay',
  PE: 'Peru',         PH: 'Philippines',    PL: 'Poland',        PT: 'Portugal',
  RO: 'Romania',      RU: 'Russia',         RW: 'Rwanda',        SA: 'Saudi Arabia',
  SN: 'Senegal',      RS: 'Serbia',         SL: 'Sierra Leone',  SO: 'Somalia',
  ZA: 'South Africa', SS: 'South Sudan',    ES: 'Spain',         LK: 'Sri Lanka',
  SD: 'Sudan',        SY: 'Syria',          TJ: 'Tajikistan',    TZ: 'Tanzania',
  TH: 'Thailand',     TL: 'Timor-Leste',    TN: 'Tunisia',       TR: 'Turkey',
  TM: 'Turkmenistan', UG: 'Uganda',         UA: 'Ukraine',       GB: 'United Kingdom',
  US: 'United States', UY: 'Uruguay',       UZ: 'Uzbekistan',    VE: 'Venezuela',
  VN: 'Vietnam',      YE: 'Yemen',          ZM: 'Zambia',        ZW: 'Zimbabwe',
  HK: 'Hong Kong',    TW: 'Taiwan',         MO: 'Macau',         SG: 'Singapore',
  MY: 'Malaysia',     AE: 'UAE',            QA: 'Qatar',         OM: 'Oman',
}

export function codeToName(code: string): string | null {
  return COUNTRY_CODE_TO_NAME[code.toUpperCase()] ?? null
}

/** Display a country field as a full name — expands 2-letter ISO codes (HT → Haiti). */
export function displayCountry(country: string | undefined | null): string {
  const s = (country ?? '').trim()
  if (/^[A-Za-z]{2}$/.test(s)) return COUNTRY_CODE_TO_NAME[s.toUpperCase()] ?? s.toUpperCase()
  return s
}

const NOISE = new Set(['unknown', 'Unknown', 'UNKNOWN', '', 'N/A', 'n/a', 'null', 'undefined'])

export function normalizeCountryName(raw: string | undefined | null): string | null {
  if (!raw || NOISE.has(raw)) return null
  if (/^[A-Z]{2}$/.test(raw)) return codeToName(raw)
  return raw
}
