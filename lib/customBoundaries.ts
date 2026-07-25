// Custom GeoJSON boundaries for countries where official government claims differ
// from OpenStreetMap data (which shows de facto control lines, not claimed territory).
//
// India: OSM excludes PoK, Gilgit-Baltistan, and Aksai Chin.
// This boundary follows the Survey of India official political map.

export interface CustomBoundary {
  id: string
  place_name: string
  center: [number, number]
  bbox: [number, number, number, number]  // [minLng, minLat, maxLng, maxLat]
  note: string
  geometry: GeoJSON.Polygon
  aliases: string[]
}

// Simplified polygon of India's officially claimed territory per Survey of India.
// Includes: J&K (full), Azad Kashmir, Gilgit-Baltistan, Aksai Chin, Arunachal Pradesh.
// Coordinates are [longitude, latitude] pairs, clockwise from west Gujarat coast.
const INDIA_COORDINATES: [number, number][] = [
  // West Gujarat coast
  [68.18, 23.61], [68.55, 22.80], [68.85, 22.40], [69.20, 22.30],
  [70.00, 22.40], [70.50, 21.80], [70.90, 21.10], [71.20, 20.80],
  [71.80, 20.50],
  // Surat / Daman area
  [72.50, 21.10], [72.80, 20.80], [73.00, 19.90], [73.00, 19.20],
  [72.80, 18.90],
  // Goa / Karnataka coast
  [73.10, 17.80], [73.60, 17.00], [73.90, 16.50], [74.10, 15.40],
  [74.60, 14.80], [74.40, 14.20], [74.90, 12.20], [75.20, 11.80],
  // Kerala coast
  [76.20, 11.00], [76.70, 10.00], [76.30, 9.00], [76.50, 8.60],
  // Southern tip — Cape Comorin (Kanyakumari)
  [77.05, 8.10], [77.55, 8.07],
  // Tamil Nadu east coast
  [78.20, 8.50], [79.00, 9.50], [80.00, 11.00], [80.30, 12.00],
  [80.20, 13.50], [80.40, 15.00],
  // Andhra Pradesh / Odisha coast
  [81.00, 16.00], [82.30, 17.60], [83.50, 18.60], [84.50, 19.20],
  [85.00, 19.80], [86.10, 20.40], [86.70, 20.30],
  // West Bengal coast
  [87.30, 21.30], [87.90, 21.90], [88.20, 22.10], [88.40, 22.60],
  [88.80, 22.50], [88.90, 23.00],
  // Bangladesh east boundary going north
  [88.80, 24.00], [89.00, 24.40], [89.60, 25.00], [90.00, 25.10],
  [90.50, 25.10], [91.00, 25.20], [91.50, 24.80], [91.90, 24.20],
  [92.20, 23.90], [92.50, 23.60],
  // Northeast India (Mizoram / Manipur / Nagaland)
  [92.80, 23.90], [93.00, 24.00], [93.60, 24.50], [94.20, 25.10],
  [94.80, 26.00], [95.20, 27.00], [96.00, 27.60], [96.50, 28.00],
  // Arunachal Pradesh eastern tip
  [97.40, 28.20],
  // McMahon Line — India–China boundary in northeast (west)
  [97.00, 28.70], [95.00, 28.20], [93.50, 28.00], [91.60, 27.80],
  // Around Bhutan corridor
  [91.00, 27.50], [90.00, 27.30], [89.50, 27.60],
  // Sikkim northern tip
  [88.80, 27.50],
  // Nepal–India boundary going west
  [88.00, 27.60], [87.00, 27.40], [86.00, 27.90], [85.00, 28.00],
  [84.00, 28.00], [83.00, 28.00], [82.00, 28.50], [81.00, 28.70],
  [80.50, 29.00],
  // Uttarakhand–Tibet / Himachal Pradesh–Tibet boundary
  [80.20, 30.00], [79.60, 30.50], [79.00, 31.50], [79.00, 32.00],
  // Aksai Chin — India's claimed boundary (Chinese-administered)
  [79.30, 33.50], [79.60, 34.20], [80.00, 34.50],
  [79.50, 35.20], [79.00, 35.60], [78.00, 35.60],
  // Karakoram — northern Ladakh / Gilgit-Baltistan boundary with China
  [77.50, 36.00], [76.50, 36.50], [75.50, 36.80], [74.50, 37.00],
  // India–Afghanistan–Pakistan tripoint
  [73.90, 37.10],
  // Gilgit-Baltistan / PoK (Pakistani-administered, Indian-claimed) going south
  [73.00, 36.50], [72.50, 35.80], [72.50, 35.20], [73.00, 34.80],
  [73.50, 34.50], [74.00, 34.80], [74.50, 34.00], [74.00, 33.50],
  [74.00, 33.00],
  // International boundary with Pakistan — Jammu / Punjab / Rajasthan / Sindh
  [73.80, 32.50], [73.50, 32.00], [73.00, 31.50],
  [72.80, 31.00], [73.00, 30.00], [72.50, 29.00], [72.00, 28.00],
  [71.50, 27.00], [71.00, 26.00], [70.50, 25.00], [70.20, 24.00],
  [70.00, 23.50], [69.50, 23.50],
  // Close polygon back to start
  [68.18, 23.61],
]

// ─── Jammu & Kashmir ────────────────────────────────────────────────────────
// India claims the full pre-2019 J&K state including Pakistan-administered
// Azad Kashmir (PoK), Gilgit-Baltistan (GB), and the Aksai Chin part of Ladakh.
// OSM shows only Indian-administered J&K UT — this polygon adds PoK + GB.
const JK_COORDINATES: [number, number][] = [
  // SE corner — HP/J&K/Ladakh border meeting point
  [76.5, 32.2], [77.5, 32.3], [78.5, 32.0],
  // Eastern Ladakh — India–Tibet LAC (claimed line)
  [79.2, 32.5], [79.5, 33.5], [79.8, 34.5], [80.2, 34.8],
  // Aksai Chin northern boundary
  [79.8, 35.3], [79.0, 35.6],
  // Karakoram Range — Siachen / northern GB
  [78.0, 36.0], [77.5, 36.2], [76.5, 36.5], [75.5, 36.8], [74.5, 37.0],
  // Afghanistan–India–Pakistan tripoint
  [73.9, 37.1],
  // South along GB/PoK (Pakistani-administered, Indian-claimed)
  [73.2, 36.5], [72.5, 35.5], [72.5, 35.0], [73.0, 34.5],
  // Azad Kashmir / LoC area
  [73.5, 34.5], [74.0, 34.8], [74.5, 34.2], [74.5, 33.8],
  [74.0, 33.5], [73.8, 33.0],
  // Jammu — IB with Pakistan, then HP border going east
  [74.0, 32.7], [74.2, 32.2], [74.5, 32.2], [75.5, 32.2],
  // Close
  [76.5, 32.2],
]

// ─── Ladakh UT ──────────────────────────────────────────────────────────────
// India's Ladakh UT claim includes Aksai Chin (Chinese-administered).
// OSM shows only Indian-administered Ladakh without Aksai Chin.
const LADAKH_COORDINATES: [number, number][] = [
  // SW corner — HP meets Ladakh / J&K
  [75.0, 32.5], [76.5, 32.2], [78.5, 32.0],
  // Eastern boundary — Tibet LAC (India's claimed line, includes Aksai Chin)
  [79.2, 32.5], [79.5, 33.5], [79.8, 34.5], [80.2, 34.8],
  // Aksai Chin — northern extent
  [79.8, 35.3], [79.0, 35.6],
  // Northern — Karakoram / Siachen area
  [77.8, 36.0], [77.2, 36.0], [76.8, 35.8],
  // NW corner — Siachen / Saltoro Ridge boundary
  [76.0, 35.5], [75.5, 35.0], [75.0, 34.5], [75.0, 33.5],
  // Close
  [75.0, 32.5],
]

// ─── Arunachal Pradesh ──────────────────────────────────────────────────────
// India's northern boundary is the McMahon Line (~28.5–29°N).
// China claims most of Arunachal Pradesh as "South Tibet" (Zangnan).
// OSM follows the Indian-administered extent, so this is broadly correct,
// but we override to ensure the McMahon Line is used consistently.
const ARUNACHAL_COORDINATES: [number, number][] = [
  // SW corner — Assam/AP border
  [91.5, 26.7],
  // Southern boundary with Assam / Nagaland
  [92.5, 26.5], [93.5, 26.5], [95.0, 26.8], [96.0, 27.3], [97.0, 27.8],
  // Easternmost point — Myanmar tripoint
  [97.4, 28.2],
  // McMahon Line going northwest (India–China)
  [97.0, 28.8], [95.5, 28.6], [94.5, 28.3], [93.0, 28.2], [92.5, 28.0],
  // NW — Bhutan–Arunachal–China tripoint area
  [91.8, 27.9], [91.5, 27.5],
  // Close
  [91.5, 26.7],
]

// ─── Pakistan ───────────────────────────────────────────────────────────────
// Per GoI: Pakistan does NOT include Azad Jammu & Kashmir (PoK) or
// Gilgit-Baltistan (GB) — those are Indian territory (part of J&K UT + Ladakh).
// OSM includes PoK + GB in Pakistan; this polygon excludes them.
// Pakistan's 4 provinces only: Sindh, Punjab, Balochistan, Khyber Pakhtunkhwa.
const PAK_COORDINATES: [number, number][] = [
  // Start: IB endpoint near Sialkot / Pathankot (India-Pakistan border, N end)
  [74.2, 32.2],
  // KPK–GB boundary going NW to Chitral (northern Pakistan without GB)
  [73.5, 33.0], [73.0, 33.5], [72.5, 34.0], [72.0, 35.0], [72.5, 36.0],
  // Durand Line (Afghanistan–Pakistan) going SW
  [71.5, 35.5], [71.0, 35.0], [70.5, 34.5], [70.0, 34.0],
  [69.5, 33.5], [69.0, 32.8], [68.5, 32.2], [67.5, 32.0],
  [67.0, 31.5], [66.5, 31.0], [65.5, 30.5], [64.5, 30.0],
  [63.5, 29.5], [63.0, 28.5],
  // Iran–Pakistan border going S
  [62.5, 28.0], [62.0, 27.0], [61.5, 26.0], [61.5, 25.0],
  // Arabian Sea coast going E
  [61.5, 24.5], [63.0, 24.5], [65.0, 24.8], [66.5, 24.5],
  [67.5, 24.0], [68.0, 23.6],
  // India–Pakistan IB going N back to start
  [68.5, 23.5], [70.0, 23.5], [70.5, 25.0], [71.0, 26.0],
  [71.5, 27.0], [72.0, 28.0], [72.5, 29.0], [73.0, 30.0],
  [73.0, 31.0], [73.5, 32.0], [74.0, 32.5],
  [74.2, 32.2],
]

export const CUSTOM_BOUNDARIES: CustomBoundary[] = [
  {
    id: 'custom-india-official',
    place_name: 'India',
    center: [82.8, 22.0],
    bbox: [68.18, 8.07, 97.40, 37.10],
    note: 'Survey of India official map — includes J&K, Gilgit-Baltistan & Aksai Chin',
    geometry: { type: 'Polygon', coordinates: [INDIA_COORDINATES] },
    aliases: ['india', 'republic of india', 'bharat', 'hindustan', 'भारत', 'ভারত'],
  },
  {
    id: 'custom-jk-official',
    place_name: 'Jammu and Kashmir',
    center: [75.5, 34.5],
    bbox: [72.5, 32.2, 80.2, 37.1],
    note: 'GoI official claim — includes Azad Kashmir, Gilgit-Baltistan & Aksai Chin',
    geometry: { type: 'Polygon', coordinates: [JK_COORDINATES] },
    aliases: [
      'jammu and kashmir', 'jammu & kashmir', 'j&k', 'jk', 'kashmir',
      'azad kashmir', 'jammu kashmir', 'जम्मू और कश्मीर', 'jammu',
    ],
  },
  {
    id: 'custom-ladakh-official',
    place_name: 'Ladakh',
    center: [77.5, 34.0],
    bbox: [75.0, 32.0, 80.2, 36.0],
    note: 'GoI official claim — includes Aksai Chin (Chinese-administered)',
    geometry: { type: 'Polygon', coordinates: [LADAKH_COORDINATES] },
    aliases: ['ladakh', 'leh', 'leh ladakh', 'लद्दाख'],
  },
  {
    id: 'custom-arunachal-official',
    place_name: 'Arunachal Pradesh',
    center: [94.5, 27.5],
    bbox: [91.5, 26.5, 97.4, 28.8],
    note: 'GoI official claim — McMahon Line as northern boundary',
    geometry: { type: 'Polygon', coordinates: [ARUNACHAL_COORDINATES] },
    aliases: [
      'arunachal pradesh', 'arunachal', 'arunchal pradesh',
      'अरुणाचल प्रदेश', 'itanagar',
    ],
  },
  {
    id: 'custom-pakistan-goi',
    place_name: 'Pakistan',
    center: [68.5, 30.0],
    bbox: [61.5, 23.5, 74.2, 36.0],
    note: 'Per GoI: excludes Azad Kashmir & Gilgit-Baltistan (Indian territory per GoI)',
    geometry: { type: 'Polygon', coordinates: [PAK_COORDINATES] },
    aliases: [
      'pakistan', 'islamic republic of pakistan', 'pak', 'پاکستان',
    ],
  },
]

// ─── Neighbor notes ──────────────────────────────────────────────────────────
// For countries where we can't feasibly handcraft a full custom polygon (e.g. China
// is 9.6M km²), we add an informational note to the Nominatim result instead.
// The boundary shown is de facto / OSM — the note explains the GoI position.

export interface NeighborNote {
  aliases: string[]
  note: string
}

export const NEIGHBOR_NOTES: NeighborNote[] = [
  {
    aliases: ['china', "people's republic of china", 'prc', '中国', '中國', 'mainland china'],
    note: 'GoI: Aksai Chin (Ladakh UT) & Arunachal Pradesh are Indian territory — boundary shown is China\'s de facto control',
  },
  {
    aliases: ['nepal'],
    note: 'Minor boundary points disputed; shown per de facto administration',
  },
  {
    aliases: ['myanmar', 'burma'],
    note: 'Boundary follows de facto administration; minor sections disputed',
  },
  {
    aliases: ['afghanistan'],
    note: 'Afghanistan–India share no direct border per GoI (GB is Indian territory)',
  },
  {
    aliases: ['bangladesh'],
    note: 'Land boundary demarcated by 2015 LBA; shown per current demarcation',
  },
]

export function findNeighborNote(q: string): NeighborNote | undefined {
  const norm = q.toLowerCase().trim()
  return NEIGHBOR_NOTES.find(n =>
    n.aliases.some(a => norm === a || norm === `${a} map` || norm === `map of ${a}`)
  )
}

// Lookup by query string — returns the custom boundary if the query matches
export function findCustomBoundary(q: string): CustomBoundary | undefined {
  const norm = q.toLowerCase().trim()
  return CUSTOM_BOUNDARIES.find(b =>
    b.aliases.some(a => norm === a || norm === `${a} map` || norm === `map of ${a}` || norm === `${a} state`)
  )
}
