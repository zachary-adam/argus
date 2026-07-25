'use client'
import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { IS_CLOUD_MODE } from '@/lib/supabase/config'

type SchemaResponse = { ok: boolean; missing: string[]; mode?: string }

export function CloudSchemaBanner() {
  const [status, setStatus] = useState<SchemaResponse | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!IS_CLOUD_MODE) return
    fetch('/api/cloud/schema')
      .then(r => r.ok ? r.json() : null)
      .then((d: SchemaResponse | null) => { if (d && !d.ok) setStatus(d) })
      .catch(() => {})
  }, [])

  if (!status || status.ok || dismissed) return null

  return (
    <div className="ui-cloud-schema-banner" role="status">
      <AlertTriangle size={14} aria-hidden />
      <span>
        Cloud database incomplete — missing tables: <strong>{status.missing.join(', ')}</strong>.
        Run migrations in <code>supabase/MIGRATIONS.md</code>.
      </span>
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon" onClick={() => setDismissed(true)} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  )
}
