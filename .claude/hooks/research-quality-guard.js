#!/usr/bin/env node
/**
 * research-quality-guard.js — リサーチ品質の物理強制
 *
 * research-system / omega-research / mega-research スキル実行時、
 * 必須のソース網羅（X/YouTube/arxiv/GitHub/HN/日本語）を物理確認。
 * 未達成ならWrite/Editをブロック（リサーチ結果保存を止める）。
 *
 * 環境変数:
 *   RESEARCH_QUALITY_PHASE='0' = 無効
 *   RESEARCH_QUALITY_PHASE='1' = 警告のみ（デフォルト）
 *   RESEARCH_QUALITY_PHASE='2' = ブロック有効
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const LOG_FILE = path.join(PROJECT_ROOT, '.claude', 'hooks', 'data', 'research-quality.log');
const PHASE = process.env.RESEARCH_QUALITY_PHASE || '1';

// リサーチ実行を検知するパス
const RESEARCH_OUTPUT_PATTERNS = [
  /research\/runs\/.*\/report\.md$/,
  /research\/runs\/.*\/agent_[abc]_.*\.md$/,
];

// 必須カテゴリ（最低1件以上の参照が必要）
const REQUIRED_SOURCES = {
  'X/Twitter': ['twitter.com/search', 'x.com/', 'nitter.'],
  'YouTube': ['youtube.com', 'youtu.be', 'yt-dlp'],
  'arxiv論文': ['arxiv.org/abs/', 'arxiv.org/pdf/'],
  'GitHub': ['github.com/'],
  'HN/Reddit': ['news.ycombinator.com', 'hn.algolia.com', 'reddit.com'],
  '日本語': ['zenn.dev', 'qiita.com', 'note.com', 'hatena.ne.jp'],
};

function logQualityCheck(filePath, missing, phase) {
  try {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      file: filePath,
      missing,
      phase,
    }) + '\n';
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, entry);
  } catch (e) {}
}

function checkSourceCoverage(content) {
  const missing = [];
  for (const [category, patterns] of Object.entries(REQUIRED_SOURCES)) {
    const found = patterns.some(p => content.includes(p));
    if (!found) missing.push(category);
  }
  return missing;
}

function check(toolName, toolInput) {
  try {
    if (PHASE === '0') return null;
    if (toolName !== 'Write' && toolName !== 'Edit' && toolName !== 'MultiEdit') return null;

    const filePath = (toolInput && (toolInput.file_path || toolInput.path)) || '';

    // リサーチ出力ファイルか確認
    const isResearchOutput = RESEARCH_OUTPUT_PATTERNS.some(p => p.test(filePath));
    if (!isResearchOutput) return null;

    // 内容を取得
    const content = toolInput.content || toolInput.new_string || '';
    if (content.length < 500) return null; // 短すぎる場合はスキップ

    // ソースカバレッジチェック
    const missing = checkSourceCoverage(content);
    if (missing.length === 0) return null; // 全カテゴリOK

    logQualityCheck(filePath, missing, PHASE);

    // Phase 1: 警告のみ
    if (PHASE === '1') return null;

    // Phase 2: ブロック
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: [
          '【RESEARCH QUALITY INSUFFICIENT】リサーチ網羅性が不足しています。',
          '',
          '以下のカテゴリの情報が不足しています:',
          ...missing.map(m => `  - ${m}`),
          '',
          '各カテゴリから最低1件以上のソースを取得してください:',
          '  - X/Twitter: nitter.net または opencli-rs 経由の検索',
          '  - YouTube: youtube検索またはyt-dlp',
          '  - arxiv: 論文検索API',
          '  - GitHub: リポジトリ・Issues調査',
          '  - HN/Reddit: コミュニティ議論',
          '  - 日本語: Zenn/Qiita/note',
          '',
          '緊急停止: export RESEARCH_QUALITY_PHASE=0',
        ].join('\n'),
      },
    };
  } catch (e) {
    return null;
  }
}

async function main() {
  // stdin timeout (3秒)
  const timer = setTimeout(() => process.exit(0), 3000);
  timer.unref();

  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const input = Buffer.concat(chunks).toString('utf8');
    if (!input) { process.exit(0); return; }

    const data = JSON.parse(input);
    const result = check(data.tool_name, data.tool_input || {});
    if (result) console.log(JSON.stringify(result));
    process.exit(0);
  } catch (e) {
    console.error('research-quality-guard main error:', e.message);
    process.exit(0);
  }
}

if (require.main === module) main();

module.exports = { check, checkSourceCoverage };
