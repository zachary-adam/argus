export interface RegionOption {
  id: string
  name: string
  type: 'macro' | 'country'
  group: string
  codes: string[] // ISO alpha-2
}

export const REGION_OPTIONS: RegionOption[] = [
  // ─ Macro regions ─
  { id: 'r-western-europe',  name: 'Western Europe',               type: 'macro',   group: 'Europe',       codes: ['GB','FR','DE','IT','ES','PT','NL','BE','LU','AT','CH','SE','NO','DK','FI','IE','IS'] },
  { id: 'r-eastern-europe',  name: 'Eastern Europe',               type: 'macro',   group: 'Europe',       codes: ['PL','CZ','SK','HU','RO','BG','HR','SI','BA','RS','ME','MK','AL','MD','UA','BY'] },
  { id: 'r-balkans',         name: 'Balkans',                      type: 'macro',   group: 'Europe',       codes: ['BA','RS','ME','MK','AL','HR','SI','BG','GR','RO','XK'] },
  { id: 'r-caucasus',        name: 'Caucasus',                     type: 'macro',   group: 'Europe',       codes: ['GE','AM','AZ'] },
  { id: 'r-russia-ca',       name: 'Russia & Central Asia',        type: 'macro',   group: 'Europe',       codes: ['RU','KZ','UZ','TM','TJ','KG'] },
  { id: 'r-middle-east',     name: 'Middle East',                  type: 'macro',   group: 'Middle East',  codes: ['IR','IQ','SY','LB','JO','IL','PS','SA','AE','KW','QA','BH','OM','YE','TR'] },
  { id: 'r-north-africa',    name: 'North Africa',                 type: 'macro',   group: 'Africa',       codes: ['MA','DZ','TN','LY','EG','SD'] },
  { id: 'r-west-africa',     name: 'West Africa',                  type: 'macro',   group: 'Africa',       codes: ['SN','GM','GW','GN','SL','LR','CI','GH','TG','BJ','NG','NE','BF','ML','MR','CV'] },
  { id: 'r-sahel',           name: 'Sahel',                        type: 'macro',   group: 'Africa',       codes: ['ML','NE','TD','BF','MR','SN','NG','CF'] },
  { id: 'r-east-africa',     name: 'East Africa',                  type: 'macro',   group: 'Africa',       codes: ['ET','ER','SO','DJ','KE','UG','TZ','RW','BI','SS'] },
  { id: 'r-horn-of-africa',  name: 'Horn of Africa',               type: 'macro',   group: 'Africa',       codes: ['ET','ER','SO','DJ'] },
  { id: 'r-central-africa',  name: 'Central Africa',               type: 'macro',   group: 'Africa',       codes: ['CM','CF','CD','CG','TD','GA','GQ'] },
  { id: 'r-southern-africa', name: 'Southern Africa',              type: 'macro',   group: 'Africa',       codes: ['ZA','ZW','ZM','MW','MZ','BW','NA','LS','SZ','AO'] },
  { id: 'r-south-asia',      name: 'South Asia',                   type: 'macro',   group: 'Asia-Pacific', codes: ['IN','PK','BD','LK','NP','BT','MV','AF'] },
  { id: 'r-southeast-asia',  name: 'Southeast Asia',               type: 'macro',   group: 'Asia-Pacific', codes: ['MM','TH','LA','KH','VN','MY','SG','ID','PH','BN','TL'] },
  { id: 'r-east-asia',       name: 'East Asia',                    type: 'macro',   group: 'Asia-Pacific', codes: ['CN','JP','KR','KP','MN','TW'] },
  { id: 'r-central-asia',    name: 'Central Asia',                 type: 'macro',   group: 'Asia-Pacific', codes: ['KZ','UZ','TM','TJ','KG'] },
  { id: 'r-central-am',      name: 'Central America & Caribbean',  type: 'macro',   group: 'Americas',     codes: ['MX','GT','BZ','HN','SV','NI','CR','PA','CU','JM','HT','DO','TT'] },
  { id: 'r-caribbean',       name: 'Caribbean',                    type: 'macro',   group: 'Americas',     codes: ['CU','JM','HT','DO','TT','BB','LC','VC','GD','AG','DM','KN'] },
  { id: 'r-latin-america',   name: 'Latin America',                type: 'macro',   group: 'Americas',     codes: ['MX','GT','BZ','HN','SV','NI','CR','PA','CU','JM','HT','DO','TT','CO','VE','GY','SR','BR','EC','PE','BO','PY','UY','AR','CL'] },
  { id: 'r-south-america',   name: 'South America',                type: 'macro',   group: 'Americas',     codes: ['CO','VE','GY','SR','BR','EC','PE','BO','PY','UY','AR','CL'] },
  { id: 'r-north-america',   name: 'North America',                type: 'macro',   group: 'Americas',     codes: ['US','CA'] },
  // ─ Individual countries ─
  { id: 'c-ua', name: 'Ukraine',                  type: 'country', group: 'Europe',       codes: ['UA'] },
  { id: 'c-ru', name: 'Russia',                   type: 'country', group: 'Europe',       codes: ['RU'] },
  { id: 'c-by', name: 'Belarus',                  type: 'country', group: 'Europe',       codes: ['BY'] },
  { id: 'c-pl', name: 'Poland',                   type: 'country', group: 'Europe',       codes: ['PL'] },
  { id: 'c-de', name: 'Germany',                  type: 'country', group: 'Europe',       codes: ['DE'] },
  { id: 'c-fr', name: 'France',                   type: 'country', group: 'Europe',       codes: ['FR'] },
  { id: 'c-gb', name: 'United Kingdom',           type: 'country', group: 'Europe',       codes: ['GB'] },
  { id: 'c-rs', name: 'Serbia',                   type: 'country', group: 'Europe',       codes: ['RS'] },
  { id: 'c-hr', name: 'Croatia',                  type: 'country', group: 'Europe',       codes: ['HR'] },
  { id: 'c-ro', name: 'Romania',                  type: 'country', group: 'Europe',       codes: ['RO'] },
  { id: 'c-md', name: 'Moldova',                  type: 'country', group: 'Europe',       codes: ['MD'] },
  { id: 'c-ge', name: 'Georgia',                  type: 'country', group: 'Europe',       codes: ['GE'] },
  { id: 'c-am', name: 'Armenia',                  type: 'country', group: 'Europe',       codes: ['AM'] },
  { id: 'c-az', name: 'Azerbaijan',               type: 'country', group: 'Europe',       codes: ['AZ'] },
  { id: 'c-tr', name: 'Turkey',                   type: 'country', group: 'Middle East',  codes: ['TR'] },
  { id: 'c-il', name: 'Israel',                   type: 'country', group: 'Middle East',  codes: ['IL'] },
  { id: 'c-ps', name: 'Palestine',                type: 'country', group: 'Middle East',  codes: ['PS'] },
  { id: 'c-ir', name: 'Iran',                     type: 'country', group: 'Middle East',  codes: ['IR'] },
  { id: 'c-iq', name: 'Iraq',                     type: 'country', group: 'Middle East',  codes: ['IQ'] },
  { id: 'c-sy', name: 'Syria',                    type: 'country', group: 'Middle East',  codes: ['SY'] },
  { id: 'c-lb', name: 'Lebanon',                  type: 'country', group: 'Middle East',  codes: ['LB'] },
  { id: 'c-jo', name: 'Jordan',                   type: 'country', group: 'Middle East',  codes: ['JO'] },
  { id: 'c-sa', name: 'Saudi Arabia',             type: 'country', group: 'Middle East',  codes: ['SA'] },
  { id: 'c-ye', name: 'Yemen',                    type: 'country', group: 'Middle East',  codes: ['YE'] },
  { id: 'c-ae', name: 'UAE',                      type: 'country', group: 'Middle East',  codes: ['AE'] },
  { id: 'c-ma', name: 'Morocco',                  type: 'country', group: 'Africa',       codes: ['MA'] },
  { id: 'c-ly', name: 'Libya',                    type: 'country', group: 'Africa',       codes: ['LY'] },
  { id: 'c-eg', name: 'Egypt',                    type: 'country', group: 'Africa',       codes: ['EG'] },
  { id: 'c-sd', name: 'Sudan',                    type: 'country', group: 'Africa',       codes: ['SD'] },
  { id: 'c-ss', name: 'South Sudan',              type: 'country', group: 'Africa',       codes: ['SS'] },
  { id: 'c-et', name: 'Ethiopia',                 type: 'country', group: 'Africa',       codes: ['ET'] },
  { id: 'c-so', name: 'Somalia',                  type: 'country', group: 'Africa',       codes: ['SO'] },
  { id: 'c-ke', name: 'Kenya',                    type: 'country', group: 'Africa',       codes: ['KE'] },
  { id: 'c-ug', name: 'Uganda',                   type: 'country', group: 'Africa',       codes: ['UG'] },
  { id: 'c-ng', name: 'Nigeria',                  type: 'country', group: 'Africa',       codes: ['NG'] },
  { id: 'c-ml', name: 'Mali',                     type: 'country', group: 'Africa',       codes: ['ML'] },
  { id: 'c-bf', name: 'Burkina Faso',             type: 'country', group: 'Africa',       codes: ['BF'] },
  { id: 'c-ne', name: 'Niger',                    type: 'country', group: 'Africa',       codes: ['NE'] },
  { id: 'c-td', name: 'Chad',                     type: 'country', group: 'Africa',       codes: ['TD'] },
  { id: 'c-cf', name: 'Central African Republic', type: 'country', group: 'Africa',       codes: ['CF'] },
  { id: 'c-cd', name: 'DR Congo',                 type: 'country', group: 'Africa',       codes: ['CD'] },
  { id: 'c-za', name: 'South Africa',             type: 'country', group: 'Africa',       codes: ['ZA'] },
  { id: 'c-mz', name: 'Mozambique',               type: 'country', group: 'Africa',       codes: ['MZ'] },
  { id: 'c-af', name: 'Afghanistan',              type: 'country', group: 'Asia-Pacific', codes: ['AF'] },
  { id: 'c-pk', name: 'Pakistan',                 type: 'country', group: 'Asia-Pacific', codes: ['PK'] },
  { id: 'c-in', name: 'India',                    type: 'country', group: 'Asia-Pacific', codes: ['IN'] },
  { id: 'c-bd', name: 'Bangladesh',               type: 'country', group: 'Asia-Pacific', codes: ['BD'] },
  { id: 'c-np', name: 'Nepal',                    type: 'country', group: 'Asia-Pacific', codes: ['NP'] },
  { id: 'c-cn', name: 'China',                    type: 'country', group: 'Asia-Pacific', codes: ['CN'] },
  { id: 'c-kp', name: 'North Korea',              type: 'country', group: 'Asia-Pacific', codes: ['KP'] },
  { id: 'c-tw', name: 'Taiwan',                   type: 'country', group: 'Asia-Pacific', codes: ['TW'] },
  { id: 'c-mm', name: 'Myanmar',                  type: 'country', group: 'Asia-Pacific', codes: ['MM'] },
  { id: 'c-ph', name: 'Philippines',              type: 'country', group: 'Asia-Pacific', codes: ['PH'] },
  { id: 'c-id', name: 'Indonesia',                type: 'country', group: 'Asia-Pacific', codes: ['ID'] },
  { id: 'c-th', name: 'Thailand',                 type: 'country', group: 'Asia-Pacific', codes: ['TH'] },
  { id: 'c-vn', name: 'Vietnam',                  type: 'country', group: 'Asia-Pacific', codes: ['VN'] },
  { id: 'c-kz', name: 'Kazakhstan',               type: 'country', group: 'Asia-Pacific', codes: ['KZ'] },
  { id: 'c-ve', name: 'Venezuela',                type: 'country', group: 'Americas',     codes: ['VE'] },
  { id: 'c-co', name: 'Colombia',                 type: 'country', group: 'Americas',     codes: ['CO'] },
  { id: 'c-br', name: 'Brazil',                   type: 'country', group: 'Americas',     codes: ['BR'] },
  { id: 'c-mx', name: 'Mexico',                   type: 'country', group: 'Americas',     codes: ['MX'] },
  { id: 'c-ht', name: 'Haiti',                    type: 'country', group: 'Americas',     codes: ['HT'] },
  { id: 'c-cu', name: 'Cuba',                     type: 'country', group: 'Americas',     codes: ['CU'] },
  { id: 'c-us', name: 'United States',            type: 'country', group: 'Americas',     codes: ['US'] },
  { id: 'c-ar', name: 'Argentina',                type: 'country', group: 'Americas',     codes: ['AR'] },
  { id: 'c-pe', name: 'Peru',                     type: 'country', group: 'Americas',     codes: ['PE'] },
  { id: 'c-ec', name: 'Ecuador',                  type: 'country', group: 'Americas',     codes: ['EC'] },
  { id: 'c-ky', name: 'Kashmir',                  type: 'country', group: 'Asia-Pacific', codes: ['IN','PK'] }, // disputed region
]

export const GROUP_ORDER = ['Europe', 'Middle East', 'Africa', 'Asia-Pacific', 'Americas']

// Map center + zoom for each region (used to fly the creation-flow map)
export const REGION_CENTERS: Record<string, { center: [number, number]; zoom: number }> = {
  // Macro regions
  'r-western-europe':  { center: [10,  52],  zoom: 4 },
  'r-eastern-europe':  { center: [26,  52],  zoom: 5 },
  'r-balkans':         { center: [21,  43],  zoom: 5 },
  'r-caucasus':        { center: [44,  41],  zoom: 6 },
  'r-russia-ca':       { center: [60,  55],  zoom: 3 },
  'r-middle-east':     { center: [44,  29],  zoom: 4 },
  'r-north-africa':    { center: [20,  28],  zoom: 4 },
  'r-west-africa':     { center: [-5,  11],  zoom: 5 },
  'r-sahel':           { center: [10,  15],  zoom: 5 },
  'r-east-africa':     { center: [37,   1],  zoom: 5 },
  'r-horn-of-africa':  { center: [43,   8],  zoom: 5 },
  'r-central-africa':  { center: [22,   3],  zoom: 5 },
  'r-southern-africa': { center: [28, -25],  zoom: 4 },
  'r-south-asia':      { center: [78,  22],  zoom: 4 },
  'r-southeast-asia':  { center: [108, 12],  zoom: 4 },
  'r-east-asia':       { center: [115, 35],  zoom: 3 },
  'r-central-asia':    { center: [65,  43],  zoom: 5 },
  'r-central-am':      { center: [-80, 15],  zoom: 5 },
  'r-caribbean':       { center: [-72, 18],  zoom: 6 },
  'r-latin-america':   { center: [-65, -5],  zoom: 3 },
  'r-south-america':   { center: [-65,-15],  zoom: 3 },
  'r-north-america':   { center: [-100, 45], zoom: 3 },
  // Individual countries
  'c-ua': { center: [32,  49],  zoom: 6 }, 'c-ru': { center: [90,  60],  zoom: 3 },
  'c-by': { center: [28,  53],  zoom: 6 }, 'c-pl': { center: [20,  52],  zoom: 6 },
  'c-de': { center: [10,  51],  zoom: 6 }, 'c-fr': { center: [2,   46],  zoom: 5 },
  'c-gb': { center: [-2,  54],  zoom: 5 }, 'c-rs': { center: [21,  44],  zoom: 6 },
  'c-ro': { center: [25,  46],  zoom: 6 }, 'c-md': { center: [29,  47],  zoom: 7 },
  'c-ge': { center: [44,  42],  zoom: 7 }, 'c-am': { center: [45,  40],  zoom: 7 },
  'c-az': { center: [47,  40],  zoom: 7 }, 'c-hr': { center: [16,  45],  zoom: 7 },
  'c-tr': { center: [35,  39],  zoom: 5 }, 'c-il': { center: [35,  31],  zoom: 7 },
  'c-ps': { center: [35,  32],  zoom: 8 }, 'c-ir': { center: [54,  32],  zoom: 5 },
  'c-iq': { center: [44,  33],  zoom: 6 }, 'c-sy': { center: [38,  35],  zoom: 6 },
  'c-lb': { center: [36,  34],  zoom: 7 }, 'c-jo': { center: [37,  31],  zoom: 7 },
  'c-sa': { center: [45,  24],  zoom: 5 }, 'c-ye': { center: [48,  16],  zoom: 6 },
  'c-ae': { center: [54,  24],  zoom: 7 }, 'c-ma': { center: [-6,  32],  zoom: 6 },
  'c-ly': { center: [17,  26],  zoom: 5 }, 'c-eg': { center: [30,  27],  zoom: 5 },
  'c-sd': { center: [30,  16],  zoom: 5 }, 'c-ss': { center: [31,   7],  zoom: 6 },
  'c-et': { center: [40,   9],  zoom: 5 }, 'c-so': { center: [46,   6],  zoom: 6 },
  'c-ke': { center: [38,  -1],  zoom: 6 }, 'c-ug': { center: [32,   1],  zoom: 7 },
  'c-ng': { center: [8,   10],  zoom: 6 }, 'c-ml': { center: [-2,  17],  zoom: 6 },
  'c-bf': { center: [-2,  12],  zoom: 6 }, 'c-ne': { center: [8,   17],  zoom: 6 },
  'c-td': { center: [18,  15],  zoom: 6 }, 'c-cf': { center: [20,   7],  zoom: 6 },
  'c-cd': { center: [24,  -4],  zoom: 5 }, 'c-za': { center: [26, -29],  zoom: 5 },
  'c-mz': { center: [35, -18],  zoom: 6 }, 'c-af': { center: [68,  33],  zoom: 5 },
  'c-pk': { center: [70,  30],  zoom: 5 }, 'c-in': { center: [79,  21],  zoom: 4 },
  'c-bd': { center: [90,  24],  zoom: 7 }, 'c-np': { center: [84,  28],  zoom: 7 },
  'c-cn': { center: [104, 36],  zoom: 3 }, 'c-kp': { center: [127, 40],  zoom: 7 },
  'c-tw': { center: [121, 24],  zoom: 7 }, 'c-mm': { center: [96,  19],  zoom: 6 },
  'c-ph': { center: [122, 12],  zoom: 5 }, 'c-id': { center: [118, -2],  zoom: 4 },
  'c-th': { center: [101, 15],  zoom: 6 }, 'c-vn': { center: [108, 16],  zoom: 5 },
  'c-kz': { center: [68,  48],  zoom: 5 }, 'c-ve': { center: [-66, 8],   zoom: 6 },
  'c-co': { center: [-74,  4],  zoom: 6 }, 'c-br': { center: [-52,-10],  zoom: 3 },
  'c-mx': { center: [-102,24],  zoom: 5 }, 'c-ht': { center: [-73, 19],  zoom: 8 },
  'c-cu': { center: [-79, 22],  zoom: 7 }, 'c-us': { center: [-98, 38],  zoom: 4 },
  'c-ar': { center: [-64,-35],  zoom: 4 }, 'c-pe': { center: [-76,-10],  zoom: 5 },
  'c-ec': { center: [-78, -2],  zoom: 6 }, 'c-ky': { center: [76,  34],  zoom: 7 },
}

export function getRegionCenter(id: string): { center: [number, number]; zoom: number } | null {
  return REGION_CENTERS[id] ?? null
}

export function initRegionIds(countryCodes: string[], regionName: string): string[] {
  if (countryCodes.length > 0) {
    const codeSet = new Set(countryCodes)
    const matched = REGION_OPTIONS.filter(r => r.codes.every(c => codeSet.has(c)))
    if (matched.length > 0) {
      const macros = matched.filter(r => r.type === 'macro')
      if (macros.length > 0) {
        const macroCodes = new Set(macros.flatMap(r => r.codes))
        const extras = matched.filter(r => r.type === 'country' && !r.codes.every(c => macroCodes.has(c)))
        return [...macros, ...extras].map(r => r.id)
      }
      return matched.map(r => r.id)
    }
  }
  if (regionName) {
    const lower = regionName.toLowerCase().trim()
    const exact = REGION_OPTIONS.find(r => r.name.toLowerCase() === lower)
    if (exact) return [exact.id]
    const partial = REGION_OPTIONS.find(r =>
      lower.includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(lower)
    )
    if (partial) return [partial.id]
  }
  return []
}

export function regionIdsToCountryCodes(ids: string[]): string[] {
  return [...new Set(
    REGION_OPTIONS.filter(r => ids.includes(r.id)).flatMap(r => r.codes)
  )]
}
