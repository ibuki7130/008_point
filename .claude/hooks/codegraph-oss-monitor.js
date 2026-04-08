#!/usr/bin/env node
/**
 * CodeGraph OSS Health Monitor — SessionStart hook
 * セッション開始時にOSSの健全性を自動チェック
 * 60日更新停止で警告を出す
 */
const https = require('https')
const fs = require('fs')
const path = require('path')

const REPOS = [
  { name: 'codebase-memory-mcp', owner: 'DeusData', repo: 'codebase-memory-mcp' },
]

const CACHE_PATH = path.join(__dirname, 'data', 'oss-health-cache.json')
const WARNING_DAYS = 60

function fetchLastCommit(owner, repo) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/commits?per_page=1`,
      headers: { 'User-Agent': 'taisun-agent-oss-monitor' },
    }
    https.get(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const commits = JSON.parse(data)
          if (Array.isArray(commits) && commits.length > 0) {
            resolve(commits[0].commit.committer.date)
          } else {
            resolve(null)
          }
        } catch (e) { resolve(null) }
      })
    }).on('error', () => resolve(null))
  })
}

async function main() {
  // Check cache - only run once per day
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'))
      const cacheAge = Date.now() - new Date(cache.checked_at).getTime()
      if (cacheAge < 24 * 60 * 60 * 1000) {
        // Already checked today
        if (cache.warnings && cache.warnings.length > 0) {
          process.stderr.write(`[codegraph-oss] ${cache.warnings.join(', ')}\n`)
        }
        process.exit(0)
      }
    }
  } catch (e) { /* ignore cache errors */ }

  const warnings = []

  for (const r of REPOS) {
    const lastCommitDate = await fetchLastCommit(r.owner, r.repo)
    if (lastCommitDate) {
      const daysSince = Math.floor((Date.now() - new Date(lastCommitDate).getTime()) / (1000 * 60 * 60 * 24))
      if (daysSince >= WARNING_DAYS) {
        warnings.push(`WARNING: ${r.name} last commit ${daysSince} days ago (>${WARNING_DAYS}d threshold)`)
      }
    }
  }

  // Save cache
  const cacheDir = path.dirname(CACHE_PATH)
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(CACHE_PATH, JSON.stringify({
    checked_at: new Date().toISOString(),
    warnings,
  }))

  if (warnings.length > 0) {
    process.stderr.write(`[codegraph-oss] ${warnings.join('\n')}\n`)
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(0))
