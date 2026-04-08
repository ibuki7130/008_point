/**
 * Output Validator - AIエージェント出力品質ゲート
 *
 * 3段階バリデーション:
 * 1. 不確実性検出 (ハルシネーション前兆語)
 * 2. 一貫性チェック (前回出力との矛盾検出)
 * 3. スキーマ検証 (構造化出力の型保証)
 */

export type ValidationSeverity = 'pass' | 'warn' | 'fail';

export interface UncertaintyFlag {
  phrase: string;
  position: number;
  severity: 'low' | 'medium' | 'high';
}

export interface ConsistencyViolation {
  claim: string;
  contradiction: string;
}

export interface ValidationResult {
  severity: ValidationSeverity;
  uncertaintyScore: number; // 0.0 - 1.0
  uncertaintyFlags: UncertaintyFlag[];
  consistencyViolations: ConsistencyViolation[];
  schemaErrors: string[];
  shouldRetry: boolean;
  summary: string;
}

// 不確実性語彙 (日本語 + 英語)
const UNCERTAINTY_PHRASES: Array<{ phrase: string; weight: number; severity: 'low' | 'medium' | 'high' }> = [
  // 高リスク - ハルシネーション強指標
  { phrase: 'と思います', weight: 0.6, severity: 'high' },
  { phrase: 'かもしれません', weight: 0.7, severity: 'high' },
  { phrase: 'おそらく', weight: 0.5, severity: 'medium' },
  { phrase: 'たぶん', weight: 0.5, severity: 'medium' },
  { phrase: '確認していませんが', weight: 0.8, severity: 'high' },
  { phrase: '記憶が定かでは', weight: 0.9, severity: 'high' },
  { phrase: 'I think', weight: 0.5, severity: 'medium' },
  { phrase: 'I believe', weight: 0.5, severity: 'medium' },
  { phrase: 'probably', weight: 0.5, severity: 'medium' },
  { phrase: 'might be', weight: 0.6, severity: 'high' },
  { phrase: 'not sure', weight: 0.7, severity: 'high' },
  { phrase: 'I\'m not certain', weight: 0.8, severity: 'high' },
  // 中リスク
  { phrase: 'maybe', weight: 0.4, severity: 'medium' },
  { phrase: 'possibly', weight: 0.4, severity: 'medium' },
  { phrase: 'should be', weight: 0.3, severity: 'low' },
  { phrase: 'typically', weight: 0.2, severity: 'low' },
  { phrase: '一般的に', weight: 0.2, severity: 'low' },
  { phrase: 'ほぼ', weight: 0.3, severity: 'low' },
];

// 矛盾検出パターン
const CONTRADICTION_PATTERNS: Array<[RegExp, RegExp]> = [
  [/存在します/, /存在しません/],
  [/サポートしています/, /サポートしていません/],
  [/有効です/, /無効です/],
  [/is supported/, /is not supported/],
  [/exists/, /does not exist/],
  [/enabled/, /disabled/],
];

/**
 * 出力テキストの不確実性スコアを計算
 */
function detectUncertainty(text: string): { score: number; flags: UncertaintyFlag[] } {
  const flags: UncertaintyFlag[] = [];
  let totalWeight = 0;

  for (const { phrase, weight, severity } of UNCERTAINTY_PHRASES) {
    const lowerText = text.toLowerCase();
    const lowerPhrase = phrase.toLowerCase();
    let pos = 0;

    while (true) {
      const idx = lowerText.indexOf(lowerPhrase, pos);
      if (idx === -1) break;

      flags.push({ phrase, position: idx, severity });
      totalWeight += weight;
      pos = idx + 1;
    }
  }

  // スコアを 0-1 に正規化 (上限: 3.0 = スコア 1.0)
  const score = Math.min(1.0, totalWeight / 3.0);
  return { score, flags };
}

/**
 * 現在の出力と過去の出力の矛盾を検出
 */
function detectConsistencyViolations(
  current: string,
  previous: string[]
): ConsistencyViolation[] {
  const violations: ConsistencyViolation[] = [];

  for (const prev of previous) {
    for (const [patternA, patternB] of CONTRADICTION_PATTERNS) {
      const currentHasA = patternA.test(current);
      const prevHasB = patternB.test(prev);
      const currentHasB = patternB.test(current);
      const prevHasA = patternA.test(prev);

      if ((currentHasA && prevHasB) || (currentHasB && prevHasA)) {
        const claim = current.match(patternA) || current.match(patternB);
        const contradiction = prev.match(patternB) || prev.match(patternA);
        if (claim && contradiction) {
          violations.push({
            claim: claim[0],
            contradiction: contradiction[0],
          });
        }
      }
    }
  }

  return violations;
}

/**
 * スキーマ検証 (期待フィールドの存在確認)
 */
function validateSchema(
  output: unknown,
  requiredFields: string[]
): string[] {
  if (!output || typeof output !== 'object') {
    return requiredFields.length > 0 ? ['Output is not an object'] : [];
  }

  const errors: string[] = [];
  const obj = output as Record<string, unknown>;

  for (const field of requiredFields) {
    if (!(field in obj) || obj[field] === null || obj[field] === undefined) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  return errors;
}

/**
 * 総合バリデーション判定
 */
function determineSeverity(
  uncertaintyScore: number,
  consistencyViolations: number,
  schemaErrors: number
): ValidationSeverity {
  if (schemaErrors > 0 || consistencyViolations > 0 || uncertaintyScore >= 0.7) {
    return 'fail';
  }
  if (uncertaintyScore >= 0.3) {
    return 'warn';
  }
  return 'pass';
}

export interface ValidateOptions {
  previousOutputs?: string[];
  requiredFields?: string[];
  /** スコア >= この値でリトライ推奨 (デフォルト: 0.5) */
  retryThreshold?: number;
}

/**
 * メインバリデーション関数
 */
export function validateOutput(
  output: string | unknown,
  options: ValidateOptions = {}
): ValidationResult {
  const {
    previousOutputs = [],
    requiredFields = [],
    retryThreshold = 0.5,
  } = options;

  const text = typeof output === 'string' ? output : JSON.stringify(output);

  const { score: uncertaintyScore, flags: uncertaintyFlags } = detectUncertainty(text);
  const consistencyViolations = detectConsistencyViolations(text, previousOutputs);
  const schemaErrors = validateSchema(output, requiredFields);

  const severity = determineSeverity(uncertaintyScore, consistencyViolations.length, schemaErrors.length);
  const shouldRetry = uncertaintyScore >= retryThreshold || consistencyViolations.length > 0 || schemaErrors.length > 0;

  const parts: string[] = [];
  if (uncertaintyScore >= 0.3) parts.push(`不確実性スコア: ${(uncertaintyScore * 100).toFixed(0)}%`);
  if (consistencyViolations.length > 0) parts.push(`矛盾検出: ${consistencyViolations.length}件`);
  if (schemaErrors.length > 0) parts.push(`スキーマエラー: ${schemaErrors.length}件`);
  const summary = parts.length > 0 ? parts.join(' / ') : 'バリデーション通過';

  return {
    severity,
    uncertaintyScore,
    uncertaintyFlags,
    consistencyViolations,
    schemaErrors,
    shouldRetry,
    summary,
  };
}

/**
 * バリデーション結果をログ出力用にフォーマット
 */
export function formatValidationResult(result: ValidationResult): string {
  const icon = result.severity === 'pass' ? '✅' : result.severity === 'warn' ? '⚠️' : '❌';
  return `${icon} [OutputValidator] ${result.summary}`;
}
