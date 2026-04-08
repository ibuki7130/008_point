#!/usr/bin/env node
/**
 * Auto CHANGELOG Hook (Stop hook)
 *
 * セッション終了時に変更されたファイルから
 * CHANGELOG.md エントリを自動生成する。
 *
 * 設定例 (~/.claude/settings.json):
 * { "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "node .claude/hooks/auto-changelog.js" }] }] } }
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.env.HOME
  ? `${process.env.HOME}/taisun_agent`
  : process.cwd();
const CHANGELOG_PATH = path.join(PROJECT_ROOT, 'CHANGELOG.md');

function getGitLog() {
  try {
    // 直近1コミット分のdiff stat
    return execSync(
      'git log -1 --pretty=format:"%H|%s|%ai" --name-only',
      { cwd: PROJECT_ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
  } catch {
    return '';
  }
}

function getStagedFiles() {
  try {
    return execSync(
      'git diff --name-only HEAD',
      { cwd: PROJECT_ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function categorize(files) {
  const categories = { feat: [], fix: [], refactor: [], docs: [], chore: [] };

  for (const f of files) {
    if (f.includes('validation/') || f.includes('verification')) {
      categories.feat.push(f);
    } else if (f.includes('resilience') || f.includes('circuit-breaker')) {
      categories.fix.push(f);
    } else if (f.includes('.claude/decisions') || f.includes('CHANGELOG') || f.includes('README')) {
      categories.docs.push(f);
    } else if (f.includes('.claude/hooks')) {
      categories.chore.push(f);
    } else if (f.includes('src/')) {
      categories.refactor.push(f);
    } else {
      categories.chore.push(f);
    }
  }

  return categories;
}

function formatEntry(categories, date) {
  const lines = [`\n## [Unreleased] - ${date}\n`];

  if (categories.feat.length > 0) {
    lines.push('### Added');
    categories.feat.forEach(f => lines.push(`- ${f}`));
    lines.push('');
  }
  if (categories.fix.length > 0) {
    lines.push('### Fixed');
    categories.fix.forEach(f => lines.push(`- ${f}`));
    lines.push('');
  }
  if (categories.refactor.length > 0) {
    lines.push('### Changed');
    categories.refactor.forEach(f => lines.push(`- ${f}`));
    lines.push('');
  }
  if (categories.docs.length > 0) {
    lines.push('### Docs');
    categories.docs.forEach(f => lines.push(`- ${f}`));
    lines.push('');
  }
  if (categories.chore.length > 0) {
    lines.push('### Chore');
    categories.chore.forEach(f => lines.push(`- ${f}`));
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  const staged = getStagedFiles();
  if (staged.length === 0) {
    process.exit(0);
  }

  const today = new Date().toISOString().slice(0, 10);
  const categories = categorize(staged);
  const entry = formatEntry(categories, today);

  // CHANGELOG.md が存在しない場合は新規作成
  const header = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n';
  let existing = '';
  if (fs.existsSync(CHANGELOG_PATH)) {
    existing = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  } else {
    existing = header;
  }

  // 既に今日のエントリがあれば追記しない
  if (existing.includes(`## [Unreleased] - ${today}`)) {
    process.exit(0);
  }

  // header の直後に新エントリを挿入
  const updated = existing.replace(header, header + entry);
  fs.writeFileSync(CHANGELOG_PATH, updated, 'utf8');

  process.stderr.write(
    `[AutoChangelog] 📋 CHANGELOG.md に ${staged.length} ファイルの変更を記録しました\n`
  );

  process.exit(0);
}

main();
