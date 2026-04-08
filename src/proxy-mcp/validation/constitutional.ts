/**
 * Constitutional AI スタイルのチェック
 *
 * 10原則に基づいてテキストを評価し、違反した原則と修正プロンプトを返す。
 * 外部依存ゼロ・TypeScriptのみ。
 */

import { recordEvent } from '../observability';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface ConstitutionalViolation {
  principle: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  evidence: string;
}

export interface ConstitutionalResult {
  passed: boolean;
  violationScore: number;
  violations: ConstitutionalViolation[];
  correctionPrompt?: string;
}

export interface ConstitutionalOptions {
  threshold?: number;
  contextId?: string;
}

// ──────────────────────────────────────────────
// Principle Definitions
// ──────────────────────────────────────────────

interface PrincipleChecker {
  name: string;
  severity: ConstitutionalViolation['severity'];
  check: (text: string) => string | undefined;
}

const PRINCIPLES: PrincipleChecker[] = [
  {
    name: 'honesty',
    severity: 'high',
    check: (text) => {
      const match = text.match(/(?:必ずしも|確実に|100%)[^。．\n]*(?:です|ます|する|できる|である)/);
      if (match) return match[0].substring(0, 100);
      return undefined;
    },
  },
  {
    name: 'uncertainty',
    severity: 'medium',
    check: (text) => {
      const match = text.match(/(?:絶対に|間違いなく|確かに)[^。．\n]*(?:です|ます|する)/);
      if (match) return match[0].substring(0, 100);
      return undefined;
    },
  },
  {
    name: 'fabrication',
    severity: 'critical',
    check: (text) => {
      const urlMatch = text.match(/https?:\/\/[^\s）)」\]]+/g);
      if (!urlMatch) return undefined;
      const suspicious = urlMatch.find(url =>
        /example\.com\/(?:paper|research|study)/.test(url) ||
        /fakepaper|fictional|made-up/.test(url)
      );
      return suspicious ? suspicious.substring(0, 100) : undefined;
    },
  },
  {
    name: 'consistency',
    severity: 'high',
    check: (text) => {
      const sentences = text.split(/[。．\n]/).filter(s => s.length > 10);
      for (let i = 0; i < sentences.length; i++) {
        for (let j = i + 1; j < sentences.length; j++) {
          const a = sentences[i];
          const b = sentences[j];
          const aWords = a.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          const bLower = b.toLowerCase();
          const shared = aWords.filter(w => bLower.includes(w));
          if (shared.length >= 2) {
            const aAffirm = /できる|である|です|あります/.test(a);
            const bNegate = /できない|ではない|ありません|ません/.test(b);
            const aNegate = /できない|ではない|ありません|ません/.test(a);
            const bAffirm = /できる|である|です|あります/.test(b);
            if ((aAffirm && bNegate) || (aNegate && bAffirm)) {
              return `"${a.substring(0, 50)}" vs "${b.substring(0, 50)}"`;
            }
          }
        }
      }
      return undefined;
    },
  },
  {
    name: 'scope',
    severity: 'medium',
    check: (text) => {
      const match = text.match(/(?:宇宙全体|すべての生物|全人類|全世界)[^。．\n]*(?:確実|必ず|間違いなく)/);
      if (match) return match[0].substring(0, 100);
      return undefined;
    },
  },
  {
    name: 'harmful',
    severity: 'critical',
    check: (text) => {
      const match = text.match(
        /(?:爆弾の作り方|毒物の合成|ハッキング手順|不正アクセス方法)[^。．\n]*/
      );
      if (match) return match[0].substring(0, 100);
      return undefined;
    },
  },
  {
    name: 'privacy',
    severity: 'high',
    check: (text) => {
      const match = text.match(
        /(?:\d{3}-\d{4}-\d{4}|\b\d{3}-\d{2}-\d{4}\b|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/
      );
      if (match) return match[0].substring(0, 100);
      return undefined;
    },
  },
  {
    name: 'attribution',
    severity: 'medium',
    check: (text) => {
      const match = text.match(/(?:私が発明|私が開発|私が考案)[^。．\n]*(?:した|しました)/);
      if (match) return match[0].substring(0, 100);
      return undefined;
    },
  },
  {
    name: 'recency',
    severity: 'low',
    check: (text) => {
      const match = text.match(/(?:最新の|最新技術|2024年現在)[^。．\n]*(?:です|ます|である)/);
      if (match) return match[0].substring(0, 100);
      return undefined;
    },
  },
  {
    name: 'completeness',
    severity: 'low',
    // BUG-006修正: 薬品名・医療成分名・法律・金融用語を包括するパターンに拡張
    check: (text) => {
      const MEDICAL = /(?:薬(?:品|剤|物)?|医療|診断|治療|処方|投薬|服用|副作用|手術|入院|症状|[ァ-ヶー]{4,}(?:塩酸塩|硫酸塩|注射|錠|カプセル)?)[^。．\n]{5,}/;
      const LEGAL = /(?:法律|法的|契約|訴訟|弁護|判決|条文|規制|違法|合法)[^。．\n]{5,}/;
      const FINANCIAL = /(?:投資|運用|株|為替|証券|ファンド|リスク|損失|利回り|金融商品)[^。．\n]{5,}/;
      const hasWarningNeeded = MEDICAL.test(text) || LEGAL.test(text) || FINANCIAL.test(text);
      const hasWarning = /(?:注意|警告|免責|専門家|医師|弁護士|ファイナンシャル)/.test(text);
      if (hasWarningNeeded && !hasWarning) {
        const match = text.match(MEDICAL) ?? text.match(LEGAL) ?? text.match(FINANCIAL);
        return match ? match[0].substring(0, 100) : undefined;
      }
      return undefined;
    },
  },
];

// ──────────────────────────────────────────────
// Severity Weights
// ──────────────────────────────────────────────

const SEVERITY_WEIGHTS: Record<ConstitutionalViolation['severity'], number> = {
  critical: 0.4,
  high: 0.25,
  medium: 0.15,
  low: 0.05,
};

// ──────────────────────────────────────────────
// Correction Prompt
// ──────────────────────────────────────────────

function buildCorrectionPrompt(violations: ConstitutionalViolation[]): string {
  const items = violations.map((v, i) =>
    `${i + 1}. 原則「${v.principle}」違反 [${v.severity}]\n   箇所: "${v.evidence}"`
  ).join('\n\n');

  return (
    `以下のConstitutional AI原則違反が検出されました。\n\n${items}\n\n` +
    `各違反箇所を修正し、誠実で正確な表現に改めてください。`
  );
}

// ──────────────────────────────────────────────
// Main API
// ──────────────────────────────────────────────

/**
 * Constitutional AI スタイルのチェックを実行する
 */
export function checkConstitutional(
  text: string,
  options: ConstitutionalOptions = {}
): ConstitutionalResult {
  const { threshold = 0.3, contextId = 'constitutional' } = options;

  const violations: ConstitutionalViolation[] = [];

  for (const principle of PRINCIPLES) {
    const evidence = principle.check(text);
    if (evidence !== undefined) {
      violations.push({
        principle: principle.name,
        severity: principle.severity,
        evidence,
      });
    }
  }

  const violationScore = violations.reduce(
    (acc, v) => acc + SEVERITY_WEIGHTS[v.severity],
    0
  );
  const clampedScore = Math.min(1.0, violationScore);
  const passed = clampedScore < threshold;

  recordEvent('memory_search', contextId, passed ? 'ok' : 'fail', {
    metadata: { violationScore: clampedScore, violationCount: violations.length },
  });

  return {
    passed,
    violationScore: clampedScore,
    violations,
    correctionPrompt: violations.length > 0
      ? buildCorrectionPrompt(violations)
      : undefined,
  };
}
