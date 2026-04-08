/**
 * News Collector
 * NewsAPI.org (無料枠: 100req/day) + Reddit API (無料)
 */

import { CollectorResult, IntelligenceItem, WATCH_TARGETS, WATCH_KEYWORDS } from '../types'
import crypto from 'crypto'

function makeId(src: string, id: string): string {
  return crypto.createHash('md5').update(`${src}:${id}`).digest('hex').slice(0, 16)
}

// ─────────────────────────────────────────────
// NewsAPI.org - 無料枠100req/day
// https://newsapi.org/
// ─────────────────────────────────────────────
const NEWS_API_QUERIES = [
  { q: 'artificial intelligence Claude Anthropic OpenAI', category: 'ai_news' as const },
  { q: 'vibe coding cursor windsurf opencode', category: 'dev_tools' as const },
  { q: 'Warren Buffett Elon Musk Jensen Huang Sam Altman', category: 'celebrity' as const },
  { q: 'Federal Reserve interest rate inflation economy', category: 'economics' as const },
  { q: 'stock market nasdaq bitcoin cryptocurrency', category: 'finance' as const },
  { q: 'AI agent MCP model context protocol', category: 'dev_tools' as const },
]

export async function collectNewsApi(apiKey: string, maxPerQuery = 5): Promise<CollectorResult> {
  const items: IntelligenceItem[] = []

  const results = await Promise.allSettled(
    NEWS_API_QUERIES.map(async query => {
      const params = new URLSearchParams({
        q: query.q,
        apiKey,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: String(maxPerQuery),
      })
      const res = await fetch(`https://newsapi.org/v2/everything?${params}`, {
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error(`NewsAPI ${res.status}`)
      const data = await res.json()
      return { articles: data.articles ?? [], category: query.category }
    })
  )

  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    const { articles, category } = result.value

    for (const article of articles) {
      if (!article.title || article.title === '[Removed]') continue

      // 著名人発言チェック
      const speaker = WATCH_TARGETS.find(t =>
        [t.name, ...t.aliases].some(alias =>
          (article.title + (article.description ?? '')).toLowerCase().includes(alias.toLowerCase())
        )
      )

      items.push({
        id: makeId('newsapi', article.url ?? article.title),
        title: article.title,
        summary: article.description ?? '',
        url: article.url ?? '',
        source: article.source?.name ?? 'NewsAPI',
        sourceType: 'api',
        category: speaker ? 'celebrity' : category,
        publishedAt: new Date(article.publishedAt ?? Date.now()),
        fetchedAt: new Date(),
        reliability: 4,
        tags: ['newsapi'],
        speaker: speaker?.name,
      })
    }
  }

  return { items, source: 'NewsAPI', fetchedAt: new Date(), itemCount: items.length }
}

// ─────────────────────────────────────────────
// Reddit API - 無料枠 (OAuth不要でJSON取得可)
// ─────────────────────────────────────────────
const REDDIT_SUBREDDITS = [
  { name: 'MachineLearning', category: 'ai_news' as const, reliability: 4 as const },
  { name: 'artificial', category: 'ai_news' as const, reliability: 3 as const },
  { name: 'ClaudeAI', category: 'ai_news' as const, reliability: 3 as const },
  { name: 'LocalLLaMA', category: 'ai_news' as const, reliability: 3 as const },
  { name: 'programming', category: 'dev_tools' as const, reliability: 3 as const },
  { name: 'webdev', category: 'dev_tools' as const, reliability: 3 as const },
  { name: 'investing', category: 'finance' as const, reliability: 2 as const },
  { name: 'economics', category: 'economics' as const, reliability: 3 as const },
  { name: 'singularity', category: 'ai_news' as const, reliability: 2 as const },
]

export async function collectReddit(maxPerSub = 5): Promise<CollectorResult> {
  const items: IntelligenceItem[] = []

  const results = await Promise.allSettled(
    REDDIT_SUBREDDITS.map(async sub => {
      const url = `https://www.reddit.com/r/${sub.name}/hot.json?limit=${maxPerSub}`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'IntelligenceBot/1.0 (by /u/intelligencebot)' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) throw new Error(`Reddit r/${sub.name}: ${res.status}`)
      const data = await res.json()
      return { posts: data.data?.children ?? [], sub }
    })
  )

  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    const { posts, sub } = result.value

    for (const post of posts) {
      const p = post.data
      if (!p || p.stickied || !p.title) continue

      items.push({
        id: makeId('reddit', p.id),
        title: p.title,
        summary: p.selftext ? p.selftext.slice(0, 200) : `r/${sub.name} - Score: ${p.score ?? 0}`,
        url: `https://reddit.com${p.permalink}`,
        source: `Reddit r/${sub.name}`,
        sourceType: 'social',
        category: sub.category,
        publishedAt: new Date((p.created_utc ?? 0) * 1000),
        fetchedAt: new Date(),
        reliability: sub.reliability,
        tags: ['reddit', sub.name.toLowerCase()],
      })
    }
  }

  return { items, source: 'Reddit', fetchedAt: new Date(), itemCount: items.length }
}

// ─────────────────────────────────────────────
// 著名人発言フィルタリング
// ─────────────────────────────────────────────
export function filterCelebrityMentions(items: IntelligenceItem[]): IntelligenceItem[] {
  const allKeywords = WATCH_TARGETS.flatMap(t => [t.name, ...t.aliases].map(a => a.toLowerCase()))

  return items.filter(item => {
    const text = `${item.title} ${item.summary}`.toLowerCase()
    const match = WATCH_TARGETS.find(t =>
      [t.name, ...t.aliases].some(alias => text.includes(alias.toLowerCase()))
    )
    if (match) {
      item.speaker = match.name
      item.category = 'celebrity'
      return true
    }
    return false
  })
}

// ─────────────────────────────────────────────
// キーワードフィルタリング
// ─────────────────────────────────────────────
export function filterByKeywords(
  items: IntelligenceItem[],
  keywordGroup: keyof typeof WATCH_KEYWORDS
): IntelligenceItem[] {
  const keywords = WATCH_KEYWORDS[keywordGroup]
  return items.filter(item => {
    const text = `${item.title} ${item.summary}`.toLowerCase()
    return keywords.some(kw => text.includes(kw.toLowerCase()))
  })
}
