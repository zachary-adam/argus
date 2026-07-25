'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import nextDynamic from 'next/dynamic'
import { useProjectStore } from '@/stores/projectStore'
import { ArgusMark } from '@/components/ArgusMark'
import { Toaster } from '@/components/Toaster'
import { ArrowLeft } from 'lucide-react'

const BriefHistoryPanel = nextDynamic(
  () => import('@/components/BriefHistoryPanel'),
  { ssr: false },
)

export default function MobileBriefPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const { projects, openProject } = useProjectStore()
  const project = projects.find(p => p.id === projectId)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const unsub = useProjectStore.persist.onFinishHydration(() => setHydrated(true))
    if (useProjectStore.persist.hasHydrated()) setHydrated(true)
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const state = useProjectStore.getState()
    const p = state.projects.find(x => x.id === projectId)
    if (!p) {
      router.replace('/')
      return
    }
    if (state.activeProjectId !== projectId) {
      openProject(projectId)
    }
    document.title = `${p.name} — Briefs`
  }, [hydrated, projectId, openProject, router])

  if (!hydrated) {
    return (
      <div className="mobile-brief-page">
        <div className="home-list-skeleton" style={{ padding: 16 }} aria-hidden>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="home-list-skeleton__row" />
          ))}
        </div>
      </div>
    )
  }

  if (!project) return null

  return (
    <div className="mobile-brief-page">
      <header className="mobile-brief-page__topbar">
        <button type="button" className="ui-back" onClick={() => router.push('/')}>
          <ArrowLeft size={14} /> Projects
        </button>
        <div className="mobile-brief-page__brand">
          <ArgusMark size={22} variant="onLight" />
          <span className="ui-wordmark ui-wordmark--sm">ARGUS</span>
        </div>
      </header>
      <BriefHistoryPanel variant="page" projectName={project.name} onBack={() => router.push('/')} />
      <Toaster />
    </div>
  )
}
