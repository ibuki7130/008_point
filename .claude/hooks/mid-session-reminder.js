#!/usr/bin/env node
/**
 * mid-session-reminder.js — 中盤リマインダー
 *
 * UserPromptSubmit hook として動作。
 * 5回のユーザープロンプト毎にコアルールを自動再注入し、
 * 長時間セッションでのルールドリフトを防ぐ。
 *
 * 動作:
 *   プロンプト回数をカウント
 *   5, 10, 15, 20... 回目にリマインダー注入
 *
 * 環境変数:
 *   MID_SESSION_REMINDER_PHASE='0' = 無効
 *   MID_SESSION_REMINDER_PHASE='1' = 有効（デフォルト）
 *   MID_SESSION_REMINDER_INTERVAL=5 （デフォルト5回ごと）
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const COUNTER_DIR = path.join(PROJECT_ROOT, '.claude', 'checkpoints');
const PHASE = process.env.MID_SESSION_REMINDER_PHASE || '1';
const INTERVAL = parseInt(process.env.MID_SESSION_REMINDER_INTERVAL || '5', 10);

function getSessionId() {
  if (process.env.CLAUDE_SESSION_ID) return process.env.CLAUDE_SESSION_ID;
  const today = new Date().toISOString().split('T')[0];
  return `${today}_${process.pid}`;
}

function getCounterFile(sessionId) {
  return path.join(COUNTER_DIR, `prompt_count_${sessionId}.json`);
}

function incrementCounter(sessionId) {
  try {
    fs.mkdirSync(COUNTER_DIR, { recursive: true });
    const file = getCounterFile(sessionId);
    let data = { count: 0 };
    if (fs.existsSync(file)) {
      try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
    }
    data.count = (data.count || 0) + 1;
    data.lastUpdate = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(data));
    return data.count;
  } catch (e) {
    return 0;
  }
}

function buildReminder(count) {
  return [
    '',
    `=== MID-SESSION REMINDER (${count}回目のプロンプト) ===`,
    '',
    '長時間セッションのためコアルールを再確認:',
    '',
    '**WORKFLOW FIDELITY CONTRACT**',
    '1. スキル指定 → Skill tool 必須（手動実装禁止）',
    '2. 既存ファイルは必ず Read してから編集',
    '3. 指示にない行動は事前承認が必要',
    '4. 未読ファイルの Edit/Write 禁止',
    '',
    '**SUB-AGENT RULES**',
    '- 3+並列 Agent: run_in_background: true 必須',
    '- 重要Agent起動時: AGENT CHECKPOINT 3問を付与',
    '- リサーチ: WebSearch後 最低3件 WebFetch 必須',
    '',
    '**CONTEXT MANAGEMENT**',
    '- 大きな発見は .claude/temp-context/ に保存',
    '- /compact 前に重要情報を snapshot',
    '- SESSION_HANDOFF.md 更新',
    '',
    '**MISTAKES 参照**',
    '新しい作業を始める前に .claude/hooks/mistakes.md を確認',
    '',
    '=== END REMINDER ===',
    '',
  ].join('\n');
}

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

    let data = {};
    try { data = JSON.parse(input); } catch (e) {}

    const sessionId = data.session_id || getSessionId();
    const count = incrementCounter(sessionId);

    // INTERVAL回ごとにリマインダー注入
    if (count > 0 && count % INTERVAL === 0) {
      console.log(buildReminder(count));
    }

    process.exit(0);
  } catch (e) {
    console.error('mid-session-reminder main error:', e.message);
    process.exit(0); // フェイルオープン
  }
}

if (require.main === module) main();

module.exports = { incrementCounter, buildReminder };
