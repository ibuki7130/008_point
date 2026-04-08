/**
 * Economics Collector - 完全無料API群
 * FRED / World Bank / IMF / 日銀
 */

import { CollectorResult, EconomicIndicator, IntelligenceItem } from '../types'
import crypto from 'crypto'

function makeId(src: string, id: string): string {
  return crypto.createHash('md5').update(`${src}:${id}`).digest('hex').slice(0, 16)
}

// ─────────────────────────────────────────────
// FRED API (St. Louis Fed) - 完全無料, APIキー要
// https://fred.stlouisfed.org/docs/api/
// ─────────────────────────────────────────────
const FRED_SERIES = [
  { id: 'FEDFUNDS', name: 'Fed Funds Rate', unit: '%', country: 'US' },
  { id: 'CPIAUCSL', name: 'CPI (All Urban)', unit: 'Index', country: 'US' },
  { id: 'UNRATE', name: 'Unemployment Rate', unit: '%', country: 'US' },
  { id: 'GDP', name: 'US GDP', unit: 'Billions USD', country: 'US' },
  { id: 'T10Y2Y', name: '10Y-2Y Yield Spread', unit: '%', country: 'US' },
  { id: 'DFF', name: 'Effective Fed Funds Rate', unit: '%', country: 'US' },
  { id: 'DEXJPUS', name: 'USD/JPY Exchange Rate', unit: 'JPY per USD', country: 'JP' },
]

export async function collectFredData(apiKey: string): Promise<CollectorResult> {
  const items: IntelligenceItem[] = []

  const results = await Promise.allSettled(
    FRED_SERIES.map(async series => {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${series.id}&api_key=${apiKey}&sort_order=desc&limit=2&file_type=json`
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`FRED ${series.id}: ${res.status}`)
      return { series, data: await res.json() }
    })
  )

  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    const { series, data } = result.value
    const obs = data.observations as Array<{ date: string; value: string }>
    if (!obs || obs.length === 0) continue

    const latest = obs[0]
    const previous = obs[1]
    const value = parseFloat(latest.value)
    const prevValue = previous ? parseFloat(previous.value) : undefined

    if (isNaN(value)) continue

    const changePercent = prevValue && !isNaN(prevValue)
      ? ((value - prevValue) / Math.abs(prevValue)) * 100
      : undefined

    const indicator: EconomicIndicator = {
      name: series.name,
      value,
      unit: series.unit,
      previousValue: prevValue,
      changePercent,
      country: series.country,
      date: latest.date,
    }

    const direction = changePercent !== undefined
      ? changePercent > 0 ? '↑' : changePercent < 0 ? '↓' : '→'
      : ''

    items.push({
      id: makeId('fred', series.id),
      title: `${series.name}: ${value}${series.unit} ${direction}`,
      summary: `${series.name} as of ${latest.date}: ${value} ${series.unit}${prevValue !== undefined ? ` (前回: ${prevValue})` : ''}${changePercent !== undefined ? ` 変化率: ${changePercent.toFixed(2)}%` : ''}`,
      url: `https://fred.stlouisfed.org/series/${series.id}`,
      source: 'FRED (St. Louis Fed)',
      sourceType: 'api',
      category: 'economics',
      publishedAt: new Date(latest.date),
      fetchedAt: new Date(),
      reliability: 5,
      tags: ['economic-indicator', series.country.toLowerCase(), series.id.toLowerCase()],
      indicator,
    })
  }

  return { items, source: 'FRED', fetchedAt: new Date(), itemCount: items.length }
}

// ─────────────────────────────────────────────
// World Bank API - 完全無料, APIキー不要
// https://datahelpdesk.worldbank.org/
// ─────────────────────────────────────────────
const WORLD_BANK_INDICATORS = [
  { code: 'NY.GDP.MKTP.CD', name: 'World GDP (current USD)', country: 'WLD' },
  { code: 'FP.CPI.TOTL.ZG', name: 'Inflation (CPI %)', country: 'WLD' },
  { code: 'NY.GDP.MKTP.KD.ZG', name: 'GDP Growth Rate (%)', country: 'JPN' },
  { code: 'SL.UEM.TOTL.ZS', name: 'Unemployment Rate (%)', country: 'JPN' },
]

export async function collectWorldBankData(): Promise<CollectorResult> {
  const items: IntelligenceItem[] = []

  const results = await Promise.allSettled(
    WORLD_BANK_INDICATORS.map(async ind => {
      const url = `https://api.worldbank.org/v2/country/${ind.country}/indicator/${ind.code}?format=json&mrv=2&per_page=2`
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`WorldBank ${ind.code}: ${res.status}`)
      return { ind, data: await res.json() }
    })
  )

  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    const { ind, data } = result.value
    const records = data[1] as Array<{ date: string; value: number | null; country: { value: string } }> | null
    if (!records || records.length === 0) continue

    const latest = records.find(r => r.value !== null)
    if (!latest || latest.value === null) continue

    items.push({
      id: makeId('worldbank', `${ind.country}:${ind.code}`),
      title: `${latest.country.value} ${ind.name}: ${latest.value.toFixed(2)}`,
      summary: `World Bank data - ${ind.name} for ${latest.country.value} (${latest.date}): ${latest.value.toFixed(2)}`,
      url: `https://data.worldbank.org/indicator/${ind.code}`,
      source: 'World Bank Open Data',
      sourceType: 'api',
      category: 'economics',
      publishedAt: new Date(`${latest.date}-01-01`),
      fetchedAt: new Date(),
      reliability: 5,
      tags: ['world-bank', 'economic-indicator', ind.country.toLowerCase()],
      indicator: {
        name: ind.name,
        value: latest.value,
        unit: '',
        country: ind.country,
        date: latest.date,
      },
    })
  }

  return { items, source: 'World Bank', fetchedAt: new Date(), itemCount: items.length }
}

// ─────────────────────────────────────────────
// HackerNews API - 完全無料, APIキー不要
// Top/Best stories
// ─────────────────────────────────────────────
export async function collectHackerNews(maxItems = 20): Promise<CollectorResult> {
  const items: IntelligenceItem[] = []

  const res = await fetch('https://hacker-news.firebaseio.com/v0/beststories.json', {
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`HN fetch failed: ${res.status}`)

  const storyIds: number[] = await res.json()
  const topIds = storyIds.slice(0, maxItems)

  const stories = await Promise.allSettled(
    topIds.map(id =>
      fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
        signal: AbortSignal.timeout(5000),
      }).then(r => r.json())
    )
  )

  for (const result of stories) {
    if (result.status !== 'fulfilled') continue
    const story = result.value
    if (!story || !story.title || !story.url) continue

    items.push({
      id: makeId('hn', String(story.id)),
      title: story.title,
      summary: `HackerNews - Score: ${story.score ?? 0}, Comments: ${story.descendants ?? 0}`,
      url: story.url,
      source: 'Hacker News',
      sourceType: 'api',
      category: 'dev_tools',
      publishedAt: new Date((story.time ?? 0) * 1000),
      fetchedAt: new Date(),
      reliability: 3,
      tags: ['hackernews', 'tech'],
    })
  }

  return { items, source: 'Hacker News', fetchedAt: new Date(), itemCount: items.length }
}

// ─────────────────────────────────────────────
// GitHub Trending (非公式スクレイプ) - 完全無料
// ─────────────────────────────────────────────
export async function collectGithubTrending(language = ''): Promise<CollectorResult> {
  const url = `https://github.com/trending${language ? `/${language}` : ''}?since=daily`
  const items: IntelligenceItem[] = []

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IntelligenceBot/1.0)' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`GitHub Trending fetch failed: ${res.status}`)

  const html = await res.text()

  // article タグからリポジトリ情報を抽出
  const repoMatches = html.matchAll(/<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>([\s\S]*?)<\/article>/gi)

  for (const match of repoMatches) {
    const articleHtml = match[1]
    const repoPathMatch = articleHtml.match(/href="\/([^/]+\/[^/?"]+)"/)
    if (!repoPathMatch) continue

    const repoPath = repoPathMatch[1]
    const descMatch = articleHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/)
    const description = descMatch ? descMatch[1].replace(/<[^>]*>/g, '').trim() : ''
    const starsMatch = articleHtml.match(/(\d[\d,]*)\s*stars today/)
    const starsToday = starsMatch ? starsMatch[1].replace(',', '') : '0'

    items.push({
      id: makeId('github-trending', repoPath),
      title: repoPath,
      summary: `GitHub Trending: ${description || repoPath} (+${starsToday} stars today)`,
      url: `https://github.com/${repoPath}`,
      source: 'GitHub Trending',
      sourceType: 'scraper',
      category: 'dev_tools',
      publishedAt: new Date(),
      fetchedAt: new Date(),
      reliability: 4,
      tags: ['github', 'trending', 'oss', ...(language ? [language] : [])],
    })
  }

  return { items, source: 'GitHub Trending', fetchedAt: new Date(), itemCount: items.length }
}
