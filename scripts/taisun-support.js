#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const crypto = require('crypto');

const REPO_DIR = path.resolve(__dirname, '..');

function safe(fn) {
  try { return fn(); } catch (_) { return 'N/A'; }
}

const pkg = JSON.parse(fs.readFileSync(path.join(REPO_DIR, 'package.json'), 'utf8'));

const profile = safe(() => {
  const p = JSON.parse(fs.readFileSync(path.join(REPO_DIR, '.claude', 'mcp-profiles.json'), 'utf8'));
  return p.activeProfile;
});

let ollamaStatus = safe(() => {
  const list = execSync('ollama list 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
  const models = list.split('\n').slice(1).filter(Boolean).map(l => l.split(/\s+/)[0]).slice(0, 5);
  return models.length > 0 ? `利用可能（${models.join(', ')}）` : '起動中（モデルなし）';
});
if (ollamaStatus === 'N/A') {
  ollamaStatus = safe(() => { execSync('which ollama', { encoding: 'utf8' }); return '未起動（インストール済み）'; });
  if (ollamaStatus === 'N/A') ollamaStatus = '未インストール';
}

const skillCount = safe(() =>
  fs.readdirSync(path.join(REPO_DIR, '.claude', 'skills'))
    .filter(f => {
      const p = path.join(REPO_DIR, '.claude', 'skills', f);
      return fs.statSync(p).isDirectory() && f !== '_archived' && f !== 'data';
    }).length
);

const hookCount = safe(() =>
  fs.readdirSync(path.join(REPO_DIR, '.claude', 'hooks'))
    .filter(f => f.endsWith('.js')).length
);

const lastError = safe(() => {
  const logPath = path.join(REPO_DIR, '.claude', 'hooks', 'data', 'hook-event.log');
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
  const errors = lines.filter(l => l.includes('error') || l.includes('ERROR'));
  return errors.length > 0 ? errors[errors.length - 1].slice(0, 200) : 'なし';
});

const supportId = 'taisun-' + crypto
  .createHash('md5')
  .update(`${pkg.version}-${os.hostname()}`)
  .digest('hex')
  .slice(0, 6);

const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const outputPath = path.join(REPO_DIR, `taisun-support-${date}.txt`);

const content = `=== TAISUN Support Bundle ===
Date        : ${new Date().toISOString()}
Version     : v${pkg.version}
OS          : ${os.type()} ${os.release()} (${os.arch()})
Node        : ${process.version}
Profile     : ${profile}
Ollama      : ${ollamaStatus}
Skills      : ${skillCount}
Hooks       : ${hookCount}
Last Error  : ${lastError}
Support ID  : ${supportId}
================================
`;

fs.writeFileSync(outputPath, content);
console.log(content);
console.log(`保存先: ${outputPath}`);
console.log('このファイルの内容をサポートに共有してください。');
