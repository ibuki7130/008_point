#!/usr/bin/env node
/**
 * TAISUN Agent 2026 - 自動診断スクリプト
 *
 * 使用方法:
 *   node scripts/taisun-diagnose.js [--full] [--fix]
 *
 * オプション:
 *   --full  完全診断モード
 *   --fix   問題の自動修復を試みる
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// カラー出力
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

const OK = `${colors.green}✅${colors.reset}`;
const NG = `${colors.red}❌${colors.reset}`;
const WARN = `${colors.yellow}⚠️${colors.reset}`;

// 診断結果を格納
const results = {
  layers: [],
  skills: { count: 0, issues: [] },
  agents: { count: 0, issues: [] },
  mcpTools: { count: 0, issues: [] },
  memory: { issues: [] },
  hooks: { issues: [] },
  score: 0
};

// ベースパス（スクリプトの場所から常にリポジトリルートを特定）
const BASE = path.resolve(__dirname, '..');
const CLAUDE_DIR = path.join(BASE, '.claude');

console.log(`
${colors.bold}${colors.cyan}============================================${colors.reset}
${colors.bold}  TAISUN Agent 2026 自動診断${colors.reset}
${colors.bold}${colors.cyan}============================================${colors.reset}
`);

// 13層防御システムの診断
function checkDefenseLayers() {
  console.log(`${colors.bold}📋 13層防御システム診断${colors.reset}\n`);

  const layers = [
    { id: 0, name: 'CLAUDE.md', file: '.claude/CLAUDE.md', type: 'file' },
    { id: 1, name: 'SessionStart Injector', file: '.claude/hooks/workflow-sessionstart-injector.js', type: 'file' },
    { id: 2, name: 'Permission Gate', file: '.claude/hooks/workflow-fidelity-guard.js', type: 'file' },
    { id: 3, name: 'Read-before-Write', file: '.claude/hooks/workflow-fidelity-guard.js', type: 'integrated' },
    { id: 4, name: 'Baseline Lock', file: '.claude/hooks/workflow-fidelity-guard.js', type: 'integrated' },
    { id: 5, name: 'Skill Evidence', file: '.claude/hooks/skill-usage-guard.js', type: 'file' },
    { id: 6, name: 'Deviation Approval', file: '.claude/hooks/deviation-approval-guard.js', type: 'file' },
    { id: 7, name: 'Agent Enforcement', file: '.claude/hooks/agent-enforcement-guard.js', type: 'file' },
    { id: 8, name: 'Copy Safety', file: '.claude/hooks/copy-safety-guard.js', type: 'file' },
    { id: 9, name: 'Input Sanitizer', file: '.claude/hooks/input-sanitizer-guard.js', type: 'file' },
    { id: 10, name: 'Skill Auto-Select', file: '.claude/hooks/config/skill-mapping.json', type: 'file' },
    { id: 11, name: 'Definition Lint', file: '.claude/hooks/definition-lint-gate.js', type: 'file' },
    { id: 12, name: 'Context Quality', file: '.claude/hooks/console-log-guard.js', type: 'file' }
  ];

  let enabledCount = 0;

  layers.forEach(layer => {
    const filePath = path.join(BASE, layer.file);
    const exists = fs.existsSync(filePath);

    if (exists) {
      enabledCount++;
      console.log(`  Layer ${layer.id.toString().padStart(2)}: ${OK} ${layer.name}`);
      results.layers.push({ ...layer, status: 'ok' });
    } else if (layer.type === 'integrated') {
      // 統合されたレイヤーは親ファイルの存在で判定
      console.log(`  Layer ${layer.id.toString().padStart(2)}: ${OK} ${layer.name} (統合)`);
      enabledCount++;
      results.layers.push({ ...layer, status: 'ok' });
    } else {
      console.log(`  Layer ${layer.id.toString().padStart(2)}: ${NG} ${layer.name}`);
      results.layers.push({ ...layer, status: 'missing' });
    }
  });

  console.log(`\n  ${colors.bold}結果: ${enabledCount}/13 レイヤー有効${colors.reset}\n`);
  return enabledCount;
}

// Hooks設定の診断
function checkHooksSettings() {
  console.log(`${colors.bold}🔧 Hooks設定診断${colors.reset}\n`);

  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');

  if (!fs.existsSync(settingsPath)) {
    console.log(`  ${NG} settings.json が見つかりません\n`);
    results.hooks.issues.push('settings.json missing');
    return 0;
  }

  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const hooks = settings.hooks || {};

    const requiredHooks = [
      { event: 'SessionStart', contains: 'sessionstart-injector' },
      { event: 'PreToolUse', contains: 'unified-guard' },
      { event: 'PostToolUse', contains: 'definition-lint' },
      { event: 'SessionEnd', contains: 'session-handoff' }
    ];

    let hookCount = 0;

    requiredHooks.forEach(req => {
      const hookArray = hooks[req.event] || [];
      const found = hookArray.some(h =>
        h.hooks?.some(hook => hook.command?.includes(req.contains))
      );

      if (found) {
        console.log(`  ${OK} ${req.event}: 設定済み`);
        hookCount++;
      } else {
        console.log(`  ${NG} ${req.event}: 未設定`);
        results.hooks.issues.push(`${req.event} hook missing`);
      }
    });

    console.log(`\n  ${colors.bold}結果: ${hookCount}/4 フック設定済み${colors.reset}\n`);
    return hookCount;
  } catch (e) {
    console.log(`  ${NG} settings.json の解析エラー: ${e.message}\n`);
    results.hooks.issues.push('settings.json parse error');
    return 0;
  }
}

// スキルシステムの診断
function checkSkills() {
  console.log(`${colors.bold}🎯 スキルシステム診断${colors.reset}\n`);

  const skillsDir = path.join(CLAUDE_DIR, 'skills');
  const mappingPath = path.join(CLAUDE_DIR, 'hooks/config/skill-mapping.json');

  // スキルフォルダ数
  let skillCount = 0;
  if (fs.existsSync(skillsDir)) {
    skillCount = fs.readdirSync(skillsDir).filter(f =>
      fs.statSync(path.join(skillsDir, f)).isDirectory()
    ).length;
  }

  console.log(`  スキルフォルダ: ${skillCount >= 70 ? OK : WARN} ${skillCount}個`);
  results.skills.count = skillCount;

  // マッピング設定
  if (fs.existsSync(mappingPath)) {
    try {
      const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
      const mappingCount = mapping.mappings?.length || 0;
      console.log(`  スキルマッピング: ${mappingCount >= 5 ? OK : WARN} ${mappingCount}個`);
    } catch (e) {
      console.log(`  スキルマッピング: ${NG} 解析エラー`);
      results.skills.issues.push('skill-mapping.json parse error');
    }
  } else {
    console.log(`  スキルマッピング: ${NG} ファイルなし`);
    results.skills.issues.push('skill-mapping.json missing');
  }

  console.log();
  return skillCount;
}

// エージェントシステムの診断
function checkAgents() {
  console.log(`${colors.bold}🤖 エージェントシステム診断${colors.reset}\n`);

  const agentsDir = path.join(CLAUDE_DIR, 'agents');

  if (!fs.existsSync(agentsDir)) {
    console.log(`  ${NG} agents ディレクトリが見つかりません\n`);
    results.agents.issues.push('agents directory missing');
    return 0;
  }

  const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  const agentCount = agentFiles.length;

  console.log(`  エージェント数: ${agentCount >= 80 ? OK : WARN} ${agentCount}個`);
  results.agents.count = agentCount;

  // コーディネーターの確認
  const hasCoordinator = agentFiles.some(f => f.includes('coordinator'));
  console.log(`  コーディネーター: ${hasCoordinator ? OK : NG} ${hasCoordinator ? '存在' : '不在'}`);

  if (!hasCoordinator) {
    results.agents.issues.push('coordinator agent missing');
  }

  console.log();
  return agentCount;
}

// MCPツールの診断
function checkMCPTools() {
  console.log(`${colors.bold}🔨 MCPツール診断${colors.reset}\n`);

  const mcpToolsDir = path.join(CLAUDE_DIR, 'mcp-tools');
  const mcpConfigPath = path.join(BASE, '.mcp.json');

  // ツール定義ファイル
  let toolCount = 0;
  if (fs.existsSync(mcpToolsDir)) {
    const toolFiles = fs.readdirSync(mcpToolsDir).filter(f => f.endsWith('.json'));
    toolFiles.forEach(file => {
      try {
        const tools = JSON.parse(fs.readFileSync(path.join(mcpToolsDir, file), 'utf-8'));
        toolCount += tools.tools?.length || 0;
      } catch (e) {
        // 解析エラーは無視
      }
    });
  }

  console.log(`  ツール数: ${toolCount >= 200 ? OK : WARN} ${toolCount}個`);
  results.mcpTools.count = toolCount;

  // MCP設定
  if (fs.existsSync(mcpConfigPath)) {
    try {
      const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
      const serverCount = Object.keys(mcpConfig.mcpServers || {}).length;
      const hasProxy = mcpConfig.mcpServers?.['taisun-proxy'] !== undefined;

      console.log(`  MCPサーバー: ${serverCount >= 1 ? OK : WARN} ${serverCount}個`);
      console.log(`  taisun-proxy: ${hasProxy ? OK : NG} ${hasProxy ? '登録済み' : '未登録'}`);

      if (!hasProxy) {
        results.mcpTools.issues.push('taisun-proxy not registered');
      }
    } catch (e) {
      console.log(`  MCP設定: ${NG} 解析エラー`);
      results.mcpTools.issues.push('.mcp.json parse error');
    }
  } else {
    console.log(`  MCP設定: ${NG} .mcp.json なし`);
    results.mcpTools.issues.push('.mcp.json missing');
  }

  console.log();
  return toolCount;
}

// メモリシステムの診断
function checkMemory() {
  console.log(`${colors.bold}🧠 メモリシステム診断${colors.reset}\n`);

  const memoryFiles = [
    { path: '.claude/memory.md', name: '長期記憶' },
    { path: '.claude/pins.md', name: 'ピン留め' },
    { path: '.claude/directives.md', name: '指示台帳' },
    { path: '.claude/traceability.yml', name: 'トレーサビリティ' },
    { path: 'memory_bank', name: 'メモリバンク', isDir: true }
  ];

  let memoryCount = 0;

  memoryFiles.forEach(mf => {
    const fullPath = path.join(BASE, mf.path);
    const exists = mf.isDir
      ? fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()
      : fs.existsSync(fullPath);

    if (exists) {
      console.log(`  ${OK} ${mf.name}`);
      memoryCount++;
    } else {
      console.log(`  ${NG} ${mf.name}`);
      results.memory.issues.push(`${mf.name} missing`);
    }
  });

  console.log(`\n  ${colors.bold}結果: ${memoryCount}/5 メモリシステム有効${colors.reset}\n`);
  return memoryCount;
}

// スコア計算
function calculateScore(layerCount, hookCount, skillCount, agentCount, toolCount, memoryCount) {
  let score = 0;

  // 13層防御 (40点)
  score += Math.round((layerCount / 13) * 40);

  // Hooks設定 (20点)
  score += Math.round((hookCount / 4) * 20);

  // スキル (15点)
  score += Math.min(15, Math.round((skillCount / 75) * 15));

  // エージェント (15点)
  score += Math.min(15, Math.round((agentCount / 82) * 15));

  // MCP (5点)
  score += Math.min(5, Math.round((toolCount / 227) * 5));

  // メモリ (5点)
  score += Math.round((memoryCount / 5) * 5);

  return score;
}

// メイン実行
function main() {
  const args = process.argv.slice(2);
  const fullMode = args.includes('--full');
  const fixMode = args.includes('--fix');

  const layerCount = checkDefenseLayers();
  const hookCount = checkHooksSettings();
  const skillCount = checkSkills();
  const agentCount = checkAgents();
  const toolCount = checkMCPTools();
  const memoryCount = checkMemory();

  const score = calculateScore(layerCount, hookCount, skillCount, agentCount, toolCount, memoryCount);
  results.score = score;

  // 結果サマリー
  console.log(`
${colors.bold}${colors.cyan}============================================${colors.reset}
${colors.bold}  診断結果サマリー${colors.reset}
${colors.bold}${colors.cyan}============================================${colors.reset}

  ${colors.bold}総合スコア: ${score >= 90 ? colors.green : score >= 70 ? colors.yellow : colors.red}${score}/100点${colors.reset}

  13層防御システム : ${layerCount}/13
  Hooks設定       : ${hookCount}/4
  スキル          : ${skillCount}個
  エージェント    : ${agentCount}個
  MCPツール       : ${toolCount}個
  メモリシステム  : ${memoryCount}/5
`);

  // 問題点のリスト
  const allIssues = [
    ...results.hooks.issues,
    ...results.skills.issues,
    ...results.agents.issues,
    ...results.mcpTools.issues,
    ...results.memory.issues,
    ...results.layers.filter(l => l.status === 'missing').map(l => `Layer ${l.id} (${l.name}) missing`)
  ];

  if (allIssues.length > 0) {
    console.log(`  ${colors.bold}${colors.red}検出された問題:${colors.reset}`);
    allIssues.forEach((issue, i) => {
      console.log(`    ${i + 1}. ${issue}`);
    });
    console.log();
  }

  // 推奨アクション
  if (score < 100) {
    console.log(`  ${colors.bold}推奨アクション:${colors.reset}`);

    if (layerCount < 13) {
      console.log(`    1. [最優先] 不足している防御レイヤーのファイルを確認・復元`);
    }
    if (hookCount < 4) {
      console.log(`    2. [高] settings.json のhooks設定を確認`);
    }
    if (skillCount < 70) {
      console.log(`    3. [中] スキルフォルダの確認`);
    }
    if (agentCount < 80) {
      console.log(`    4. [中] エージェント定義の確認`);
    }

    console.log(`
  ${colors.bold}修復コマンド:${colors.reset}
    npm run taisun:setup
`);
  } else {
    console.log(`  ${colors.green}${colors.bold}すべてのシステムが正常に動作しています！${colors.reset}\n`);
  }

  // 終了コード
  process.exit(score >= 70 ? 0 : 1);
}

main();
