import { describe, it, expect } from 'vitest'
import {
  defaultEngineFromProject,
  effectiveAiModeForRequest,
  planAiExecution,
  applyProviderPreference,
  resolveClientKey,
  planAiFromRequestWithProvider,
} from './aiMode'

describe('aiMode', () => {
  it('defaults to rules only when project aiMode is explicitly none', () => {
    expect(defaultEngineFromProject('none')).toBe('rules')
    expect(defaultEngineFromProject('cloud')).toBe('ai')
    expect(defaultEngineFromProject(undefined)).toBe('ai')
  })

  it('maps toolbar engine to request header', () => {
    expect(effectiveAiModeForRequest('rules', { aiMode: 'cloud' })).toBe('none')
    expect(effectiveAiModeForRequest('ai', { aiMode: 'none' })).toBe('cloud')
    expect(effectiveAiModeForRequest('ai', { aiMode: 'byok' })).toBe('byok')
  })

  it('forces offline when header is none even with keys', () => {
    const plan = planAiExecution({
      aiMode: 'none',
      openaiKey: 'sk-test',
      anthropicKey: 'sk-ant-test',
    })
    expect(plan.useOffline).toBe(true)
    expect(plan.key).toBeNull()
  })

  it('requires keys when AI mode explicit without credentials', () => {
    const plan = planAiExecution({ aiMode: 'cloud' })
    expect(plan.missingKeys).toBe(true)
    expect(plan.useOffline).toBe(false)
  })

  it('uses keys when AI mode cloud and keys present', () => {
    const plan = planAiExecution({ aiMode: 'cloud', openaiKey: 'sk-test' })
    expect(plan.useOffline).toBe(false)
    expect(plan.key).toBe('sk-test')
  })

  it('resolveClientKey prefers body key over header', () => {
    const req = {
      headers: { get: (name: string) => (name === 'x-argus-client-key' ? 'sk-header' : null) },
    } as import('next/server').NextRequest
    expect(resolveClientKey(req, 'sk-body')).toBe('sk-body')
    expect(resolveClientKey(req, undefined)).toBe('sk-header')
    expect(resolveClientKey(req, '  ')).toBe('sk-header')
  })

  it('applyProviderPreference honors explicit provider', () => {
    const base = planAiExecution({ aiMode: 'cloud', openaiKey: 'sk-o', anthropicKey: 'sk-ant-a' })
    const claude = applyProviderPreference(base, 'claude', { anthropicKey: 'sk-ant-a', openaiKey: 'sk-o' })
    expect(claude.isAnthropic).toBe(true)
    expect(claude.key).toBe('sk-ant-a')
    const openai = applyProviderPreference(base, 'openai', { anthropicKey: 'sk-ant-a', openaiKey: 'sk-o' })
    expect(openai.isAnthropic).toBe(false)
    expect(openai.key).toBe('sk-o')
  })

  it('applyProviderPreference keeps BYOK user key off server vault', () => {
    const base = planAiExecution({ aiMode: 'byok', openaiKey: 'sk-server', anthropicKey: 'sk-ant-server', clientKey: 'sk-proj-user' })
    const plan = applyProviderPreference(base, 'claude', { anthropicKey: 'sk-ant-server', openaiKey: 'sk-server' }, 'sk-proj-user')
    expect(plan.key).toBe('sk-proj-user')
    expect(plan.isAnthropic).toBe(false)
  })

  it('planAiFromRequestWithProvider falls back when preferred provider key missing', () => {
    const req = {
      headers: {
        get: (name: string) => {
          if (name === 'x-ai-provider') return 'claude'
          if (name === 'x-argus-ai-mode') return 'cloud'
          return null
        },
      },
    } as import('next/server').NextRequest
    const plan = planAiFromRequestWithProvider(req, null, () => null, 'claude')
    expect(plan.missingKeys).toBe(true)
    const plan2 = planAiFromRequestWithProvider(
      req,
      null,
      name => (name === 'OPENAI_API_KEY' ? 'sk-openai-only' : null),
      'claude',
    )
    expect(plan2.key).toBe('sk-openai-only')
    expect(plan2.isAnthropic).toBe(false)
  })
})
