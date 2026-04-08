#!/usr/bin/env node
/**
 * session-end-ledger.js
 * Stop hook: セッション終了時に TCPS Ledger を SESSION_HANDOFF.md へ自動記録
 *
 * TCPS (TAISUN Context Persistence System) Layer 2
 * @version 1.0.0
 * @date 2026-03-17
 */

const fs = require('fs');
const path = require('path');

const CWD = process.cwd();
const HANDOFF_PATH = path.join(CWD, 'SESSION_HANDOFF.md');
const BACKUP_DIR = path.join(CWD, 'scripts', 'originals', 'backups');

// ===== バックアップ一覧の取得 =====

function listBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('pre-compact-') && f.endsWith('.json'))
      .sort()
      .reverse(); // 新しい順
  } catch (e) {
    return [];
  }
}

function parseBackupInfo(filename) {
  try {
    const filePath = path.join(BACKUP_DIR, filename);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return {
      timestamp: (data.timestamp || '').slice(0, 16),
      savedCount: data.savedCount || 0,
    };
  } catch (e) {
    return { timestamp: '?', savedCount: 0 };
  }
}

// ===== SESSION_HANDOFF.md の Ledger テーブル更新 =====

function updateLedger() {
  if (!fs.existsSync(HANDOFF_PATH)) return;

  const content = fs.readFileSync(HANDOFF_PATH, 'utf-8');

  // Ledger テーブルが存在しない場合は追記しない（pre-compact-save.js が管理）
  if (!content.includes('TCPS Ledger')) return;

  const backups = listBackups();
  if (backups.length === 0) return;

  // テーブルを再構築
  const rows = backups.slice(0, 10).map(filename => {
    const info = parseBackupInfo(filename);
    return `| ${info.timestamp} | ${filename} | ${info.savedCount}件 |`;
  });

  const newTable =
    `| 日時 | バックアップファイル | 保存件数 |\n` +
    `|------|-------------------|---------|\n` +
    rows.join('\n');

  // 既存テーブルを置換
  const tablePattern = /\| 日時 \| バックアップファイル \| 保存件数 \|[\s\S]*?(?=\n##|\n---|\n>|$)/;
  const updated = content.replace(tablePattern, newTable);

  if (updated !== content) {
    fs.writeFileSync(HANDOFF_PATH, updated);
  }
}

// ===== メイン =====

async function main() {
  let input = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', d => { input += d; });

  process.stdin.on('end', () => {
    try {
      updateLedger();
      process.stderr.write('[TCPS] session-end-ledger: Ledger 更新完了\n');
    } catch (e) {
      process.stderr.write(`[TCPS] session-end-ledger エラー: ${e.message}\n`);
    }
    process.exit(0);
  });

  process.stdin.on('error', () => process.exit(0));
}

main();
