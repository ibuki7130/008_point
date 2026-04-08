#!/usr/bin/env node
/**
 * rules-read-tracker.js — ルールRead履歴トラッカー
 *
 * PostToolUse hookとして動作。Read tool実行後、対象ファイルが
 * .claude/rules/* または重要ルールファイルの場合、
 * 「Read済み」フラグを記録する。
 *
 * このフラグは rules-enforce-guard.js で参照される。
 *
 * 2026-04-09 更新:
 * - JSON → JSONL に変更（race condition対策・append-onlyで競合消失防止）
 * - safeSessionFile によるパストラバーサル対策
 * - stdin timeout 追加
 * - catch 内 console.error でデバッグ性向上
 *
 * 安全設計: フェイルオープン・常に exit 0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getSessionId, safeSessionFile } = require('./utils/session-path');

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const READ_LOG_DIR = path.join(PROJECT_ROOT, '.claude', 'checkpoints');

// 追跡対象のファイルパターン
const TRACKED_PATTERNS = [
  /\.claude\/rules\/.*\.md$/,
  /\.claude\/CLAUDE\.md$/,
  /\.claude\/hooks\/mistakes\.md$/,
  /SESSION_HANDOFF\.md$/,
];

function recordRead(filePath) {
  try {
    if (!filePath) return;

    // 追跡対象か確認
    const isTracked = TRACKED_PATTERNS.some(p => p.test(filePath));
    if (!isTracked) return;

    // 記録先ファイル（パストラバーサル対策）
    const sessionId = getSessionId();
    const logFile = safeSessionFile(READ_LOG_DIR, `read_${sessionId}.jsonl`);
    if (!logFile) return; // 不正なsessionIdは無視

    fs.mkdirSync(READ_LOG_DIR, { recursive: true });

    // JSONL append-only（race condition対策）
    // appendFileSync は atomic で並行実行でもエントリが消えない
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      file: filePath,
    }) + '\n';
    fs.appendFileSync(logFile, entry);
  } catch (e) {
    console.error('rules-read-tracker recordRead error:', e.message);
  }
}

/**
 * 既読ファイルの一覧を取得（rules-enforce-guardから呼ばれる）
 * @param {string} sessionId
 * @returns {string[]}
 */
function getReadFiles(sessionId) {
  try {
    const logFile = safeSessionFile(READ_LOG_DIR, `read_${sessionId}.jsonl`);
    if (!logFile || !fs.existsSync(logFile)) return [];

    const content = fs.readFileSync(logFile, 'utf8');
    const files = new Set();
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.file) files.add(entry.file);
      } catch (e) {}
    }
    return Array.from(files);
  } catch (e) {
    console.error('rules-read-tracker getReadFiles error:', e.message);
    return [];
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
    if (!input) {
      process.exit(0);
      return;
    }

    const data = JSON.parse(input);

    // Read tool の実行のみ追跡
    if (data.tool_name === 'Read') {
      const filePath = data.tool_input && data.tool_input.file_path;
      recordRead(filePath);
    }

    process.exit(0);
  } catch (e) {
    console.error('rules-read-tracker main error:', e.message);
    process.exit(0); // フェイルオープン
  }
}

if (require.main === module) main();

module.exports = { recordRead, getReadFiles, getSessionId };
