#!/usr/bin/env node
/**
 * CodeGraph ROI Meter — PostToolUse hook
 * Grep/Read/Glob の呼び出しをJSONLログに記録してベースラインを取得
 */
const fs = require('fs')
const path = require('path')

const LOG_DIR = path.join(__dirname, 'data')
const LOG_PATH = path.join(LOG_DIR, 'codegraph-roi-log.jsonl')

try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

  const toolName = process.env.TOOL_NAME || ''
  const trackedTools = ['Read', 'Grep', 'Glob']

  if (!trackedTools.includes(toolName)) {
    process.exit(0)
  }

  const inputSize = parseInt(process.env.TOOL_INPUT_SIZE || '0', 10)
  const outputSize = parseInt(process.env.TOOL_OUTPUT_SIZE || '0', 10)

  const entry = {
    ts: new Date().toISOString(),
    tool: toolName,
    input_tokens_est: Math.ceil(inputSize / 4),
    output_tokens_est: Math.ceil(outputSize / 4),
    session: process.env.CLAUDE_SESSION_ID || 'unknown',
  }

  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n')
} catch (e) {
  // non-blocking: hook failure must not break workflow
  process.stderr.write(`[codegraph-roi-meter] ${e.message}\n`)
}

process.exit(0)
