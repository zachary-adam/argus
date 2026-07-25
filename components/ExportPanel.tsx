'use client'
import { useState } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { useClosePanel } from '@/lib/hooks/useClosePanel'
import { X, Download, FileText, Table, Archive, CheckCircle, Loader, BookOpen, Sparkles, BookMarked } from 'lucide-react'
import { format } from 'date-fns'
import { formatCanvasMarkdown, formatCanvasHtml } from '@/lib/canvasExport'
import { formatForecastsMarkdown, formatPlotsMarkdown, forecastsToCSV, plotsToGeoJSON, formatForecastsHtml, formatPlotsHtml } from '@/lib/reportSections'
import { plotsForProject } from '@/lib/plotScope'
import { usePlotsStore } from '@/stores/plotsStore'
import { projectBriefToMarkdown } from '@/lib/briefMarkdown'
import { fetchProjectBrief, projectBriefToHtml } from '@/lib/fetchProjectBrief'
import { loadAnalysisEngine } from '@/lib/aiMode'
import { saveBriefToHistory } from '@/lib/saveBriefHistory'
import { journalKeyBriefMarkdown } from '@/lib/journal'
import { PanelShell } from '@/components/ui/PanelShell'
import type { CanvasACHNode } from '@/types/project'

type ExportState = 'idle' | 'loading' | 'done' | 'error'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function ExportPanel() {
  const { handleClose, closing } = useClosePanel('export')
  const { getActiveProject } = useProjectStore()
  const project = getActiveProject()
  const pushToast = useMapStore(s => s.pushToast)

  const [states, setStates] = useState<Record<string, ExportState>>({})
  const setState = (key: string, s: ExportState) => setStates(p => ({ ...p, [key]: s }))

  const dateStr = format(new Date(), 'yyyy-MM-dd')
  const slug = project ? slugify(project.name) : 'argus-export'

  const scopedPlots = () => {
    if (!project) return []
    const storePlots = plotsForProject(usePlotsStore.getState().plots, project.id)
    const localIds = new Set(storePlots.map(p => p.id))
    const extra = (project.plots ?? []).filter(p => !localIds.has(p.id))
    return [...storePlots, ...extra]
  }

  // ── CSV Events ──────────────────────────────────────────────────
  const exportEventsCSV = async () => {
    setState('csv', 'loading')
    try {
      const events = useMapStore.getState().events
      const headers = ['id', 'title', 'category', 'severity', 'country', 'countryCode', 'lat', 'lon', 'source', 'timestamp', 'url', 'fatalities', 'summary']
      const rows = events.map(e => [
        e.id, `"${e.title.replace(/"/g, '""')}"`, e.category, e.severity,
        `"${e.country}"`, e.countryCode, e.lat, e.lon, e.source,
        e.timestamp, e.url, (e as { fatalities?: number }).fatalities ?? '',
        `"${e.summary.replace(/"/g, '""')}"`,
      ])
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      downloadBlob(new Blob([csv], { type: 'text/csv' }), `${slug}-events-${dateStr}.csv`)
      setState('csv', 'done')
      setTimeout(() => setState('csv', 'idle'), 3000)
    } catch { setState('csv', 'error') }
  }

  // ── JSON Project Backup ──────────────────────────────────────────
  const exportProjectJSON = async () => {
    setState('json', 'loading')
    try {
      const { events, alerts } = useMapStore.getState()
      const payload = {
        exportedAt: new Date().toISOString(),
        argusVersion: '1.0',
        project,
        events,
        alerts,
        plots: scopedPlots(),
      }
      const json = JSON.stringify(payload, null, 2)
      downloadBlob(new Blob([json], { type: 'application/json' }), `${slug}-backup-${dateStr}.json`)
      setState('json', 'done')
      setTimeout(() => setState('json', 'idle'), 3000)
    } catch { setState('json', 'error') }
  }

  // ── Ledger CSV ───────────────────────────────────────────────────
  const exportLedgerCSV = async () => {
    if (!project) return
    setState('ledger', 'loading')
    try {
      const ledger = project.predictionLedger
      const headers = ['id', 'formulaName', 'timestamp', 'output', 'outputLabel', 'validatedOutcome', 'validationNote', 'narrative']
      const rows = ledger.map(e => [
        e.id, `"${e.formulaName}"`, e.timestamp, e.output, e.outputLabel,
        e.validatedOutcome ?? '', `"${(e.validationNote ?? '').replace(/"/g, '""')}"`,
        `"${(e.narrative ?? '').replace(/"/g, '""')}"`,
      ])
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      downloadBlob(new Blob([csv], { type: 'text/csv' }), `${slug}-ledger-${dateStr}.csv`)
      setState('ledger', 'done')
      setTimeout(() => setState('ledger', 'idle'), 3000)
    } catch { setState('ledger', 'error') }
  }

  const exportForecastsCSV = async () => {
    if (!project) return
    setState('forecasts', 'loading')
    try {
      const csv = forecastsToCSV(project.forecasts ?? [])
      downloadBlob(new Blob([csv], { type: 'text/csv' }), `${slug}-forecasts-${dateStr}.csv`)
      setState('forecasts', 'done')
      setTimeout(() => setState('forecasts', 'idle'), 3000)
    } catch { setState('forecasts', 'error') }
  }

  const exportPlotsGeoJSON = async () => {
    if (!project) return
    setState('plots', 'loading')
    try {
      const plots = scopedPlots()
      const json = plotsToGeoJSON(plots)
      downloadBlob(new Blob([json], { type: 'application/geo+json' }), `${slug}-plots-${dateStr}.geojson`)
      setState('plots', 'done')
      setTimeout(() => setState('plots', 'idle'), 3000)
    } catch { setState('plots', 'error') }
  }

  // ── Research Report (Markdown) ───────────────────────────────────
  const exportResearchReport = async () => {
    setState('report', 'loading')
    try {
      if (!project) throw new Error('No project')

      const { events, alerts } = useMapStore.getState()
      const eventMap = new Map([...events, ...(project.events ?? [])].map(e => [e.id, e]))
      const cases     = project.cases ?? []
      const incidents = project.incidents ?? []
      const ledger    = project.predictionLedger ?? []
      const forecasts = project.forecasts ?? []
      const plots     = scopedPlots()
      const achNodes  = (project.analyticalCanvas?.nodes ?? []).filter(n => n.type === 'ach') as CanvasACHNode[]
      const canvasMd  = formatCanvasMarkdown(project, events)
      const critEvents = events.filter(e => e.severity === 'critical')
      const highEvents = events.filter(e => e.severity === 'high')
      const topEvents  = [...critEvents, ...highEvents]
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .slice(0, 20)
      const dateLabel = format(new Date(), 'dd MMMM yyyy')

      const L: string[] = []
      const add = (...lines: string[]) => L.push(...lines)

      add(`# ${project.name}`, `*Research Report — ${dateLabel}*`, '')

      if (project.researchQuestion) {
        add('## Research Question', '', `> ${project.researchQuestion}`, '')
      }

      add('**Region:** ' + project.regionName +
        (project.goalTemplateId ? ' · **Goal:** ' + project.goalTemplateId.replace(/-/g, ' ') : '') +
        '  ', '')

      // Situation summary
      add('## Situation Summary', '',
        `- **${events.length}** events tracked  `,
        `- **${critEvents.length}** critical · **${highEvents.length}** high severity  `,
        alerts.length > 0 ? `- **${alerts.length}** correlation alerts  ` : '',
        '')

      // Cases
      if (cases.length > 0) {
        add('## Investigation Cases', '')
        for (const c of cases) {
          add(`### ${c.name}`, '')
          add(`**Status:** ${c.status.charAt(0).toUpperCase() + c.status.slice(1)}` +
            (c.researchQuestion ? ` · **Question:** ${c.researchQuestion}` : '') + '  ')
          if (c.notes.trim()) add('', '**Analyst Notes:**', '', c.notes)
          const caseEvs = c.eventIds.map(id => eventMap.get(id)).filter(Boolean) as typeof events
          if (caseEvs.length > 0) {
            add('', `**${caseEvs.length} linked events:**`, '')
            for (const ev of caseEvs) {
              const d = format(new Date(ev.timestamp), 'dd MMM yyyy')
              add(`- **[${(ev.severity ?? 'medium').toUpperCase()}]** ${ev.title} *(${ev.country}, ${d})*`)
              if (ev.summary) add(`  ${ev.summary.slice(0, 200).replace(/\n/g, ' ')}`)
              if (ev.url) add(`  ${ev.url}`)
            }
          }
          add('')
        }
      }

      // Analyst canvas (events, relationships, ACH)
      if (canvasMd.length > 0) {
        add(...canvasMd)
      } else if (achNodes.length > 0) {
        add('## Analysis of Competing Hypotheses', '')
        for (const ach of achNodes) {
          add('**Hypotheses:**', '')
          for (const h of ach.hypotheses) add(`- **${h.id.toUpperCase()}:** ${h.text}`)
          if (ach.narrative) add('', '**Analytical Judgment:**', '', `> ${ach.narrative}`)
          add('', `**Confidence Level:** ${ach.confidence}`, '')
        }
      }

      // Incidents
      if (incidents.length > 0) {
        add('## Tracked Incidents', '')
        for (const inc of incidents.filter(i => i.stage !== 'closed')) {
          add(`### ${inc.title}`, `**Stage:** ${inc.stage} · **Severity:** ${inc.severity}  `)
          if (inc.summary) add('', inc.summary)
          add('')
        }
      }

      // Key events timeline
      if (topEvents.length > 0) {
        add('## Key Events Timeline', '')
        for (const ev of topEvents) {
          const d = format(new Date(ev.timestamp), 'dd MMM yyyy')
          add(`**${d} · ${ev.title}**  `)
          add(`*${(ev.severity ?? '').toUpperCase()} · ${ev.source} · ${ev.country}*  `)
          if (ev.summary) add(ev.summary.slice(0, 300).replace(/\n/g, ' '))
          if (ev.url) add(`Source: ${ev.url}`)
          add('')
        }
      }

      // Formula results
      if (ledger.length > 0) {
        add('## Formula Analysis', '')
        for (const entry of ledger.slice(-5)) {
          add(`**${entry.formulaName}:** ${entry.output}/100 (${entry.outputLabel})`)
          if (entry.narrative) add(`> ${entry.narrative}`)
          add('')
        }
      }

      if (forecasts.length > 0) add(...formatForecastsMarkdown(forecasts))
      if (plots.length > 0) add(...formatPlotsMarkdown(plots))

      add('---', `*Generated by ARGUS · ${dateLabel}*`)

      const md = L.filter(l => l !== undefined).join('\n')
      downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${slug}-research-report-${dateStr}.md`)
      setState('report', 'done')
      setTimeout(() => setState('report', 'idle'), 3000)
    } catch { setState('report', 'error') }
  }

  // ── Journal rules brief (no AI) ─────────────────────────────────
  const exportJournalBrief = async () => {
    if (!project) return
    setState('journalbrief', 'loading')
    try {
      const md = journalKeyBriefMarkdown(project)
      downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${slug}-journal-brief-${dateStr}.md`)
      setState('journalbrief', 'done')
      pushToast({ title: 'Journal brief exported', body: 'Key evidence only — no AI synthesis', severity: 'info', type: 'system' })
      setTimeout(() => setState('journalbrief', 'idle'), 3000)
    } catch { setState('journalbrief', 'error') }
  }

  // ── AI intelligence brief ────────────────────────────────────────
  const exportAIBrief = async () => {
    if (!project) return
    setState('aibrief', 'loading')
    try {
      const { events, alerts, situations, flaggedAlerts } = useMapStore.getState()
      const data = await fetchProjectBrief(
        project,
        { events, alerts, situations, flaggedAlerts },
        usePlotsStore.getState().plots,
        loadAnalysisEngine(project.aiMode),
      )
      if (!data.ok) {
        const body = [data.error, data.hint].filter(Boolean).join(' — ')
        throw new Error(body || 'Brief request failed')
      }
      if (data.warning || data.offline) {
        pushToast({
          title: 'Rules-based brief',
          body: data.warning ?? 'AI unavailable — category/rules brief generated instead.',
          severity: 'medium',
          type: 'system',
        })
      }
      void saveBriefToHistory({
        type: 'project',
        title: `${project.name} intelligence brief`,
        country: project.regionName,
        projectId: project.id,
        brief: data.brief as unknown as Record<string, unknown>,
      })
      const md = projectBriefToMarkdown(data.brief, {
        projectName: project.name,
        regionName: project.regionName,
        researchQuestion: project.researchQuestion,
        generatedAt: format(new Date(), 'dd MMMM yyyy HH:mm'),
      })
      downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${slug}-intelligence-brief-${dateStr}.md`)
      setState('aibrief', 'done')
      setTimeout(() => setState('aibrief', 'idle'), 3000)
    } catch (err) {
      setState('aibrief', 'error')
      const msg = err instanceof Error ? err.message : 'Could not generate AI brief'
      pushToast({
        title: 'Brief failed',
        body: msg.includes('key') || msg.includes('AI_KEYS') || msg.includes('Sign in')
          ? msg
          : `${msg}. Check AI mode and API keys in Settings.`,
        severity: 'high',
        type: 'system',
      })
    }
  }

  // ── PDF Brief via print ──────────────────────────────────────────
  const exportPDF = async () => {
    setState('pdf', 'loading')
    try {
      if (!project) throw new Error('No project')

      const { events, alerts } = useMapStore.getState()
      const eventMap   = new Map([...events, ...(project.events ?? [])].map(e => [e.id, e]))
      const cases      = project.cases ?? []
      const incidents  = project.incidents ?? []
      const achNodes   = (project.analyticalCanvas?.nodes ?? []).filter(n => n.type === 'ach') as CanvasACHNode[]
      const forecasts  = project.forecasts ?? []
      const plots      = scopedPlots()
      const escH = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      const canvasHtml = formatCanvasHtml(project, events, escH)
      const critEvents = events.filter(e => e.severity === 'critical')
      const highEvents = events.filter(e => e.severity === 'high')
      const topEvents  = [...critEvents, ...highEvents]
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .slice(0, 15)
      const dateLabel  = format(new Date(), 'dd MMMM yyyy HH:mm')

      let aiBriefHtml = ''
      try {
        const { events: ev2, alerts: al2, situations: sit2, flaggedAlerts: fa2 } = useMapStore.getState()
        const briefRes = await fetchProjectBrief(
          project,
          { events: ev2, alerts: al2, situations: sit2, flaggedAlerts: fa2 },
          scopedPlots(),
          loadAnalysisEngine(project.aiMode),
        )
        if (briefRes.ok) {
          aiBriefHtml = projectBriefToHtml(briefRes.brief, escH)
        }
      } catch { /* PDF still works without AI section */ }

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Research Report — ${escH(project.name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; color: #0f172a; background: white; padding: 40px 52px; max-width: 820px; margin: 0 auto; }
  .banner { text-align: center; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; padding: 6px 0; font-size: 8pt; font-weight: bold; letter-spacing: 0.2em; margin-bottom: 28px; font-family: sans-serif; }
  h1 { font-size: 20pt; font-weight: bold; margin-bottom: 6px; }
  h2 { font-size: 13pt; font-weight: bold; margin: 22px 0 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
  h3 { font-size: 11pt; font-weight: bold; margin: 14px 0 4px; }
  .meta { font-size: 9pt; color: #475569; margin-bottom: 8px; font-family: sans-serif; }
  .rq { font-size: 12pt; font-style: italic; color: #1e3a8a; border-left: 4px solid #1e3a8a; padding: 8px 14px; background: #f0f6ff; margin: 10px 0 18px; line-height: 1.6; }
  .stats { display: flex; gap: 20px; margin: 10px 0 16px; font-family: sans-serif; }
  .stat { text-align: center; padding: 8px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
  .stat-num { font-size: 20pt; font-weight: bold; color: #1e3a8a; }
  .stat-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; }
  .event { margin-bottom: 10px; padding: 8px 12px; border-left: 3px solid #1e3a8a; background: #f8fafc; }
  .event-sev { font-size: 8pt; font-weight: bold; text-transform: uppercase; color: #1e3a8a; font-family: sans-serif; margin-bottom: 2px; }
  .event-title { font-weight: bold; font-size: 11pt; margin-bottom: 4px; }
  .event-body { font-size: 10pt; color: #334155; line-height: 1.55; }
  .event-meta { font-size: 8pt; color: #94a3b8; margin-top: 4px; font-family: sans-serif; }
  .case-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; margin-bottom: 12px; }
  .case-header { font-size: 8pt; font-family: sans-serif; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: #7c3aed; margin-bottom: 4px; }
  .case-notes { font-size: 10pt; color: #334155; line-height: 1.6; background: #fafafa; border: 1px solid #e2e8f0; padding: 8px 10px; border-radius: 4px; margin: 6px 0; white-space: pre-wrap; }
  .ach-hyp { padding: 4px 0; border-bottom: 1px solid #f1f5f9; font-size: 10pt; }
  .ach-conf { font-size: 9pt; font-weight: bold; font-family: sans-serif; text-transform: uppercase; margin-top: 8px; color: #475569; }
  .narrative { font-style: italic; color: #334155; border-left: 3px solid #7c3aed; padding: 6px 12px; background: #faf5ff; margin: 8px 0; font-size: 10pt; line-height: 1.6; }
  .bluf { font-size: 13pt; font-weight: 700; color: #1e3a8a; border-left: 4px solid #1e3a8a; padding: 10px 14px; background: #f0f6ff; margin: 12px 0 16px; line-height: 1.55; }
  p { line-height: 1.65; margin-bottom: 8px; font-size: 11pt; }
  @media print { body { padding: 20px 28px; } }
</style>
</head>
<body>
  <div class="banner">ARGUS RESEARCH REPORT · ${escH(project.name.toUpperCase())}</div>

  <h1>${escH(project.name)}</h1>
  <div class="meta">Region: ${escH(project.regionName)}${project.goalTemplateId ? ` &nbsp;·&nbsp; Goal: ${project.goalTemplateId.replace(/-/g,' ')}` : ''} &nbsp;·&nbsp; Generated: ${dateLabel}</div>

  ${project.researchQuestion ? `<div class="rq">${escH(project.researchQuestion)}</div>` : ''}

  ${aiBriefHtml}

  <h2>Situation Overview</h2>
  <div class="stats">
    <div class="stat"><div class="stat-num">${events.length}</div><div class="stat-label">Events</div></div>
    <div class="stat"><div class="stat-num" style="color:#dc2626">${critEvents.length}</div><div class="stat-label">Critical</div></div>
    <div class="stat"><div class="stat-num" style="color:#ea580c">${highEvents.length}</div><div class="stat-label">High</div></div>
    ${alerts.length > 0 ? `<div class="stat"><div class="stat-num">${alerts.length}</div><div class="stat-label">Alerts</div></div>` : ''}
    ${cases.length > 0 ? `<div class="stat"><div class="stat-num">${cases.length}</div><div class="stat-label">Cases</div></div>` : ''}
  </div>

  ${cases.length > 0 ? `
  <h2>Investigation Cases</h2>
  ${cases.map(c => {
    const cEvs = c.eventIds.map(id => eventMap.get(id)).filter(Boolean) as typeof events
    return `<div class="case-box">
      <div class="case-header">${escH(c.status.toUpperCase())} · ${cEvs.length} event${cEvs.length !== 1 ? 's' : ''}</div>
      <h3>${escH(c.name)}</h3>
      ${c.researchQuestion ? `<p style="font-style:italic;color:#475569;font-size:10pt">${escH(c.researchQuestion)}</p>` : ''}
      ${c.notes.trim() ? `<div class="case-notes">${escH(c.notes)}</div>` : ''}
      ${cEvs.length > 0 ? `<ul style="margin:8px 0 0 16px;font-size:10pt;color:#334155">${cEvs.map(ev => `<li><strong>${escH(ev.title)}</strong> <span style="color:#64748b;font-size:9pt">(${escH(ev.country ?? '')}, ${format(new Date(ev.timestamp), 'dd MMM yyyy')})</span></li>`).join('')}</ul>` : ''}
    </div>`
  }).join('')}` : ''}

  ${canvasHtml || (achNodes.length > 0 ? `
  <h2>Analysis of Competing Hypotheses</h2>
  ${achNodes.map(ach => `
    ${ach.hypotheses.map(h => `<div class="ach-hyp"><strong>${escH(h.id.toUpperCase())}:</strong> ${escH(h.text)}</div>`).join('')}
    ${ach.narrative ? `<div class="narrative">${escH(ach.narrative)}</div>` : ''}
    <div class="ach-conf">Confidence: ${ach.confidence}</div>
  `).join('')}` : '')}

  ${topEvents.length > 0 ? `
  <h2>Key Events Timeline</h2>
  ${topEvents.map(e => `
    <div class="event">
      <div class="event-sev">${(e.severity ?? '').toUpperCase()} · ${escH(e.source ?? '')} · ${escH(e.country ?? '')}</div>
      <div class="event-title">${escH(e.title)}</div>
      <div class="event-body">${escH(e.summary?.slice(0, 350) ?? '')}</div>
      <div class="event-meta">${format(new Date(e.timestamp), 'dd MMM yyyy HH:mm')}${e.url ? ` · <a href="${escH(e.url)}">${escH(e.url.slice(0, 80))}</a>` : ''}</div>
    </div>
  `).join('')}` : ''}

  ${incidents.filter(i => i.stage !== 'closed').length > 0 ? `
  <h2>Tracked Incidents</h2>
  ${incidents.filter(i => i.stage !== 'closed').map(inc => `
    <div class="event" style="border-left-color:#dc2626">
      <div class="event-sev" style="color:#dc2626">${escH(inc.stage.toUpperCase())} · ${escH(inc.severity)}</div>
      <div class="event-title">${escH(inc.title)}</div>
      ${inc.summary ? `<div class="event-body">${escH(inc.summary)}</div>` : ''}
    </div>
  `).join('')}` : ''}

  ${project.predictionLedger.length > 0 ? `
  <h2>Formula Analysis</h2>
  ${project.predictionLedger.slice(-5).map(e => `
    <p><strong>${escH(e.formulaName)}:</strong> ${e.output}/100 (${escH(e.outputLabel)})
    ${e.validatedOutcome ? ` — Validated: ${escH(e.validatedOutcome.toUpperCase())}` : ' — Pending validation'}
    ${e.narrative ? `<br><em>"${escH(e.narrative)}"</em>` : ''}</p>
  `).join('')}` : ''}

  ${formatForecastsHtml(forecasts, escH)}
  ${formatPlotsHtml(plots, escH)}

  <div class="banner">ARGUS · ${dateStr}</div>
</body>
</html>`

      const win = window.open('', '_blank', 'width=900,height=700')
      if (!win) throw new Error('Popup blocked')
      win.document.write(html)
      win.document.close()
      win.focus()
      setTimeout(() => { win.print() }, 500)

      setState('pdf', 'done')
      setTimeout(() => setState('pdf', 'idle'), 3000)
    } catch { setState('pdf', 'error') }
  }

  const { events: _ev, alerts: _al } = useMapStore.getState()

  type ExportItem = {
    key: string
    icon: typeof Sparkles
    iconClass: string
    label: string
    description: string
    action: () => void | Promise<void>
    disabled?: boolean
    primary?: boolean
  }

  const REPORT_PRIMARY: ExportItem[] = [
    {
      key: 'aibrief',
      icon: Sparkles,
      iconClass: 'ui-export-row__icon ui-export-row__icon--accent',
      label: 'Intelligence brief',
      description: 'Short situation brief from your events, notes, and research question — with sources',
      action: exportAIBrief,
      disabled: !project,
      primary: true,
    },
    {
      key: 'journalbrief',
      icon: BookMarked,
      iconClass: 'ui-export-row__icon',
      label: 'Journal memo',
      description: 'Only the evidence you marked as key — no AI writing',
      action: exportJournalBrief,
      disabled: !project || !(project.journal ?? []).some(e => e.significance === 'key'),
    },
  ]

  const REPORT_MORE: ExportItem[] = [
    {
      key: 'report',
      icon: BookOpen,
      iconClass: 'ui-export-row__icon',
      label: 'Research report',
      description: 'Full write-up as Markdown — edit in any text app',
      action: exportResearchReport,
    },
    {
      key: 'pdf',
      icon: FileText,
      iconClass: 'ui-export-row__icon',
      label: 'Print / PDF',
      description: `Printable report${_al.length ? ` · ${_al.length} alert${_al.length === 1 ? '' : 's'}` : ''}`,
      action: exportPDF,
    },
  ]

  const DATA_PRIMARY: ExportItem[] = [
    {
      key: 'json',
      icon: Archive,
      iconClass: 'ui-export-row__icon ui-export-row__icon--backup',
      label: 'Project backup',
      description: 'Everything in one JSON file — restore or move the project later',
      action: exportProjectJSON,
    },
    {
      key: 'csv',
      icon: Table,
      iconClass: 'ui-export-row__icon ui-export-row__icon--data',
      label: 'Events spreadsheet',
      description: `${_ev.length} event${_ev.length === 1 ? '' : 's'} as CSV (title, place, time, source)`,
      action: exportEventsCSV,
    },
  ]

  const DATA_ADVANCED: ExportItem[] = [
    {
      key: 'ledger',
      icon: Table,
      iconClass: 'ui-export-row__icon ui-export-row__icon--ledger',
      label: 'Score history',
      description: `${project?.predictionLedger.length ?? 0} recorded scores`,
      action: exportLedgerCSV,
      disabled: !project?.predictionLedger.length,
    },
    {
      key: 'forecasts',
      icon: Table,
      iconClass: 'ui-export-row__icon ui-export-row__icon--data',
      label: 'Forecasts spreadsheet',
      description: `${project?.forecasts?.length ?? 0} forecasts with due dates`,
      action: exportForecastsCSV,
      disabled: !(project?.forecasts?.length),
    },
    {
      key: 'plots',
      icon: Table,
      iconClass: 'ui-export-row__icon ui-export-row__icon--data',
      label: 'Map plots (GeoJSON)',
      description: `${project ? scopedPlots().length : 0} annotations for GIS tools`,
      action: exportPlotsGeoJSON,
      disabled: !project || scopedPlots().length === 0,
    },
  ]

  function renderExportRow({ key, icon: Icon, iconClass, label, description, action, disabled, primary }: ExportItem) {
    const s = states[key] ?? 'idle'
    const btnTone =
      s === 'error' ? 'ui-btn--danger-ghost'
      : primary && s === 'idle' ? 'ui-btn--primary'
      : 'ui-btn--ghost'
    return (
      <div key={key} className={`ui-export-row${disabled ? ' ui-export-row--disabled' : ''}${s === 'error' ? ' ui-export-row--error' : ''}`}>
        <div className={iconClass} aria-hidden="true">
          <Icon size={15} />
        </div>
        <div className="ui-export-row__copy">
          <div className="ui-export-row__title">{label}</div>
          <div className="ui-export-row__desc">{description}</div>
          {s === 'error' && (
            <div className="ui-callout ui-callout--error" style={{ fontSize: 10, marginTop: 8, padding: '6px 10px' }}>
              Export failed — allow downloads{key === 'pdf' ? ' and pop-ups' : ''} in your browser.
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={action}
          disabled={s === 'loading' || disabled}
          className={`ui-btn ${btnTone} ui-export-row__action`}
          style={{
            ...(s === 'done' ? { background: 'var(--low)', border: 'none', color: '#fff' } : {}),
            ...(s === 'loading' ? { opacity: 0.7 } : {}),
          }}
        >
          {s === 'loading' && <Loader size={11} style={{ animation: 'spin 0.8s linear infinite' }} />}
          {s === 'done' && <CheckCircle size={11} />}
          {(s === 'idle' || s === 'error') && <Download size={11} />}
          {s === 'loading' ? 'Working…' : s === 'done' ? 'Done' : s === 'error' ? 'Retry' : 'Export'}
        </button>
      </div>
    )
  }

  function renderSection(label: string, items: ExportItem[]) {
    return (
      <section className="ui-export__section">
        <div className="ui-section-label">{label}</div>
        <div className="ui-export__group">
          {items.map(renderExportRow)}
        </div>
      </section>
    )
  }

  return (
    <div className="ui-modal-overlay" onClick={handleClose}>
      <div
        className={`ui-command-palette panel-slide-in${closing ? ' panel-closing' : ''}`}
        style={{ width: 'min(560px, 94vw)', maxHeight: 'min(680px, 90vh)', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <PanelShell
          kicker="Output"
          title="Export"
          subtitle={project ? `${project.name} · ${dateStr}` : undefined}
          actions={
            <button type="button" onClick={handleClose} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
              <X size={14} />
            </button>
          }
          footer={
            <>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Runs on your machine — nothing is uploaded.
              </span>
              <button
                type="button"
                className="ui-link"
                style={{ fontSize: 10, marginLeft: 'auto' }}
                onClick={() => { useMapStore.getState().openBriefHistory(); handleClose() }}
              >
                Brief history →
              </button>
            </>
          }
        >
          <div className="ui-export">
            {!project && (
              <p className="ui-export__hint">
                Open a project to export briefs and a full backup.
              </p>
            )}
            {renderSection('Briefs', REPORT_PRIMARY)}
            {renderSection('Reports', REPORT_MORE)}
            {renderSection('Backup', DATA_PRIMARY)}
            <details className="ui-export__advanced">
              <summary>Advanced</summary>
              <div className="ui-export__group">
                {DATA_ADVANCED.map(renderExportRow)}
              </div>
            </details>
          </div>
        </PanelShell>
      </div>
    </div>
  )
}
