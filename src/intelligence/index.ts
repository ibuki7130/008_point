/**
 * Global Intelligence System - Entry Point
 *
 * 使い方:
 *   npx ts-node src/intelligence/index.ts
 *   または
 *   import { runIntelligence } from './intelligence'
 */

import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import { aggregate, AggregationResult } from './aggregator'
import { saveReport, generateMarkdownReport } from './report'
import { IntelligenceConfig } from './types'

export { aggregate, generateMarkdownReport, saveReport }
export type { AggregationResult, IntelligenceConfig }

export async function runIntelligence(
  config?: Partial<IntelligenceConfig>,
  outputDir?: string
): Promise<AggregationResult> {
  const fullConfig: IntelligenceConfig = {
    newsApiKey: process.env.NEWS_API_KEY,
    fredApiKey: process.env.FRED_API_KEY,
    redditClientId: process.env.REDDIT_CLIENT_ID,
    redditClientSecret: process.env.REDDIT_CLIENT_SECRET,
    apifyToken: process.env.APIFY_TOKEN,
    claudeApiKey: process.env.ANTHROPIC_API_KEY,
    xaiApiKey: process.env.XAI_API_KEY,
    maxItemsPerSource: 10,
    ...config,
  }

  console.log('🌐 Global Intelligence System 起動中...')
  console.log(`📡 有効ソース: RSS, HackerNews, GitHub Trending, World Bank, Reddit${fullConfig.fredApiKey ? ', FRED' : ''}${fullConfig.newsApiKey ? ', NewsAPI' : ''}${fullConfig.apifyToken ? ', Apify(X/Twitter)' : ''}${fullConfig.xaiApiKey ? ', xAI Grok(Web検索)' : ''}`)

  const result = await aggregate(fullConfig)

  console.log(`✅ 収集完了: ${result.totalCount}件 (${result.durationMs}ms)`)
  console.log(`👤 著名人言及: ${result.celebrities.length}件`)
  console.log(`📊 経済指標: ${result.economics.length}件`)

  if (result.errors.length > 0) {
    console.warn(`⚠️  エラー ${result.errors.length}件:`)
    for (const e of result.errors) {
      console.warn(`   - ${e.source}: ${e.error}`)
    }
  }

  if (outputDir) {
    const { markdownPath, jsonPath } = await saveReport(
      result,
      outputDir
    )
    console.log(`📄 レポート保存: ${markdownPath}`)
    console.log(`📦 JSONデータ: ${jsonPath}`)
  }

  return result
}

// CLI実行
if (require.main === module) {
  const outputDir = path.join(process.cwd(), 'research', 'runs',
    `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}__intelligence`)

  runIntelligence({}, outputDir)
    .then(result => {
      console.log('\n=== カテゴリ別集計 ===')
      for (const [cat, items] of Object.entries(result.byCategory)) {
        if (items.length > 0) {
          console.log(`  ${cat}: ${items.length}件`)
        }
      }

      if (result.celebrities.length > 0) {
        console.log('\n=== 著名人発言トップ5 ===')
        result.celebrities.slice(0, 5).forEach(item => {
          console.log(`  [${item.speaker}] ${item.title.slice(0, 70)}`)
        })
      }

      process.exit(0)
    })
    .catch(err => {
      console.error('Fatal error:', err)
      process.exit(1)
    })
}
