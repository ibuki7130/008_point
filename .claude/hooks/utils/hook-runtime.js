/**
 * hook-runtime.js — Claude Code hook の共通ランタイム
 *
 * 全hookで共通する以下のボイラープレートを一元化:
 *   1. stdin 読み込み + timeout (3秒)
 *   2. JSON パース
 *   3. check関数の呼び出し
 *   4. 結果のstdout出力
 *   5. 例外ハンドリング（console.error + フェイルオープン）
 *   6. Phase管理（phases.json または環境変数から読み込み）
 *
 * 使い方:
 *   const { runHook, getPhase } = require('./utils/hook-runtime');
 *
 *   function check(toolName, toolInput, ctx) {
 *     if (ctx.phase === '0') return null;
 *     // ... ロジック
 *     return null;  // 通過 or { hookSpecificOutput: {...} } でブロック
 *   }
 *
 *   runHook('checkpoint-guard', check);
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const PHASES_CONFIG = path.join(PROJECT_ROOT, '.claude', 'hooks', 'config', 'phases.json');

// ─────────────────────────────────────────
// Phase管理
// ─────────────────────────────────────────

let cachedPhases = null;

function loadPhasesConfig() {
  if (cachedPhases) return cachedPhases;
  try {
    if (fs.existsSync(PHASES_CONFIG)) {
      cachedPhases = JSON.parse(fs.readFileSync(PHASES_CONFIG, 'utf8'));
      return cachedPhases;
    }
  } catch (e) {
    console.error('hook-runtime loadPhasesConfig error:', e.message);
  }
  cachedPhases = { hooks: {}, global: { defaultPhase: '1' } };
  return cachedPhases;
}

/**
 * 指定hookの現在Phaseを取得
 * 優先順位: 環境変数 > phases.json > global default
 */
function getPhase(hookName) {
  try {
    const config = loadPhasesConfig();
    const hookConfig = config.hooks && config.hooks[hookName];

    // 環境変数が最優先
    if (hookConfig && hookConfig.envVar && process.env[hookConfig.envVar]) {
      return process.env[hookConfig.envVar];
    }

    // phases.json のhook設定
    if (hookConfig && hookConfig.phase !== undefined) {
      return String(hookConfig.phase);
    }

    // グローバルデフォルト
    if (config.global && config.global.defaultPhase !== undefined) {
      return String(config.global.defaultPhase);
    }
  } catch (e) {
    console.error('hook-runtime getPhase error:', e.message);
  }
  return '1'; // 安全デフォルト: 警告のみ
}

// ─────────────────────────────────────────
// Hook Runtime
// ─────────────────────────────────────────

/**
 * Hookのメインランタイム
 * @param {string} hookName - hook名（ログ用）
 * @param {Function} checkFn - (toolName, toolInput, ctx) => result | null
 * @param {Object} options
 * @param {number} options.timeoutMs - stdin timeout（デフォルト3000ms）
 * @param {boolean} options.allowEmpty - 空入力を許可（デフォルト true）
 */
async function runHook(hookName, checkFn, options = {}) {
  const timeoutMs = options.timeoutMs || 3000;
  const allowEmpty = options.allowEmpty !== false;

  // stdin timeout
  const timer = setTimeout(() => process.exit(0), timeoutMs);
  timer.unref();

  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const input = Buffer.concat(chunks).toString('utf8');

    if (!input) {
      if (allowEmpty) {
        process.exit(0);
        return;
      }
      console.error(`${hookName}: empty stdin`);
      process.exit(0);
      return;
    }

    let data;
    try {
      data = JSON.parse(input);
    } catch (parseErr) {
      console.error(`${hookName} JSON parse error:`, parseErr.message);
      process.exit(0);
      return;
    }

    const phase = getPhase(hookName);
    const ctx = {
      phase,
      hookName,
      sessionId: data.session_id || null,
      hookEventName: data.hook_event_name || data.source || null,
      cwd: data.cwd || process.cwd(),
    };

    // Phase 0: 完全無効
    if (phase === '0') {
      process.exit(0);
      return;
    }

    // ユーザーのcheck関数を実行
    const result = checkFn(data.tool_name, data.tool_input || {}, ctx, data);

    if (result) {
      console.log(JSON.stringify(result));
    }
    process.exit(0);
  } catch (e) {
    console.error(`${hookName} runtime error:`, e.message);
    process.exit(0); // フェイルオープン
  }
}

// ─────────────────────────────────────────
// エクスポート
// ─────────────────────────────────────────

module.exports = {
  runHook,
  getPhase,
  loadPhasesConfig,
  PHASES_CONFIG,
};
