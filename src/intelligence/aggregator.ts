/**
 * Intelligence Aggregator
 * 全コレクターを統合し、重複排除・スコアリング・ソートを行う
 */

import { collectRssFeeds } from './collectors/rss-collector'
import { collectFredData, collectWorldBankData, collectHackerNews, collectGithubTrending } from './collectors/economics-collector'
import { collectNewsApi, collectReddit, filterCelebrityMentions } from './collectors/news-collector'
import { collectCelebrityTweets, collectXTrending, collectXWatchAccounts } from './collectors/apify-collector'
import { IntelligenceItem, IntelligenceConfig, CollectorResult, IntelligenceCategory, WATCH_KEYWORDS } from './types'

export interface AggregationResult {
  items: IntelligenceItem[]
  byCategory: Record<IntelligenceCategory, IntelligenceItem[]>
  celebrities: IntelligenceItem[]
  economics: IntelligenceItem[]
  errors: Array<{ source: string; error: string }>
  fetchedAt: Date
  totalCount: number
  durationMs: number
}

function deduplicateItems(items: IntelligenceItem[]): IntelligenceItem[] {
  const seen = new Map<string, IntelligenceItem>()

  for (const item of items) {
    const key = item.id
    const existing = seen.get(key)
    // 同じIDは高信頼度を優先
    if (!existing || item.reliability > existing.reliability) {
      seen.set(key, item)
    }
  }

  // URLベースの重複も除去
  const urlSeen = new Set<string>()
  const result: IntelligenceItem[] = []
  for (const item of seen.values()) {
    const normalizedUrl = item.url.replace(/[?#].*$/, '').toLowerCase()
    if (!urlSeen.has(normalizedUrl)) {
      urlSeen.add(normalizedUrl)
      result.push(item)
    }
  }

  return result
}

function scoreItem(item: IntelligenceItem): number {
  const now = Date.now()
  const ageHours = (now - item.publishedAt.getTime()) / (1000 * 60 * 60)
  const recencyScore = Math.max(0, 1 - ageHours / 48)  // 48時間で0になる
  const reliabilityScore = item.reliability / 5
  const celebrityBonus = item.speaker ? 0.2 : 0
  return reliabilityScore * 0.5 + recencyScore * 0.4 + celebrityBonus * 0.1
}

function groupByCategory(items: IntelligenceItem[]): Record<IntelligenceCategory, IntelligenceItem[]> {
  const categories: IntelligenceCategory[] = [
    'finance', 'economics', 'ai_news', 'dev_tools', 'celebrity', 'crypto', 'business', 'tech_community'
  ]
  const grouped = Object.fromEntries(
    categories.map(c => [c, [] as IntelligenceItem[]])
  ) as Record<IntelligenceCategory, IntelligenceItem[]>

  for (const item of items) {
    grouped[item.category].push(item)
  }
  return grouped
}

export async function aggregate(config: IntelligenceConfig): Promise<AggregationResult> {
  const startTime = Date.now()
  const allResults: CollectorResult[] = []
  const errors: Array<{ source: string; error: string }> = []
  const maxItems = config.maxItemsPerSource ?? 10

  // ── 並列収集 ──────────────────────────────────
  const tasks: Promise<CollectorResult | CollectorResult[]>[] = []

  // RSS (常時有効・無料)
  tasks.push(
    collectRssFeeds(maxItems, config.enabledCategories).catch(e => {
      errors.push({ source: 'RSS', error: String(e) })
      return [] as CollectorResult[]
    })
  )

  // HackerNews (常時有効・無料)
  tasks.push(
    collectHackerNews(maxItems).catch(e => {
      errors.push({ source: 'HackerNews', error: String(e) })
      return { items: [], source: 'HackerNews', fetchedAt: new Date(), itemCount: 0 }
    })
  )

  // GitHub Trending (常時有効・無料)
  tasks.push(
    collectGithubTrending().catch(e => {
      errors.push({ source: 'GitHub Trending', error: String(e) })
      return { items: [], source: 'GitHub Trending', fetchedAt: new Date(), itemCount: 0 }
    })
  )

  // World Bank (常時有効・無料)
  tasks.push(
    collectWorldBankData().catch(e => {
      errors.push({ source: 'World Bank', error: String(e) })
      return { items: [], source: 'World Bank', fetchedAt: new Date(), itemCount: 0 }
    })
  )

  // Reddit (常時有効・無料)
  tasks.push(
    collectReddit(maxItems).catch(e => {
      errors.push({ source: 'Reddit', error: String(e) })
      return { items: [], source: 'Reddit', fetchedAt: new Date(), itemCount: 0 }
    })
  )

  // FRED (APIキーが設定されている場合)
  if (config.fredApiKey) {
    tasks.push(
      collectFredData(config.fredApiKey).catch(e => {
        errors.push({ source: 'FRED', error: String(e) })
        return { items: [], source: 'FRED', fetchedAt: new Date(), itemCount: 0 }
      })
    )
  }

  // NewsAPI (APIキーが設定されている場合)
  if (config.newsApiKey) {
    tasks.push(
      collectNewsApi(config.newsApiKey, maxItems).catch(e => {
        errors.push({ source: 'NewsAPI', error: String(e) })
        return { items: [], source: 'NewsAPI', fetchedAt: new Date(), itemCount: 0 }
      })
    )
  }

  // Apify - X(Twitter) 著名人発言 + トレンド + 監視50アカウント (APIトークンが設定されている場合)
  if (config.apifyToken) {
    tasks.push(
      collectCelebrityTweets(config.apifyToken, 5).catch(e => {
        errors.push({ source: 'Apify (Celebrity)', error: String(e) })
        return { items: [], source: 'Apify (Celebrity)', fetchedAt: new Date(), itemCount: 0 }
      })
    )
    tasks.push(
      collectXTrending(config.apifyToken, WATCH_KEYWORDS.ai_coding, maxItems).catch(e => {
        errors.push({ source: 'Apify (Trending)', error: String(e) })
        return { items: [], source: 'Apify (Trending)', fetchedAt: new Date(), itemCount: 0 }
      })
    )
    // X監視アカウント50件 - AI coding 英語
    tasks.push(
      collectXWatchAccounts(config.apifyToken, { language: 'en', specialty: 'ai_coding', maxPerAccount: 3 }).catch(e => {
        errors.push({ source: 'Apify (X Watch EN/AI Coding)', error: String(e) })
        return { items: [], source: 'Apify (X Watch EN/AI Coding)', fetchedAt: new Date(), itemCount: 0 }
      })
    )
    // X監視アカウント50件 - 日本語
    tasks.push(
      collectXWatchAccounts(config.apifyToken, { language: 'ja', maxPerAccount: 3 }).catch(e => {
        errors.push({ source: 'Apify (X Watch JA)', error: String(e) })
        return { items: [], source: 'Apify (X Watch JA)', fetchedAt: new Date(), itemCount: 0 }
      })
    )
  }

  // ── 結果収集 ──────────────────────────────────
  const settled = await Promise.all(tasks)

  for (const r of settled) {
    if (Array.isArray(r)) {
      allResults.push(...r)
    } else {
      allResults.push(r)
    }
  }

  // ── 全アイテムをフラット化 ─────────────────────
  const rawItems = allResults.flatMap(r => r.items)

  // ── 重複排除・スコアリング ─────────────────────
  const unique = deduplicateItems(rawItems)
  const scored = unique.sort((a, b) => scoreItem(b) - scoreItem(a))

  // ── カテゴリ別グループ化 ───────────────────────
  const byCategory = groupByCategory(scored)

  // ── 著名人発言抽出 ─────────────────────────────
  const celebrities = filterCelebrityMentions(scored)

  // ── 経済指標のみ抽出 ───────────────────────────
  const economics = scored.filter(i => i.category === 'economics')

  return {
    items: scored,
    byCategory,
    celebrities,
    economics,
    errors,
    fetchedAt: new Date(),
    totalCount: scored.length,
    durationMs: Date.now() - startTime,
  }
}
