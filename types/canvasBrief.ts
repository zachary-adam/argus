import type { BriefSource } from '@/types/brief'

export interface CanvasBriefRequest {
  projectName: string
  researchQuestion: string
  regionName: string
  apiKey?: string
  workspaceContext?: string
  events: Array<{
    title: string
    summary?: string
    body?: string
    category: string
    country: string
    severity: number
    timestamp: string
    actors?: string[]
    source?: string
    analystComments?: string[]
    url?: string
  }>
  achFindings: Array<{
    leadHypothesis: string
    leadSupports: number
    leadContradicts: number
    allHypotheses: Array<{ text: string; supports: number; contradicts: number; net: number }>
    confidence: string
    narrative?: string
  }>
  analystNotes: string[]
  papers?: Array<{
    title: string
    authors?: string[]
    year?: number
    abstract?: string
    doi?: string
    venue?: string
    url?: string
  }>
  watchEntities?: string[]
  countryCodes?: string[]
}

export interface CanvasBriefResponse {
  headline: string
  situation: string
  keyFindings: string[]
  riskLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW'
  riskRationale: string
  assessmentInsight: string
  watchItems: string[]
  analystJudgment: string
  confidence: 'HIGH' | 'MODERATE' | 'LOW'
  confidenceRationale: string
  sources?: BriefSource[]
  offline?: boolean
  warning?: string
}
