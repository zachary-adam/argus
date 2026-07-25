import { describe, it, expect } from 'vitest'
import { classifyInfoOps } from './infoOps'

const ev = (over: Partial<{ title: string; summary: string; body: string; url: string }>) => ({
  title: '', summary: '', body: '', url: '', ...over,
})

describe('classifyInfoOps', () => {
  it('flags the PIB fact-check / debunk post', () => {
    const r = classifyInfoOps(ev({
      title: 'A viral video claims the Indian Army assaulted civilians during the 2026 West Bengal elections',
      summary: '#PIBFactCheck: This video is misleading. This is an old video from Bangladesh falsely shared. Do not believe such misinformation.',
    }))
    expect(r.infoOps).toBe(true)
    expect(r.reason).toBe('fact-check/debunk')
  })

  it('flags a "doctored image" style debunk (weak word + media noun)', () => {
    expect(classifyInfoOps(ev({ title: 'Doctored image of a polling booth fire spreads online' })).infoOps).toBe(true)
  })

  it('flags a raw facebook share URL', () => {
    const r = classifyInfoOps(ev({ title: 'Clip going around', url: 'https://www.facebook.com/share/v/1EZHNfYTpX/' }))
    expect(r.infoOps).toBe(true)
    expect(r.reason).toBe('social-media share')
  })

  it('flags a t.me / telegram share', () => {
    expect(classifyInfoOps(ev({ url: 'https://t.me/somechannel/123' })).infoOps).toBe(true)
  })

  it('does NOT flag real conflict reporting', () => {
    expect(classifyInfoOps(ev({
      title: 'VIOLENCE ERUPTS IN WEST Bengal 2026 Election; CAPF Deployed Amid Crude Bombs',
      summary: 'Security forces deployed across districts after clashes.',
      url: 'https://example-news.com/bengal',
    })).infoOps).toBe(false)
  })

  it('does NOT flag ordinary prose containing a weak word without a media noun', () => {
    expect(classifyInfoOps(ev({
      title: 'Officials call rivals’ economic projections misleading ahead of vote',
    })).infoOps).toBe(false)
  })

  it('does NOT flag a normal news URL', () => {
    expect(classifyInfoOps(ev({ title: 'Cyber incidents report', url: 'https://www.csis.org/programs' })).infoOps).toBe(false)
  })
})
