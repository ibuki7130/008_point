#!/usr/bin/env node
/**
 * Agent Usage Logger — PostToolUse hook (Task matcher)
 * どのエージェントがどのくらい使われているかをログに記録
 */
const fs = require('fs')
const path = require('path')

const LOG_DIR = path.join(__dirname, 'data')
const LOG_PATH = path.join(LOG_DIR, 'agent-usage-log.jsonl')

try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

  const entry = {
    ts: new Date().toISOString(),
    event: 'agent_call',
    session: process.env.CLAUDE_SESSION_ID || 'unknown',
  }

  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n')
} catch (e) {
  process.stderr.write(`[agent-usage-logger] ${e.message}\n`)
}

process.exit(0)
