/**
 * Intelligence Scheduler
 * 定期実行 + キャッシュ管理
 *
 * 使い方: import { startScheduler } from './intelligence/scheduler'
 */

import { runIntelligence } from './index'
import { AggregationResult } from './aggregator'
import path from 'path'

interface SchedulerOptions {
  intervalMinutes?: number   // デフォルト: 30分
  outputDir?: string
  onResult?: (result: AggregationResult) => void
  onError?: (error: Error) => void
}

let cache: { result: AggregationResult; fetchedAt: Date } | null = null
let timer: ReturnType<typeof setInterval> | null = null

export function getCachedResult(): AggregationResult | null {
  if (!cache) return null
  const ageMinutes = (Date.now() - cache.fetchedAt.getTime()) / 60000
  // 60分以内のキャッシュは有効
  return ageMinutes < 60 ? cache.result : null
}

export function startScheduler(options: SchedulerOptions = {}): () => void {
  const intervalMs = (options.intervalMinutes ?? 30) * 60 * 1000
  const outputDir = options.outputDir ?? path.join(process.cwd(), 'research', 'runs')

  const run = async () => {
    try {
      const result = await runIntelligence({}, outputDir)
      cache = { result, fetchedAt: new Date() }
      options.onResult?.(result)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error('Scheduler error:', error.message)
      options.onError?.(error)
    }
  }

  // 即時実行
  run()

  // 定期実行
  timer = setInterval(run, intervalMs)
  console.log(`⏱  Scheduler 起動: ${options.intervalMinutes ?? 30}分ごとに収集`)

  // 停止関数を返す
  return () => {
    if (timer) {
      clearInterval(timer)
      timer = null
      console.log('Scheduler 停止')
    }
  }
}
