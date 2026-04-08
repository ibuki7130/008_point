#!/usr/bin/env node
/**
 * StopFailure Logger — StopFailure hookイベント
 * API障害・レート制限でセッションが停止した時に自動記録
 * 配布ユーザーが「なぜ止まったか」を確認できるようにする
 */
const fs = require('fs')
const path = require('path')

const LOG_DIR = path.join(__dirname, 'data')
const LOG_PATH = path.join(LOG_DIR, 'stop-failure-log.jsonl')

try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

  let input = ''
  if (!process.stdin.isTTY) {
    try {
      input = fs.readFileSync('/dev/stdin', 'utf-8')
    } catch (e) {
      // stdin not available
    }
  }

  const entry = {
    ts: new Date().toISOString(),
    event: 'stop_failure',
    session: process.env.CLAUDE_SESSION_ID || 'unknown',
    error_type: 'unknown',
    details: '',
  }

  // Parse error info from stdin or env
  if (input) {
    try {
      const data = JSON.parse(input)
      entry.error_type = data.error_type || data.type || 'unknown'
      entry.details = data.message || data.error || JSON.stringify(data).substring(0, 500)
    } catch (e) {
      entry.details = input.substring(0, 500)
    }
  }

  // Detect common failure patterns
  const details = entry.details.toLowerCase()
  if (details.includes('rate') || details.includes('429')) {
    entry.error_type = 'rate_limit'
  } else if (details.includes('auth') || details.includes('401') || details.includes('403')) {
    entry.error_type = 'auth_failure'
  } else if (details.includes('timeout') || details.includes('504')) {
    entry.error_type = 'timeout'
  } else if (details.includes('500') || details.includes('internal')) {
    entry.error_type = 'server_error'
  }

  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n')
  process.stderr.write(`[stop-failure] Logged: ${entry.error_type}\n`)
} catch (e) {
  process.stderr.write(`[stop-failure] ${e.message}\n`)
}

process.exit(0)
