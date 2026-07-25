import { test, expect } from '@playwright/test'

test.describe('API smoke', () => {
  test('status reports AI available', async ({ request }) => {
    const res = await request.get('/api/status')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.aiAvailable).toBe(true)
  })

  test('vault is configured', async ({ request }) => {
    const res = await request.get('/api/vault')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.configured).toBe(true)
  })

  test('NLQ works in rules mode', async ({ request }) => {
    const res = await request.post('/api/nlq', {
      headers: { 'Content-Type': 'application/json', 'x-argus-ai-mode': 'none' },
      data: {
        query: 'ukraine conflict',
        events: [{
          id: 'api-ev-1',
          title: 'Ukraine border incident',
          summary: 'Test',
          category: 'conflict',
          country: 'Ukraine',
          countryCode: 'UA',
          severity: 'high',
          timestamp: new Date().toISOString(),
          lat: 48.5,
          lon: 37.5,
          source: 'test',
        }],
      },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.offline).toBe(true)
    expect(body.summary).toBeTruthy()
  })

  test('verify returns heuristic in rules mode', async ({ request }) => {
    const claim = {
      id: 'api-ev-1',
      title: 'Ukraine border incident',
      summary: 'Test claim',
      category: 'conflict',
      country: 'Ukraine',
      countryCode: 'UA',
      severity: 'high',
      timestamp: new Date().toISOString(),
      lat: 48.5,
      lon: 37.5,
      source: 'test',
    }
    const res = await request.post('/api/verify', {
      headers: { 'Content-Type': 'application/json', 'x-argus-ai-mode': 'none' },
      data: { claim, corpus: [claim] },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.mode).toBe('heuristic')
    expect(body.result.verdict).toBeTruthy()
  })
})
