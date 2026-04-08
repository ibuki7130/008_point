#!/usr/bin/env node
/**
 * checkpoint-guard.js — Boot Sequence 物理強制システム
 *
 * Claude Code が CLAUDE.md の手順を自己判断でスキップする問題を防ぐ。
 *
 * 動作モード（環境変数 CHECKPOINT_GUARD_PHASE で制御）:
 *   '0' = 完全無効化（緊急停止用）
 *   '1' = 警告モード（ログのみ、ブロックしない） ← デフォルト・現在
 *   '2' = 新規Writeのみブロック
 *   '3' = Write/Edit/Bash すべてブロック
 *
 * 安全設計:
 *   - エラー時は必ずフェイルオープン（作業を止めない）
 *   - タイムアウト3秒
 *   - 環境変数で即座に無効化可能
 *   - Read/Glob/Grep/WebFetch/WebSearch は常に通過
 *
 * チェックポイント完了ファイル:
 *   .claude/checkpoints/done_${sessionId}.flag
 *   TTL: 8時間で自動削除
 */

'use strict';

const fs = require('fs');
const path = require('path');

// === 設定 ===
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const CHECKPOINT_DIR = path.join(PROJECT_ROOT, '.claude', 'checkpoints');
const SKIP_LOG = path.join(PROJECT_ROOT, '.claude', 'hooks', 'data', 'checkpoint-skip.log');
const PHASE = process.env.CHECKPOINT_GUARD_PHASE || '1';
const TTL_MS = 8 * 60 * 60 * 1000; // 8時間

// === セッションID取得（フォールバック付き） ===
function getSessionId() {
  if (process.env.CLAUDE_SESSION_ID) return process.env.CLAUDE_SESSION_ID;
  const today = new Date().toISOString().split('T')[0];
  return `${today}_${process.pid}`;
}

// === ホワイトリスト: これらのファイルへの書き込みは常に許可 ===
const ALWAYS_ALLOW_WRITE_PATTERNS = [
  /\.claude\/checkpoints\//,        // checkpoint完了ファイル
  /\.claude\/hooks\/data\//,         // hookの自動データ
  /SESSION_HANDOFF\.md$/,            // セッション引き継ぎ
  /\.claude\/memory\.md$/,           // メモリ
  /\.workflow_state\.json$/,         // ワークフロー状態
  /mistakes\.md$/,                   // 違反記録
  /\.claude\/handoff\.json$/,        // handoff
];

// === ホワイトリスト: これらのBashコマンドは常に許可 ===
const ALWAYS_ALLOW_BASH_PATTERNS = [
  /^cat\s+\.claude\//,
  /^ls(\s+|$)/,
  /^node\s+\.claude\/hooks\//,
  /^touch\s+\.claude\/checkpoints\//,
  /^mkdir\s+-p\s+\.claude\//,
  /^echo\s+/,
  /^pwd$/,
];

// === チェックポイント完了判定 ===
function isCheckpointDone(sessionId) {
  try {
    if (!fs.existsSync(CHECKPOINT_DIR)) return false;
    const flagFile = path.join(CHECKPOINT_DIR, `done_${sessionId}.flag`);
    if (!fs.existsSync(flagFile)) return false;

    const stat = fs.statSync(flagFile);
    const age = Date.now() - stat.mtimeMs;
    if (age > TTL_MS) {
      try { fs.unlinkSync(flagFile); } catch (e) {}
      return false;
    }
    return true;
  } catch (e) {
    return true; // エラー時はフェイルオープン
  }
}

// === 古いフラグの自動クリーンアップ ===
function cleanupOldFlags() {
  try {
    if (!fs.existsSync(CHECKPOINT_DIR)) return;
    const files = fs.readdirSync(CHECKPOINT_DIR);
    const now = Date.now();
    for (const f of files) {
      if (!f.startsWith('done_') || !f.endsWith('.flag')) continue;
      const fullPath = path.join(CHECKPOINT_DIR, f);
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > TTL_MS) {
          fs.unlinkSync(fullPath);
        }
      } catch (e) {}
    }
  } catch (e) {}
}

// === スキップ記録 ===
function logSkip(sessionId, toolName, detail) {
  try {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      session: sessionId,
      tool: toolName,
      detail: detail.substring(0, 200),
      phase: PHASE,
    }) + '\n';
    fs.mkdirSync(path.dirname(SKIP_LOG), { recursive: true });
    fs.appendFileSync(SKIP_LOG, entry);
  } catch (e) {}
}

// === メインチェック関数 ===
function check(toolName, toolInput) {
  try {
    // Phase 0: 完全無効化
    if (PHASE === '0') return null;

    // 読み取り系ツールは常に通過（循環ブロック防止）
    const READ_ONLY_TOOLS = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'TodoRead', 'BashOutput'];
    if (READ_ONLY_TOOLS.includes(toolName)) return null;

    cleanupOldFlags();
    const sessionId = getSessionId();

    // チェックポイント完了済み → 通過
    if (isCheckpointDone(sessionId)) return null;

    // ホワイトリストチェック（Write/Edit）
    if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') {
      const filePath = (toolInput && (toolInput.file_path || toolInput.path)) || '';
      if (ALWAYS_ALLOW_WRITE_PATTERNS.some(p => p.test(filePath))) return null;
    }

    // ホワイトリストチェック（Bash）
    if (toolName === 'Bash') {
      const cmd = ((toolInput && toolInput.command) || '').trim();
      // コマンド連結文字を含む場合はホワイトリスト適用外（迂回防止）
      const hasDangerousChars = /[;&|`$()<>]/.test(cmd);
      if (!hasDangerousChars && ALWAYS_ALLOW_BASH_PATTERNS.some(p => p.test(cmd))) return null;
    }

    // ここに到達 = checkpoint未完了でツール実行を試みている
    const detail = (toolInput && (toolInput.file_path || toolInput.command || toolInput.path)) || '';
    logSkip(sessionId, toolName, detail);

    // Phase 1: 警告のみ（ブロックなし）← デフォルト
    if (PHASE === '1') return null;

    // Phase 2: Writeのみブロック
    if (PHASE === '2' && toolName !== 'Write') return null;

    // Phase 2/3: ブロック発動
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: [
          '【CHECKPOINT REQUIRED】boot sequence が未完了です。',
          '',
          '以下を実行してから再試行してください:',
          '1. CLAUDE.md の Pre-Flight Checks を確認',
          '2. SESSION_HANDOFF.md（存在すれば）を読む',
          '3. .workflow_state.json の状態を確認',
          '4. 完了後: mkdir -p .claude/checkpoints && touch .claude/checkpoints/done_' + sessionId + '.flag',
          '',
          '緊急停止: export CHECKPOINT_GUARD_PHASE=0',
        ].join('\n'),
      },
    };
  } catch (e) {
    // フェイルオープン: エラー時は必ず通す
    return null;
  }
}

// === スタンドアロン実行（テスト用 + hook単体動作） ===
async function main() {
  // stdin timeout (3秒)
  const timer = setTimeout(() => process.exit(0), 3000);
  timer.unref();

  try {
    // stdinから読む
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
    // フェイルオープン
    console.error('checkpoint-guard main error:', e.message);
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { check, getSessionId, isCheckpointDone, PHASE };
