export interface NlqHistoryRecord {
  id: string
  user_id: string | null
  project_id: string | null
  query: string
  summary: string
  applied_filters: string
  match_count: number
  created_at: string
}

export function nlqToMarkdown(record: NlqHistoryRecord): string {
  const when = new Date(record.created_at).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  return [
    `# NLQ — ${record.query}`,
    '',
    `**When:** ${when}`,
    record.applied_filters ? `**Filters:** ${record.applied_filters}` : '',
    `**Matches:** ${record.match_count}`,
    '',
    '## Summary',
    record.summary,
    '',
    '---',
    '*ARGUS map query (⌘K)*',
  ].filter(Boolean).join('\n')
}
