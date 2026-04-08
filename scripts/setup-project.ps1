# TAISUN Agent - プロジェクトセットアップ (Windows)
#
# 別のプロジェクトフォルダでtaisun_agentの機能を使えるようにする。
# .claude/ と .mcp.json を Junction/コピーで反映する。
#
# 使い方:
#   cd ~\Projects\MyProject
#   ~\taisun_agent\scripts\setup-project.ps1
#
#   または:
#   .\scripts\setup-project.ps1 ~\Projects\MyProject

param(
    [string]$ProjectPath
)

$ErrorActionPreference = "Continue"

# PowerShell 5.1 UTF-8 出力対応
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# ─────────────────────────────────────────
# taisun_agent のルートを検出
# ─────────────────────────────────────────
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$TAISUN_DIR = Split-Path -Parent $SCRIPT_DIR

# プロジェクトディレクトリ
if ($ProjectPath) {
    if (-not (Test-Path $ProjectPath)) {
        New-Item -ItemType Directory -Path $ProjectPath -Force | Out-Null
    }
    $PROJECT_DIR = (Resolve-Path $ProjectPath).Path
} else {
    $PROJECT_DIR = (Get-Location).Path
}

# ─────────────────────────────────────────
# 表示ヘルパー
# ─────────────────────────────────────────
function Write-Ok   { param($msg) Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  !!  $msg" -ForegroundColor Yellow }
function Write-Info { param($msg) Write-Host "  ->  $msg" -ForegroundColor Cyan }

# ─────────────────────────────────────────
# 確認
# ─────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   TAISUN Agent — プロジェクトセットアップ (Windows)           ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  TAISUN:       $TAISUN_DIR"
Write-Host "  プロジェクト: $PROJECT_DIR"
Write-Host ""

# taisun_agent の .claude が存在するか確認
if (-not (Test-Path "$TAISUN_DIR\.claude")) {
    Write-Host "  NG  $TAISUN_DIR\.claude が見つかりません" -ForegroundColor Red
    Write-Host "     先に .\scripts\install.ps1 を実行してください"
    exit 1
}

# ─────────────────────────────────────────
# git init
# ─────────────────────────────────────────
if (-not (Test-Path "$PROJECT_DIR\.git")) {
    git -C $PROJECT_DIR init -q 2>$null
    Write-Ok "Git リポジトリを初期化しました"
} else {
    Write-Ok "Git リポジトリは既に存在します"
}

# ─────────────────────────────────────────
# .claude/ の Junction リンク
# ─────────────────────────────────────────
$CLAUDE_LINK = "$PROJECT_DIR\.claude"

if (Test-Path $CLAUDE_LINK) {
    $item = Get-Item $CLAUDE_LINK
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        Write-Ok ".claude\ は既にリンク済み"
    } else {
        Write-Warn ".claude\ が通常フォルダとして存在します"
        $reply = "y"
        try { $reply = Read-Host "  バックアップしてリンクしますか？ [y/N]" } catch {}
        if ($reply -match '^[Yy]$') {
            $backup = "${CLAUDE_LINK}.backup.$(Get-Date -Format 'yyyyMMddHHmmss')"
            Move-Item $CLAUDE_LINK $backup
            New-Item -ItemType Junction -Path $CLAUDE_LINK -Target "$TAISUN_DIR\.claude" | Out-Null
            Write-Ok ".claude\ をリンクしました（旧フォルダは $backup に退避）"
        } else {
            Write-Info "スキップしました"
        }
    }
} else {
    try {
        New-Item -ItemType Junction -Path $CLAUDE_LINK -Target "$TAISUN_DIR\.claude" | Out-Null
        Write-Ok ".claude\ → $TAISUN_DIR\.claude\ (Junction)"
    } catch {
        Write-Warn "Junction の作成に失敗しました（管理者権限が必要な場合があります）"
        Write-Info "コピー方式で代替します..."
        Copy-Item "$TAISUN_DIR\.claude" -Destination $CLAUDE_LINK -Recurse -Force
        Write-Ok ".claude\ をコピーしました（※ git pull で自動更新されません。再実行で更新してください）"
    }
}

# ─────────────────────────────────────────
# .mcp.json のコピー（Windowsではファイルの symlink は管理者権限が必要なので copy）
# ─────────────────────────────────────────
$MCP_LINK = "$PROJECT_DIR\.mcp.json"

if (Test-Path "$TAISUN_DIR\.mcp.json") {
    if (Test-Path $MCP_LINK) {
        Write-Ok ".mcp.json は既に存在します"
    } else {
        Copy-Item "$TAISUN_DIR\.mcp.json" $MCP_LINK
        Write-Ok ".mcp.json をコピーしました"
        Write-Info "※ Windowsではコピーです。taisun_agent側を更新したら再実行してください"
    }
}

# ─────────────────────────────────────────
# .gitignore に追記
# ─────────────────────────────────────────
$GITIGNORE = "$PROJECT_DIR\.gitignore"
$entries = @(".claude/", ".mcp.json", ".env")
$needsAdd = $false

foreach ($entry in $entries) {
    if (-not (Test-Path $GITIGNORE) -or -not (Select-String -Path $GITIGNORE -Pattern "^$([regex]::Escape($entry))$" -Quiet)) {
        $needsAdd = $true
    }
}

if ($needsAdd) {
    $additions = @("", "# TAISUN Agent")
    foreach ($entry in $entries) {
        if (-not (Test-Path $GITIGNORE) -or -not (Select-String -Path $GITIGNORE -Pattern "^$([regex]::Escape($entry))$" -Quiet)) {
            $additions += $entry
        }
    }
    $additions | Out-File -FilePath $GITIGNORE -Append -Encoding UTF8
    Write-Ok ".gitignore に .claude/ .mcp.json .env を追加しました"
}

# ─────────────────────────────────────────
# グローバルスキル・エージェント・MCP登録
# ─────────────────────────────────────────
Write-Host ""
Write-Host "  グローバルスキル・エージェントを登録しています..."

$TARGET_SKILLS = "$env:USERPROFILE\.claude\skills"
$SOURCE_SKILLS = "$TAISUN_DIR\.claude\skills"
if (-not (Test-Path $TARGET_SKILLS)) { New-Item -ItemType Directory -Path $TARGET_SKILLS -Force | Out-Null }

$SKILL_NEW = 0
if (Test-Path $SOURCE_SKILLS) {
    Get-ChildItem -Path $SOURCE_SKILLS -Directory | ForEach-Object {
        $skillName = $_.Name
        $skillDir = $_.FullName
        if ($skillName -in @("_archived", "_guides", "data")) { return }
        if (-not (Test-Path "$skillDir\SKILL.md") -and -not (Test-Path "$skillDir\CLAUDE.md")) { return }
        $target = "$TARGET_SKILLS\$skillName"
        if ((Test-Path $target) -and (-not ((Get-Item $target).Attributes -band [IO.FileAttributes]::ReparsePoint))) {
            Remove-Item $target -Recurse -Force
        }
        if (-not (Test-Path $target)) {
            try {
                New-Item -ItemType Junction -Path $target -Target $skillDir | Out-Null
            } catch {
                Copy-Item $skillDir -Destination $target -Recurse -Force
            }
            $SKILL_NEW++
        }
    }
}

$TARGET_AGENTS = "$env:USERPROFILE\.claude\agents"
$SOURCE_AGENTS = "$TAISUN_DIR\.claude\agents"
if (-not (Test-Path $TARGET_AGENTS)) { New-Item -ItemType Directory -Path $TARGET_AGENTS -Force | Out-Null }

$AGENT_NEW = 0
if (Test-Path $SOURCE_AGENTS) {
    Get-ChildItem -Path $SOURCE_AGENTS -Filter "*.md" | ForEach-Object {
        if ($_.Name -eq "CLAUDE.md") { return }
        $target = "$TARGET_AGENTS\$($_.Name)"
        Copy-Item $_.FullName -Destination $target -Force
        $AGENT_NEW++
    }
}

# MCP グローバル登録
$SETTINGS_FILE = "$env:USERPROFILE\.claude\settings.json"
$settingsDir = Split-Path $SETTINGS_FILE
if (-not (Test-Path $settingsDir)) { New-Item -ItemType Directory -Path $settingsDir -Force | Out-Null }

if (Test-Path "$TAISUN_DIR\.mcp.json") {
    $mcpScript = @"
const fs = require('fs');
const path = require('path');
const REPO_DIR = '$($TAISUN_DIR -replace '\\', '/')';
const SETTINGS_FILE = '$($SETTINGS_FILE -replace '\\', '/')';
let settings = {};
try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch(e) {}
if (!settings.mcpServers) settings.mcpServers = {};
let mcp = {};
try { mcp = JSON.parse(fs.readFileSync(path.join(REPO_DIR, '.mcp.json'), 'utf8')); } catch(e) {}
for (const [key, val] of Object.entries(mcp.mcpServers || {})) {
  if (key.startsWith('_comment')) continue;
  const server = JSON.parse(JSON.stringify(val));
  if (Array.isArray(server.args)) {
    server.args = server.args.map(arg => {
      if (typeof arg === 'string' && !path.isAbsolute(arg) && (arg.startsWith('dist/') || arg.startsWith('mcp-servers/'))) {
        return path.join(REPO_DIR, arg).replace(/\//g, '\\\\');
      }
      return arg;
    });
  }
  settings.mcpServers[key] = server;
}
fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
const count = Object.keys(settings.mcpServers).filter(k => !k.startsWith('_')).length;
console.log('  OK MCP ' + count + ' servers registered');
"@
    try { node -e $mcpScript 2>$null } catch { Write-Info "MCP登録をスキップしました" }
}

if ($SKILL_NEW -gt 0) { Write-Ok "スキル ${SKILL_NEW}件を新規登録しました" }
if ($AGENT_NEW -gt 0) { Write-Ok "エージェント ${AGENT_NEW}件を登録しました" }

# ─────────────────────────────────────────
# 結果表示
# ─────────────────────────────────────────
$SKILL_COUNT = (Get-ChildItem "$env:USERPROFILE\.claude\skills" -Directory -ErrorAction SilentlyContinue).Count
$AGENT_COUNT = (Get-ChildItem "$env:USERPROFILE\.claude\agents" -Filter "*.md" -ErrorAction SilentlyContinue).Count

Write-Host ""
Write-Host "  ┌──────────────┬─────────────────────────────────────────────┐"
Write-Host "  │     項目     │                   状態                       │"
Write-Host "  ├──────────────┼─────────────────────────────────────────────┤"
Write-Host "  │ .git         │ 初期化済み                                   │"
Write-Host "  ├──────────────┼─────────────────────────────────────────────┤"
Write-Host "  │ .claude\     │ → $TAISUN_DIR\.claude\"
Write-Host "  ├──────────────┼─────────────────────────────────────────────┤"
Write-Host "  │ .mcp.json    │ → $TAISUN_DIR\.mcp.json"
Write-Host "  ├──────────────┼─────────────────────────────────────────────┤"
Write-Host "  │ スキル       │ ${SKILL_COUNT}個"
Write-Host "  ├──────────────┼─────────────────────────────────────────────┤"
Write-Host "  │ エージェント │ ${AGENT_COUNT}個"
Write-Host "  └──────────────┴─────────────────────────────────────────────┘"
Write-Host ""
Write-Host "  このフォルダで Claude Code を開くと TAISUN の全機能が使えます。"
Write-Host ""
