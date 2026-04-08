#!/usr/bin/env node
/**
 * context-snapshot-manager.js — コンパクト前後のコンテキスト記憶保護
 *
 * 目的: 巨大コンテキスト（リサーチ等）でコンパクト実行時に重要情報を失わない
 *
 * 仕組み:
 *   1. PreCompact hook: 一時保存場所に重要情報を書き出し
 *   2. SessionStart hook: 前回の一時保存を読み込んでClaudeに提示
 *   3. SessionEnd hook: 一時保存を削除
 *
 * 保存場所: .claude/temp-context/${session_id}/
 *   - snapshot.md        : 最新スナップショット
 *   - findings.jsonl     : 重要発見の蓄積
 *   - checkpoints.md     : チェックポイント通過記録
 *   - pending.md         : 未完了タスク
 *
 * 環境変数:
 *   CONTEXT_SNAPSHOT_PHASE='0' = 無効
 *   CONTEXT_SNAPSHOT_PHASE='1' = 有効（デフォルト）
 *
 * 安全設計: フェイルオープン・全エラーをcatch
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const TEMP_CONTEXT_ROOT = path.join(PROJECT_ROOT, '.claude', 'temp-context');
const PHASE = process.env.CONTEXT_SNAPSHOT_PHASE || '1';

function getSessionId() {
  if (process.env.CLAUDE_SESSION_ID) return process.env.CLAUDE_SESSION_ID;
  const today = new Date().toISOString().split('T')[0];
  return `${today}_${process.pid}`;
}

function getSessionDir(sessionId) {
  return path.join(TEMP_CONTEXT_ROOT, sessionId || getSessionId());
}

// ─────────────────────────────────────────
// 1. SNAPSHOT CREATE — コンパクト前に呼ぶ
// ─────────────────────────────────────────
function createSnapshot(sessionId, content) {
  try {
    const dir = getSessionDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    const snapFile = path.join(dir, 'snapshot.md');

    const entry = [
      '# Context Snapshot',
      `**Session**: ${sessionId || getSessionId()}`,
      `**Timestamp**: ${new Date().toISOString()}`,
      '',
      '## 保存理由',
      'コンパクト前の重要情報保護',
      '',
      '## 内容',
      content || '(content not provided)',
      '',
      '---',
      '',
    ].join('\n');

    fs.writeFileSync(snapFile, entry);
    return snapFile;
  } catch (e) {
    return null;
  }
}

// ─────────────────────────────────────────
// 2. APPEND FINDING — 重要発見を蓄積
// ─────────────────────────────────────────
function appendFinding(sessionId, finding) {
  try {
    const dir = getSessionDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'findings.jsonl');

    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      ...finding,
    }) + '\n';

    fs.appendFileSync(file, entry);
    return true;
  } catch (e) {
    return false;
  }
}

// ─────────────────────────────────────────
// 3. READ SNAPSHOT — 次セッション開始時に読む
// ─────────────────────────────────────────
function readSnapshot(sessionId) {
  try {
    const dir = getSessionDir(sessionId);
    if (!fs.existsSync(dir)) return null;

    const snapFile = path.join(dir, 'snapshot.md');
    const findingsFile = path.join(dir, 'findings.jsonl');
    const checkpointsFile = path.join(dir, 'checkpoints.md');
    const pendingFile = path.join(dir, 'pending.md');

    const result = { path: dir };

    if (fs.existsSync(snapFile)) {
      result.snapshot = fs.readFileSync(snapFile, 'utf8');
    }

    if (fs.existsSync(findingsFile)) {
      const lines = fs.readFileSync(findingsFile, 'utf8').split('\n').filter(Boolean);
      result.findings = lines.map(l => {
        try { return JSON.parse(l); } catch (e) { return null; }
      }).filter(Boolean);
    }

    if (fs.existsSync(checkpointsFile)) {
      result.checkpoints = fs.readFileSync(checkpointsFile, 'utf8');
    }

    if (fs.existsSync(pendingFile)) {
      result.pending = fs.readFileSync(pendingFile, 'utf8');
    }

    return result;
  } catch (e) {
    return null;
  }
}

// ─────────────────────────────────────────
// 4. CLEANUP — セッション終了時に削除
// ─────────────────────────────────────────
function cleanupSession(sessionId) {
  try {
    const dir = getSessionDir(sessionId);
    if (!fs.existsSync(dir)) return false;

    // 古いファイルを全削除
    const files = fs.readdirSync(dir);
    for (const f of files) {
      try {
        fs.unlinkSync(path.join(dir, f));
      } catch (e) {}
    }
    try {
      fs.rmdirSync(dir);
    } catch (e) {}
    return true;
  } catch (e) {
    return false;
  }
}

// 古い全セッションのクリーンアップ（24時間以上前）
function cleanupOldSessions() {
  try {
    if (!fs.existsSync(TEMP_CONTEXT_ROOT)) return;

    const dirs = fs.readdirSync(TEMP_CONTEXT_ROOT);
    const now = Date.now();
    const TTL = 24 * 60 * 60 * 1000; // 24時間

    for (const dirName of dirs) {
      const fullDir = path.join(TEMP_CONTEXT_ROOT, dirName);
      try {
        const stat = fs.statSync(fullDir);
        if (!stat.isDirectory()) continue;
        if (now - stat.mtimeMs > TTL) {
          const files = fs.readdirSync(fullDir);
          for (const f of files) {
            try { fs.unlinkSync(path.join(fullDir, f)); } catch (e) {}
          }
          try { fs.rmdirSync(fullDir); } catch (e) {}
        }
      } catch (e) {}
    }
  } catch (e) {}
}

// ─────────────────────────────────────────
// CLI EXECUTION
// ─────────────────────────────────────────
async function main() {
  // stdin timeout (3秒)
  const timer = setTimeout(() => process.exit(0), 3000);
  timer.unref();

  try {
    if (PHASE === '0') { process.exit(0); return; }

    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const input = Buffer.concat(chunks).toString('utf8');
    if (!input) { process.exit(0); return; }

    const data = JSON.parse(input);
    const hookEvent = data.hook_event_name || data.source || '';
    const sessionId = data.session_id || getSessionId();

    // 古いセッションの定期クリーンアップ
    cleanupOldSessions();

    // Hook event に応じた処理
    switch (hookEvent) {
      case 'PreCompact':
      case 'compact': {
        // コンパクト前: 現在の内容を保存
        const content = data.content || data.transcript || 'compact triggered';
        createSnapshot(sessionId, content);
        // 標準出力には何も返さない（非ブロッキング）
        break;
      }

      case 'SessionStart':
      case 'startup':
      case 'resume': {
        // セッション開始: 前回の snapshot があれば提示
        const snap = readSnapshot(sessionId);
        if (snap && snap.snapshot) {
          const output = [
            '=== PREVIOUS SESSION SNAPSHOT (temp-context) ===',
            '',
            `保存場所: ${snap.path}`,
            '',
            '前回セッションで一時保存された内容があります。',
            '必要に応じて以下をRead:',
            snap.snapshot ? `  - ${path.join(snap.path, 'snapshot.md')}` : '',
            snap.checkpoints ? `  - ${path.join(snap.path, 'checkpoints.md')}` : '',
            snap.pending ? `  - ${path.join(snap.path, 'pending.md')}` : '',
            snap.findings ? `  - ${path.join(snap.path, 'findings.jsonl')}` : '',
            '',
            '=== END SNAPSHOT NOTICE ===',
          ].filter(Boolean).join('\n');
          console.log(output);
        }
        break;
      }

      case 'SessionEnd':
      case 'end':
      case 'stop': {
        // セッション終了: 一時保存を削除
        cleanupSession(sessionId);
        break;
      }
    }

    process.exit(0);
  } catch (e) {
    console.error('context-snapshot-manager main error:', e.message);
    process.exit(0); // フェイルオープン
  }
}

if (require.main === module) main();

module.exports = {
  createSnapshot,
  appendFinding,
  readSnapshot,
  cleanupSession,
  cleanupOldSessions,
  getSessionDir,
  getSessionId,
};
