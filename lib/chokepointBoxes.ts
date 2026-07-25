/** AIS bounding box: [[south, west], [north, east]] in [lat, lon]. */
export type ChokepointBox = [[number, number], [number, number]]

export type ChokepointDefinition = {
  name: string
  box: ChokepointBox
  description: string
}

/** Strategic maritime chokepoints — shared by vessel AIS coverage and map markers. */
export const CHOKEPOINT_DEFINITIONS: ChokepointDefinition[] = [
  { name: 'Strait of Hormuz', box: [[24.0, 55.5], [28.5, 59.5]], description: 'Critical oil transit — ~21% of global petroleum liquids' },
  { name: 'Bab-el-Mandeb', box: [[12.5, 43.0], [12.8, 43.5]], description: 'Red Sea gateway — Houthi threat zone' },
  { name: 'Suez Canal', box: [[30.0, 32.3], [31.3, 32.4]], description: 'Key trade route — ~12% of global trade' },
  { name: 'Strait of Gibraltar', box: [[36.0, 5.3], [36.1, -5.6]], description: 'Mediterranean–Atlantic gateway' },
  { name: 'Strait of Malacca', box: [[1.2, 103.5], [1.4, 104.0]], description: 'Asia-Pacific oil corridor' },
  { name: 'Panama Canal', box: [[9.0, -79.7], [9.4, -79.9]], description: 'Americas trade nexus' },
  { name: 'Dardanelles', box: [[40.0, 26.0], [40.5, 26.7]], description: 'Black Sea–Mediterranean link' },
  { name: 'Bosphorus Strait', box: [[41.0, 29.0], [41.3, 29.1]], description: 'Istanbul strait — grain & energy transit' },
  { name: 'Sunda Strait', box: [[-5.9, 105.9], [-6.6, 105.3]], description: 'Indonesia archipelago passage' },
  { name: 'Lombok Strait', box: [[-8.4, 115.6], [-8.9, 116.0]], description: 'Deep-draft Indonesia alternative to Sunda' },
  { name: 'Danish Straits (Great Belt)', box: [[55.5, 10.5], [56.2, 11.0]], description: 'Baltic–North Sea access' },
  { name: 'Strait of Sicily', box: [[35.9, 14.3], [37.0, 15.0]], description: 'Central Mediterranean corridor' },
  { name: 'Aegean approaches', box: [[35.0, 23.0], [36.0, 26.0]], description: 'Eastern Mediterranean shipping lane' },
  { name: 'Gulf of Aden', box: [[12.0, 44.0], [12.7, 45.0]], description: 'Somalia piracy & interdiction zone' },
  { name: 'Red Sea (northern approach)', box: [[21.5, 38.0], [27.0, 34.5]], description: 'Suez northern approach — conflict spillover risk' },
  { name: 'Galleons Passage', box: [[10.5, -61.0], [11.0, -61.9]], description: 'Trinidad–Tobago offshore corridor' },
  { name: 'Mona Passage', box: [[18.2, -68.0], [18.6, -67.8]], description: 'Puerto Rico–Dominican Republic strait' },
  { name: 'Windward Passage', box: [[19.7, -74.0], [20.1, -73.5]], description: 'Cuba–Haiti passage — Caribbean transit' },
  { name: 'Cabot Strait', box: [[45.0, -60.0], [47.5, -59.3]], description: 'Gulf of St. Lawrence access' },
  { name: 'Irish Sea approaches', box: [[53.0, -5.5], [54.5, -4.5]], description: 'UK–Ireland maritime corridor' },
  { name: 'Dover Strait (English Channel)', box: [[50.9, 1.4], [51.1, 1.6]], description: 'Busiest shipping lane in the world' },
  { name: 'Denmark Strait', box: [[65.5, -37.0], [66.5, -34.0]], description: 'North Atlantic–Arctic gateway' },
  { name: 'Faroe-Shetland Gap', box: [[60.0, -6.0], [62.0, -4.0]], description: 'GIUK approaches — submarine corridor' },
  { name: 'Drake Passage', box: [[-54.5, -68.0], [-55.9, -67.0]], description: 'Southern Ocean transit — Cape Horn alternative' },
  { name: 'Strait of Magellan', box: [[-52.5, -70.0], [-53.9, -70.5]], description: 'Patagonia passage — weather-exposed route' },
  { name: 'Gulf of Tonkin / Hainan Strait', box: [[12.6, 109.0], [21.0, 108.0]], description: 'South China Sea northern approaches' },
  { name: 'Taiwan Strait', box: [[22.0, 119.0], [25.5, 122.0]], description: 'PRC–Taiwan flashpoint — semiconductor supply risk' },
  { name: 'Korea/Tsushima Strait', box: [[33.0, 129.0], [34.5, 130.0]], description: 'Japan–Korea maritime corridor' },
  { name: 'La Pérouse (Sōya) Strait', box: [[45.5, 141.5], [46.0, 142.0]], description: 'Hokkaido–Sakhalin passage' },
  { name: 'Mindoro/Verde Island Passage', box: [[11.0, 119.5], [13.0, 121.0]], description: 'Philippines internal passage' },
  { name: 'Strait of Hormuz (inner Larak)', box: [[26.0, 56.0], [26.7, 56.5]], description: 'Hormuz narrow channel — Larak Island sector' },
  { name: 'Hanish Islands passage', box: [[13.5, 42.5], [14.0, 42.8]], description: 'Red Sea Bab-el-Mandeb approaches' },
]

export function chokepointCentroid(box: ChokepointBox): { lat: number; lon: number } {
  const [[latMin, lonMin], [latMax, lonMax]] = box
  return { lat: (latMin + latMax) / 2, lon: (lonMin + lonMax) / 2 }
}

/** Lon/lat ring for map polygon layers. */
export function chokepointBoxPolygon(box: ChokepointBox): number[][] {
  const [[latMin, lonMin], [latMax, lonMax]] = box
  return [
    [lonMin, latMin],
    [lonMax, latMin],
    [lonMax, latMax],
    [lonMin, latMax],
    [lonMin, latMin],
  ]
}

export function chokepointsFeatureCollection() {
  return {
    type: 'FeatureCollection' as const,
    features: CHOKEPOINT_DEFINITIONS.map((d, i) => ({
      type: 'Feature' as const,
      id: i,
      properties: { name: d.name, description: d.description },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [chokepointBoxPolygon(d.box)],
      },
    })),
  }
}

/** Map markers + correlation proximity checks. */
export const CHOKEPOINTS = CHOKEPOINT_DEFINITIONS.map(({ name, box, description }) => {
  const { lat, lon } = chokepointCentroid(box)
  return { name, lat, lon, description }
})

/** AISStream / focused vessel subscription boxes. */
export const CHOKEPOINT_BOXES: ChokepointBox[] = CHOKEPOINT_DEFINITIONS.map(d => d.box)

/** Broader ocean corridors between chokepoints (focused AIS coverage). */
export const MARITIME_CORRIDOR_BOXES: ChokepointBox[] = [
  [[35.0, -75.0], [55.0, -10.0]],   // North Atlantic main lane
  [[45.0, -65.0], [50.0, -55.0]],   // Canadian Maritimes
  [[30.0, -6.0], [38.0, 6.0]],      // Western Mediterranean
  [[30.0, 6.0], [38.0, 30.0]],      // Central Mediterranean
  [[-5.0, 38.0], [15.0, 60.0]],     // NW Indian Ocean
  [[-30.0, 30.0], [5.0, 80.0]],     // Indian Ocean central
  [[-35.0, 15.0], [-25.0, 35.0]],   // Cape of Good Hope
  [[18.0, 108.0], [25.0, 122.0]],   // South China Sea
  [[20.0, -160.0], [50.0, -120.0]], // North Pacific
  [[15.0, -90.0], [30.0, -60.0]],   // Caribbean / Gulf of Mexico
  [[68.0, 6.0], [95.0, 28.0]],      // India + northern subcontinent
  [[80.0, 5.0], [95.0, 20.0]],     // Bay of Bengal
  [[58.0, 18.0], [75.0, 30.0]],    // Arabian Sea
]

export const FOCUSED_VESSEL_BOXES: ChokepointBox[] = [
  ...CHOKEPOINT_BOXES,
  ...MARITIME_CORRIDOR_BOXES,
]

/** REST fallback hotspots as [minLon, minLat, maxLon, maxLat]. */
export const REST_VESSEL_HOTSPOTS: [number, number, number, number][] = [
  ...CHOKEPOINT_DEFINITIONS.slice(0, 8).map(({ box }) => {
    const [[latMin, lonMin], [latMax, lonMax]] = box
    return [lonMin, latMin, lonMax, latMax] as [number, number, number, number]
  }),
  [68.0, 6.0, 95.0, 28.0],   // India / LAC maritime approaches
  [80.0, 5.0, 95.0, 22.0],   // Bay of Bengal
  [58.0, 18.0, 75.0, 26.0],  // Arabian Sea
]
