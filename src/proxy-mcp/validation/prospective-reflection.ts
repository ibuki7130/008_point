/**
 * Prospective Reflection — 実行前クリティック
 *
 * プロンプトの曖昧さ・欠落コンテキスト・過大期待・スコープ違反を事前検出。
 * 参考: "Prospective Reflection" 2025論文
 */

import { recordEvent } from '../observability';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface ProspectiveRisk {
  type: 'ambiguity' | 'missing_context' | 'overconfidence' | 'scope_violation';
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface ProspectiveReflectionResult {
  shouldProceed: boolean;
  riskScore: number;
  risks: ProspectiveRisk[];
  refinedPrompt?: string;
  recommendation: 'proceed' | 'refine' | 'abort';
}

export interface ProspectiveOptions {
  threshold?: number;
  contextId?: string;
}

// ──────────────────────────────────────────────
// Risk Detectors
// ──────────────────────────────────────────────

const SEVERITY_WEIGHTS: Record<ProspectiveRisk['severity'], number> = {
  critical: 0.4,
  high: 0.25,
  medium: 0.15,
  low: 0.05,
};

function detectAmbiguity(prompt: string): ProspectiveRisk[] {
  const risks: ProspectiveRisk[] = [];

  const ambiguousPatterns: Array<{ pattern: RegExp; desc: string; severity: ProspectiveRisk['severity'] }> = [
    { pattern: /適当に|いい感じに|なんとかして|うまく/, desc: '「適当に」「いい感じに」などの曖昧な指示が含まれています', severity: 'high' },
    { pattern: /よしなに|いわゆる|みたいな感じ/, desc: '抽象的な指示語が含まれています', severity: 'medium' },
    { pattern: /普通に|普通の|ふつう/, desc: '「普通」は人によって解釈が異なります', severity: 'low' },
  ];

  for (const { pattern, desc, severity } of ambiguousPatterns) {
    if (pattern.test(prompt)) {
      risks.push({ type: 'ambiguity', description: desc, severity });
    }
  }

  return risks;
}

function detectMissingContext(prompt: string): ProspectiveRisk[] {
  const risks: ProspectiveRisk[] = [];

  const needsFile = /ファイル|コード|スクリプト|関数/.test(prompt);
  const hasPath = /\/[^\s]+|[A-Za-z]:\\|\.ts|\.js|\.py|\.go|\.rs/.test(prompt);
  if (needsFile && !hasPath) {
    risks.push({
      type: 'missing_context',
      description: 'ファイル操作が示唆されていますが、ファイルパスが指定されていません',
      severity: 'high',
    });
  }

  const needsUrl = /サイト|ページ|URL|ウェブ|Web/.test(prompt);
  const hasUrl = /https?:\/\//.test(prompt);
  if (needsUrl && !hasUrl) {
    risks.push({
      type: 'missing_context',
      description: 'URLが必要そうですが指定されていません',
      severity: 'medium',
    });
  }

  const needsVersion = /アップグレード|移行|互換|バージョン/.test(prompt);
  const hasVersion = /v?\d+\.\d+|\d+系/.test(prompt);
  if (needsVersion && !hasVersion) {
    risks.push({
      type: 'missing_context',
      description: 'バージョン情報が必要そうですが指定されていません',
      severity: 'medium',
    });
  }

  return risks;
}

function detectOverconfidence(prompt: string): ProspectiveRisk[] {
  const risks: ProspectiveRisk[] = [];

  const overconfidentPatterns: Array<{ pattern: RegExp; desc: string; severity: ProspectiveRisk['severity'] }> = [
    { pattern: /完璧に|完全に|必ず/, desc: '「完璧に」「必ず」などの絶対的な要求は達成が困難です', severity: 'high' },
    { pattern: /エラーなく|バグなし|100%/, desc: '「エラーなく」「100%」などの完全無欠の要求です', severity: 'high' },
    { pattern: /即座に|瞬時に|一瞬で/, desc: '即時実行の期待は環境によって実現できない場合があります', severity: 'medium' },
  ];

  for (const { pattern, desc, severity } of overconfidentPatterns) {
    if (pattern.test(prompt)) {
      risks.push({ type: 'overconfidence', description: desc, severity });
    }
  }

  return risks;
}

function detectScopeViolation(prompt: string): ProspectiveRisk[] {
  const risks: ProspectiveRisk[] = [];

  const scopePatterns: Array<{ pattern: RegExp; desc: string; severity: ProspectiveRisk['severity'] }> = [
    { pattern: /全部|すべての|あらゆる/, desc: '「全部」「すべての」などの無制限スコープはリソースを消費します', severity: 'high' },
    { pattern: /無制限|制限なし|どんな.*でも/, desc: '無制限の要求はシステムに負荷をかける可能性があります', severity: 'high' },
    { pattern: /全ファイル|全ページ|全データ/, desc: '全量処理は時間・コストがかかります', severity: 'medium' },
  ];

  for (const { pattern, desc, severity } of scopePatterns) {
    if (pattern.test(prompt)) {
      risks.push({ type: 'scope_violation', description: desc, severity });
    }
  }

  return risks;
}

// ──────────────────────────────────────────────
// Refined Prompt Generation
// ──────────────────────────────────────────────

function buildRefinedPrompt(prompt: string, risks: ProspectiveRisk[]): string {
  const suggestions: string[] = [];

  for (const risk of risks) {
    switch (risk.type) {
      case 'ambiguity':
        suggestions.push('曖昧な表現を具体的な要件に置き換えてください（例: 「適当に」→「〇〇の形式で」）');
        break;
      case 'missing_context':
        suggestions.push(`不足している情報を追加してください: ${risk.description}`);
        break;
      case 'overconfidence':
        suggestions.push('絶対的な要求を現実的な要件に緩和してください（例: 「完璧に」→「できる限り正確に」）');
        break;
      case 'scope_violation':
        suggestions.push('処理範囲を限定してください（例: 「全部」→「最大〇件まで」）');
        break;
    }
  }

  const unique = [...new Set(suggestions)];
  return (
    `以下の点を改善してからプロンプトを再送してください:\n` +
    unique.map((s, i) => `${i + 1}. ${s}`).join('\n') +
    `\n\n元のプロンプト:\n${prompt}`
  );
}

// ──────────────────────────────────────────────
// Main API
// ──────────────────────────────────────────────

/**
 * プロンプトの事前リスク評価を実行する
 */
export function evaluateProspectively(
  prompt: string,
  options: ProspectiveOptions = {}
): ProspectiveReflectionResult {
  const { threshold = 0.4, contextId = 'prospective' } = options;

  const risks: ProspectiveRisk[] = [
    ...detectAmbiguity(prompt),
    ...detectMissingContext(prompt),
    ...detectOverconfidence(prompt),
    ...detectScopeViolation(prompt),
  ];

  const riskScore = Math.min(
    1.0,
    risks.reduce((acc, r) => acc + SEVERITY_WEIGHTS[r.severity], 0)
  );

  const hasCritical = risks.some(r => r.severity === 'critical');
  let recommendation: ProspectiveReflectionResult['recommendation'];

  if (hasCritical) {
    recommendation = 'abort';
  } else if (riskScore >= threshold) {
    recommendation = 'refine';
  } else {
    recommendation = 'proceed';
  }

  const shouldProceed = recommendation === 'proceed';

  recordEvent('memory_search', contextId, shouldProceed ? 'ok' : 'fail', {
    metadata: { riskScore, riskCount: risks.length, recommendation },
  });

  return {
    shouldProceed,
    riskScore,
    risks,
    refinedPrompt: recommendation !== 'proceed'
      ? buildRefinedPrompt(prompt, risks)
      : undefined,
    recommendation,
  };
}
