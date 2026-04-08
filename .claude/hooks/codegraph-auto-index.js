#!/usr/bin/env node
/**
 * CodeGraph Auto-Index — PostToolUse hook
 * Write/Edit 後に codebase-memory-mcp の差分再索引をトリガー
 * async実行でブロッキングしない
 */
const { spawnSync } = require('child_process')
const path = require('path')

const CBM_BIN = path.join(__dirname, '..', '..', 'tools', 'codebase-memory-mcp', 'codebase-memory-mcp')
const PROJECT_ROOT = path.join(__dirname, '..', '..')

try {
  // 非同期で再索引（タイムアウト10秒、失敗してもブロックしない）
  const result = spawnSync(CBM_BIN, [
    'cli', 'index_repository',
    JSON.stringify({ repo_path: PROJECT_ROOT })
  ], {
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: PROJECT_ROOT,
  })

  if (result.status === 0) {
    process.stderr.write('[codegraph] auto-index updated\n')
  }
} catch (e) {
  // non-blocking
  process.stderr.write(`[codegraph] auto-index skip: ${e.message}\n`)
}

process.exit(0)
