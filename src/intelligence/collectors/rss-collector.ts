/**
 * RSS Collector - 完全無料
 * 金融/AI/開発ニュースのRSSフィードを収集
 */

import { CollectorResult, IntelligenceCategory, IntelligenceItem, ReliabilityScore } from '../types'
import crypto from 'crypto'

interface RssSource {
  name: string
  url: string
  category: IntelligenceCategory
  reliability: ReliabilityScore
  language: 'ja' | 'en'
}

const RSS_SOURCES: RssSource[] = [
  // === AI・テックニュース ===
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', category: 'ai_news', reliability: 4, language: 'en' },
  { name: 'The Verge AI', url: 'https://www.theverge.com/ai-artificial-intelligence/rss/index.xml', category: 'ai_news', reliability: 4, language: 'en' },
  { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/', category: 'ai_news', reliability: 4, language: 'en' },
  { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', category: 'ai_news', reliability: 5, language: 'en' },
  // === 開発ツール ===
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'dev_tools', reliability: 4, language: 'en' },
  { name: 'Dev.to Trending', url: 'https://dev.to/feed', category: 'dev_tools', reliability: 3, language: 'en' },
  // === 金融・経済 ===
  { name: 'Reuters Finance', url: 'https://feeds.reuters.com/reuters/businessNews', category: 'finance', reliability: 5, language: 'en' },
  { name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', category: 'finance', reliability: 4, language: 'en' },
  // === 日本語 ===
  { name: '日経電子版', url: 'https://www.nikkei.com/rss/index.aspx', category: 'business', reliability: 5, language: 'ja' },
  { name: 'ITmedia AI', url: 'https://rss.itmedia.co.jp/rss/2.0/aiplus.xml', category: 'ai_news', reliability: 4, language: 'ja' },
  { name: 'ZDNet Japan', url: 'https://japan.zdnet.com/index.rdf', category: 'dev_tools', reliability: 4, language: 'ja' },
  // === ビジネス ===
  { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', category: 'business', reliability: 5, language: 'en' },
  { name: 'Bloomberg Tech', url: 'https://feeds.bloomberg.com/technology/news.rss', category: 'ai_news', reliability: 5, language: 'en' },
]

function generateId(url: string, title: string): string {
  return crypto.createHash('md5').update(`${url}:${title}`).digest('hex').slice(0, 16)
}

function parseRssDate(dateStr: string): Date {
  try {
    return new Date(dateStr)
  } catch {
    return new Date()
  }
}

function extractTextFromHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
}

async function fetchRssFeed(source: RssSource, maxItems: number): Promise<IntelligenceItem[]> {
  const response = await fetch(source.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IntelligenceBot/1.0)' },
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    throw new Error(`RSS fetch failed: ${response.status} ${source.url}`)
  }

  const xml = await response.text()
  const items: IntelligenceItem[] = []

  // シンプルなXMLパース（依存なし）
  const itemMatches = xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)

  let count = 0
  for (const match of itemMatches) {
    if (count >= maxItems) break

    const itemXml = match[1]
    const title = extractTextFromHtml(itemXml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
    const link = extractTextFromHtml(itemXml.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? itemXml.match(/<link[^>]*\/>/i)?.[0] ?? '')
    const description = extractTextFromHtml(itemXml.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] ?? '')
    const pubDate = itemXml.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ?? ''

    if (!title || !link) continue

    items.push({
      id: generateId(link, title),
      title,
      summary: description.slice(0, 300),
      url: link.trim(),
      source: source.name,
      sourceType: 'rss',
      category: source.category,
      publishedAt: parseRssDate(pubDate),
      fetchedAt: new Date(),
      reliability: source.reliability,
      tags: [],
    })
    count++
  }

  return items
}

export async function collectRssFeeds(
  maxItemsPerSource = 10,
  categories?: IntelligenceCategory[]
): Promise<CollectorResult[]> {
  const sources = categories
    ? RSS_SOURCES.filter(s => categories.includes(s.category))
    : RSS_SOURCES

  const results = await Promise.allSettled(
    sources.map(source => fetchRssFeed(source, maxItemsPerSource))
  )

  return results.map((result, i) => {
    const source = sources[i]
    if (result.status === 'fulfilled') {
      return {
        items: result.value,
        source: source.name,
        fetchedAt: new Date(),
        itemCount: result.value.length,
      }
    }
    return {
      items: [],
      source: source.name,
      fetchedAt: new Date(),
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      itemCount: 0,
    }
  })
}
