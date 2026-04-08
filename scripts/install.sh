#!/bin/bash
# TAISUN Agent - インストールスクリプト
#
# 使い方:
#   ./scripts/install.sh                    # 標準インストール（core + video + x-sns）
#   ./scripts/install.sh --profile minimal  # 最小構成（coreのみ、約85スキル）
#   ./scripts/install.sh --profile full     # 全スキル（約118スキル）
#   ./scripts/install.sh --with-docker      # 標準 + Docker スキル追加
#   ./scripts/install.sh --with-figma       # 標準 + Figma スキル追加
#   ./scripts/install.sh --with-voice       # 標準 + 音声AI スキル追加
#   ./scripts/install.sh --list-profiles    # プロファイル一覧を表示

# set -e を使わない（1つの失敗で全体が止まるのを防ぐ）
set +e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ─────────────────────────────────────────
# Mac: Xcode Command Line Tools 確認（gitが動くために必須）
# ─────────────────────────────────────────
if [[ "$OSTYPE" == "darwin"* ]]; then
    # スクリプト自身に実行権限を付与（git clone直後はpermission deniedになる場合がある）
    chmod +x "$0" 2>/dev/null || true
    chmod +x "$REPO_DIR/scripts/"*.sh 2>/dev/null || true

    if ! xcode-select -p &>/dev/null; then
        echo ""
        echo "  ⚠️  Xcode Command Line Tools がインストールされていません"
        echo "     git や Node.js を使うために必要です。"
        echo ""
        echo "  以下のコマンドを実行してインストールしてください:"
        echo "    xcode-select --install"
        echo ""
        echo "  インストール完了後、このスクリプトを再実行してください。"
        exit 1
    fi
fi
VERSION=$(cat "$REPO_DIR/package.json" | grep '"version"' | head -1 | cut -d'"' -f4)

# ─────────────────────────────────────────
# プロファイル引数の解析
# ─────────────────────────────────────────
SKILL_PROFILE="standard"
EXTRA_PROFILES=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --profile)
            SKILL_PROFILE="$2"
            shift 2
            ;;
        --with-docker)
            EXTRA_PROFILES+=("docker")
            shift
            ;;
        --with-figma)
            EXTRA_PROFILES+=("figma")
            shift
            ;;
        --with-voice)
            EXTRA_PROFILES+=("voice")
            shift
            ;;
        --with-deep-research)
            EXTRA_PROFILES+=("deep-research")
            shift
            ;;
        --list-profiles)
            echo ""
            echo "  利用可能なプロファイル:"
            echo ""
            echo "  minimal   — コアスキルのみ（約92個）"
            echo "              リサーチ・SDD・LP・コピーライティング・キーワード等"
            echo ""
            echo "  standard  — 標準構成（約113個）[デフォルト]"
            echo "              core + 動画制作 + X/SNS自動投稿"
            echo ""
            echo "  full      — 全スキル（約120個）"
            echo "              standard + Docker + Figma + 音声AI + ディープリサーチ拡張"
            echo ""
            echo "  追加オプション:"
            echo "    --with-docker          Docker/コンテナ運用"
            echo "    --with-figma           Figmaデザイン連携"
            echo "    --with-voice           音声AI・TTS"
            echo "    --with-deep-research   ディープリサーチ拡張"
            echo ""
            exit 0
            ;;
        *)
            shift
            ;;
    esac
done

# ─────────────────────────────────────────
# 表示ヘルパー
# ─────────────────────────────────────────
ok()   { echo "  ✅ $1"; }
warn() { echo "  ⚠️  $1"; }
info() { echo "  ℹ️  $1"; }
fail() { echo ""; echo "  ❌ エラー: $1"; echo "     → $2"; echo ""; exit 1; }
step() { echo ""; echo "━━━ $1 ━━━"; }

# ─────────────────────────────────────────
# ヘッダー
# ─────────────────────────────────────────
# clear は使わない（Claude Code内でログが消えるのを防ぐ）
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║     TAISUN Agent v${VERSION} インストール          ║"
echo "║     所要時間：約 3〜5 分                            ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  プロファイル: ${SKILL_PROFILE}"
echo ""
echo "  このスクリプトが行うこと："
echo "  1. 必要なソフトウェアの確認"
echo "  2. 必要なファイルのダウンロード・準備"
echo "  3. スキル・エージェントの登録（プロファイルに基づく）"
echo "  4. 設定ファイルの作成"
echo "  5. 動作確認"
echo ""
echo "  ⚠️  途中でフォルダが作られたり、画面に文字が流れますが"
echo "      正常な動作です。最後まで待ってください。"
echo ""
# read -p はClaude Code内で動かないため、対話型ターミナルの場合のみ表示
if [ -t 0 ]; then
    read -p "  インストールを開始しますか？ [Enter でスタート / Ctrl+C でキャンセル]" _
fi

# ─────────────────────────────────────────
# Step 1: 必要なソフトウェアの確認
# ─────────────────────────────────────────
step "ステップ 1/5：必要なソフトウェアを確認しています"

echo ""
echo "  このシステムを動かすために必要なソフトウェアを確認します。"
echo ""

# Node.js
if ! command -v node &> /dev/null; then
    fail \
        "Node.js がインストールされていません" \
        "https://nodejs.org/ を開き「LTS版」をダウンロードしてインストールしてください"
fi
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    warn "Node.js のバージョンが古いです（現在: $(node -v)、推奨: v18以上）"
    warn "https://nodejs.org/ から新しいバージョンをインストールすることをお勧めします"
else
    ok "Node.js $(node -v) … OK"
fi

# npm
if ! command -v npm &> /dev/null; then
    fail \
        "npm がインストールされていません" \
        "Node.js を再インストールすると npm も一緒にインストールされます"
fi
ok "npm $(npm -v) … OK"

# uv（任意）
UV_AVAILABLE=false
if command -v uv &> /dev/null || command -v uvx &> /dev/null; then
    UV_AVAILABLE=true
    ok "uv … OK（追加機能が使えます）"
else
    info "uv が見つかりません。一部の追加機能（Web検索など）は使えませんが、"
    info "メインの機能はすべて使えます。後から追加することもできます。"
fi

# Claude Code
if command -v claude &> /dev/null; then
    ok "Claude Code … OK"
else
    warn "Claude Code がみつかりません"
    warn "https://claude.ai/download からインストールしてください"
fi

# Ollama（SDD / LP 生成スキル用）
if command -v ollama &> /dev/null; then
    ok "Ollama がインストールされています"
    OLLAMA_MODELS=$(ollama list 2>/dev/null | tail -n +2 | awk '{print $1}' | head -5 | tr '\n' ', ' | sed 's/,$//')
    if [ -n "$OLLAMA_MODELS" ]; then
        info "利用可能モデル: ${OLLAMA_MODELS}"
    fi
else
    warn "Ollama が見つかりません（一部のスキルで必要です）"
    info "対象スキル: sdd-full / sdd-design / sdd-req100 / lp-full-generation / lp-local-generator"
    info "インストール: https://ollama.com/download"
fi

echo ""
ok "ソフトウェアの確認が完了しました"

# ─────────────────────────────────────────
# Step 2: ファイルのダウンロード・準備
# ─────────────────────────────────────────
step "ステップ 2/5：必要なファイルを準備しています（少し時間がかかります）"

echo ""
echo "  インターネットからファイルをダウンロードしています。"
echo "  ※ この作業中は画面に英語の文字が流れますが、正常です。"
echo ""

cd "$REPO_DIR"

echo "  📦 ファイルをダウンロード中..."
if npm install --silent 2>/dev/null || npm install 2>&1; then
    ok "ファイルのダウンロードが完了しました"
else
    warn "一部のダウンロードに問題がありましたが、続行します"
fi

echo ""
echo "  🔨 システムを構築中..."

if npm run build 2>/dev/null; then
    ok "メインシステムの構築が完了しました"
else
    warn "一部の構築に問題がありましたが、続行します"
fi

# 追加MCPサーバーのビルド
for mcp_dir in "mcp-servers/voice-ai-mcp-server" "mcp-servers/ai-sdr-mcp-server" "mcp-servers/line-bot-mcp-server"; do
    if [ -f "$REPO_DIR/$mcp_dir/package.json" ]; then
        mcp_name=$(basename "$mcp_dir")
        (cd "$REPO_DIR/$mcp_dir" && npm install --silent && npm run build 2>/dev/null) && \
            ok "${mcp_name} の準備が完了しました" || \
            info "${mcp_name} の準備をスキップしました（APIキー設定後に使えます）"
    fi
done

# ─────────────────────────────────────────
# Step 3: スキル・エージェントの登録
# ─────────────────────────────────────────
step "ステップ 3/5：スキル・エージェントを登録しています"

echo ""
echo "  スキルとは「Claude への命令テンプレート」です。"
echo "  登録すると /リサーチ や /設計 などのコマンドが使えるようになります。"
echo ""

# プロファイルに基づく許可リスト生成
PROFILE_FILE="$REPO_DIR/scripts/skill-profiles.json"
ALLOWED_SKILLS=""

if [ -f "$PROFILE_FILE" ] && command -v node &> /dev/null; then
    ALLOWED_SKILLS=$(node -e "
const fs = require('fs');
const profiles = JSON.parse(fs.readFileSync('$PROFILE_FILE', 'utf8'));
const preset = profiles.presets['$SKILL_PROFILE'] || profiles.presets['standard'];
const extras = '${EXTRA_PROFILES[*]}'.split(' ').filter(Boolean);
const activeGroups = [...new Set([...preset, ...extras])];
const skills = new Set();
for (const group of activeGroups) {
    if (profiles.profiles[group]) {
        profiles.profiles[group].skills.forEach(s => skills.add(s));
    }
}
console.log([...skills].join('\n'));
" 2>/dev/null)
fi

# プロファイル情報を表示
echo "  📋 プロファイル: ${SKILL_PROFILE}"
if [ ${#EXTRA_PROFILES[@]} -gt 0 ]; then
    echo "     追加: ${EXTRA_PROFILES[*]}"
fi
echo ""
echo "  🔗 ~/.claude/skills/ フォルダを作成・更新しています"
echo "     ※ ~/.claude/ は Claude Code の設定フォルダです（システムが自動管理します）"
echo ""

TARGET_SKILLS="$HOME/.claude/skills"
SOURCE_SKILLS="$REPO_DIR/.claude/skills"
mkdir -p "$TARGET_SKILLS"

INSTALLED=0; UPDATED=0; SKIPPED=0; PROFILE_SKIPPED=0

if [ -d "$SOURCE_SKILLS" ]; then
    for skill_dir in "$SOURCE_SKILLS"/*/; do
        skill_name=$(basename "$skill_dir")
        [[ "$skill_name" == "_archived" ]] && continue
        [[ "$skill_name" == "_guides" ]] && continue
        [[ "$skill_name" == "data" ]] && continue
        [[ ! -f "$skill_dir/SKILL.md" ]] && [[ ! -f "$skill_dir/CLAUDE.md" ]] && continue

        # プロファイルフィルタ: 許可リストが空でない場合、リストにないスキルはスキップ
        if [ -n "$ALLOWED_SKILLS" ]; then
            if ! echo "$ALLOWED_SKILLS" | grep -qx "$skill_name"; then
                ((PROFILE_SKIPPED++)) || true
                continue
            fi
        fi

        target="$TARGET_SKILLS/$skill_name"
        if [ -d "$target" ] && [ ! -L "$target" ]; then rm -rf "$target"; fi

        if [ ! -L "$target" ]; then
            ln -sf "$skill_dir" "$target"
            ((INSTALLED++)) || true
        else
            current_target=$(readlink "$target")
            if [ "$current_target" != "$skill_dir" ]; then
                ln -sf "$skill_dir" "$target"
                ((UPDATED++)) || true
            else
                ((SKIPPED++)) || true
            fi
        fi
    done
fi

TOTAL_SKILLS=$(ls -d "$TARGET_SKILLS"/*/ 2>/dev/null | wc -l | tr -d ' ')
ok "スキルを登録しました（新規: ${INSTALLED}件 / 更新: ${UPDATED}件 / 合計: ${TOTAL_SKILLS}件）"
if [ "$PROFILE_SKIPPED" -gt 0 ]; then
    info "プロファイル外スキル: ${PROFILE_SKIPPED}件（--profile full で全て登録可能）"
fi

echo ""
echo "  🤖 ~/.claude/agents/ フォルダを作成・更新しています"
echo "     ※ エージェントとは「特定の仕事を自動で行うAI」です"
echo ""

TARGET_AGENTS="$HOME/.claude/agents"
SOURCE_AGENTS="$REPO_DIR/.claude/agents"
mkdir -p "$TARGET_AGENTS"

AGENT_INSTALLED=0; AGENT_UPDATED=0; AGENT_SKIPPED=0

if [ -d "$SOURCE_AGENTS" ]; then
    for agent_file in "$SOURCE_AGENTS"/*.md; do
        agent_name=$(basename "$agent_file")
        [[ "$agent_name" == "CLAUDE.md" ]] && continue
        target="$TARGET_AGENTS/$agent_name"
        if [ -f "$target" ] && [ ! -L "$target" ]; then rm -f "$target"; fi
        if [ ! -L "$target" ]; then
            ln -sf "$agent_file" "$target"
            ((AGENT_INSTALLED++)) || true
        else
            current_target=$(readlink "$target")
            if [ "$current_target" != "$agent_file" ]; then
                ln -sf "$agent_file" "$target"
                ((AGENT_UPDATED++)) || true
            else
                ((AGENT_SKIPPED++)) || true
            fi
        fi
    done
fi

TOTAL_AGENTS=$(ls "$TARGET_AGENTS"/*.md 2>/dev/null | wc -l | tr -d ' ')
ok "エージェントを登録しました（新規: ${AGENT_INSTALLED}件 / 更新: ${AGENT_UPDATED}件 / 合計: ${TOTAL_AGENTS}件）"

# ─────────────────────────────────────────
# Step 4: 設定ファイルの作成
# ─────────────────────────────────────────
step "ステップ 4/5：設定ファイルを作成しています"

echo ""
echo "  各種ツールの設定ファイルを準備します。"
echo ""

# フック
chmod +x "$REPO_DIR"/.claude/hooks/*.sh 2>/dev/null || true
chmod +x "$REPO_DIR"/.claude/hooks/*.js 2>/dev/null || true
mkdir -p "$REPO_DIR/.claude/temp" "$REPO_DIR/.claude/agent-memory" "$REPO_DIR/.taisun/memory"
ok "フック（自動実行設定）を準備しました"
info "  .claude/temp/        … 一時ファイル置き場"
info "  .claude/agent-memory/ … AIの作業メモ置き場"
info "  .taisun/memory/      … システムのメモリ置き場"

# .mcp.json
echo ""
if [ ! -f "$REPO_DIR/.mcp.json" ]; then
    cp "$REPO_DIR/.mcp.json.example" "$REPO_DIR/.mcp.json" 2>/dev/null || true
    ok ".mcp.json を作成しました（利用するツールの設定ファイル）"
else
    ok ".mcp.json はすでに存在します（既存の設定を保持しました）"
fi

# .env
echo ""
if [ ! -f "$REPO_DIR/.env" ]; then
    cp "$REPO_DIR/.env.example" "$REPO_DIR/.env" 2>/dev/null || touch "$REPO_DIR/.env"
    echo ""
    echo "  ┌─────────────────────────────────────────────────────────────┐"
    echo "  │  ⚠️  APIキーの設定が必要です（重要）                          │"
    echo "  └─────────────────────────────────────────────────────────────┘"
    echo ""
    echo "  .env ファイルが作成されました。"
    echo "  このファイルにあなたのAPIキーを設定する必要があります。"
    echo ""
    echo "  【必須】ANTHROPIC_API_KEY（これがないと動きません）"
    echo "    取得先 → https://console.anthropic.com/"
    echo "    設定例 → ANTHROPIC_API_KEY=sk-ant-api03-xxxxx"
    echo ""
    echo "  【任意】その他のAPIキー（なくても基本機能は使えます）"
    echo "    TAVILY_API_KEY    → Web検索機能（無料枠あり）"
    echo "    OPENAI_API_KEY    → 一部の調査機能"
    echo "    META_ACCESS_TOKEN → Facebook/Instagram広告機能"
    echo ""
    echo "  👉 設定方法："
    echo "     1. taisun_agent フォルダを開く"
    echo "     2. .env ファイルをテキストエディタで開く"
    echo "     3. ANTHROPIC_API_KEY= の右側にAPIキーを貼り付ける"
    echo "     4. 保存して閉じる"
    echo ""
else
    ok ".env はすでに存在します（既存の設定を保持しました）"
    if grep -q "ANTHROPIC_API_KEY=sk-ant-" "$REPO_DIR/.env" 2>/dev/null; then
        ok "ANTHROPIC_API_KEY が設定されています"
    else
        warn "ANTHROPIC_API_KEY がまだ設定されていません"
        warn ".env ファイルを開いて ANTHROPIC_API_KEY を設定してください"
        warn "取得先 → https://console.anthropic.com/"
    fi
fi

# MCP グローバル登録
echo ""
echo "  🔗 ツール（MCP）をClaude Codeに登録しています..."
echo "     ※ ~/.claude/settings.json に設定が書き込まれます"

SETTINGS_FILE="$HOME/.claude/settings.json"
mkdir -p "$(dirname "$SETTINGS_FILE")"

node -e "
const fs = require('fs');
const path = require('path');
const REPO_DIR = '$REPO_DIR';
const SETTINGS_FILE = '$SETTINGS_FILE';

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
        return path.join(REPO_DIR, arg);
      }
      return arg;
    });
  }
  settings.mcpServers[key] = server;
}

fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
const count = Object.keys(settings.mcpServers).filter(k=>!k.startsWith('_')).length;
console.log('  ✅ ツールを ' + count + ' 個登録しました');
" 2>/dev/null || warn "ツールの登録に問題がありました（後から手動で設定できます）"

# CodeGraph MCP パスをプロジェクト設定に自動書き換え
PROJ_SETTINGS="$REPO_DIR/.claude/settings.json"
CODEGRAPH_BIN="$REPO_DIR/tools/codebase-memory-mcp/codebase-memory-mcp"
if [ -f "$PROJ_SETTINGS" ] && [ -f "$CODEGRAPH_BIN" ]; then
    node -e "
const fs = require('fs');
const s = JSON.parse(fs.readFileSync('$PROJ_SETTINGS', 'utf8'));
if (s.mcpServers && s.mcpServers['codebase-memory']) {
  s.mcpServers['codebase-memory'].command = '$CODEGRAPH_BIN';
  fs.writeFileSync('$PROJ_SETTINGS', JSON.stringify(s, null, 2));
  console.log('  ✅ CodeGraph MCP パスを自動設定しました');
}
" 2>/dev/null
fi

# ─────────────────────────────────────────
# Step 5: 動作確認
# ─────────────────────────────────────────
step "ステップ 5/5：動作を確認しています"

echo ""

[ -f "$REPO_DIR/.claude/CLAUDE.md" ] && ok "設定ファイル (.claude/CLAUDE.md) … OK"

HOOK_OK=0
for hook in workflow-sessionstart-injector.js skill-usage-guard.js session-handoff-generator.js; do
    [ -f "$REPO_DIR/.claude/hooks/$hook" ] && ((HOOK_OK++)) || true
done
ok "フック: ${HOOK_OK} 個が正常に設定されています"

SKILL_COUNT=$(ls -d "$TARGET_SKILLS"/*/ 2>/dev/null | wc -l | tr -d ' ')
EXPECTED_SKILLS=$(ls -d "$SOURCE_SKILLS"/*/ 2>/dev/null | grep -v '_archived' | grep -v 'data' | wc -l | tr -d ' ')
if [ "$SKILL_COUNT" -ge "$EXPECTED_SKILLS" ] 2>/dev/null; then
    ok "スキル: ${SKILL_COUNT} 個が利用可能です ✅（期待値: ${EXPECTED_SKILLS}個）"
elif [ "$SKILL_COUNT" -ge 50 ] 2>/dev/null; then
    warn "スキル: ${SKILL_COUNT} 個（期待値: ${EXPECTED_SKILLS}個 — 一部欠落の可能性）"
    info "全スキルを入れるには: ./scripts/install.sh --profile full"
else
    warn "スキル: ${SKILL_COUNT} 個（期待値: ${EXPECTED_SKILLS}個 — 大幅に不足しています）"
    warn "install.sh を再実行してください: ./scripts/install.sh"
fi

AGENT_COUNT=$(ls "$TARGET_AGENTS"/*.md 2>/dev/null | wc -l | tr -d ' ')
ok "エージェント: ${AGENT_COUNT} 個が利用可能です"

# ─────────────────────────────────────────
# 完了メッセージ
# ─────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   🎉  インストールが完了しました！  v${VERSION}                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  ┌──────────────────────────────────────────────────────────┐"
echo "  │  次にやること（3ステップ）                                │"
echo "  ├──────────────────────────────────────────────────────────┤"
echo "  │                                                          │"
echo "  │  1️⃣  .env ファイルに ANTHROPIC_API_KEY を設定する         │"
echo "  │     → taisun_agent フォルダの中にある .env を開く         │"
echo "  │     → ANTHROPIC_API_KEY=sk-ant-... と入力して保存        │"
echo "  │                                                          │"
echo "  │  2️⃣  Claude Code を開く（再起動が必要です）                │"
echo "  │     → Claude Code を一度閉じて、再度開いてください        │"
echo "  │                                                          │"
echo "  │  3️⃣  試しに使ってみる                                     │"
echo "  │     → チャット欄に「こんにちは」と入力してみる            │"
echo "  │     → /help と入力すると使い方が見られます                │"
echo "  │                                                          │"
echo "  └──────────────────────────────────────────────────────────┘"
echo ""
echo "  💡 よく使うコマンド："
echo "     /research      → 調査・リサーチ"
echo "     /mega-research → 複数ソースからの詳細調査"
echo "     /sdd-full      → 設計書の自動生成"
echo "     /help-expert   → 詳しい使い方を見る"
echo ""
echo "  🔄 アップデート方法："
echo "     git pull origin main && npm run setup"
echo ""
echo "  📋 スキル構成の変更："
echo "     ./scripts/install.sh --list-profiles    # プロファイル一覧"
echo "     ./scripts/install.sh --profile minimal  # 最小構成に変更"
echo "     ./scripts/install.sh --profile full     # 全スキルに変更"
echo ""
echo "  ❓ 困ったときは："
echo "     npm run taisun:diagnose  → 問題の診断"
echo "     チャットで「使い方を教えて」と話しかける"
echo ""
