#!/usr/bin/env node
/**
 * pre-compact-save.js
 * PreToolUse hook: /compact 実行前に重要ファイルを自動永続化
 *
 * TCPS (TAISUN Context Persistence System) Layer 1
 * @version 1.0.0
 * @date 2026-03-17
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ===== 設定 =====
const ORIGINALS_DIR = path.join(process.cwd(), 'scripts', 'originals');
const BACKUP_DIR = path.join(ORIGINALS_DIR, 'backups');
const CONFIG_FILE = path.join(process.cwd(), '.claude', 'hooks', 'config', 'tcps-watch-files.json');

// デフォルト監視ファイルリスト（config がない場合のフォールバック）
const DEFAULT_WATCH_FILES = [
  'SESSION_HANDOFF.md',
];

// ===== ユーティリティ =====

function loadWatchFiles() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      return config.watchFiles || DEFAULT_WATCH_FILES;
    }
  } catch (e) { /* ignore */ }
  return DEFAULT_WATCH_FILES;
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function isCompactTrigger(hookData) {
  const toolName = hookData.tool_name || hookData.tool || '';
  const toolInput = hookData.tool_input || hookData.input || {};
  const command = (toolInput.command || toolInput.cmd || '').toLowerCase();

  // Bash で /compact コマンドそのもの、または compact ツール直接呼び出し
  // NOTE: "compact" を含む一般コマンド（git --compact-summary 等）は除外
  const isCompactCommand = /(?:^|\s)\/compact(?:\s|$)/.test(command);
  return (
    (toolName === 'Bash' && isCompactCommand) ||
    toolName === 'compact'
  );
}

// ===== バックアップ処理 =====

function saveBackup(watchFiles) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `pre-compact-${timestamp}.json`);

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const state = {
    timestamp: new Date().toISOString(),
    trigger: 'pre-compact',
    files: {},
    savedCount: 0,
    missingCount: 0,
  };

  for (const relPath of watchFiles) {
    const absPath = path.join(process.cwd(), relPath);
    if (fs.existsSync(absPath)) {
      const content = fs.readFileSync(absPath, 'utf-8');
      state.files[relPath] = {
        content,
        hash: sha256(content),
        size: content.length,
        savedAt: state.timestamp,
      };
      state.savedCount++;
    } else {
      state.files[relPath] = { missing: true };
      state.missingCount++;
    }
  }

  fs.writeFileSync(backupFile, JSON.stringify(state, null, 2));

  // 古いバックアップの削除（7日以上前）
  pruneOldBackups(BACKUP_DIR, 7);

  return { backupFile, state };
}

function pruneOldBackups(dir, maxDays) {
  try {
    const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('pre-compact-') && f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (e) { /* ignore */ }
}

// ===== SESSION_HANDOFF.md の compact 記録更新 =====

function updateHandoffLedger(backupFile) {
  const handoffPath = path.join(process.cwd(), 'SESSION_HANDOFF.md');
  if (!fs.existsSync(handoffPath)) return;

  try {
    let content = fs.readFileSync(handoffPath, 'utf-8');
    const timestamp = new Date().toISOString().slice(0, 16);
    const backupName = path.basename(backupFile);

    // Ledger テーブルが存在すれば追記、なければヘッダーに注記を追加
    const ledgerEntry = `\n<!-- TCPS: /compact 前バックアップ ${timestamp} → ${backupName} -->`;

    // 末尾に追記
    if (!content.includes(ledgerEntry)) {
      content = content.trimEnd() + '\n' + ledgerEntry + '\n';
      fs.writeFileSync(handoffPath, content);
    }
  } catch (e) { /* ignore */ }
}

// ===== メイン =====

async function main() {
  let input = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', d => { input += d; });

  process.stdin.on('end', () => {
    try {
      const hookData = input ? JSON.parse(input) : {};

      if (!isCompactTrigger(hookData)) {
        process.exit(0);
        return;
      }

      // /compact を検知 → バックアップ実行
      const watchFiles = loadWatchFiles();
      const { backupFile, state } = saveBackup(watchFiles);

      // SESSION_HANDOFF.md に記録
      updateHandoffLedger(backupFile);

      process.stderr.write(
        `[TCPS] /compact 前バックアップ完了: ${state.savedCount}件保存, ${state.missingCount}件なし → ${path.relative(process.cwd(), backupFile)}\n`
      );

      process.exit(0); // 非ブロッキング
    } catch (e) {
      process.stderr.write(`[TCPS] pre-compact-save エラー: ${e.message}\n`);
      process.exit(0); // エラーでもブロックしない
    }
  });

  // stdin が空のまま終了する場合
  process.stdin.on('error', () => process.exit(0));
}

main();
