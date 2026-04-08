#!/usr/bin/env node
/**
 * mistake-pattern-matcher.js — 過去のミスとの自動照合
 *
 * PreToolUse hook として動作。
 * Write/Edit/Bash 実行前に mistakes.md のパターンと現在のツール入力を照合し、
 * 類似パターンを検知したら警告/ブロックする。
 *
 * 「同じミスを繰り返す」問題への直接対策。
 *
 * 環境変数:
 *   MISTAKE_MATCHER_PHASE='0' = 無効
 *   MISTAKE_MATCHER_PHASE='1' = 警告のみ（デフォルト）
 *   MISTAKE_MATCHER_PHASE='2' = 類似検知時ブロック
 *
 * 安全設計: フェイルオープン・tfidfではなくキーワード一致で軽量動作
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const MISTAKES_FILE = path.join(PROJECT_ROOT, '.claude', 'hooks', 'mistakes.md');
const MATCH_LOG = path.join(PROJECT_ROOT, '.claude', 'hooks', 'data', 'mistake-match.log');
const PHASE = process.env.MISTAKE_MATCHER_PHASE || '1';

// ─────────────────────────────────────────
// mistakes.md からパターンを抽出
// ─────────────────────────────────────────
function extractPatterns() {
  try {
    if (!fs.existsSync(MISTAKES_FILE)) return [];

    const content = fs.readFileSync(MISTAKES_FILE, 'utf8');
    const patterns = [];

    // ### Pattern N: xxx ブロックを抽出
    const blocks = content.split(/### Pattern \d+:/).slice(1);
    blocks.forEach((block, idx) => {
      const titleMatch = block.match(/^(.+?)\n/);
      const title = titleMatch ? titleMatch[1].trim() : `Pattern ${idx + 1}`;

      // ❌ 間違い と ✅ 正解 を抽出
      const wrongMatch = block.match(/❌[^✅]*?:\s*([^\n]+)/);
      const rightMatch = block.match(/✅[^❌]*?:\s*([^\n]+)/);

      patterns.push({
        id: idx + 1,
        title,
        wrong: wrongMatch ? wrongMatch[1].trim() : '',
        right: rightMatch ? rightMatch[1].trim() : '',
        block: block.substring(0, 500),
      });
    });

    // 表形式の記録も抽出（| 日付 | ID | 要約 | 修正状態 |）
    const tableLines = content.match(/\|\s*\d{4}-\d{2}-\d{2}\s*\|.+?\|/g) || [];
    tableLines.forEach((line, idx) => {
      const cols = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 3) {
        patterns.push({
          id: `table_${idx}`,
          title: cols[1] || 'unknown',
          wrong: cols[2] || '',
          right: '',
          block: line,
        });
      }
    });

    return patterns;
  } catch (e) {
    return [];
  }
}

// ─────────────────────────────────────────
// キーワード抽出（簡易版）
// ─────────────────────────────────────────
function extractKeywords(text) {
  if (!text) return [];
  const normalized = text.toLowerCase().replace(/[:\,\.\"\'\(\)\{\}\[\]「」『』【】、。]/g, ' ');
  const keywords = new Set();

  // 英単語（3文字以上）
  const englishWords = normalized.match(/[a-z0-9_-]{3,}/g) || [];
  englishWords.forEach(w => {
    if (!['the', 'and', 'for', 'with', 'this', 'that'].includes(w)) keywords.add(w);
  });

  // 日本語: 2-gram, 3-gram で部分文字列を抽出（形態素解析なしの簡易版）
  const jpOnly = normalized.replace(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, ' ');
  const jpSegments = jpOnly.split(/\s+/).filter(Boolean);
  for (const seg of jpSegments) {
    // 3文字以上の連続文字列をそのまま
    if (seg.length >= 2) keywords.add(seg);
    // 3-gram
    for (let i = 0; i <= seg.length - 3; i++) {
      keywords.add(seg.substring(i, i + 3));
    }
    // 2-gram
    for (let i = 0; i <= seg.length - 2; i++) {
      keywords.add(seg.substring(i, i + 2));
    }
  }

  // ストップワード除去
  const stopwords = ['は', 'を', 'が', 'の', 'に', 'で', 'と', 'して', 'いる', 'する', 'から', 'まで'];
  stopwords.forEach(s => keywords.delete(s));

  return Array.from(keywords);
}

// ─────────────────────────────────────────
// パターンマッチング（Jaccard係数）
// ─────────────────────────────────────────
function similarity(textA, textB) {
  const setA = new Set(extractKeywords(textA));
  const setB = new Set(extractKeywords(textB));
  if (setA.size === 0 || setB.size === 0) return 0;

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

function findSimilarPatterns(currentAction, threshold = 0.12) {
  const patterns = extractPatterns();
  const matches = [];

  for (const p of patterns) {
    const searchText = `${p.title} ${p.wrong} ${p.block}`.substring(0, 1000);
    const score = similarity(currentAction, searchText);
    if (score >= threshold) {
      matches.push({ pattern: p, score });
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, 3);
}

// ─────────────────────────────────────────
// ログ記録
// ─────────────────────────────────────────
function logMatch(toolName, action, matches) {
  try {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      tool: toolName,
      action: action.substring(0, 200),
      matches: matches.map(m => ({
        id: m.pattern.id,
        title: m.pattern.title,
        score: m.score,
      })),
      phase: PHASE,
    }) + '\n';
    fs.mkdirSync(path.dirname(MATCH_LOG), { recursive: true });
    fs.appendFileSync(MATCH_LOG, entry);
  } catch (e) {}
}

// ─────────────────────────────────────────
// メインチェック
// ─────────────────────────────────────────
function check(toolName, toolInput) {
  try {
    if (PHASE === '0') return null;
    if (!['Write', 'Edit', 'MultiEdit', 'Bash', 'Task'].includes(toolName)) return null;
    if (!toolInput) return null;

    // 現在のアクションを文字列化
    let action = '';
    if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') {
      action = `${toolInput.file_path || ''} ${toolInput.content || toolInput.new_string || ''}`;
    } else if (toolName === 'Bash') {
      action = toolInput.command || '';
    } else if (toolName === 'Task') {
      action = `${toolInput.subagent_type || ''} ${toolInput.prompt || ''}`;
    }

    if (action.length < 20) return null; // 短すぎる場合スキップ

    // 大ファイル対策: n-gram爆発防止（Write全コンテンツ等を先頭2KBに制限）
    action = action.substring(0, 2000);

    // 類似パターン検索
    const matches = findSimilarPatterns(action, 0.25);
    if (matches.length === 0) return null;

    // マッチあり → ログ記録
    logMatch(toolName, action, matches);

    // Phase 1: 警告のみ（コンテキスト注入）
    if (PHASE === '1') {
      const warning = [
        '',
        '⚠️  MISTAKE PATTERN DETECTED ⚠️',
        '',
        '現在のアクションが過去のミスパターンと類似しています:',
        ...matches.map((m, i) => `  ${i + 1}. ${m.pattern.title} (類似度: ${(m.score * 100).toFixed(0)}%)`),
        '',
        '対応: .claude/hooks/mistakes.md で該当パターンを確認してから進めてください',
        '',
      ].join('\n');
      // stderrに出力してadditionalContextへ
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: warning,
        },
      }));
      return null; // 通過させる（警告のみ）
    }

    // Phase 2: ブロック
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: [
          '【MISTAKE PATTERN MATCH】過去のミスパターンと類似しています',
          '',
          '検知されたパターン:',
          ...matches.map((m, i) => `  ${i + 1}. ${m.pattern.title} (類似度: ${(m.score * 100).toFixed(0)}%)`),
          '',
          '対応手順:',
          '1. Read .claude/hooks/mistakes.md で該当パターンを確認',
          '2. 過去の✅正解の方法で再試行',
          '3. 本当に別のパターンの場合は MISTAKE_MATCHER_PHASE=1 に戻す',
          '',
          '緊急停止: export MISTAKE_MATCHER_PHASE=0',
        ].join('\n'),
      },
    };
  } catch (e) {
    return null;
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
    console.error('mistake-pattern-matcher main error:', e.message);
    process.exit(0);
  }
}

if (require.main === module) main();

module.exports = { check, extractPatterns, findSimilarPatterns, similarity };
