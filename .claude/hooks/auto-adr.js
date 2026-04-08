#!/usr/bin/env node
/**
 * Auto ADR Hook (PostToolUse: Write/Edit)
 *
 * 重要ファイルの編集を検出し、ADRの記録を提案する。
 * stderr に提案を出力するだけ（ブロックしない）。
 */

const path = require('path');
const fs = require('fs');

// ADR対象となる重要ファイルパターン
const IMPORTANT_PATTERNS = [
  /src\/proxy-mcp\/internal\//,
  /src\/proxy-mcp\/validation\//,
  /src\/proxy-mcp\/supervisor\//,
  /src\/performance\/ModelRouter/,
  /src\/intent-parser\//,
  /\.claude\/settings\.json$/,
  /tsconfig\.json$/,
];

// ADR番号を自動採番
function nextAdrNumber(decisionsDir) {
  if (!fs.existsSync(decisionsDir)) return '001';
  const files = fs.readdirSync(decisionsDir)
    .filter(f => /^\d{8}-\d{3}-/.test(f))
    .sort();
  if (files.length === 0) return '001';
  const last = files[files.length - 1];
  const num = parseInt(last.split('-')[1], 10) + 1;
  return String(num).padStart(3, '0');
}

function main() {
  let inputData = '';
  process.stdin.on('data', chunk => { inputData += chunk; });

  process.stdin.on('end', () => {
    try {
      const event = JSON.parse(inputData);
      const toolName = event?.tool_name ?? '';
      const filePath = event?.tool_input?.file_path ?? event?.tool_input?.path ?? '';

      if (!['Write', 'Edit'].includes(toolName) || !filePath) {
        process.exit(0);
      }

      const isImportant = IMPORTANT_PATTERNS.some(p => p.test(filePath));
      if (!isImportant) {
        process.exit(0);
      }

      const projectRoot = process.env.HOME
        ? `${process.env.HOME}/taisun_agent`
        : process.cwd();
      const decisionsDir = path.join(projectRoot, '.claude', 'decisions');
      const nextNum = nextAdrNumber(decisionsDir);
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const relPath = filePath.replace(projectRoot + '/', '');

      process.stderr.write(
        `[AutoADR] 📝 重要ファイル変更を検出: ${relPath}\n` +
        `  → ADR記録を推奨: .claude/decisions/${today}-${nextNum}-<title>.md\n` +
        `  テンプレート:\n` +
        `    # ADR-${nextNum}: <変更内容>\n` +
        `    **日付**: ${today.slice(0,4)}-${today.slice(4,6)}-${today.slice(6,8)}\n` +
        `    **ステータス**: accepted\n` +
        `    **実装**: ${relPath}\n` +
        `    ## 背景 / ## 判断 / ## 期待効果\n`
      );

      process.exit(0);
    } catch {
      process.exit(0);
    }
  });
}

main();
