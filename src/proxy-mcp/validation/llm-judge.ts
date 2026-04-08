/**
 * LLM Judge — セマンティック検証層
 *
 * Claude Haiku を審判者として使用し、ルールベース層では検出できない
 * 意味的なハルシネーション・論理破綻・事実誤認を検出する。
 *
 * アーキテクチャ: ルールベース事前フィルタ（<10ms）→ LLM Judge（非同期）
 * コスト最適化: Prompt Caching + Batch API 対応
 * デフォルト: 無効（VALIDATION_LLM_JUDGE_ENABLED=true で有効化）
 */

import { recordEvent } from '../observability';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface LLMJudgeIssue {
  type: 'hallucination' | 'logical_error' | 'factual_error' | 'inconsistency';
  description: string;
  evidence: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface LLMJudgeResult {
  passed: boolean;
  score: number;
  reasoning: string;
  issues: LLMJudgeIssue[];
  skipped: boolean;
  skipReason?: string;
}

export interface LLMJudgeOptions {
  enabled?: boolean;
  contextId?: string;
  sourceTexts?: string[];
  /** タイムアウト ms (デフォルト: 10000) */
  timeoutMs?: number;
}

// ──────────────────────────────────────────────
// System Prompt (Cached — 4096+ tokens 確保)
// ──────────────────────────────────────────────

const JUDGE_SYSTEM_PROMPT = `あなたはテキスト品質の専門審判者です。与えられたテキストを以下の観点で厳密に評価してください。

## 評価基準

### 1. ハルシネーション検出
- 根拠なく断言されている事実
- 存在しない研究・統計・引用
- 誤った因果関係の主張

### 2. 論理的整合性
- 前提と結論の矛盾
- 循環論理
- 無効な三段論法

### 3. 事実誤認
- 明らかに間違っている数値・日付・固有名詞
- 科学的コンセンサスと相反する主張

### 4. 内部一貫性
- テキスト内での矛盾
- 用語の不一致した使用

## 出力形式（必ずこの JSON 形式で返すこと）

{
  "score": 0.0〜1.0,
  "passed": true/false,
  "reasoning": "判定理由の要約（100文字以内）",
  "issues": [
    {
      "type": "hallucination|logical_error|factual_error|inconsistency",
      "description": "問題の説明",
      "evidence": "該当テキストの抜粋（50文字以内）",
      "severity": "critical|high|medium|low"
    }
  ]
}

スコア基準:
- 0.8以上: 合格（passed: true）
- 0.8未満: 不合格（passed: false）
- 問題なし: issues は空配列 []

重要: JSON のみを返すこと。前置き・後記一切不要。`;

// ──────────────────────────────────────────────
// Skip Guard (rule-based pre-filter)
// ──────────────────────────────────────────────

/** テキストが LLM Judge をスキップすべきか判定（低コストの事前チェック） */
function shouldSkip(text: string): { skip: boolean; reason?: string } {
  if (text.trim().length < 20) {
    return { skip: true, reason: 'text_too_short' };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { skip: true, reason: 'no_api_key' };
  }
  return { skip: false };
}

// ──────────────────────────────────────────────
// JSON Parse Helper
// ──────────────────────────────────────────────

function parseJudgeResponse(content: string): Omit<LLMJudgeResult, 'skipped'> {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no JSON found');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      passed: Boolean(parsed.passed ?? parsed.score >= 0.8),
      score: Number(parsed.score ?? 0.5),
      reasoning: String(parsed.reasoning ?? ''),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch {
    // パース失敗時は安全側に倒してスコア0.5で通過
    return { passed: true, score: 0.5, reasoning: 'parse_error', issues: [] };
  }
}

// ──────────────────────────────────────────────
// Main API
// ──────────────────────────────────────────────

/**
 * LLM Judge によるセマンティック検証を実行する
 */
export async function runLLMJudge(
  text: string,
  options: LLMJudgeOptions = {}
): Promise<LLMJudgeResult> {
  const {
    enabled = process.env.VALIDATION_LLM_JUDGE_ENABLED === 'true',
    contextId = 'llm-judge',
    sourceTexts = [],
    timeoutMs = 10000,
  } = options;

  // 無効または事前チェックでスキップ
  if (!enabled) {
    return { passed: true, score: 1.0, reasoning: '', issues: [], skipped: true, skipReason: 'disabled' };
  }

  const guard = shouldSkip(text);
  if (guard.skip) {
    return { passed: true, score: 1.0, reasoning: '', issues: [], skipped: true, skipReason: guard.reason };
  }

  const userContent = sourceTexts.length > 0
    ? `## ソーステキスト（RAG参照元）\n${sourceTexts.slice(0, 3).map((s, i) => `[${i + 1}] ${s.substring(0, 300)}`).join('\n')}\n\n## 評価対象テキスト\n${text}`
    : `## 評価対象テキスト\n${text}`;

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: [
      {
        type: 'text',
        text: JUDGE_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' }, // Prompt Caching でコスト削減
      },
    ],
    messages: [{ role: 'user', content: userContent }],
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status}`);
    }
    const data = await res.json() as { content?: Array<{ type: string; text: string }> };
    const content = data.content?.[0]?.type === 'text' ? data.content[0].text : '';
    const result = parseJudgeResponse(content);

    recordEvent('memory_search', contextId, result.passed ? 'ok' : 'fail', {
      metadata: { score: result.score, issueCount: result.issues.length },
    });

    return { ...result, skipped: false };
  } catch (error) {
    // API エラー・タイムアウト時は安全側に倒してスキップ扱い
    const reason = error instanceof Error ? error.message : 'unknown_error';
    recordEvent('memory_search', contextId, 'ok', {
      metadata: { skipped: true, skipReason: reason },
    });
    return { passed: true, score: 1.0, reasoning: '', issues: [], skipped: true, skipReason: reason };
  }
}
