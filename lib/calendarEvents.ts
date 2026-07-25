// Static geopolitical calendar — elections, summits, anniversaries, deadlines
// Dates use YYYY-MM-DD; recurring anniversaries use the current year

export type CalendarEventType =
  | 'election'
  | 'anniversary'
  | 'summit'
  | 'sanctions'
  | 'deadline'
  | 'un-session'
  | 'custom'

export interface CalendarEntry {
  id: string
  date: string          // YYYY-MM-DD
  title: string
  country: string
  countryCode: string
  type: CalendarEventType
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'info'
  description: string
  source?: string
  recurring?: boolean   // true = anniversary, shows every year
  lat?: number
  lon?: number
}

function yr(mm: string, dd: string): string {
  const now = new Date()
  const y = now.getFullYear()
  const candidate = `${y}-${mm}-${dd}`
  // If the date has already passed this year, show next year
  return new Date(candidate) < now ? `${y + 1}-${mm}-${dd}` : candidate
}

export const STATIC_CALENDAR: CalendarEntry[] = [
  // === ELECTIONS ===
  {
    id: 'elec-pk-2025',
    date: '2025-10-15',
    title: 'Pakistan General Election (anticipated)',
    country: 'Pakistan', countryCode: 'PK', type: 'election',
    riskLevel: 'high',
    description: 'Expected general election following political instability. PTI detention and civil society tensions elevate pre-election violence risk.',
    lat: 33.7, lon: 73.1,
  },
  {
    id: 'elec-ng-2027',
    date: '2027-02-20',
    title: 'Nigeria Presidential Election',
    country: 'Nigeria', countryCode: 'NG', type: 'election',
    riskLevel: 'high',
    description: 'Quadrennial election. Historical pattern of inter-ethnic violence, ballot stuffing, and INEC disputes in Delta and Rivers states.',
    lat: 9.0, lon: 8.7,
  },
  {
    id: 'elec-ke-2027',
    date: '2027-08-10',
    title: 'Kenya General Election',
    country: 'Kenya', countryCode: 'KE', type: 'election',
    riskLevel: 'medium',
    description: 'Scheduled general election. 2007-08 post-election violence resulted in 1,500 deaths; IEBC credibility remains contested.',
    lat: -1.3, lon: 36.8,
  },
  {
    id: 'elec-ir-2025',
    date: '2025-06-28',
    title: 'Iran Presidential Election',
    country: 'Iran', countryCode: 'IR', type: 'election',
    riskLevel: 'high',
    description: 'Guardian Council controls candidate vetting. Protest risk elevated following 2022 Mahsa Amini unrest precedent.',
    lat: 35.7, lon: 51.4,
  },
  {
    id: 'elec-drc-2028',
    date: '2028-12-20',
    title: 'DRC Presidential Election',
    country: 'DR Congo', countryCode: 'CD', type: 'election',
    riskLevel: 'critical',
    description: 'Tshisekedi re-election contested. M23 presence in North Kivu creates conditions for election-related violence.',
    lat: -4.3, lon: 15.3,
  },

  // === CONFLICT ANNIVERSARIES (recurring) ===
  {
    id: 'ann-srebrenica',
    date: yr('07', '11'),
    title: 'Srebrenica Massacre Anniversary',
    country: 'Bosnia', countryCode: 'BA', type: 'anniversary',
    riskLevel: 'medium', recurring: true,
    description: '1995 Srebrenica genocide anniversary. Denial rhetoric from RS leadership elevates intercommunal tensions annually. Monitor for protest activity.',
    lat: 44.1, lon: 19.3,
  },
  {
    id: 'ann-9-11',
    date: yr('09', '11'),
    title: '9/11 Anniversary — Global Threat Elevation',
    country: 'Global', countryCode: 'XX', type: 'anniversary',
    riskLevel: 'high', recurring: true,
    description: 'Annual period of elevated attack risk. Jihadist groups have historically used the anniversary for messaging and operational activity.',
  },
  {
    id: 'ann-nakba',
    date: yr('05', '15'),
    title: 'Nakba Day — Regional Protest Risk',
    country: 'Palestine', countryCode: 'PS', type: 'anniversary',
    riskLevel: 'high', recurring: true,
    description: 'Palestinian "Catastrophe" anniversary. Annual protests across MENA, diaspora, and Western capitals. Escalation risk at Israel-Gaza and West Bank.',
    lat: 31.9, lon: 35.2,
  },
  {
    id: 'ann-tiananmen',
    date: yr('06', '04'),
    title: 'Tiananmen Square Anniversary',
    country: 'China', countryCode: 'CN', type: 'anniversary',
    riskLevel: 'medium', recurring: true,
    description: '1989 crackdown anniversary. PRC intensifies censorship and surveillance. Hong Kong vigils banned since 2020.',
    lat: 39.9, lon: 116.4,
  },
  {
    id: 'ann-rwanda',
    date: yr('04', '07'),
    title: 'Rwandan Genocide Commemoration',
    country: 'Rwanda', countryCode: 'RW', type: 'anniversary',
    riskLevel: 'low', recurring: true,
    description: '1994 genocide remembrance (Kwibuka). Regional ethnic tensions in DRC/Burundi. Monitor for denial rhetoric from regional actors.',
    lat: -1.9, lon: 29.9,
  },
  {
    id: 'ann-kosovo',
    date: yr('02', '17'),
    title: 'Kosovo Independence Day',
    country: 'Kosovo', countryCode: 'XK', type: 'anniversary',
    riskLevel: 'medium', recurring: true,
    description: 'Serbia and Russia do not recognise Kosovo independence. Annual Serbia-Kosovo tensions. Monitor north Mitrovica.',
    lat: 42.7, lon: 21.2,
  },
  {
    id: 'ann-pak-india-partition',
    date: yr('08', '14'),
    title: 'Pakistan Independence Day / India-Pakistan Partition Anniversary',
    country: 'Pakistan', countryCode: 'PK', type: 'anniversary',
    riskLevel: 'medium', recurring: true,
    description: 'Partition anniversary. Cross-border rhetoric elevated; sporadic LOC violations common. Monitor Jammu & Kashmir.',
    lat: 33.7, lon: 73.1,
  },

  // === UN SESSIONS ===
  {
    id: 'un-ga-2025',
    date: '2025-09-16',
    title: 'UN General Assembly 80th Session Opens',
    country: 'United States', countryCode: 'US', type: 'un-session',
    riskLevel: 'info',
    description: 'UNGA High-Level Week (23-27 Sep). Diplomatic activity peaks; protest risk in NYC elevated. Key resolutions on Gaza, Ukraine, Sudan expected.',
    lat: 40.7, lon: -74.0,
  },
  {
    id: 'un-sc-ukraine',
    date: yr('02', '24'),
    title: 'Ukraine War Anniversary — UNSC Emergency Session',
    country: 'Ukraine', countryCode: 'UA', type: 'un-session',
    riskLevel: 'high', recurring: true,
    description: 'Annual emergency UNSC session on Ukraine. Russia veto expected. Western capitals hold solidarity events. Russian offensive activity has historically increased around this date.',
    lat: 50.4, lon: 30.5,
  },

  // === SANCTIONS DEADLINES ===
  {
    id: 'sanc-iran-snapback',
    date: '2025-10-18',
    title: 'Iran — JCPOA Snapback Sanctions Expiry',
    country: 'Iran', countryCode: 'IR', type: 'sanctions',
    riskLevel: 'critical',
    description: 'UN arms embargo snapback mechanism expires. Removal would allow conventional arms sales to Iran. US/EU/UK response options limited under UNSCR 2231.',
    lat: 35.7, lon: 51.4,
  },
  {
    id: 'sanc-russia-review',
    date: yr('07', '31'),
    title: 'EU Russia Sanctions Package — 6-Month Review',
    country: 'Russia', countryCode: 'RU', type: 'sanctions',
    riskLevel: 'medium', recurring: true,
    description: 'EU reviews Russia sanctions every 6 months (Jan/Jul). Extension requires unanimous Council vote. Hungarian veto risk monitor.',
    lat: 55.7, lon: 37.6,
  },
  {
    id: 'sanc-nk-arms',
    date: yr('03', '31'),
    title: 'DPRK UN Panel of Experts Mandate Review',
    country: 'North Korea', countryCode: 'KP', type: 'sanctions',
    riskLevel: 'high', recurring: true,
    description: 'Annual UNSC vote on DPRK sanctions monitoring mandate. Russia/China veto in 2024 terminated the Panel. Western circumvention options limited.',
    lat: 39.0, lon: 125.8,
  },

  // === GEOPOLITICAL DEADLINES ===
  {
    id: 'dl-taiwan-strait-drills',
    date: yr('08', '04'),
    title: 'PLA Taiwan Strait Exercise Anniversary',
    country: 'Taiwan', countryCode: 'TW', type: 'anniversary',
    riskLevel: 'high', recurring: true,
    description: 'Aug 4 2022 PLA encirclement drills anniversary. PRC uses Pelosi visit commemoration for deterrence signalling. Monitor ADIZ incursions.',
    lat: 23.7, lon: 121.0,
  },
  {
    id: 'dl-minsk-review',
    date: yr('09', '01'),
    title: 'Donbas Ceasefire — Historical Deadline Period',
    country: 'Ukraine', countryCode: 'UA', type: 'deadline',
    riskLevel: 'medium', recurring: true,
    description: 'September historically sees elevated SIGACT activity along FEBA in Donbas. Back-to-school period has correlated with offensive tempo increases.',
    lat: 48.0, lon: 37.8,
  },

  // === SUMMITS ===
  {
    id: 'summit-nato-2025',
    date: '2025-06-24',
    title: 'NATO Summit — The Hague',
    country: 'Netherlands', countryCode: 'NL', type: 'summit',
    riskLevel: 'medium',
    description: 'NATO leaders summit. Ukraine membership pathway and 5% GDP defence spending pledge key agenda items. Protest risk at host city.',
    lat: 52.1, lon: 4.3,
  },
  {
    id: 'summit-g7-2025',
    date: '2025-06-15',
    title: 'G7 Summit — Kananaskis, Canada',
    country: 'Canada', countryCode: 'CA', type: 'summit',
    riskLevel: 'low',
    description: 'G7 Leaders Summit. Russia sanctions, AI governance, and climate finance expected key agenda items.',
    lat: 51.0, lon: -115.0,
  },
  {
    id: 'summit-sco-2025',
    date: '2025-07-03',
    title: 'SCO Summit — China',
    country: 'China', countryCode: 'CN', type: 'summit',
    riskLevel: 'medium',
    description: 'Shanghai Cooperation Organisation summit. Russia-China strategic partnership signalling. Iran full member since 2023.',
    lat: 39.9, lon: 116.4,
  },
  {
    id: 'summit-au-2025',
    date: '2025-07-15',
    title: 'African Union Summit — Addis Ababa',
    country: 'Ethiopia', countryCode: 'ET', type: 'summit',
    riskLevel: 'low',
    description: 'AU Assembly of Heads of State. Sudan crisis, Sahel coups, and Great Lakes security on agenda.',
    lat: 9.0, lon: 38.7,
  },
]

export const EVENT_TYPE_CONFIG: Record<CalendarEventType, { label: string; color: string; bg: string }> = {
  election:    { label: 'Election',    color: '#1C5D7A', bg: '#E0EBF0' },
  anniversary: { label: 'Anniversary', color: '#6B42A8', bg: '#EDE8F5' },
  summit:      { label: 'Summit',      color: '#1C5D7A', bg: '#E0EBF0' },
  sanctions:   { label: 'Sanctions',   color: '#BE1E3A', bg: '#F7E2E6' },
  deadline:    { label: 'Deadline',    color: '#9A7517', bg: '#F4EDD4' },
  'un-session':{ label: 'UN Session',  color: '#3D7C66', bg: '#E0EDE8' },
  custom:      { label: 'Custom',      color: '#5E6B7A', bg: '#ECEAE3' },
}

export const RISK_COLOR: Record<string, string> = {
  critical: '#BE1E3A', high: '#C2691C', medium: '#9A7517', low: '#3D7C66', info: '#5E6B7A',
}
