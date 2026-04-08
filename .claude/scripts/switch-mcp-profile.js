#!/usr/bin/env node
/**
 * switch-mcp-profile.js
 *
 * MCPプロファイルを切り替えるCLIスクリプト。
 * mcp-profiles.json で定義された development/secure/marketing モードに従い、
 * ~/.claude/settings.json の各MCPサーバーの disabled フラグを更新する。
 *
 * 使い方:
 *   node .claude/scripts/switch-mcp-profile.js [development|secure|marketing]
 *   node .claude/scripts/switch-mcp-profile.js --status
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─────────────────────────────────────────────────────────────────────────────
// パス定義
// ─────────────────────────────────────────────────────────────────────────────

const PROFILES_FILE = path.join(__dirname, '..', 'mcp-profiles.json');
const SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');

// ─────────────────────────────────────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`Error reading ${filePath}: ${err.message}`);
    process.exit(1);
  }
}

function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  } catch (err) {
    console.error(`Error writing ${filePath}: ${err.message}`);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ステータス表示
// ─────────────────────────────────────────────────────────────────────────────

function showStatus() {
  const profiles = readJson(PROFILES_FILE);
  const settings = readJson(SETTINGS_FILE);

  const active = profiles.activeProfile;
  const profile = profiles.profiles[active];

  console.log('\n=== MCP Profile Status ===');
  console.log(`Active profile : ${active}`);
  console.log(`Description    : ${profile.description}`);
  console.log(`Note           : ${profile.note}`);

  console.log('\n--- Enabled servers ---');
  (profile.enabledServers || []).forEach((s) => {
    const mcpEntry = settings.mcpServers && settings.mcpServers[s];
    const actual = mcpEntry ? (mcpEntry.disabled ? '⛔ disabled' : '✅ enabled') : '❓ not found';
    console.log(`  ${s}: ${actual}`);
  });

  console.log('\n--- Disabled servers ---');
  (profile.disabledServers || []).forEach((s) => {
    const mcpEntry = settings.mcpServers && settings.mcpServers[s];
    const actual = mcpEntry ? (mcpEntry.disabled ? '⛔ disabled' : '✅ enabled') : '❓ not found';
    console.log(`  ${s}: ${actual}`);
  });

  console.log('\nAvailable profiles: ' + Object.keys(profiles.profiles).join(', '));
  console.log('');
}

// ─────────────────────────────────────────────────────────────────────────────
// プロファイル切替
// ─────────────────────────────────────────────────────────────────────────────

function switchProfile(targetProfile) {
  const profiles = readJson(PROFILES_FILE);

  if (!profiles.profiles[targetProfile]) {
    console.error(`Unknown profile: "${targetProfile}"`);
    console.error(`Available profiles: ${Object.keys(profiles.profiles).join(', ')}`);
    process.exit(1);
  }

  const profile = profiles.profiles[targetProfile];
  const settings = readJson(SETTINGS_FILE);

  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }

  // ─── 整合性チェック: enabledServers が .mcp.json に存在するか ───
  const mcpJsonPath = path.join(__dirname, '..', '..', '.mcp.json');
  let mcpServers = {};
  try {
    const mcpData = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
    mcpServers = mcpData.mcpServers || {};
  } catch (_) {}

  const missingServers = [];
  (profile.enabledServers || []).forEach((serverName) => {
    if (!mcpServers[serverName] && !settings.mcpServers[serverName]) {
      missingServers.push(serverName);
    }
  });

  if (missingServers.length > 0) {
    console.log(`\n⚠️  以下のサーバーは .mcp.json に登録されていません（スキップ）:`);
    missingServers.forEach((s) => console.log(`   - ${s}`));
  }

  let changedCount = 0;

  // enabledServers → disabled: false
  (profile.enabledServers || []).forEach((serverName) => {
    if (settings.mcpServers[serverName]) {
      if (settings.mcpServers[serverName].disabled !== false) {
        settings.mcpServers[serverName].disabled = false;
        changedCount++;
      }
    }
    // settings に存在しないサーバーはスキップ（警告のみ）
  });

  // disabledServers → disabled: true
  (profile.disabledServers || []).forEach((serverName) => {
    if (settings.mcpServers[serverName]) {
      if (settings.mcpServers[serverName].disabled !== true) {
        settings.mcpServers[serverName].disabled = true;
        changedCount++;
      }
    }
  });

  // activeProfile を更新
  profiles.activeProfile = targetProfile;

  // 書き込み
  writeJson(SETTINGS_FILE, settings);
  writeJson(PROFILES_FILE, profiles);

  console.log(`\n✅ Switched to profile: ${targetProfile}`);
  console.log(`   ${profile.description}`);
  console.log(`   ${changedCount} server(s) updated`);
  console.log('\n⚠️  Claude Code を再起動して変更を反映してください\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// エントリポイント
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log('Usage:');
  console.log('  node .claude/scripts/switch-mcp-profile.js [development|secure|marketing]');
  console.log('  node .claude/scripts/switch-mcp-profile.js --status');
  process.exit(0);
}

if (args[0] === '--status') {
  showStatus();
} else {
  switchProfile(args[0]);
}
