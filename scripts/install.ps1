# TAISUN Agent - Windowsインストールスクリプト (PowerShell)
#
# 使い方 (PowerShell):
#   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
#   .\scripts\install.ps1                    # 標準インストール
#   .\scripts\install.ps1 -Profile minimal   # 最小構成（coreのみ）
#   .\scripts\install.ps1 -Profile full      # 全スキル
#   .\scripts\install.ps1 -ListProfiles      # プロファイル一覧
#
# 必要なもの:
#   - Windows 10/11
#   - Node.js v18+ (https://nodejs.org/)
#   - Claude Code (https://claude.ai/download)
#   - PowerShell 5.1 以上

param(
    [string]$Profile = "standard",
    [switch]$WithDocker,
    [switch]$WithFigma,
    [switch]$WithVoice,
    [switch]$WithDeepResearch,
    [switch]$ListProfiles,
    [switch]$Update
)

# PowerShell 5.1 UTF-8 出力対応
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# ErrorActionPreference を Continue に変更（1つの失敗で全体停止を防止）
$ErrorActionPreference = "Continue"

# TLS 1.2 強制（古い Windows 10 対応）
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$REPO_DIR = Split-Path -Parent $PSScriptRoot
$VERSION = (Get-Content "$REPO_DIR\package.json" | ConvertFrom-Json).version

if ($ListProfiles) {
    Write-Host ""
    Write-Host "  利用可能なプロファイル:"
    Write-Host ""
    Write-Host "  minimal   — コアスキルのみ（約92個）"
    Write-Host "              リサーチ・SDD・LP・コピーライティング・キーワード等"
    Write-Host ""
    Write-Host "  standard  — 標準構成（約113個）[デフォルト]"
    Write-Host "              core + 動画制作 + X/SNS自動投稿"
    Write-Host ""
    Write-Host "  full      — 全スキル（約120個）"
    Write-Host "              standard + Docker + Figma + 音声AI + ディープリサーチ拡張"
    Write-Host ""
    Write-Host "  追加オプション:"
    Write-Host "    -WithDocker          Docker/コンテナ運用"
    Write-Host "    -WithFigma           Figmaデザイン連携"
    Write-Host "    -WithVoice           音声AI・TTS"
    Write-Host "    -WithDeepResearch    ディープリサーチ拡張"
    Write-Host ""
    exit 0
}

# ─────────────────────────────────────────
# 表示ヘルパー関数
# ─────────────────────────────────────────
function Write-Ok   { param($msg) Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  !!  $msg" -ForegroundColor Yellow }
function Write-Info { param($msg) Write-Host "  ->  $msg" -ForegroundColor Cyan }
function Write-Fail { param($msg) Write-Host "  NG  $msg" -ForegroundColor Red }
function Write-Step { param($msg) Write-Host ""; Write-Host "━━━ $msg ━━━" -ForegroundColor White }

# ─────────────────────────────────────────
# アップデートモード（-Update フラグ時）
# ─────────────────────────────────────────
if ($Update) {
    Write-Host ""
    Write-Host "  TAISUN Agent アップデート (Windows)" -ForegroundColor Cyan
    Write-Host ""

    # git pull を試行、失敗したら強制同期、それもダメならZIPフォールバック
    Write-Host "  最新版を取得しています..."
    try {
        git fetch origin 2>&1 | Out-Null
        $gitResult = git pull origin main --ff-only 2>&1
        if ($LASTEXITCODE -ne 0) { throw "git pull failed" }
        Write-Ok "git pull 成功"
    } catch {
        Write-Info "通常の更新ができませんでした。最新版に強制同期します..."
        try {
            git reset --hard origin/main 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "reset failed" }
            Write-Ok "最新版に同期しました"
        } catch {
        Write-Warn "git同期に失敗しました。ZIPダウンロードで更新します..."

        $zipUrl = "https://github.com/taiyousan15/taisun_agent/archive/refs/heads/main.zip"
        $zipPath = "$env:TEMP\taisun_agent_update.zip"
        $extractPath = "$env:TEMP\taisun_agent_extract"

        try {
            Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
            if (Test-Path $extractPath) { Remove-Item $extractPath -Recurse -Force }
            Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force

            $sourceDir = Get-ChildItem $extractPath -Directory | Select-Object -First 1
            Get-ChildItem $sourceDir.FullName -Force | ForEach-Object {
                $dest = Join-Path $REPO_DIR $_.Name
                if ($_.PSIsContainer) {
                    if ($_.Name -eq "node_modules" -or $_.Name -eq ".git") { return }
                    Copy-Item $_.FullName -Destination $dest -Recurse -Force
                } else {
                    Copy-Item $_.FullName -Destination $dest -Force
                }
            }
            Write-Ok "ZIPダウンロードで更新しました"
            Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
            Remove-Item $extractPath -Recurse -Force -ErrorAction SilentlyContinue
        } catch {
            Write-Fail "更新に失敗しました: $_"
            Write-Info "手動でZIPをダウンロードしてください: $zipUrl"
            exit 1
        }
    }}
    Write-Host ""
    Write-Host "  引き続きインストールを実行します..." -ForegroundColor Cyan
    Write-Host ""
}

# ─────────────────────────────────────────
# ヘッダー
# ─────────────────────────────────────────
# Clear-Host は使わない（Claude Code内でログが消えるのを防ぐ）
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     TAISUN Agent インストール (Windows)            ║" -ForegroundColor Cyan
Write-Host "║     バージョン：v$VERSION                              ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  このスクリプトが行うこと："
Write-Host "  1. 必要なソフトウェアの確認"
Write-Host "  2. ファイルのダウンロード・インストール"
Write-Host "  3. スキル・エージェントのセットアップ"
Write-Host "  4. API キーの設定"
Write-Host "  5. 動作確認"
Write-Host ""
Write-Host "  ⚠  途中で文字が流れますが正常な動作です。"
Write-Host "     最後まで待ってください。"
Write-Host ""
Write-Host "  3秒後に自動で開始します..."
Start-Sleep -Seconds 3
Write-Host ""

# ─────────────────────────────────────────
# ステップ 1: 必要なソフトウェアの確認
# ─────────────────────────────────────────
Write-Step "ステップ 1/5：必要なソフトウェアを確認しています"
Write-Host ""

# Node.js
try {
    $nodeVersion = (node -v 2>$null).TrimStart('v').Split('.')[0]
    if ([int]$nodeVersion -lt 18) {
        Write-Warn "Node.js のバージョンが古いです（現在: $(node -v)、推奨: v18以上）"
        Write-Info "https://nodejs.org/ から最新版をダウンロードしてください"
    } else {
        Write-Ok "Node.js $(node -v) がインストールされています"
    }
} catch {
    Write-Fail "Node.js がインストールされていません"
    Write-Host ""
    Write-Host "  ┌──────────────────────────────────────────────────────────┐"
    Write-Host "  │  Node.js のインストール方法                               │"
    Write-Host "  ├──────────────────────────────────────────────────────────┤"
    Write-Host "  │  1. https://nodejs.org/ を開く                            │"
    Write-Host "  │  2. 「LTS（推奨版）」をクリックしてダウンロード           │"
    Write-Host "  │  3. ダウンロードした .msi ファイルを実行                  │"
    Write-Host "  │  4. インストール完了後、このスクリプトを再実行            │"
    Write-Host "  └──────────────────────────────────────────────────────────┘"
    Write-Host ""
    exit 1
}

# npm
try {
    $npmV = npm -v 2>$null
    Write-Ok "npm $npmV がインストールされています"
} catch {
    Write-Fail "npm がインストールされていません（Node.js と一緒にインストールされるはずです）"
    exit 1
}

# uv（省略可能）
$UV_AVAILABLE = $false
if (Get-Command uv -ErrorAction SilentlyContinue) {
    $UV_AVAILABLE = $true
    Write-Ok "uv がインストールされています"
} else {
    Write-Warn "uv が見つかりません（Python系の一部機能が使えません）"
    Write-Info "後でインストールする場合: winget install astral-sh.uv"
}

# Claude Code
if (Get-Command claude -ErrorAction SilentlyContinue) {
    Write-Ok "Claude Code がインストールされています"
} else {
    Write-Warn "Claude Code が見つかりません"
    Write-Info "https://claude.ai/download からインストールしてください"
}

# Python3（intelligence-research スキル用）
if (Get-Command python3 -ErrorAction SilentlyContinue) {
    Write-Ok "Python3 がインストールされています"
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    Write-Ok "Python がインストールされています"
} else {
    Write-Warn "Python が見つかりません（intelligence-research スキルが使えない場合があります）"
    Write-Info "https://www.python.org/ からインストールできます"
}

# Ollama（SDD / LP 生成スキル用）
if (Get-Command ollama -ErrorAction SilentlyContinue) {
    Write-Ok "Ollama がインストールされています"
    try {
        $ollamaModels = (ollama list 2>$null | Select-Object -Skip 1 | Select-Object -First 5 | ForEach-Object { ($_ -split '\s+')[0] }) -join ', '
        if ($ollamaModels) { Write-Info "利用可能モデル: $ollamaModels" }
    } catch {}
} else {
    Write-Warn "Ollama が見つかりません（一部のスキルで必要です）"
    Write-Info "対象スキル: sdd-full / sdd-design / sdd-req100 / lp-full-generation / lp-local-generator"
    Write-Info "インストール: https://ollama.com/download"
}

# ─────────────────────────────────────────
# ステップ 2: ファイルのインストール
# ─────────────────────────────────────────
Write-Step "ステップ 2/5：ファイルをインストールしています（少し時間がかかります）"

Write-Host ""
Write-Host "  📦 必要なファイルをダウンロードしています..."
Set-Location $REPO_DIR
$npmLog = "$REPO_DIR\npm-install.log"
try {
    $npmOutput = npm install 2>&1
    $npmOutput | Out-File $npmLog -Encoding UTF8
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    Write-Ok "ファイルのインストールが完了しました"
} catch {
    Write-Warn "npm install で問題が発生しました"
    Write-Info "詳細ログ: $npmLog"
    if (Test-Path $npmLog) {
        Get-Content $npmLog -Tail 5 | ForEach-Object { Write-Host "       $_" -ForegroundColor Gray }
    }
    Write-Info "続行します..."
}

Write-Host ""
Write-Host "  🔨 システムを構築しています..."
try {
    npm run build 2>$null
    Write-Ok "システムの構築が完了しました"
} catch {
    Write-Warn "一部の構築に問題がありましたが、続行します"
}

foreach ($server in @("voice-ai-mcp-server", "ai-sdr-mcp-server", "line-bot-mcp-server")) {
    $serverPath = "$REPO_DIR\mcp-servers\$server\package.json"
    if (Test-Path $serverPath) {
        try {
            Push-Location "$REPO_DIR\mcp-servers\$server"
            npm install --silent 2>$null
            npm run build 2>$null
            Write-Ok "$server を構築しました"
        } catch {
            Write-Info "$server の構築をスキップしました"
        } finally {
            Pop-Location
        }
    }
}

# ─────────────────────────────────────────
# ステップ 3: スキル・エージェントのセットアップ
# ─────────────────────────────────────────
Write-Step "ステップ 3/5：スキル・エージェントをセットアップしています"

Write-Host ""

# --- スキルのインストール ---
$TARGET_SKILLS = "$env:USERPROFILE\.claude\skills"
$SOURCE_SKILLS = "$REPO_DIR\.claude\skills"

# プロファイルに基づく許可リスト生成
$PROFILE_FILE = "$REPO_DIR\scripts\skill-profiles.json"
$ALLOWED_SKILLS = @()

if (Test-Path $PROFILE_FILE) {
    try {
        $profileData = Get-Content $PROFILE_FILE -Raw | ConvertFrom-Json
        $presetGroups = $profileData.presets.$Profile
        if (-not $presetGroups) { $presetGroups = $profileData.presets.standard }

        $extraProfiles = @()
        if ($WithDocker) { $extraProfiles += "docker" }
        if ($WithFigma) { $extraProfiles += "figma" }
        if ($WithVoice) { $extraProfiles += "voice" }
        if ($WithDeepResearch) { $extraProfiles += "deep-research" }

        $activeGroups = @($presetGroups) + $extraProfiles | Select-Object -Unique
        foreach ($group in $activeGroups) {
            $groupObj = $profileData.profiles | Select-Object -ExpandProperty $group -ErrorAction SilentlyContinue
            if ($groupObj) {
                $ALLOWED_SKILLS += $groupObj.skills
            }
        }
        $ALLOWED_SKILLS = $ALLOWED_SKILLS | Select-Object -Unique
    } catch {
        Write-Warn "プロファイル読み込みエラー: 全スキルをインストールします"
    }
}

Write-Host "  スキルを設定しています..."
Write-Host "  📋 プロファイル: $Profile"
Write-Info "スキルの保存先: $TARGET_SKILLS"
Write-Host "       （Claude Code が使うスキルが入るフォルダです）"
Write-Host ""

if (-not (Test-Path $TARGET_SKILLS)) {
    New-Item -ItemType Directory -Path $TARGET_SKILLS -Force | Out-Null
    Write-Ok "$TARGET_SKILLS フォルダを作成しました"
}

$INSTALLED = 0
$UPDATED = 0
$SKIPPED = 0
$PROFILE_SKIPPED = 0

if (Test-Path $SOURCE_SKILLS) {
    Get-ChildItem -Path $SOURCE_SKILLS -Directory | ForEach-Object {
        $skillName = $_.Name
        $skillDir = $_.FullName

        # 内部ディレクトリをスキップ
        if ($skillName -in @("_archived", "_guides", "data")) { return }

        # SKILL.md または CLAUDE.md があるものだけ
        if (-not (Test-Path "$skillDir\SKILL.md") -and -not (Test-Path "$skillDir\CLAUDE.md")) { return }

        # プロファイルフィルタ
        if ($ALLOWED_SKILLS.Count -gt 0 -and $skillName -notin $ALLOWED_SKILLS) {
            $PROFILE_SKIPPED++
            return
        }

        $target = "$TARGET_SKILLS\$skillName"

        # 古い通常ディレクトリを削除（Junctionではないもの）
        if ((Test-Path $target) -and (-not ((Get-Item $target).Attributes -band [IO.FileAttributes]::ReparsePoint))) {
            Remove-Item $target -Recurse -Force
        }

        if (-not (Test-Path $target)) {
            # Junction リンクを作成（失敗時はコピーにフォールバック）
            try {
                New-Item -ItemType Junction -Path $target -Target $skillDir | Out-Null
            } catch {
                Copy-Item $skillDir -Destination $target -Recurse -Force
            }
            $INSTALLED++
        } else {
            $SKIPPED++
        }
    }

    $total = @(Get-ChildItem $TARGET_SKILLS -Directory -ErrorAction SilentlyContinue).Count
    Write-Ok "スキルを設定しました（新規: ${INSTALLED}件 / スキップ: ${SKIPPED}件 / 合計: ${total}件）"
    if ($PROFILE_SKIPPED -gt 0) {
        Write-Info "プロファイル外スキル: ${PROFILE_SKIPPED}件（-Profile full で全て登録可能）"
    }
} else {
    Write-Warn "スキルのソースフォルダが見つかりません: $SOURCE_SKILLS"
}

Write-Host ""

# --- エージェントのインストール ---
$TARGET_AGENTS = "$env:USERPROFILE\.claude\agents"
$SOURCE_AGENTS = "$REPO_DIR\.claude\agents"

Write-Host "  エージェントを設定しています..."
Write-Info "エージェントの保存先: $TARGET_AGENTS"
Write-Host "       （Claude Code が使うエージェントが入るフォルダです）"
Write-Host ""

if (-not (Test-Path $TARGET_AGENTS)) {
    New-Item -ItemType Directory -Path $TARGET_AGENTS -Force | Out-Null
    Write-Ok "$TARGET_AGENTS フォルダを作成しました"
}

$AGENT_INSTALLED = 0

if (Test-Path $SOURCE_AGENTS) {
    Get-ChildItem -Path $SOURCE_AGENTS -Filter "*.md" | ForEach-Object {
        if ($_.Name -eq "CLAUDE.md") { return }

        $target = "$TARGET_AGENTS\$($_.Name)"
        Copy-Item $_.FullName -Destination $target -Force
        $AGENT_INSTALLED++
    }
    $total = @(Get-ChildItem $TARGET_AGENTS -Filter "*.md" -ErrorAction SilentlyContinue).Count
    Write-Ok "エージェントを設定しました（更新: ${AGENT_INSTALLED}件 / 合計: ${total}件）"
    Write-Info "Windows版はエージェントをコピーしています。git pull 後に再実行して更新してください。"
}

# --- 作業用ディレクトリの作成 ---
Write-Host ""
Write-Host "  作業用フォルダを作成しています..."

$dirs = @(
    @{ Path = "$REPO_DIR\.claude\temp";         Desc = "一時ファイル用" },
    @{ Path = "$REPO_DIR\.claude\agent-memory"; Desc = "エージェントの記憶保存用" },
    @{ Path = "$REPO_DIR\.taisun\memory";       Desc = "システムの記憶保存用" }
)
foreach ($dir in $dirs) {
    if (-not (Test-Path $dir.Path)) {
        New-Item -ItemType Directory -Path $dir.Path -Force | Out-Null
        Write-Ok "$($dir.Path) を作成しました（$($dir.Desc)）"
    }
}

# ─────────────────────────────────────────
# ステップ 4: API キーの設定
# ─────────────────────────────────────────
Write-Step "ステップ 4/5：API キーを設定しています"

Write-Host ""
Write-Host "  📝 設定ファイル (.mcp.json) を準備しています..."

if (-not (Test-Path "$REPO_DIR\.mcp.json")) {
    if (Test-Path "$REPO_DIR\.mcp.json.example") {
        Copy-Item "$REPO_DIR\.mcp.json.example" "$REPO_DIR\.mcp.json"
        Write-Ok ".mcp.json をテンプレートから作成しました"
    }
} else {
    Write-Ok ".mcp.json は既に存在します"
}

Write-Host ""
Write-Host "  🔑 環境変数ファイル (.env) を準備しています..."

if (-not (Test-Path "$REPO_DIR\.env")) {
    if (Test-Path "$REPO_DIR\.env.example") {
        Copy-Item "$REPO_DIR\.env.example" "$REPO_DIR\.env"
    } else {
        New-Item -ItemType File -Path "$REPO_DIR\.env" | Out-Null
    }

    Write-Host ""
    Write-Host "  ┌──────────────────────────────────────────────────────────────┐"
    Write-Host "  │  ⚠  ANTHROPIC_API_KEY の設定が必要です                      │"
    Write-Host "  ├──────────────────────────────────────────────────────────────┤"
    Write-Host "  │  1. https://console.anthropic.com/ を開く                    │"
    Write-Host "  │  2. 「API Keys」→「Create Key」でキーを発行                  │"
    Write-Host "  │  3. 以下のファイルをメモ帳で開いて編集:                      │"
    Write-Host "  │     $REPO_DIR\.env"
    Write-Host "  │  4. ANTHROPIC_API_KEY=sk-ant-... の行を追記                  │"
    Write-Host "  └──────────────────────────────────────────────────────────────┘"
    Write-Host ""
    Write-Host "  オプション（設定するとより多くの機能が使えます）："
    Write-Host "  ┌──────────────────────────────────────────────────────────────┐"
    Write-Host "  │  FRED_API_KEY    → 経済指標の取得 (fred.stlouisfed.org 無料) │"
    Write-Host "  │  NEWSAPI_KEY     → ニュース収集 (newsapi.org 無料枠あり)     │"
    Write-Host "  │  APIFY_TOKEN     → X/Twitter のデータ収集 (apify.com)        │"
    Write-Host "  └──────────────────────────────────────────────────────────────┘"
} else {
    Write-Ok ".env は既に存在します"
    $envContent = Get-Content "$REPO_DIR\.env" -Raw
    if ($envContent -match "ANTHROPIC_API_KEY=sk-ant-") {
        Write-Ok "ANTHROPIC_API_KEY が設定されています"
    } else {
        Write-Warn "ANTHROPIC_API_KEY がまだ設定されていません"
        Write-Info ".env ファイルに ANTHROPIC_API_KEY=sk-ant-... を追記してください"
    }
}

# MCPをグローバル登録
Write-Host ""
Write-Host "  🔌 MCPサーバーをグローバル登録しています..."
Write-Info "登録先: $env:USERPROFILE\.claude\settings.json"
Write-Host "       （Claude Code が自動的に読み込む設定ファイルです）"

$SETTINGS_FILE = "$env:USERPROFILE\.claude\settings.json"
$settingsDir = Split-Path $SETTINGS_FILE
if (-not (Test-Path $settingsDir)) {
    New-Item -ItemType Directory -Path $settingsDir -Force | Out-Null
    Write-Ok "$settingsDir フォルダを作成しました"
}

$nodeScript = @"
const fs = require('fs');
const path = require('path');
const REPO_DIR = '$($REPO_DIR -replace '\\', '/')';
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
      if (typeof arg === 'string' && !path.isAbsolute(arg) &&
          (arg.startsWith('dist/') || arg.startsWith('mcp-servers/'))) {
        return path.join(REPO_DIR, arg).replace(/\//g, '\\\\');
      }
      return arg;
    });
  }
  settings.mcpServers[key] = server;
}

fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
const count = Object.keys(settings.mcpServers).filter(k => !k.startsWith('_')).length;
console.log('  [OK] MCPサーバーを登録しました（' + count + ' 件）');
"@

try {
    node -e $nodeScript
} catch {
    Write-Warn "MCPのグローバル登録に失敗しました（後で手動設定もできます）"
}

# CodeGraph MCP パスをプロジェクト設定に自動書き換え
$PROJ_SETTINGS = "$REPO_DIR\.claude\settings.json"
$CODEGRAPH_BIN = "$REPO_DIR\tools\codebase-memory-mcp\codebase-memory-mcp"
if ((Test-Path $PROJ_SETTINGS) -and (Test-Path $CODEGRAPH_BIN)) {
    try {
        $projSettings = Get-Content $PROJ_SETTINGS -Raw | ConvertFrom-Json
        if ($projSettings.mcpServers -and $projSettings.mcpServers.'codebase-memory') {
            $projSettings.mcpServers.'codebase-memory'.command = $CODEGRAPH_BIN
            $projSettings | ConvertTo-Json -Depth 10 | Set-Content $PROJ_SETTINGS -Encoding UTF8
            Write-Ok "CodeGraph MCP パスを自動設定しました"
        }
    } catch {
        Write-Warn "CodeGraph MCP パス設定をスキップしました"
    }
}

# ─────────────────────────────────────────
# ステップ 5: 動作確認
# ─────────────────────────────────────────
Write-Step "ステップ 5/5：動作を確認しています"

Write-Host ""

if (Test-Path "$REPO_DIR\.claude\CLAUDE.md") {
    Write-Ok "設定ファイルが正しく配置されています"
}

$SKILL_COUNT = @(Get-ChildItem $TARGET_SKILLS -Directory -ErrorAction SilentlyContinue).Count
$EXPECTED_SKILLS = @(Get-ChildItem $SOURCE_SKILLS -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notin @("_archived", "_guides", "data") } | Where-Object { (Test-Path "$($_.FullName)\SKILL.md") -or (Test-Path "$($_.FullName)\CLAUDE.md") }).Count
if ($SKILL_COUNT -ge $EXPECTED_SKILLS) {
    Write-Ok "スキル: $SKILL_COUNT 個が利用可能です（期待値: ${EXPECTED_SKILLS}個）"
} elseif ($SKILL_COUNT -ge 50) {
    Write-Warn "スキル: $SKILL_COUNT 個（期待値: ${EXPECTED_SKILLS}個 — 一部欠落の可能性）"
    Write-Info "全スキルを入れるには: .\scripts\install.ps1 -Profile full"
} else {
    Write-Warn "スキル: $SKILL_COUNT 個（期待値: ${EXPECTED_SKILLS}個 — 大幅に不足しています）"
    Write-Warn "install.ps1 を再実行してください: .\scripts\install.ps1"
}

$AGENT_COUNT = (Get-ChildItem $TARGET_AGENTS -Filter "*.md" -ErrorAction SilentlyContinue).Count
Write-Ok "エージェント: $AGENT_COUNT 個が利用可能です"

# ─────────────────────────────────────────
# 完了メッセージ
# ─────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   インストールが完了しました！  v$VERSION (Windows)               ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  ┌──────────────────────────────────────────────────────────┐"
Write-Host "  │  次にやること（3ステップ）                               │"
Write-Host "  ├──────────────────────────────────────────────────────────┤"
Write-Host "  │                                                          │"
Write-Host "  │  ① .env を開いて ANTHROPIC_API_KEY を設定               │"
Write-Host "  │     （まだ設定していない場合のみ）                       │"
Write-Host "  │                                                          │"
Write-Host "  │  ② Claude Code をこのフォルダで開く                     │"
Write-Host "  │     PowerShell で: claude                                │"
Write-Host "  │                                                          │"
Write-Host "  │  ③ 「使い方を教えて」と話しかける                       │"
Write-Host "  │     日本語で何でも聞けます                               │"
Write-Host "  │                                                          │"
Write-Host "  └──────────────────────────────────────────────────────────┘"
Write-Host ""
Write-Host "  アップデートするには（1行で完了）："
Write-Host "    .\scripts\install.ps1 -Update"
Write-Host ""
Write-Host "  📋 スキル構成の変更："
Write-Host "    .\scripts\install.ps1 -ListProfiles      # プロファイル一覧"
Write-Host "    .\scripts\install.ps1 -Profile minimal    # 最小構成に変更"
Write-Host "    .\scripts\install.ps1 -Profile full       # 全スキルに変更"
Write-Host ""
Write-Host "  ❓ 困ったときは："
Write-Host "     npm run taisun:diagnose  → 問題の診断"
Write-Host "     チャットで「使い方を教えて」と話しかける"
Write-Host ""
Write-Host "  ※ スキルは Junction リンク（git pull で自動更新）"
Write-Host "     エージェントはコピー（git pull 後に install.ps1 を再実行）"
Write-Host ""
