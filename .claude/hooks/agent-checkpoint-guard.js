#!/usr/bin/env node
/**
 * agent-checkpoint-guard.js — Agent Checkpoint 物理強制
 *
 * Task toolで重要Agentを起動する際、プロンプトに「AGENT CHECKPOINT」が
 * 含まれていなければブロックする。CLAUDE.mdの文字指示ではなくhookで物理強制する。
 *
 * 環境変数:
 *   AGENT_CHECKPOINT_PHASE='0' = 完全無効化
 *   AGENT_CHECKPOINT_PHASE='1' = 警告のみ（デフォルト）
 *   AGENT_CHECKPOINT_PHASE='2' = ブロック有効
 *
 * 安全設計: フェイルオープン・タイムアウト3秒・環境変数で停止可能
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const SKIP_LOG = path.join(PROJECT_ROOT, '.claude', 'hooks', 'data', 'agent-checkpoint-skip.log');
const PHASE = process.env.AGENT_CHECKPOINT_PHASE || '1';

// Checkpoint対象のAgent種別（CLAUDE.mdと同期）
const TARGETED_AGENTS = [
  'researcher', 'implementer', 'feature-builder', 'bug-fixer',
  'backend-developer', 'frontend-developer', 'architect',
  'system-architect', 'api-designer', 'database-designer',
  'requirements-elicitation', 'gather-requirements',
  'security-architect', 'ReviewAgent', 'multi-agent-debate',
];

// Checkpoint対象外のAgent
const EXCLUDED_AGENTS = [
  'haiku', 'code-searcher', 'tmux-monitor', 'tmux-session-creator',
  'tmux-command-executor',
];

// プロンプトに含まれているべきマーカー（いずれか1つあればOK）
const CHECKPOINT_MARKERS = [
  'AGENT CHECKPOINT',
  '--- AGENT CHECKPOINT',
  'Q1. あなたの役割',
  'Q1. 役割',
];

function logSkip(agentType, hasMarker, promptPreview) {
  try {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      agentType,
      hasMarker,
      promptPreview: promptPreview.substring(0, 200),
      phase: PHASE,
    }) + '\n';
    fs.mkdirSync(path.dirname(SKIP_LOG), { recursive: true });
    fs.appendFileSync(SKIP_LOG, entry);
  } catch (e) {}
}

function check(toolName, toolInput) {
  try {
    if (PHASE === '0') return null;
    if (toolName !== 'Task') return null;
    if (!toolInput) return null;

    const subagentType = (toolInput.subagent_type || '').toLowerCase();
    const prompt = toolInput.prompt || '';

    // 境界マッチヘルパー: ハイフン/アンダースコア/開始終端で区切る
    // 'architect' が 'system-architect' にもマッチするが 'chart-something' にはマッチしない
    const matchesAgent = (name, pattern) => {
      const n = name.toLowerCase();
      const p = pattern.toLowerCase();
      if (n === p) return true;
      // 単語境界での一致（ハイフン/アンダースコア区切り）
      const regex = new RegExp(`(^|[-_])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([-_]|$)`);
      return regex.test(n);
    };

    // 対象外Agentは通過
    if (EXCLUDED_AGENTS.some(a => matchesAgent(subagentType, a))) {
      return null;
    }

    // 対象Agentかチェック
    const isTargeted = TARGETED_AGENTS.some(a => matchesAgent(subagentType, a));
    if (!isTargeted) return null;

    // checkpointマーカーの存在確認
    const hasMarker = CHECKPOINT_MARKERS.some(m => prompt.includes(m));

    if (hasMarker) return null; // OK、通過

    // マーカーなし → 違反
    logSkip(subagentType, false, prompt);

    // Phase 1: 警告のみ
    if (PHASE === '1') return null;

    // Phase 2: ブロック発動
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: [
          '【AGENT CHECKPOINT REQUIRED】',
          '',
          `Agent "${subagentType}" は重要Agent（リサーチ/実装/設計/要件定義系）です。`,
          'プロンプト末尾に以下を追加してから再実行してください:',
          '',
          '--- AGENT CHECKPOINT ---',
          'Q1. あなたの役割を1行で述べよ（プロンプトから抽出）',
          'Q2. 成果物の形式と制約は？（文字数制限・必須項目・WebFetch最低件数）',
          'Q3. 完了条件は何か？（何をもって「完了」とするか）',
          '',
          '緊急停止: export AGENT_CHECKPOINT_PHASE=0',
        ].join('\n'),
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
    console.error('agent-checkpoint-guard main error:', e.message);
    process.exit(0);
  }
}

if (require.main === module) main();

module.exports = { check, PHASE };
