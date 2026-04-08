/**
 * Intelligence Report Generator
 * 収集データをMarkdown/JSONレポートに変換
 */

import { AggregationResult } from './aggregator'
import { IntelligenceItem, IntelligenceCategory } from './types'
import fs from 'fs/promises'
import path from 'path'

const CATEGORY_LABELS: Record<IntelligenceCategory, string> = {
  finance: '💰 金融・株式・FX',
  economics: '📊 経済指標・マクロ',
  ai_news: '🤖 AI・機械学習',
  dev_tools: '🛠 開発ツール・OSS',
  celebrity: '👤 著名人・経済界発言',
  crypto: '₿ 暗号資産',
  business: '🏢 ビジネス',
  tech_community: '💬 技術コミュニティ',
}

function formatItem(item: IntelligenceItem, index: number): string {
  const date = item.publishedAt.toLocaleDateString('ja-JP', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const speaker = item.speaker ? ` **[${item.speaker}]**` : ''
  const reliability = '⭐'.repeat(item.reliability)

  return [
    `${index + 1}. **${item.title}**${speaker}`,
    `   - ${item.summary.slice(0, 120)}${item.summary.length > 120 ? '...' : ''}`,
    `   - 📅 ${date} | 📰 ${item.source} | ${reliability}`,
    `   - 🔗 ${item.url}`,
  ].join('\n')
}

export function generateMarkdownReport(result: AggregationResult): string {
  const now = new Date().toLocaleString('ja-JP')
  const lines: string[] = []

  lines.push(`# 🌐 Global Intelligence Report`)
  lines.push(`> 生成日時: ${now} | 収集件数: ${result.totalCount} | 取得時間: ${result.durationMs}ms`)
  lines.push('')

  // エラーサマリー
  if (result.errors.length > 0) {
    lines.push('## ⚠️ 収集エラー')
    for (const e of result.errors) {
      lines.push(`- **${e.source}**: ${e.error}`)
    }
    lines.push('')
  }

  // 著名人発言 (最優先表示)
  if (result.celebrities.length > 0) {
    lines.push(`## ${CATEGORY_LABELS.celebrity}`)
    lines.push(`> ${result.celebrities.length}件の発言・言及を検出`)
    lines.push('')
    result.celebrities.slice(0, 10).forEach((item, i) => {
      lines.push(formatItem(item, i))
      lines.push('')
    })
  }

  // 経済指標
  if (result.economics.length > 0) {
    lines.push(`## ${CATEGORY_LABELS.economics}`)
    lines.push('')
    for (const item of result.economics.slice(0, 10)) {
      if (item.indicator) {
        const { name, value, unit, previousValue, changePercent, country, date } = item.indicator
        const arrow = changePercent !== undefined
          ? changePercent > 0.1 ? ' 🔴↑' : changePercent < -0.1 ? ' 🟢↓' : ' ➡️'
          : ''
        lines.push(`| **${name}** | ${value} ${unit}${arrow} | ${previousValue ?? '-'} | ${country} | ${date} |`)
      }
    }
    if (result.economics.some(i => i.indicator)) {
      lines.splice(lines.lastIndexOf(`## ${CATEGORY_LABELS.economics}`) + 2, 0,
        '| 指標 | 最新値 | 前回値 | 国 | 日付 |',
        '|-----|--------|--------|-----|------|'
      )
    }
    lines.push('')
  }

  // カテゴリ別ニュース
  const categoryOrder: IntelligenceCategory[] = ['ai_news', 'dev_tools', 'finance', 'business', 'crypto', 'tech_community']
  for (const cat of categoryOrder) {
    const items = result.byCategory[cat]
    if (!items || items.length === 0) continue

    lines.push(`## ${CATEGORY_LABELS[cat]}`)
    lines.push('')
    items.slice(0, 8).forEach((item, i) => {
      lines.push(formatItem(item, i))
      lines.push('')
    })
  }

  return lines.join('\n')
}

export async function saveReport(
  result: AggregationResult,
  outputDir: string
): Promise<{ markdownPath: string; jsonPath: string }> {
  await fs.mkdir(outputDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const markdownPath = path.join(outputDir, `intelligence-${timestamp}.md`)
  const jsonPath = path.join(outputDir, `intelligence-${timestamp}.json`)

  const markdown = generateMarkdownReport(result)
  await fs.writeFile(markdownPath, markdown, 'utf-8')

  // JSON保存 (Date を文字列に変換)
  const jsonData = {
    ...result,
    fetchedAt: result.fetchedAt.toISOString(),
    items: result.items.map(item => ({
      ...item,
      publishedAt: item.publishedAt.toISOString(),
      fetchedAt: item.fetchedAt.toISOString(),
    })),
  }
  await fs.writeFile(jsonPath, JSON.stringify(jsonData, null, 2), 'utf-8')

  return { markdownPath, jsonPath }
}
