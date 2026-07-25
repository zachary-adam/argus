/** GeoJSON polygon ring for a circle on the map (lon/lat, radius in km). */
export function circlePolygon(lon: number, lat: number, radiusKm: number, steps = 64): number[][] {
  const R = 6371
  const coords: number[][] = []
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    const dLat = (radiusKm / R) * (180 / Math.PI)
    const dLon = (radiusKm / R) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180)
    coords.push([lon + dLon * Math.sin(angle), lat + dLat * Math.cos(angle)])
  }
  return coords
}

export function circleGeoJson(lon: number, lat: number, radiusKm: number) {
  return {
    type: 'Feature' as const,
    properties: { radiusKm },
    geometry: {
      type: 'Polygon' as const,
      coordinates: [circlePolygon(lon, lat, radiusKm)],
    },
  }
}
