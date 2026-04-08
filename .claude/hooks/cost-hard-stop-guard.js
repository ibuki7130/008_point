#!/usr/bin/env node
/**
 * cost-hard-stop-guard.js — コスト爆発ハードストップ
 *
 * Issue #42796 ($345→$42,121の爆発事例) への対策。
 * advisory-onlyの既存hookでは警告のみで実行を止められないため、
 * 真のハードストップとしてツール実行を物理ブロックする。
 *
 * 環境変数:
 *   COST_HARD_STOP_DAILY_LIMIT  1日の上限（デフォルト $50）
 *   COST_HARD_STOP_MONTHLY_LIMIT 月の上限（デフォルト $500）
 *   COST_HARD_STOP_PHASE='0' = 完全無効
 *   COST_HARD_STOP_PHASE='1' = 警告のみ（デフォルト）
 *   COST_HARD_STOP_PHASE='2' = ブロック発動
 *
 * 安全設計: フェイルオープン・タイムアウト3秒・環境変数で停止可能
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const COST_LOG = path.join(PROJECT_ROOT, '.claude', 'hooks', 'data', 'cost-tracking.jsonl');
const ALERT_LOG = path.join(PROJECT_ROOT, '.claude', 'hooks', 'data', 'cost-alert.log');

const PHASE = process.env.COST_HARD_STOP_PHASE || '1';
const DAILY_LIMIT = parseFloat(process.env.COST_HARD_STOP_DAILY_LIMIT || '50');
const MONTHLY_LIMIT = parseFloat(process.env.COST_HARD_STOP_MONTHLY_LIMIT || '500');

// ツールごとの推定コスト（Opus 4.6 MAX プラン前提の定額だが追跡のため）
const TOOL_ESTIMATED_COST = {
  'Write': 0.01,
  'Edit': 0.01,
  'MultiEdit': 0.02,
  'Bash': 0.005,
  'Task': 0.10,  // サブエージェント起動は高コスト
  'Read': 0.002,
  'Grep': 0.001,
  'Glob': 0.001,
  'WebFetch': 0.05,
  'WebSearch': 0.05,
};

function today() {
  return new Date().toISOString().split('T')[0];
}

function currentMonth() {
  return new Date().toISOString().substring(0, 7); // YYYY-MM
}

// 既存ログを読んで累積コストを計算
// 30日以上前のエントリを削除（月次cleanup）
// 確率的実行: 1% の確率で起動時に実行
function cleanupOldEntries() {
  try {
    if (!fs.existsSync(COST_LOG)) return;
    if (Math.random() > 0.01) return; // 1% のみ実行

    const lines = fs.readFileSync(COST_LOG, 'utf8').split('\n').filter(Boolean);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const keptLines = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.date && entry.date >= cutoffStr) {
          keptLines.push(line);
        }
      } catch (e) {}
    }

    // atomic rename で安全に書き換え
    const tmpFile = COST_LOG + '.tmp';
    fs.writeFileSync(tmpFile, keptLines.join('\n') + (keptLines.length > 0 ? '\n' : ''));
    fs.renameSync(tmpFile, COST_LOG);
  } catch (e) {
    console.error('cost-hard-stop cleanup error:', e.message);
  }
}

function getCumulativeCost() {
  try {
    if (!fs.existsSync(COST_LOG)) return { daily: 0, monthly: 0 };

    cleanupOldEntries(); // 月次cleanup（確率的）

    const lines = fs.readFileSync(COST_LOG, 'utf8').split('\n').filter(Boolean);
    const today_str = today();
    const month_str = currentMonth();

    let daily = 0;
    let monthly = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.date === today_str) daily += entry.cost || 0;
        if (entry.date && entry.date.startsWith(month_str)) monthly += entry.cost || 0;
      } catch (e) {}
    }

    return { daily, monthly };
  } catch (e) {
    return { daily: 0, monthly: 0 };
  }
}

// コストを記録
function recordCost(toolName, cost) {
  try {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      date: today(),
      tool: toolName,
      cost: cost,
    }) + '\n';
    fs.mkdirSync(path.dirname(COST_LOG), { recursive: true });
    fs.appendFileSync(COST_LOG, entry);
  } catch (e) {}
}

function logAlert(msg, daily, monthly) {
  try {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      msg,
      daily,
      monthly,
      dailyLimit: DAILY_LIMIT,
      monthlyLimit: MONTHLY_LIMIT,
      phase: PHASE,
    }) + '\n';
    fs.mkdirSync(path.dirname(ALERT_LOG), { recursive: true });
    fs.appendFileSync(ALERT_LOG, entry);
  } catch (e) {}
}

function check(toolName, toolInput) {
  try {
    if (PHASE === '0') return null;

    // コスト推定
    const estimatedCost = TOOL_ESTIMATED_COST[toolName] || 0;
    if (estimatedCost === 0) return null;

    // 累積取得（recordCost前に判定 — 上限超過時の二重計上を防止）
    const { daily, monthly } = getCumulativeCost();

    // 実行前コスト記録（上限チェック後）
    recordCost(toolName, estimatedCost);

    // 閾値チェック
    const dailyExceeded = daily > DAILY_LIMIT;
    const monthlyExceeded = monthly > MONTHLY_LIMIT;
    const dailyWarning = daily > DAILY_LIMIT * 0.8;  // 80%で警告
    const monthlyWarning = monthly > MONTHLY_LIMIT * 0.8;

    if (!dailyExceeded && !monthlyExceeded && !dailyWarning && !monthlyWarning) {
      return null; // 問題なし
    }

    // ログ記録
    if (dailyExceeded || monthlyExceeded) {
      logAlert('HARD_STOP_TRIGGERED', daily, monthly);
    } else if (dailyWarning || monthlyWarning) {
      logAlert('WARNING_80_PERCENT', daily, monthly);
    }

    // Phase 1: 警告のみ
    if (PHASE === '1') return null;

    // Phase 2: ハードストップ
    if (dailyExceeded || monthlyExceeded) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: [
            '【COST HARD STOP】コスト上限を超過しました。',
            '',
            `今日の累積: $${daily.toFixed(2)} (上限: $${DAILY_LIMIT})`,
            `今月の累積: $${monthly.toFixed(2)} (上限: $${MONTHLY_LIMIT})`,
            '',
            '以下のいずれかで再開:',
            '1. 明日まで待つ（翌日00:00にリセット）',
            '2. 上限引き上げ: export COST_HARD_STOP_DAILY_LIMIT=100',
            '3. 一時無効化: export COST_HARD_STOP_PHASE=0',
            '',
            '過去のコスト記録: .claude/hooks/data/cost-tracking.jsonl',
            'アラート履歴: .claude/hooks/data/cost-alert.log',
          ].join('\n'),
        },
      };
    }

    return null;
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
    if (!input) { process.exit(0); return; }

    const data = JSON.parse(input);
    const result = check(data.tool_name, data.tool_input || {});
    if (result) console.log(JSON.stringify(result));
    process.exit(0);
  } catch (e) {
    console.error('cost-hard-stop-guard main error:', e.message);
    process.exit(0);
  }
}

if (require.main === module) main();

module.exports = { check, getCumulativeCost, recordCost, TOOL_ESTIMATED_COST };
