# TAISUN Agent - Windows ワンライナーインストーラー
#
# 使い方（PowerShellに1行貼るだけ）:
#   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force; irm https://raw.githubusercontent.com/taiyousan15/taisun_agent/main/scripts/quick-install.ps1 | iex
#
# 動作:
#   1. C:\taisun_agent に git clone（既存なら git pull）
#   2. install.ps1 を自動実行
#   3. 完了後、Claude Code で開くだけ

# UTF-8 出力対応
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"

# TLS 1.2 強制（古い Windows 10 対応）
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

# ─────────────────────────────────────────
# 定数
# ─────────────────────────────────────────
$INSTALL_DIR = "C:\taisun_agent"
$REPO_URL = "https://github.com/taiyousan15/taisun_agent.git"

# ─────────────────────────────────────────
# 表示ヘルパー
# ─────────────────────────────────────────
function Write-Ok   { param($msg) Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  !!  $msg" -ForegroundColor Yellow }
function Write-Info { param($msg) Write-Host "  ->  $msg" -ForegroundColor Cyan }
function Write-Fail { param($msg) Write-Host "  NG  $msg" -ForegroundColor Red }

# ─────────────────────────────────────────
# ヘッダー
# ─────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  TAISUN Agent - Windows Quick Installer" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  インストール先: $INSTALL_DIR"
Write-Host ""

# ─────────────────────────────────────────
# 前提チェック
# ─────────────────────────────────────────
Write-Host "  前提条件を確認しています..."
Write-Host ""

# Node.js チェック
$nodeOk = $false
try {
    $nodeVer = (node -v 2>$null)
    if ($nodeVer) {
        $major = [int]($nodeVer.TrimStart('v').Split('.')[0])
        if ($major -ge 18) {
            Write-Ok "Node.js $nodeVer"
            $nodeOk = $true
        } else {
            Write-Fail "Node.js $nodeVer (v18以上が必要です)"
        }
    }
} catch {}

if (-not $nodeOk) {
    Write-Fail "Node.js v18 以上が必要です"
    Write-Host ""
    Write-Host "  https://nodejs.org/ から LTS版をダウンロードしてください" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# git チェック
$gitOk = $false
try {
    $gitVer = (git --version 2>$null)
    if ($gitVer) {
        Write-Ok "$gitVer"
        $gitOk = $true
    }
} catch {}

if (-not $gitOk) {
    Write-Fail "git がインストールされていません"
    Write-Host ""
    Write-Host "  https://gitforwindows.org/ からダウンロードしてください" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Claude Code チェック（警告のみ）
try {
    $claudeVer = (claude --version 2>$null)
    if ($claudeVer) {
        Write-Ok "Claude Code がインストールされています"
    } else { throw }
} catch {
    Write-Warn "Claude Code が見つかりません（後でインストールしてください）"
    Write-Info "https://claude.ai/download"
}

# ─────────────────────────────────────────
# Windows LongPath 有効化チェック
# ─────────────────────────────────────────
try {
    $longPath = Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -ErrorAction SilentlyContinue
    if (-not $longPath -or $longPath.LongPathsEnabled -ne 1) {
        Write-Warn "Windows LongPath が無効です（npm install で問題が起きる場合があります）"
        Write-Info "管理者PowerShellで以下を実行すると有効化できます:"
        Write-Host "       Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name 'LongPathsEnabled' -Value 1" -ForegroundColor Gray
    } else {
        Write-Ok "Windows LongPath が有効です"
    }
} catch {
    Write-Info "LongPath設定の確認をスキップしました"
}

# ─────────────────────────────────────────
# OneDrive 警告
# ─────────────────────────────────────────
$currentDir = (Get-Location).Path
if ($currentDir -match "OneDrive") {
    Write-Warn "現在のフォルダが OneDrive 内です"
    Write-Info "TAISUN は $INSTALL_DIR にインストールされるので問題ありません"
}

Write-Host ""

# ─────────────────────────────────────────
# git clone / pull
# ─────────────────────────────────────────
if (Test-Path "$INSTALL_DIR\.git") {
    # 既存インストール → アップデート
    Write-Info "既存のインストールを検出しました。最新版に更新します..."
    Push-Location $INSTALL_DIR
    try {
        git fetch origin 2>&1 | Out-Null
        $pullResult = git pull origin main --ff-only 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Info "通常の更新ができませんでした。最新版に強制同期します..."
            git reset --hard origin/main 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "git sync failed" }
        }
        Write-Ok "最新版に更新しました"
    } catch {
        Write-Warn "git 更新に失敗しました。再インストールします..."
        Pop-Location
        Remove-Item $INSTALL_DIR -Recurse -Force -ErrorAction SilentlyContinue
        git clone $REPO_URL $INSTALL_DIR 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "git clone に失敗しました"
            exit 1
        }
        Write-Ok "再インストール完了"
    } finally {
        if ((Get-Location).Path -eq $INSTALL_DIR) { Pop-Location }
    }
} else {
    # 新規インストール
    Write-Info "TAISUN Agent をダウンロードしています..."

    if (Test-Path $INSTALL_DIR) {
        Write-Info "既存フォルダを削除しています..."
        Remove-Item $INSTALL_DIR -Recurse -Force -ErrorAction SilentlyContinue
    }

    git clone $REPO_URL $INSTALL_DIR 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "git clone に失敗しました"
        Write-Host ""
        Write-Host "  考えられる原因:" -ForegroundColor Yellow
        Write-Host "  - インターネット接続を確認してください"
        Write-Host "  - git がPATHに含まれているか確認してください"
        Write-Host ""
        exit 1
    }
    Write-Ok "ダウンロード完了"
}

Write-Host ""

# ─────────────────────────────────────────
# install.ps1 を実行
# ─────────────────────────────────────────
Write-Info "セットアップを開始します..."
Write-Host ""

$installScript = "$INSTALL_DIR\scripts\install.ps1"
if (Test-Path $installScript) {
    & $installScript -Profile standard
} else {
    Write-Fail "install.ps1 が見つかりません: $installScript"
    exit 1
}

# ─────────────────────────────────────────
# 完了メッセージ
# ─────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  インストール完了！" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  次のステップ:" -ForegroundColor White
Write-Host ""
Write-Host "  1. PowerShell で以下を実行:" -ForegroundColor White
Write-Host "     cd C:\taisun_agent" -ForegroundColor Cyan
Write-Host "     claude" -ForegroundColor Cyan
Write-Host ""
Write-Host "  2. Claude Code が開いたら「使い方を教えて」と話しかける"
Write-Host ""
Write-Host "  アップデートするには:"
Write-Host "     cd C:\taisun_agent" -ForegroundColor Gray
Write-Host "     .\scripts\install.ps1 -Update" -ForegroundColor Gray
Write-Host ""
