import { format } from 'date-fns'
import type { Plot } from '@/types'
import type { Forecast } from '@/lib/forecasting'

export function formatForecastsMarkdown(forecasts: Forecast[]): string[] {
  if (!forecasts.length) return []
  const lines = ['## Forecasts', '']
  for (const f of forecasts) {
    const due = format(new Date(f.dueDate), 'dd MMM yyyy')
    const pct = Math.round(f.probability * 100)
    const status = f.resolved
      ? (f.outcome === 1 ? '✓ happened' : '✗ did not happen')
      : 'open'
    lines.push(`- **${pct}%** · ${f.statement} *(due ${due} · ${status})*`)
    if (f.basis) lines.push(`  ${f.basis}`)
  }
  lines.push('')
  return lines
}

export function formatPlotsMarkdown(plots: Plot[]): string[] {
  if (!plots.length) return []
  const lines = ['## Map Plots', '']
  for (const p of plots) {
    const threat = p.properties?.threat_level ?? 'info'
    const cat = p.properties?.category ?? 'custom'
    lines.push(`- **${p.label ?? p.type}** (${p.type} · ${cat} · ${threat})`)
    if (p.properties?.notes) lines.push(`  ${p.properties.notes}`)
  }
  lines.push('')
  return lines
}

export function plotsToGeoJSON(plots: Plot[]): string {
  const features = plots.map(p => {
    const geometry = p.type === 'point'
      ? { type: 'Point' as const, coordinates: p.coordinates as number[] }
      : { type: 'Polygon' as const, coordinates: [p.coordinates as number[][]] }
    return {
      type: 'Feature' as const,
      properties: {
        id: p.id,
        label: p.label,
        type: p.type,
        ...p.properties,
      },
      geometry,
    }
  })
  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2)
}

export function forecastsToCSV(forecasts: Forecast[]): string {
  const headers = ['id', 'statement', 'probability', 'dueDate', 'createdAt', 'resolved', 'outcome', 'resolvedAt', 'basis']
  const rows = forecasts.map(f => [
    f.id,
    `"${f.statement.replace(/"/g, '""')}"`,
    f.probability,
    f.dueDate,
    f.createdAt,
    f.resolved ? 'true' : 'false',
    f.outcome ?? '',
    f.resolvedAt ?? '',
    `"${(f.basis ?? '').replace(/"/g, '""')}"`,
  ])
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
}

export function formatForecastsHtml(forecasts: Forecast[], esc: (s: string) => string): string {
  if (!forecasts.length) return ''
  const items = forecasts.map(f => {
    const due = format(new Date(f.dueDate), 'dd MMM yyyy')
    const pct = Math.round(f.probability * 100)
    const status = f.resolved
      ? (f.outcome === 1 ? 'Happened' : 'Did not happen')
      : 'Open'
    return `<li><strong>${pct}%</strong> · ${esc(f.statement)} <span style="color:#64748b;font-size:9pt">(due ${due} · ${status})</span></li>`
  }).join('')
  return `<h2>Forecasts</h2><ul style="margin:0 0 12px 18px;font-size:10pt;color:#334155;line-height:1.6">${items}</ul>`
}

export function formatPlotsHtml(plots: Plot[], esc: (s: string) => string): string {
  if (!plots.length) return ''
  const items = plots.map(p => {
    const threat = p.properties?.threat_level ?? 'info'
    const cat = p.properties?.category ?? 'custom'
    const label = esc(p.label ?? p.type)
    const notes = p.properties?.notes ? `<div style="font-size:9pt;color:#64748b;margin-top:2px">${esc(p.properties.notes)}</div>` : ''
    return `<li><strong>${label}</strong> <span style="color:#64748b;font-size:9pt">(${p.type} · ${cat} · ${threat})</span>${notes}</li>`
  }).join('')
  return `<h2>Map Plots</h2><ul style="margin:0 0 12px 18px;font-size:10pt;color:#334155;line-height:1.55">${items}</ul>`
}
