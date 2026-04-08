/**
 * Apify Collector - X(Twitter) 著名人発言・トレンド収集
 * コスト: $10/月 (Personal plan)
 * https://apify.com/
 *
 * 使用Actor:
 *   - apify/twitter-scraper (ツイート検索)
 *   - quacker/twitter-search (Quote Tweet含む検索)
 */

import { CollectorResult, IntelligenceItem, WATCH_TARGETS, X_WATCH_ACCOUNTS, getXHandles } from '../types'
import crypto from 'crypto'

const APIFY_BASE_URL = 'https://api.apify.com/v2'

function makeId(src: string, id: string): string {
  return crypto.createHash('md5').update(`${src}:${id}`).digest('hex').slice(0, 16)
}

interface ApifyRunInput {
  searchTerms?: string[]
  handles?: string[]
  maxItems?: number
  language?: string
}

interface Tweet {
  id?: string
  text?: string
  createdAt?: string
  author?: { userName?: string; name?: string }
  url?: string
  likeCount?: number
  retweetCount?: number
  replyCount?: number
}

async function runApifyActor(
  actorId: string,
  input: ApifyRunInput,
  apiToken: string
): Promise<Tweet[]> {
  // Actor 起動
  const runRes = await fetch(
    `${APIFY_BASE_URL}/acts/${actorId}/runs?token=${apiToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, maxItems: input.maxItems ?? 20 }),
      signal: AbortSignal.timeout(15000),
    }
  )
  if (!runRes.ok) {
    const body = await runRes.text()
    throw new Error(`Apify run failed ${runRes.status}: ${body.slice(0, 200)}`)
  }

  const runData = await runRes.json()
  const runId: string = runData.data?.id
  if (!runId) throw new Error('Apify: run ID not returned')

  // 完了待ち (最大60秒)
  const deadline = Date.now() + 60000
  let datasetId: string | null = null

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000))
    const statusRes = await fetch(
      `${APIFY_BASE_URL}/actor-runs/${runId}?token=${apiToken}`,
      { signal: AbortSignal.timeout(8000) }
    )
    const status = await statusRes.json()
    const runStatus: string = status.data?.status

    if (runStatus === 'SUCCEEDED') {
      datasetId = status.data?.defaultDatasetId
      break
    }
    if (['FAILED', 'TIMED-OUT', 'ABORTED'].includes(runStatus)) {
      throw new Error(`Apify run ${runStatus}`)
    }
  }

  if (!datasetId) throw new Error('Apify: timeout waiting for run')

  // データセット取得
  const itemsRes = await fetch(
    `${APIFY_BASE_URL}/datasets/${datasetId}/items?token=${apiToken}&format=json`,
    { signal: AbortSignal.timeout(10000) }
  )
  if (!itemsRes.ok) throw new Error(`Apify dataset fetch failed: ${itemsRes.status}`)

  return itemsRes.json()
}

// ─────────────────────────────────────────────
// 著名人ツイート収集
// ─────────────────────────────────────────────
export async function collectCelebrityTweets(
  apiToken: string,
  maxPerPerson = 5
): Promise<CollectorResult> {
  const items: IntelligenceItem[] = []

  // 重要度3の著名人のみ対象（コスト節約）
  const targets = WATCH_TARGETS.filter(t => t.importance === 3)
  const handles = targets.map(t => t.name.toLowerCase().replace(/\s+/g, ''))

  const results = await Promise.allSettled(
    targets.map(async target => {
      const searchTerms = [`from:${target.name.split(' ').pop()?.toLowerCase() ?? target.name}`]
      const tweets = await runApifyActor(
        'apidojo~tweet-scraper',
        { searchTerms, maxItems: maxPerPerson },
        apiToken
      )
      return { target, tweets }
    })
  )

  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    const { target, tweets } = result.value

    for (const tweet of tweets) {
      if (!tweet.text) continue

      items.push({
        id: makeId('apify-twitter', tweet.id ?? tweet.text),
        title: `[${target.name}] ${tweet.text.slice(0, 100)}${tweet.text.length > 100 ? '...' : ''}`,
        summary: tweet.text,
        url: tweet.url ?? `https://x.com/search?q=${encodeURIComponent(target.name)}`,
        source: 'X (Twitter) via Apify',
        sourceType: 'social',
        category: 'celebrity',
        publishedAt: tweet.createdAt ? new Date(tweet.createdAt) : new Date(),
        fetchedAt: new Date(),
        reliability: 3,
        tags: ['twitter', 'celebrity', target.category],
        speaker: target.name,
      })
    }
  }

  return {
    items,
    source: 'Apify (X/Twitter)',
    fetchedAt: new Date(),
    itemCount: items.length,
  }
}

// ─────────────────────────────────────────────
// X_WATCH_ACCOUNTS（50件）からツイート収集
// ─────────────────────────────────────────────
export async function collectXWatchAccounts(
  apiToken: string,
  options: {
    language?: 'en' | 'ja'
    specialty?: 'ai_coding' | 'ai_models' | 'crypto_bot' | 'dev_tools' | 'vibe_coding'
    maxPerAccount?: number
  } = {}
): Promise<CollectorResult> {
  const { language, specialty, maxPerAccount = 3 } = options
  const items: IntelligenceItem[] = []

  const handles = getXHandles({ language, specialty })
  if (handles.length === 0) {
    return { items: [], source: 'Apify (X Watch Accounts)', fetchedAt: new Date(), itemCount: 0 }
  }

  // バッチ処理（一度に最大10アカウント・コスト節約）
  const batchSize = 10
  for (let i = 0; i < handles.length; i += batchSize) {
    const batch = handles.slice(i, i + batchSize)
    const searchTerms = batch.map(h => `from:${h}`)

    try {
      const tweets = await runApifyActor(
        'apidojo~tweet-scraper',
        { searchTerms, maxItems: batch.length * maxPerAccount },
        apiToken
      )

      for (const tweet of tweets) {
        if (!tweet.text) continue

        const authorHandle = tweet.author?.userName?.toLowerCase() ?? ''
        const account = X_WATCH_ACCOUNTS.find(a => a.handle.toLowerCase() === authorHandle)

        // カテゴリ判定
        const specialty = account?.specialty[0]
        const category =
          specialty === 'crypto_bot' ? 'crypto' :
          specialty === 'ai_models'  ? 'ai_news' :
          'dev_tools'

        items.push({
          id: makeId('apify-watch', tweet.id ?? tweet.text),
          title: `[@${tweet.author?.userName ?? 'unknown'}] ${tweet.text.slice(0, 100)}${tweet.text.length > 100 ? '...' : ''}`,
          summary: tweet.text,
          url: tweet.url ?? `https://x.com/${tweet.author?.userName ?? ''}`,
          source: 'X (Twitter) via Apify',
          sourceType: 'social',
          category,
          publishedAt: tweet.createdAt ? new Date(tweet.createdAt) : new Date(),
          fetchedAt: new Date(),
          reliability: 3,
          tags: ['twitter', ...(account?.specialty ?? []), account?.language ?? 'en'],
          speaker: account?.name ?? tweet.author?.name,
        })
      }
    } catch (err) {
      console.debug(`Apify batch ${i}-${i + batchSize} failed:`, (err as Error).message)
    }
  }

  return {
    items,
    source: 'Apify (X Watch Accounts)',
    fetchedAt: new Date(),
    itemCount: items.length,
  }
}

// ─────────────────────────────────────────────
// AI・開発キーワードトレンド収集
// ─────────────────────────────────────────────
export async function collectXTrending(
  apiToken: string,
  keywords: string[],
  maxItems = 20
): Promise<CollectorResult> {
  const items: IntelligenceItem[] = []

  const tweets = await runApifyActor(
    'apidojo~tweet-scraper',
    { searchTerms: keywords, maxItems },
    apiToken
  )

  for (const tweet of tweets) {
    if (!tweet.text) continue

    // 著名人チェック
    const speaker = WATCH_TARGETS.find(t =>
      [t.name, ...t.aliases].some(alias =>
        (tweet.author?.name ?? '').toLowerCase().includes(alias.toLowerCase())
      )
    )

    items.push({
      id: makeId('apify-trend', tweet.id ?? tweet.text),
      title: `${tweet.author?.name ?? 'Unknown'}: ${tweet.text.slice(0, 80)}`,
      summary: tweet.text,
      url: tweet.url ?? '',
      source: 'X (Twitter) via Apify',
      sourceType: 'social',
      category: speaker ? 'celebrity' : 'ai_news',
      publishedAt: tweet.createdAt ? new Date(tweet.createdAt) : new Date(),
      fetchedAt: new Date(),
      reliability: 2,
      tags: ['twitter', 'trending', ...keywords.slice(0, 3)],
      speaker: speaker?.name,
    })
  }

  return {
    items,
    source: 'Apify (X Trending)',
    fetchedAt: new Date(),
    itemCount: items.length,
  }
}
