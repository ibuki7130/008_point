/**
 * Chain-of-Verification (CoVe) — Phase 6
 *
 * 出力から検証質問を自動生成し、各質問を独立に検証。
 * 矛盾・不整合箇所を特定して修正プロンプトを返す。
 *
 * フロー:
 *   output → extractClaims() → generateQuestions() → verifyClaims()
 *            → contradiction detection → CoVeResult
 *
 * 参考: "Chain-of-Verification Reduces Hallucination in LLMs"
 *       Dhuliawala et al. 2024 (事実誤認率20-30%低減)
 */

import { recordEvent } from '../observability';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface Claim {
  text: string;
  /** 検証優先度 (数値・固有名詞含む文は高い) */
  priority: 'high' | 'medium' | 'low';
}

export interface VerificationQuestion {
  claim: string;
  question: string;
  /** output内で矛盾する根拠 (見つかった場合のみ) */
  contradictionEvidence?: string;
  verified: boolean;
}

export interface CoVeResult {
  /** 矛盾なし = true */
  passed: boolean;
  claims: Claim[];
  questions: VerificationQuestion[];
  contradictions: VerificationQuestion[];
  /** 矛盾率 0.0-1.0 */
  contradictionRate: number;
  /** 修正プロンプト (矛盾がある場合のみ) */
  correctionPrompt?: string;
}

export interface CoVeOptions {
  /** 生成する検証質問の最大数 (デフォルト: 5) */
  maxQuestions?: number;
  /** 矛盾と判定する閾値 (デフォルト: 0.2) */
  contradictionThreshold?: number;
  contextId?: string;
}

// ──────────────────────────────────────────────
// Claim Extraction
// ──────────────────────────────────────────────

/** 数値・固有名詞を含む文を優先してクレームを抽出 */
function extractClaims(text: string): Claim[] {
  const sentences = text
    .split(/[。．\n]|(?<=[^A-Z])\. /)
    .map(s => s.trim())
    .filter(s => s.length > 15);

  return sentences.slice(0, 10).map(sentence => {
    // 数値・%・年・固有名詞パターンがある文は高優先度
    const hasNumbers = /\d+/.test(sentence);
    const hasPercent = /%|パーセント|percent/i.test(sentence);
    const hasYear = /20\d{2}年?/.test(sentence);
    const hasProperNoun = /[A-Z][a-z]+|Claude|GPT|Grok|Meta|Google|Microsoft|Anthropic/.test(sentence);

    let priority: Claim['priority'] = 'low';
    if (hasNumbers && (hasPercent || hasYear)) priority = 'high';
    else if (hasNumbers || hasProperNoun) priority = 'medium';

    return { text: sentence, priority };
  });
}

// ──────────────────────────────────────────────
// Question Generation
// ──────────────────────────────────────────────

/** クレームから検証質問を生成 */
function generateQuestion(claim: Claim): string {
  const { text } = claim;

  // 数値クレーム → 具体的な数値を問う質問
  const numMatch = text.match(/(\d+(?:\.\d+)?)\s*(%|パーセント|percent|倍|件|回|ms|秒)/i);
  if (numMatch) {
    return `この文が述べる "${numMatch[0]}" という値は、文章全体の他の記述と矛盾しないか？`;
  }

  // 因果関係 → 因果の一致を問う質問
  if (/により|によって|のため|結果として|つまり/.test(text)) {
    return `この文の因果関係は文章の他の部分と整合しているか？`;
  }

  // 比較 → 比較対象の一貫性を問う質問
  if (/より|比べ|対比|一方|他方/.test(text)) {
    return `この比較は他の箇所で述べられている同じ対象の記述と一致しているか？`;
  }

  // デフォルト
  return `この記述 "${text.substring(0, 60)}..." は文章全体の主張と矛盾しないか？`;
}

// ──────────────────────────────────────────────
// Contradiction Detection
// ──────────────────────────────────────────────

/** 出力テキスト内で矛盾する証拠を探す */
function findContradiction(claim: string, fullText: string): string | undefined {
  // 数値抽出
  const claimNumbers = [...claim.matchAll(/\d+(?:\.\d+)?/g)].map(m => parseFloat(m[0]));
  if (claimNumbers.length === 0) return undefined;

  const claimValue = claimNumbers[0];

  // テキスト全体から同じ文脈で異なる数値が使われていないか探す
  const sentences = fullText.split(/[。．\n]|(?<=[^A-Z])\. /).filter(s => s.length > 10);

  for (const sentence of sentences) {
    if (sentence === claim) continue;

    const sentenceNumbers = [...sentence.matchAll(/\d+(?:\.\d+)?/g)].map(m => parseFloat(m[0]));

    // 同じ文脈キーワードで異なる数値を検出
    const claimKeywords = claim.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const sharedKeywords = claimKeywords.filter(kw => sentence.toLowerCase().includes(kw));

    if (sharedKeywords.length >= 2 && sentenceNumbers.length > 0) {
      // BUG-002修正: claimValue=0 の場合の誤検出を防ぐ絶対差分チェック
      const hasConflict = sentenceNumbers.some(n => {
        if (n === claimValue) return false;
        const maxAbs = Math.max(Math.abs(n), Math.abs(claimValue));
        if (maxAbs < 1e-9) return false; // 両方ゼロ近傍
        return Math.abs(n - claimValue) / maxAbs > 0.1;
      });
      if (hasConflict) {
        return `矛盾する可能性: "${sentence.substring(0, 80)}..." (値: ${sentenceNumbers[0]})`;
      }
    }
  }

  return undefined;
}

// ──────────────────────────────────────────────
// Correction Prompt
// ──────────────────────────────────────────────

function buildCorrectionPrompt(contradictions: VerificationQuestion[]): string {
  const items = contradictions.map((q, i) =>
    `${i + 1}. 主張: "${q.claim.substring(0, 80)}..."\n   問題: ${q.question}\n   証拠: ${q.contradictionEvidence}`
  ).join('\n\n');

  return (
    `以下の記述に検証質問で矛盾が検出されました。\n\n` +
    `矛盾箇所:\n${items}\n\n` +
    `各矛盾箇所を事実に基づいて修正し、数値・固有名詞・因果関係を一貫させてください。`
  );
}

// ──────────────────────────────────────────────
// Main API
// ──────────────────────────────────────────────

/**
 * Chain-of-Verification を実行する
 *
 * @param output  検証対象のテキスト
 * @param options CoVe オプション
 */
export function runCoVe(output: string, options: CoVeOptions = {}): CoVeResult {
  const { maxQuestions = 5, contradictionThreshold = 0.2, contextId = 'cove' } = options;

  // Step 1: クレーム抽出 (高・中優先度を優先)
  const allClaims = extractClaims(output);
  const prioritized = [
    ...allClaims.filter(c => c.priority === 'high'),
    ...allClaims.filter(c => c.priority === 'medium'),
    ...allClaims.filter(c => c.priority === 'low'),
  ].slice(0, maxQuestions);

  // Step 2: 検証質問生成
  const questions: VerificationQuestion[] = prioritized.map(claim => {
    const question = generateQuestion(claim);
    const evidence = findContradiction(claim.text, output);
    return {
      claim: claim.text,
      question,
      contradictionEvidence: evidence,
      verified: evidence === undefined,
    };
  });

  // Step 3: 矛盾リスト
  const contradictions = questions.filter(q => !q.verified);
  const contradictionRate = questions.length > 0
    ? contradictions.length / questions.length
    : 0;

  const passed = contradictionRate < contradictionThreshold;

  recordEvent('memory_search', contextId, passed ? 'ok' : 'fail', {
    metadata: { contradictionRate, totalQuestions: questions.length },
  });

  return {
    passed,
    claims: prioritized,
    questions,
    contradictions,
    contradictionRate,
    correctionPrompt: contradictions.length > 0
      ? buildCorrectionPrompt(contradictions)
      : undefined,
  };
}

/**
 * バッチ CoVe — 複数出力を一括検証
 */
export function runCoVeBatch(outputs: string[], options: CoVeOptions = {}): CoVeResult[] {
  return outputs.map(output => runCoVe(output, options));
}
