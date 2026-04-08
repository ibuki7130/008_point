#!/usr/bin/env node
/**
 * Output Verifier Hook (PostToolUse)
 *
 * エージェント出力の不確実性を検出し、
 * スコアが閾値を超えた場合に警告を出す。
 *
 * 設定: ~/.claude/settings.json の hooks セクションに追加:
 * {
 *   "hooks": {
 *     "PostToolUse": [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "node .claude/hooks/output-verifier.js" }] }]
 *   }
 * }
 */

const UNCERTAINTY_PHRASES = [
  { phrase: 'と思います',      weight: 0.6, severity: 'high' },
  { phrase: 'かもしれません',  weight: 0.7, severity: 'high' },
  { phrase: 'おそらく',        weight: 0.5, severity: 'medium' },
  { phrase: 'たぶん',          weight: 0.5, severity: 'medium' },
  { phrase: '確認していませんが', weight: 0.8, severity: 'high' },
  { phrase: '記憶が定かでは',  weight: 0.9, severity: 'high' },
  { phrase: 'I think',         weight: 0.5, severity: 'medium' },
  { phrase: 'I believe',       weight: 0.5, severity: 'medium' },
  { phrase: 'probably',        weight: 0.5, severity: 'medium' },
  { phrase: 'might be',        weight: 0.6, severity: 'high' },
  { phrase: "I'm not certain", weight: 0.8, severity: 'high' },
];

const RETRY_THRESHOLD = 0.5;
const WARN_THRESHOLD  = 0.3;

function detectUncertainty(text) {
  let totalWeight = 0;
  const flagged = [];

  for (const { phrase, weight, severity } of UNCERTAINTY_PHRASES) {
    if (text.toLowerCase().includes(phrase.toLowerCase())) {
      totalWeight += weight;
      flagged.push({ phrase, severity });
    }
  }

  return { score: Math.min(1.0, totalWeight / 3.0), flagged };
}

function main() {
  let inputData = '';
  process.stdin.on('data', chunk => { inputData += chunk; });

  process.stdin.on('end', () => {
    try {
      const event = JSON.parse(inputData);

      // tool_result の output テキストを抽出
      const output = event?.tool_result?.output ?? event?.output ?? '';
      if (!output || typeof output !== 'string' || output.length < 50) {
        process.exit(0);
      }

      const { score, flagged } = detectUncertainty(output);

      if (score >= RETRY_THRESHOLD) {
        const phrases = flagged.map(f => `"${f.phrase}"(${f.severity})`).join(', ');
        process.stderr.write(
          `[OutputVerifier] ⚠️  不確実性スコア HIGH: ${(score * 100).toFixed(0)}% — 再確認を推奨\n` +
          `  検出語句: ${phrases}\n`
        );
        // exit 1 で Claude に警告を通知 (ブロックはしない)
        process.exit(1);
      } else if (score >= WARN_THRESHOLD) {
        const phrases = flagged.map(f => `"${f.phrase}"`).join(', ');
        process.stderr.write(
          `[OutputVerifier] ℹ️  不確実性スコア MEDIUM: ${(score * 100).toFixed(0)}% — ${phrases}\n`
        );
      }

      process.exit(0);
    } catch {
      // パース失敗は無視してスルー
      process.exit(0);
    }
  });
}

main();
