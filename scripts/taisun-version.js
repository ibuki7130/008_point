#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const crypto = require('crypto');

const REPO_DIR = path.resolve(__dirname, '..');

// バージョン取得
const pkg = JSON.parse(fs.readFileSync(path.join(REPO_DIR, 'package.json'), 'utf8'));
const version = pkg.version;

// 最終更新日（package.json の mtime）
const pkgStat = fs.statSync(path.join(REPO_DIR, 'package.json'));
const updated = pkgStat.mtime.toISOString().slice(0, 10);

// アクティブプロファイル
let profile = 'unknown';
try {
  const profiles = JSON.parse(
    fs.readFileSync(path.join(REPO_DIR, '.claude', 'mcp-profiles.json'), 'utf8')
  );
  profile = profiles.activeProfile || 'unknown';
} catch (_) {}

// OS
const osName = `${os.type()} ${os.release()}`;

// Node
const nodeVersion = process.version;

// Ollama
let ollamaStatus = '未インストール';
try {
  const ollamaList = execSync('ollama list 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
  const models = ollamaList
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[0])
    .slice(0, 5);
  ollamaStatus = models.length > 0 ? `利用可能（${models.join(', ')}）` : '起動中（モデルなし）';
} catch (_) {
  try {
    execSync('which ollama 2>/dev/null', { encoding: 'utf8' });
    ollamaStatus = '未起動（インストール済み）';
  } catch (_) {
    ollamaStatus = '未インストール';
  }
}

// スキル・エージェント数
let skillCount = 0;
let agentCount = 0;
try {
  const skillsDir = path.join(REPO_DIR, '.claude', 'skills');
  skillCount = fs.readdirSync(skillsDir).filter((f) => {
    const p = path.join(skillsDir, f);
    return fs.statSync(p).isDirectory() && f !== '_archived' && f !== 'data';
  }).length;
} catch (_) {}
try {
  const agentsDir = path.join(REPO_DIR, '.claude', 'agents');
  agentCount = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md') && f !== 'CLAUDE.md').length;
} catch (_) {}

// Support ID
const supportId = 'taisun-' + crypto
  .createHash('md5')
  .update(`${version}-${os.hostname()}`)
  .digest('hex')
  .slice(0, 6);

// 出力
console.log('');
console.log('  TAISUN Agent');
console.log('  ─────────────────────────────');
console.log(`  Version    : v${version}`);
console.log(`  Updated    : ${updated}`);
console.log(`  Profile    : ${profile}`);
console.log(`  OS         : ${osName}`);
console.log(`  Node       : ${nodeVersion}`);
console.log(`  Ollama     : ${ollamaStatus}`);
console.log(`  Skills     : ${skillCount}`);
console.log(`  Agents     : ${agentCount}`);
console.log(`  Support ID : ${supportId}`);
console.log('');
