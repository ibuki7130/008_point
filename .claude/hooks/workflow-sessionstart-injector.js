#!/usr/bin/env node
/**
 * Workflow SessionStart Injector - セッション開始時の状態注入
 *
 * SessionStart 時に実行され、.workflow_state.json の内容を
 * コンテキストとして注入します。
 *
 * これにより、セッション再開時のフェーズ誤認を防止します。
 */

const fs = require('fs');
const path = require('path');
const stateManager = require('./workflow-state-manager.js');
const { readStdin } = require('./utils/read-stdin');

async function main() {
  let input = {};

  try {
    const stdinData = await readStdin();
    if (stdinData) {
      input = JSON.parse(stdinData);
    }
  } catch (e) {
    process.exit(0);
    return;
  }

  const cwd = input.cwd || process.cwd();
  const context = [];

  // ワークフロー状態を読み込み（欠損時は自動初期化）
  let state = stateManager.loadState(cwd);

  if (!state) {
    // .workflow_state.json が存在しない場合、デフォルト状態を自動作成
    state = stateManager.createInitialState('user_request', true);
    const saved = stateManager.saveState(state, cwd);
    if (saved) {
      context.push('=== WORKFLOW STATE AUTO-INITIALIZED ===');
      context.push('');
      context.push('.workflow_state.json が見つからなかったため、デフォルト状態で自動作成しました。');
      context.push('');
    }
  }

  if (state) {
    // 状態要約を生成
    const summary = stateManager.generateStateSummary(state);
    if (summary) {
      context.push(summary);
    }
  }

  // Desktop以下のプロジェクトも検索
  const desktopStates = findDesktopWorkflowStates();
  if (desktopStates.length > 0) {
    context.push('');
    context.push('=== OTHER ACTIVE WORKFLOWS ===');
    context.push('');
    desktopStates.forEach(ws => {
      context.push(`- ${ws.path}: ${ws.workflowId} (Phase ${ws.phase})`);
    });
    context.push('');
  }

  // SESSION_HANDOFF.md も探して注入
  const handoffs = findSessionHandoffs(cwd);
  if (handoffs.length > 0) {
    context.push('');
    context.push('=== SESSION HANDOFF FILES FOUND ===');
    context.push('');
    context.push('以下のハンドオフファイルを確認してください:');
    handoffs.forEach(h => {
      context.push(`- ${h}`);
    });
    context.push('');
  }

  // mistakes.md の存在確認
  const mistakesPath = path.join(__dirname, 'mistakes.md');
  if (fs.existsSync(mistakesPath)) {
    context.push('');
    context.push('=== MISTAKES LOG EXISTS ===');
    context.push('');
    context.push('過去のミスが記録されています。作業開始前に確認してください:');
    context.push(`- ${mistakesPath}`);
    context.push('');
  }

  // ─────────────────────────────────────────
  // CHECKPOINT: 動的質問生成（5問）
  // mistakes.md + SESSION_HANDOFF.md から質問を生成し、
  // Claudeが本当にファイルを読んだか検証する
  // ─────────────────────────────────────────
  const checkpoint = generateCheckpointQuestions(cwd);
  if (checkpoint.length > 0) {
    context.push('');
    context.push('=== BOOT CHECKPOINT（必須・スキップ禁止） ===');
    context.push('');
    context.push('作業開始前に以下の5問に回答せよ。回答できない場合は該当ファイルをReadせよ。');
    context.push('回答は内部処理のみ（ユーザーに表示不要）。全問回答後に作業開始。');
    context.push('');
    checkpoint.forEach((q, i) => {
      context.push(`Q${i + 1}. ${q}`);
    });
    context.push('');
  }

  // コンテキストを出力
  if (context.length > 0) {
    console.log(context.join('\n'));
  }

  process.exit(0);
}

function findDesktopWorkflowStates() {
  const states = [];
  try {
    const desktop = path.join(process.env.HOME, 'Desktop');
    if (fs.existsSync(desktop)) {
      const entries = fs.readdirSync(desktop, { withFileTypes: true });

      entries.forEach(entry => {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const statePath = path.join(desktop, entry.name, '.workflow_state.json');
          if (fs.existsSync(statePath)) {
            try {
              const content = fs.readFileSync(statePath, 'utf8');
              const state = JSON.parse(content);
              states.push({
                path: path.join(desktop, entry.name),
                workflowId: state.meta?.workflowId || 'unknown',
                phase: state.meta?.currentPhase || 1
              });
            } catch (e) {}
          }
        }
      });
    }
  } catch (e) {}
  return states.slice(0, 5);
}

function findSessionHandoffs(cwd) {
  const handoffs = [];

  try {
    // カレントディレクトリ
    const cwdHandoff = path.join(cwd, 'SESSION_HANDOFF.md');
    if (fs.existsSync(cwdHandoff)) {
      handoffs.push(cwdHandoff);
    }

    // Desktop以下を検索
    const desktop = path.join(process.env.HOME, 'Desktop');
    if (fs.existsSync(desktop)) {
      const entries = fs.readdirSync(desktop, { withFileTypes: true });

      entries.forEach(entry => {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const handoffPath = path.join(desktop, entry.name, 'SESSION_HANDOFF.md');
          if (fs.existsSync(handoffPath)) {
            handoffs.push(handoffPath);
          }
        }
      });
    }
  } catch (e) {}

  return [...new Set(handoffs)].slice(0, 5);
}

/**
 * BOOT CHECKPOINT — 動的質問生成
 *
 * mistakes.md / SESSION_HANDOFF.md / workflow_state.json から
 * 5つの質問を動的に生成する。Claudeが本当にファイルを読んだか検証する仕組み。
 * ファイル内容が変わるたびに質問も変わるので丸暗記はできない。
 */
function generateCheckpointQuestions(cwd) {
  const questions = [];

  try {
    // Q1: mistakes.md — 特定行の内容を答えさせる（推測不可能）
    const mistakesPath = path.join(__dirname, 'mistakes.md');
    if (fs.existsSync(mistakesPath)) {
      const content = fs.readFileSync(mistakesPath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      const patterns = content.match(/### Pattern \d+: (.+)/g);
      if (patterns && patterns.length > 0) {
        // ランダムなPatternを選んで質問
        const idx = Math.floor(Math.random() * patterns.length);
        const patternNum = idx + 1;
        questions.push(
          `Read .claude/hooks/mistakes.md → Pattern ${patternNum} の「✅ 正解」の内容を1行で答えよ（推測禁止・必ずReadで確認）`
        );
      }
    }

    // Q2: SESSION_HANDOFF.md — 特定セクションの内容を答えさせる
    const handoffPath = path.join(cwd, 'SESSION_HANDOFF.md');
    if (fs.existsSync(handoffPath)) {
      const content = fs.readFileSync(handoffPath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      // ファイルの行数を使った質問（推測不可能）
      questions.push(
        `Read SESSION_HANDOFF.md → 全体の行数と、最初の見出し（# で始まる行）の内容を答えよ`
      );
    } else {
      questions.push(
        `SESSION_HANDOFF.md は存在するか？ 存在しない場合は「なし」と回答`
      );
    }

    // Q3: workflow_state.json — 開始日時を答えさせる（推測不可能）
    const statePath = path.join(cwd, '.workflow_state.json');
    if (fs.existsSync(statePath)) {
      questions.push(
        `workflow_state.json の meta.startedAt の値を答えよ（ISO 8601形式の日時文字列）`
      );
    }

    // Q4: スキル/トリガーワード検出（これは毎回必要）
    questions.push(
      `ユーザーの指示を読み、スキル名（/xxx）またはトリガーワード（CLAUDE.mdの「リサーチ自動発動ルール」表を参照）が含まれるか判定せよ → 含まれる場合はSkill tool使用が必須`
    );

    // Q5: 編集対象ファイルの事前Read確認
    questions.push(
      `これから編集・作成するファイルがあるか？ ある場合は必ず事前にReadせよ。未読ファイルへのEdit/Writeは実行禁止。`
    );

  } catch (e) {
    questions.push('Read .claude/hooks/mistakes.md を実行して内容を把握せよ');
    questions.push('未読ファイルの編集禁止ルールを確認せよ');
  }

  return questions.slice(0, 5);
}

main().catch(() => process.exit(0));
