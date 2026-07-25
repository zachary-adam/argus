import { describe, it, expect } from 'vitest'
import { detectLang, isLikelyEnglish, newsLocale, newsEditions, regionalEditions } from './lang'

describe('language detection + news localisation', () => {
  it('detects script-based languages', () => {
    expect(detectLang('Protests erupt in Nairobi')).toBe('en')
    expect(detectLang('दिल्ली में विरोध प्रदर्शन')).toBe('hi')   // Hindi
    expect(detectLang('احتجاجات في القاهرة')).toBe('ar')       // Arabic
    expect(detectLang('Протесты в Москве')).toBe('ru')         // Russian
    expect(detectLang('東京で抗議活動')).toBe('ja')             // Japanese
  })

  it('isLikelyEnglish guards translation routing', () => {
    expect(isLikelyEnglish('Election results announced')).toBe(true)
    expect(isLikelyEnglish('चुनाव परिणाम घोषित')).toBe(false)
  })

  it('maps countries to local-language Google News locales', () => {
    expect(newsLocale('IN')).toEqual({ hl: 'hi', gl: 'IN', ceid: 'IN:hi' })
    expect(newsLocale('RU')).toEqual({ hl: 'ru', gl: 'RU', ceid: 'RU:ru' })
    expect(newsLocale('ZZ')).toEqual({ hl: 'en-US', gl: 'US', ceid: 'US:en' }) // default
    expect(newsLocale(undefined)).toEqual({ hl: 'en-US', gl: 'US', ceid: 'US:en' })
  })

  it('newsEditions returns local + English editions for non-English regions', () => {
    const inEd = newsEditions('IN')
    expect(inEd).toHaveLength(2)
    expect(inEd[0]).toEqual({ hl: 'hi', gl: 'IN', ceid: 'IN:hi' })  // local language
    expect(inEd[1]).toEqual({ hl: 'en', gl: 'IN', ceid: 'IN:en' })  // English, same region
  })

  it('newsEditions returns a single edition when the region is already English', () => {
    expect(newsEditions('US')).toHaveLength(1)   // US not in local map → en-US only
    expect(newsEditions(undefined)).toHaveLength(1)
  })

  it('regionalEditions matches sub-national regions named in place text', () => {
    expect(regionalEditions('IN', 'West Bengal, India')).toEqual([{ hl: 'bn', gl: 'IN', ceid: 'IN:bn' }])
    expect(regionalEditions('IN', 'Kolkata election violence')).toEqual([{ hl: 'bn', gl: 'IN', ceid: 'IN:bn' }])
    expect(regionalEditions('IN', 'Ladakh')).toEqual([])          // no regional edition for Ladakh
    expect(regionalEditions('IN', 'Jamia Nagar, Delhi')).toEqual([{ hl: 'ur', gl: 'IN', ceid: 'IN:ur' }])
    expect(regionalEditions('IN', '')).toEqual([])                // no place text → no regionals
    expect(regionalEditions('PK', 'Punjab')).toEqual([])          // regions are scoped per country
    expect(regionalEditions('CA', 'Quebec sovereignty')).toEqual([{ hl: 'fr', gl: 'CA', ceid: 'CA:fr' }])
  })

  it('newsEditions adds regional-language editions between local and English', () => {
    const bengal = newsEditions('IN', 'West Bengal, India')
    expect(bengal.map(e => e.ceid)).toEqual(['IN:hi', 'IN:bn', 'IN:en'])
  })

  it('uses valid script-suffixed ceids for Chinese editions (naive CN:zh is dead)', () => {
    expect(newsLocale('CN')).toEqual({ hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans' })
    expect(newsLocale('TW')).toEqual({ hl: 'zh-TW', gl: 'TW', ceid: 'TW:zh-Hant' })
  })

  it('adds free-press fallback editions for censored-language home editions', () => {
    const cn = newsEditions('CN')
    expect(cn.map(e => e.ceid)).toEqual(['CN:zh-Hans', 'TW:zh-Hant', 'HK:zh-Hant', 'CN:en'])
    // Fallbacks never duplicate the local edition itself.
    const tw = newsEditions('TW')
    expect(tw.map(e => e.ceid)).toEqual(['TW:zh-Hant', 'HK:zh-Hant', 'TW:en'])
    // Languages without a fallback entry are untouched.
    expect(newsEditions('IN').map(e => e.ceid)).toEqual(['IN:hi', 'IN:en'])
  })

  it('newsEditions de-dupes and handles multi-region place text', () => {
    const multi = newsEditions('IN', 'clashes in Mumbai and Kolkata')
    expect(multi.map(e => e.ceid)).toEqual(['IN:hi', 'IN:bn', 'IN:mr', 'IN:en'])
    // Without place text, behaviour is unchanged from the country-level mapping.
    expect(newsEditions('IN').map(e => e.ceid)).toEqual(['IN:hi', 'IN:en'])
  })
})
