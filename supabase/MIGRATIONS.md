# Supabase migrations

Run these **in order** on your Supabase project (SQL editor or CLI) before using cloud sync.

| Order | File | Tables / purpose |
|------:|------|------------------|
| 1 | `supabase/schema.sql` | `projects` — core project JSON |
| 2 | `supabase/migrations/20260622_intel_history.sql` | `intel_briefs`, `nlq_history` — AI brief + NLQ history |
| 3 | `supabase/migrations/20260629_plots.sql` | `plots` — map annotations (API backup) |
| 4 | `supabase/migrations/20260629_snapshots.sql` | `snapshots` — public share links |
| 5 | `supabase/migrations/20260701_research_journal.sql` | `journal_entries`, `hypothesis_revisions`, `event_paper_links` |
| 6 | `supabase/migrations/20260613_ai_usage_logs.sql` | `ai_usage_logs` — optional usage tracking |
| 7 | `supabase/migrations/20260613_ai_usage_logs_user_id.sql` | patch if you ran step 6 before user_id column existed |

## Verify

With `NEXT_PUBLIC_MODE=cloud` and Supabase env vars set:

```bash
curl -s http://localhost:3000/api/cloud/schema | jq
```

`ok: true` means all expected tables exist. Missing tables show in `missing`.

## Notes

- **Research journal** sync silently skips if migration 5 is missing — run it before relying on cloud journal sync.
- **Plots** persist in `project.plots` (project JSON) regardless; the `plots` table is a server-side backup for authenticated users.
- **Brief history** on mobile requires cloud auth + migration 2.
