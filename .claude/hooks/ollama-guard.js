#!/usr/bin/env node
'use strict';

/**
 * ollama-guard.js — PreToolUse フック（advisory）
 *
 * Ollama 必須スキルが呼ばれたときに、Ollama の起動状態を確認する。
 * ブロックはしない（advisory）。stderr に警告を出す。
 */

const { execSync } = require('child_process');

const OLLAMA_REQUIRED_SKILLS = [
  'sdd-full', 'sdd-design', 'sdd-req100',
  'lp-full-generation', 'lp-local-generator',
];

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(input);
    const toolName = (event.tool_name || '').toLowerCase();
    const toolInputStr = JSON.stringify(event.tool_input || {}).toLowerCase();

    const isOllamaSkill = OLLAMA_REQUIRED_SKILLS.some(s =>
      toolName.includes(s) || toolInputStr.includes(s)
    );

    if (!isOllamaSkill) {
      process.exit(0);
    }

    try {
      execSync('curl -s --max-time 3 http://localhost:11434/api/tags', { timeout: 5000 });
      process.exit(0);
    } catch (_) {
      try {
        execSync('which ollama 2>/dev/null', { timeout: 3000 });
        process.stderr.write(
          '⚠️  Ollama がインストールされていますが起動していません。\n' +
          '   実行: ollama serve\n' +
          '   その後: ollama pull deepseek-r1:70b\n'
        );
      } catch (_) {
        process.stderr.write(
          '⚠️  Ollama が見つかりません。このスキルには Ollama が必要です。\n' +
          '   インストール: https://ollama.com/download\n' +
          '   インストール後: ollama pull deepseek-r1:70b\n'
        );
      }
      process.exit(0);
    }
  } catch (_) {
    process.exit(0);
  }
});
