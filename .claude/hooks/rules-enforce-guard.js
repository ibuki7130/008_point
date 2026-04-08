#!/usr/bin/env node
/**
 * rules-enforce-guard.js — ルール読み込み強制 + サブエージェント迂回対策
 *
 * PreToolUse hook (Write/Edit/Bash/Task/MultiEdit) として動作。
 *
 * 必須ルールファイルが今セッションでReadされているかを物理確認し、
 * 未読ならツール実行をブロックする。
 *
 * サブエージェント迂回対策:
 *   Task tool もチェック対象に含める。親が未読なら子も起動できない。
 *
 * 環境変数:
 *   RULES_ENFORCE_PHASE='0' = 完全無効化
 *   RULES_ENFORCE_PHASE='1' = 警告のみ（デフォルト）
 *   RULES_ENFORCE_PHASE='2' = ブロック発動
 *
 * 必須Read対象（最小限）:
 *   - .claude/hooks/mistakes.md
 *
 * 安全設計: フェイルオープン・タイムアウト3秒・環境変数で停止可能
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const READ_LOG_DIR = path.join(PROJECT_ROOT, '.claude', 'checkpoints');
const SKIP_LOG = path.join(PROJECT_ROOT, '.claude', 'hooks', 'data', 'rules-enforce-skip.log');
const PHASE = process.env.RULES_ENFORCE_PHASE || '1';

// 必須Read対象（最小限に絞る - Bootstrap問題回避）
const REQUIRED_READS = [
  'mistakes.md',
];

// チェック対象ツール
const CHECKED_TOOLS = ['Write', 'Edit', 'MultiEdit', 'Task', 'Bash'];

// ホワイトリスト: これらは常に通過
const ALWAYS_ALLOW_WRITE_PATTERNS = [
  /\.claude\/checkpoints\//,
  /\.claude\/hooks\/data\//,
  /SESSION_HANDOFF\.md$/,
  /mistakes\.md$/,
];

const ALWAYS_ALLOW_BASH_PATTERNS = [
  /^cat\s+/,
  /^ls(\s+|$)/,
  /^node\s+\.claude\/hooks\//,
  /^touch\s+\.claude\/checkpoints\//,
  /^mkdir\s+-p\s+\.claude\//,
  /^echo\s+/,
  /^pwd$/,
  /^git\s+(status|diff|log)/,
];

const { getSessionId, safeSessionFile } = require('./utils/session-path');

// 今セッションで Read されたファイル一覧を取得（JSONL形式対応）
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
    console.error('rules-enforce getReadFiles error:', e.message);
    return [];
  }
}

// 必須Reads が全て満たされているかチェック
function checkRequiredReads(sessionId) {
  const readFiles = getReadFiles(sessionId);
  const missing = [];

  for (const required of REQUIRED_READS) {
    const isRead = readFiles.some(f => f.endsWith(required) || f.includes(required));
    if (!isRead) missing.push(required);
  }

  return missing;
}

function logSkip(toolName, missing, detail) {
  try {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      tool: toolName,
      missing,
      detail: detail.substring(0, 200),
      phase: PHASE,
    }) + '\n';
    fs.mkdirSync(path.dirname(SKIP_LOG), { recursive: true });
    fs.appendFileSync(SKIP_LOG, entry);
  } catch (e) {}
}

function check(toolName, toolInput) {
  try {
    if (PHASE === '0') return null;
    if (!CHECKED_TOOLS.includes(toolName)) return null;
    if (!toolInput) return null;

    // ホワイトリストチェック
    if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') {
      const filePath = toolInput.file_path || toolInput.path || '';
      if (ALWAYS_ALLOW_WRITE_PATTERNS.some(p => p.test(filePath))) return null;
    }

    if (toolName === 'Bash') {
      const cmd = (toolInput.command || '').trim();
      // コマンド連結文字を含む場合はホワイトリスト適用外（迂回防止）
      const hasDangerousChars = /[;&|`$()<>]/.test(cmd);
      if (!hasDangerousChars && ALWAYS_ALLOW_BASH_PATTERNS.some(p => p.test(cmd))) return null;
    }

    // 必須Read確認
    const sessionId = getSessionId();
    const missing = checkRequiredReads(sessionId);

    if (missing.length === 0) return null; // 全て読み込み済み → 通過

    // 違反検知
    const detail = (toolInput.file_path || toolInput.command || toolInput.subagent_type || '');
    logSkip(toolName, missing, detail);

    // Phase 1: 警告のみ
    if (PHASE === '1') return null;

    // Phase 2: ブロック発動
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: [
          '【RULES READ REQUIRED】必須ルールファイルが未読です。',
          '',
          '以下のファイルを Read してから再試行してください:',
          ...missing.map(f => `  - ${f}`),
          '',
          'Read 例:',
          '  Read .claude/hooks/mistakes.md',
          '',
          toolName === 'Task'
            ? '※ サブエージェント経由でも迂回不可（親Claudeがルール読み込み必須）'
            : '',
          '緊急停止: export RULES_ENFORCE_PHASE=0',
        ].filter(Boolean).join('\n'),
      },
    };
  } catch (e) {
    return null; // フェイルオープン
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
    const result = check(data.tool_name, data.tool_input || {});
    if (result) {
      console.log(JSON.stringify(result));
    }
    process.exit(0);
  } catch (e) {
    console.error('rules-enforce-guard main error:', e.message);
    process.exit(0);
  }
}

if (require.main === module) main();

module.exports = { check, getReadFiles, checkRequiredReads, PHASE };
