import type { Project } from '@/types/project'

export interface BriefInputCounts {
  paperLinks: number
  journalEntries: number
  cases: number
  hypotheses: number
}

export function countBriefInputs(project: Project | null | undefined): BriefInputCounts {
  if (!project) {
    return { paperLinks: 0, journalEntries: 0, cases: 0, hypotheses: 0 }
  }
  return {
    paperLinks: project.eventPaperLinks?.length ?? 0,
    journalEntries: (project.journal ?? []).length,
    cases: (project.cases ?? []).filter(c => c.status !== 'closed').length,
    hypotheses: project.hypothesisLog?.length ?? 0,
  }
}

/** One-line summary for brief generation UI. */
export function formatBriefInputsLine(project: Project | null | undefined): string | null {
  const c = countBriefInputs(project)
  const parts: string[] = []
  if (c.paperLinks > 0) parts.push(`${c.paperLinks} paper link${c.paperLinks === 1 ? '' : 's'}`)
  if (c.journalEntries > 0) parts.push(`${c.journalEntries} journal ${c.journalEntries === 1 ? 'entry' : 'entries'}`)
  if (c.cases > 0) parts.push(`${c.cases} open case${c.cases === 1 ? '' : 's'}`)
  if (c.hypotheses > 0) parts.push(`${c.hypotheses} hypothesis note${c.hypotheses === 1 ? '' : 's'}`)
  if (parts.length === 0) return null
  return `AI will also use your: ${parts.join(' · ')}`
}
