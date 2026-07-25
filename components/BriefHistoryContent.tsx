'use client'
import type { CanvasBriefResponse } from '@/types/canvasBrief'
import type { CountryBriefData, ProjectBriefData } from '@/types/brief'
import type { BriefHistoryRecord } from '@/lib/briefRender'
import type { NlqHistoryRecord } from '@/lib/nlqHistory'

function BriefSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="ui-brief-view__section">
      <div className="ui-section-label">{label}</div>
      {children}
    </section>
  )
}

function BriefList({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <ul className="ui-brief-view__list">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  )
}

function BriefParagraph({ children }: { children: React.ReactNode }) {
  return <p className="ui-brief-view__text">{children}</p>
}

function CanvasBriefView({ data, createdAt }: { data: CanvasBriefResponse; createdAt: string }) {
  const generatedAt = new Date(createdAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <article className="ui-brief-view">
      <div className="ui-brief-view__meta">Generated {generatedAt}</div>
      <div className="ui-brief-view__headline">{data.headline}</div>
      <BriefSection label="Situation">
        <BriefParagraph>{data.situation}</BriefParagraph>
      </BriefSection>
      {data.keyFindings?.length > 0 && (
        <BriefSection label="Key findings">
          <BriefList items={data.keyFindings} />
        </BriefSection>
      )}
      <BriefSection label="Risk">
        <BriefParagraph>
          <span className="ui-brief-view__badge">{data.riskLevel}</span>
          {' '}{data.riskRationale}
        </BriefParagraph>
      </BriefSection>
      {data.assessmentInsight && (
        <BriefSection label="Assessment">
          <BriefParagraph>{data.assessmentInsight}</BriefParagraph>
        </BriefSection>
      )}
      {data.watchItems?.length > 0 && (
        <BriefSection label="Watch items">
          <BriefList items={data.watchItems} />
        </BriefSection>
      )}
      {data.analystJudgment && (
        <BriefSection label="Analyst judgment">
          <BriefParagraph>{data.analystJudgment}</BriefParagraph>
        </BriefSection>
      )}
      <BriefSection label="Confidence">
        <BriefParagraph>
          <span className="ui-brief-view__badge">{data.confidence}</span>
          {' '}{data.confidenceRationale}
        </BriefParagraph>
      </BriefSection>
    </article>
  )
}

function ProjectBriefView({ data, createdAt }: { data: ProjectBriefData; createdAt: string }) {
  const generatedAt = new Date(createdAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <article className="ui-brief-view">
      <div className="ui-brief-view__meta">{data.classification} · Generated {generatedAt}</div>
      <BriefSection label="BLUF">
        <p className="ui-brief-view__lead">{data.bluf}</p>
      </BriefSection>
      <BriefSection label="Situation">
        <BriefParagraph>{data.situation}</BriefParagraph>
      </BriefSection>
      {data.keyFindings?.length > 0 && (
        <BriefSection label="Key findings">
          <ul className="ui-brief-view__list">
            {data.keyFindings.map((f, i) => (
              <li key={i}>
                <strong>{f.finding}</strong>
                {f.significance ? ` — ${f.significance}` : ''}
                {f.confidence ? ` (${f.confidence})` : ''}
              </li>
            ))}
          </ul>
        </BriefSection>
      )}
      {data.patterns && (
        <BriefSection label="Patterns">
          <BriefParagraph>{data.patterns}</BriefParagraph>
        </BriefSection>
      )}
      {data.outlook && (
        <BriefSection label="Outlook">
          <BriefParagraph>{data.outlook}</BriefParagraph>
        </BriefSection>
      )}
      {data.analystNote && (
        <BriefSection label="Analyst note">
          <BriefParagraph>{data.analystNote}</BriefParagraph>
        </BriefSection>
      )}
    </article>
  )
}

function CountryBriefView({ data, country, createdAt }: { data: CountryBriefData; country: string; createdAt: string }) {
  const generatedAt = new Date(createdAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <article className="ui-brief-view">
      <div className="ui-brief-view__meta">{country} · Generated {generatedAt}</div>
      <BriefSection label="Executive summary">
        <p className="ui-brief-view__lead">{data.executiveSummary}</p>
      </BriefSection>
      {data.situationAssessment && (
        <BriefSection label="Situation">
          <BriefParagraph>{data.situationAssessment}</BriefParagraph>
        </BriefSection>
      )}
      {data.keyJudgments?.length ? (
        <BriefSection label="Key judgments">
          <ul className="ui-brief-view__list">
            {data.keyJudgments.map((j, i) => (
              <li key={i}>
                <strong>{j.confidence}</strong> — {j.judgment}
              </li>
            ))}
          </ul>
        </BriefSection>
      ) : null}
      {data.outlook30 && (
        <BriefSection label="30-day outlook">
          <BriefParagraph>{data.outlook30}</BriefParagraph>
        </BriefSection>
      )}
      {data.watchItems?.length > 0 && (
        <BriefSection label="Watch">
          <BriefList items={data.watchItems} />
        </BriefSection>
      )}
    </article>
  )
}

export function BriefHistoryContent({ record }: { record: BriefHistoryRecord }) {
  const data = record.data
  if (!data) {
    return <p className="ui-brief-view__text">No brief content saved.</p>
  }

  if (record.type === 'canvas') {
    return <CanvasBriefView data={data as unknown as CanvasBriefResponse} createdAt={record.created_at} />
  }
  if (record.type === 'project') {
    return <ProjectBriefView data={data as unknown as ProjectBriefData} createdAt={record.created_at} />
  }
  return (
    <CountryBriefView
      data={data as unknown as CountryBriefData}
      country={record.country || record.title}
      createdAt={record.created_at}
    />
  )
}

export function NlqHistoryContent({ record }: { record: NlqHistoryRecord }) {
  const when = new Date(record.created_at).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <article className="ui-brief-view">
      <div className="ui-brief-view__headline">{record.query}</div>
      <div className="ui-brief-view__meta">
        {when} · {record.match_count} matches
        {record.applied_filters ? ` · ${record.applied_filters}` : ''}
      </div>
      <BriefSection label="Summary">
        <BriefParagraph>{record.summary}</BriefParagraph>
      </BriefSection>
    </article>
  )
}
