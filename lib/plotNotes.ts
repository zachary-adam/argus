// Strip legacy capture markers that older recon plots stuffed into the notes
// string (a full base64 image, or a Static Maps URL that embedded the API key)
// so they don't render as a wall of text / leak the key. New captures store the
// image in plot.properties.snapshot instead.
export function cleanNotes(notes?: string): string {
  if (!notes) return ''
  return notes
    .split('\n')
    .filter(l => !l.startsWith('[SNAPSHOT_B64]') && !l.startsWith('[SATELLITE_URL]') && !l.startsWith('SNAPSHOT:'))
    .join('\n')
    .trim()
}
