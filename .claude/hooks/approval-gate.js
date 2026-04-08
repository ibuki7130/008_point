#!/usr/bin/env node
'use strict';

/**
 * approval-gate.js — PreToolUse フック
 *
 * 投稿系・課金系ツールの操作前に承認プロンプトを挿入する。
 * 投稿系: stderr に警告を出す（advisory）
 * 課金系: exit 1 でブロック（blocking）
 */

const fs = require('fs');
const path = require('path');

const POSTING_TOOLS = {
  'twitter-client': ['post', 'reply', 'retweet', 'tweet'],
  'line-bot': ['send', 'push', 'broadcast'],
  'youtube': ['upload', 'publish'],
};

const BILLING_TOOLS = {
  'meta-ads': ['create', 'update', 'publish', 'budget'],
  'voice-ai': ['make-call', 'broadcast'],
};

const SUBMIT_PATTERNS = ['submit', 'click_final', 'form_submit', 'checkout', 'purchase'];

function classifyOperation(toolName, input) {
  const inputStr = JSON.stringify(input || {}).toLowerCase();

  for (const [tool, actions] of Object.entries(BILLING_TOOLS)) {
    if (toolName.includes(tool)) {
      if (actions.some(a => inputStr.includes(a))) return 'billing';
    }
  }

  for (const [tool, actions] of Object.entries(POSTING_TOOLS)) {
    if (toolName.includes(tool)) {
      if (actions.some(a => inputStr.includes(a))) return 'posting';
    }
  }

  if (['playwright', 'stagehand', 'skyvern'].some(b => toolName.includes(b))) {
    if (SUBMIT_PATTERNS.some(p => inputStr.includes(p))) return 'posting';
  }

  return 'safe';
}

function logApproval(toolName, action, approved) {
  const logDir = path.join(__dirname, '..', '..', 'logs', 'approvals');
  try { fs.mkdirSync(logDir, { recursive: true }); } catch (_) {}

  const date = new Date().toISOString().slice(0, 10);
  const logFile = path.join(logDir, `${date}.jsonl`);
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    tool: toolName,
    action: action,
    approved: approved,
  });

  try { fs.appendFileSync(logFile, entry + '\n'); } catch (_) {}
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(input);
    const toolName = event.tool_name || '';
    const toolInput = event.tool_input || {};

    const classification = classifyOperation(toolName, toolInput);

    if (classification === 'safe') {
      process.exit(0);
    }

    if (classification === 'posting') {
      const msg = `⚠️  投稿系操作を検出しました\n` +
        `   ツール: ${toolName}\n` +
        `   分類: 投稿系（外部状態を変更）\n` +
        `   承認が必要です。\n`;
      process.stderr.write(msg);
      logApproval(toolName, 'posting', 'pending');
      process.exit(0);
    }

    if (classification === 'billing') {
      const msg = `🔴 課金・広告系操作を検出しました\n` +
        `   ツール: ${toolName}\n` +
        `   分類: 課金・広告系（二段階確認必須）\n` +
        `   自動実行をブロックしました。\n`;
      process.stderr.write(msg);
      logApproval(toolName, 'billing', false);
      process.exit(1);
    }
  } catch (_) {
    process.exit(0);
  }
});
