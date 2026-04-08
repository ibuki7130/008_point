#!/bin/bash
# TAISUN Agent - プロジェクトセットアップ
#
# 別のプロジェクトフォルダでtaisun_agentの機能を使えるようにする。
# .claude/ と .mcp.json をシンボリックリンクで反映する。
#
# 使い方:
#   cd /path/to/your/project
#   ~/taisun_agent/scripts/setup-project.sh
#
#   または:
#   bash ~/taisun_agent/scripts/setup-project.sh /path/to/your/project

set +e

# ─────────────────────────────────────────
# taisun_agent のルートを検出
# ─────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAISUN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# プロジェクトディレクトリ（引数があればそれを使う、なければカレント）
if [ -n "$1" ]; then
    PROJECT_DIR="$1"
    mkdir -p "$PROJECT_DIR"
else
    PROJECT_DIR="$(pwd)"
fi

PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

# ─────────────────────────────────────────
# 表示ヘルパー
# ─────────────────────────────────────────
ok()   { echo "  ✅ $1"; }
warn() { echo "  ⚠️  $1"; }
info() { echo "  ℹ️  $1"; }

# ─────────────────────────────────────────
# 確認
# ─────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   TAISUN Agent — プロジェクトセットアップ                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  TAISUN:    $TAISUN_DIR"
echo "  プロジェクト: $PROJECT_DIR"
echo ""

# taisun_agent の .claude が存在するか確認
if [ ! -d "$TAISUN_DIR/.claude" ]; then
    echo "  ❌ $TAISUN_DIR/.claude が見つかりません"
    echo "     先に ~/taisun_agent/scripts/install.sh を実行してください"
    exit 1
fi

# ─────────────────────────────────────────
# git init（まだ初期化されていなければ）
# ─────────────────────────────────────────
if [ ! -d "$PROJECT_DIR/.git" ]; then
    git -C "$PROJECT_DIR" init -q
    ok "Git リポジトリを初期化しました"
else
    ok "Git リポジトリは既に存在します"
fi

# ─────────────────────────────────────────
# .claude/ のシンボリックリンク
# ─────────────────────────────────────────
CLAUDE_LINK="$PROJECT_DIR/.claude"

if [ -L "$CLAUDE_LINK" ]; then
    CURRENT=$(readlink "$CLAUDE_LINK")
    if [ "$CURRENT" = "$TAISUN_DIR/.claude" ]; then
        ok ".claude/ は既にリンク済み"
    else
        ln -sf "$TAISUN_DIR/.claude" "$CLAUDE_LINK"
        ok ".claude/ のリンク先を更新しました"
    fi
elif [ -d "$CLAUDE_LINK" ]; then
    warn ".claude/ が通常フォルダとして存在します"
    warn "既存の .claude/ をバックアップしてリンクします"
    REPLY="y"
    if [ -t 0 ]; then
        read -p "  バックアップしてリンクしますか？ [y/N] " -r REPLY
    fi
    if [[ "$REPLY" =~ ^[Yy]$ ]]; then
        mv "$CLAUDE_LINK" "${CLAUDE_LINK}.backup.$(date +%Y%m%d%H%M%S)"
        ln -sf "$TAISUN_DIR/.claude" "$CLAUDE_LINK"
        ok ".claude/ をリンクしました（旧フォルダはバックアップ済み）"
    else
        info "スキップしました"
    fi
else
    ln -sf "$TAISUN_DIR/.claude" "$CLAUDE_LINK"
    ok ".claude/ → $TAISUN_DIR/.claude"
fi

# ─────────────────────────────────────────
# .mcp.json のシンボリックリンク
# ─────────────────────────────────────────
MCP_LINK="$PROJECT_DIR/.mcp.json"

if [ -f "$TAISUN_DIR/.mcp.json" ]; then
    if [ -L "$MCP_LINK" ]; then
        ok ".mcp.json は既にリンク済み"
    elif [ -f "$MCP_LINK" ]; then
        warn ".mcp.json が既に存在します（上書きしません）"
        info "手動で削除してから再実行するか、以下を実行:"
        info "  ln -sf $TAISUN_DIR/.mcp.json $MCP_LINK"
    else
        ln -sf "$TAISUN_DIR/.mcp.json" "$MCP_LINK"
        ok ".mcp.json → $TAISUN_DIR/.mcp.json"
    fi
fi

# ─────────────────────────────────────────
# .gitignore に追記（リンク先を追跡しないように）
# ─────────────────────────────────────────
GITIGNORE="$PROJECT_DIR/.gitignore"
NEEDS_ADD=false

for entry in ".claude/" ".mcp.json" ".env"; do
    if [ ! -f "$GITIGNORE" ] || ! grep -qxF "$entry" "$GITIGNORE"; then
        NEEDS_ADD=true
    fi
done

if [ "$NEEDS_ADD" = true ]; then
    {
        echo ""
        echo "# TAISUN Agent（シンボリックリンク・設定ファイル）"
        [ ! -f "$GITIGNORE" ] || ! grep -qxF ".claude/" "$GITIGNORE" && echo ".claude/"
        [ ! -f "$GITIGNORE" ] || ! grep -qxF ".mcp.json" "$GITIGNORE" && echo ".mcp.json"
        [ ! -f "$GITIGNORE" ] || ! grep -qxF ".env" "$GITIGNORE" && echo ".env"
    } >> "$GITIGNORE"
    ok ".gitignore に .claude/ .mcp.json .env を追加しました"
fi

# ─────────────────────────────────────────
# グローバルスキル・エージェント・MCP登録（install.sh相当）
# ─────────────────────────────────────────
echo ""
echo "  🔗 グローバルスキル・エージェントを登録しています..."

TARGET_SKILLS="$HOME/.claude/skills"
SOURCE_SKILLS="$TAISUN_DIR/.claude/skills"
mkdir -p "$TARGET_SKILLS"

SKILL_INSTALLED=0
if [ -d "$SOURCE_SKILLS" ]; then
    for skill_dir in "$SOURCE_SKILLS"/*/; do
        skill_name=$(basename "$skill_dir")
        [[ "$skill_name" == "_archived" || "$skill_name" == "_guides" || "$skill_name" == "data" ]] && continue
        [[ ! -f "$skill_dir/SKILL.md" ]] && [[ ! -f "$skill_dir/CLAUDE.md" ]] && continue
        target="$TARGET_SKILLS/$skill_name"
        if [ -d "$target" ] && [ ! -L "$target" ]; then rm -rf "$target"; fi
        if [ ! -L "$target" ]; then
            ln -sf "$skill_dir" "$target"
            ((SKILL_INSTALLED++)) || true
        fi
    done
fi

TARGET_AGENTS="$HOME/.claude/agents"
SOURCE_AGENTS="$TAISUN_DIR/.claude/agents"
mkdir -p "$TARGET_AGENTS"

AGENT_INSTALLED=0
if [ -d "$SOURCE_AGENTS" ]; then
    for agent_file in "$SOURCE_AGENTS"/*.md; do
        agent_name=$(basename "$agent_file")
        [[ "$agent_name" == "CLAUDE.md" ]] && continue
        target="$TARGET_AGENTS/$agent_name"
        if [ ! -L "$target" ]; then
            ln -sf "$agent_file" "$target"
            ((AGENT_INSTALLED++)) || true
        fi
    done
fi

# MCP グローバル登録
SETTINGS_FILE="$HOME/.claude/settings.json"
mkdir -p "$(dirname "$SETTINGS_FILE")"
if command -v node &> /dev/null && [ -f "$TAISUN_DIR/.mcp.json" ]; then
    node -e "
const fs = require('fs');
const path = require('path');
const REPO_DIR = '$TAISUN_DIR';
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
      if (typeof arg === 'string' && !path.isAbsolute(arg) && (arg.startsWith('dist/') || arg.startsWith('mcp-servers/'))) {
        return path.join(REPO_DIR, arg);
      }
      return arg;
    });
  }
  settings.mcpServers[key] = server;
}
fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
const count = Object.keys(settings.mcpServers).filter(k=>!k.startsWith('_')).length;
console.log('  OK MCP ' + count + ' 件登録');
" 2>/dev/null || info "MCP登録をスキップしました"
fi

if [ "$SKILL_INSTALLED" -gt 0 ]; then
    ok "スキル ${SKILL_INSTALLED}件を新規登録しました"
fi
if [ "$AGENT_INSTALLED" -gt 0 ]; then
    ok "エージェント ${AGENT_INSTALLED}件を新規登録しました"
fi

# ─────────────────────────────────────────
# 結果表示
# ─────────────────────────────────────────
SKILL_COUNT=$(ls -d "$HOME/.claude/skills"/*/ 2>/dev/null | wc -l | tr -d ' ')
AGENT_COUNT=$(ls "$HOME/.claude/agents"/*.md 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo "  ┌──────────────┬─────────────────────────────────────────────┐"
echo "  │     項目     │                   状態                       │"
echo "  ├──────────────┼─────────────────────────────────────────────┤"
echo "  │ .git         │ 初期化済み                                   │"
echo "  ├──────────────┼─────────────────────────────────────────────┤"
printf "  │ .claude/     │ → %-40s│\n" "$TAISUN_DIR/.claude/"
echo "  ├──────────────┼─────────────────────────────────────────────┤"
printf "  │ .mcp.json    │ → %-40s│\n" "$TAISUN_DIR/.mcp.json"
echo "  ├──────────────┼─────────────────────────────────────────────┤"
printf "  │ スキル       │ %-43s│\n" "${SKILL_COUNT}個"
echo "  ├──────────────┼─────────────────────────────────────────────┤"
printf "  │ エージェント │ %-43s│\n" "${AGENT_COUNT}個"
echo "  └──────────────┴─────────────────────────────────────────────┘"
echo ""
echo "  このフォルダで Claude Code を開くと TAISUN の全機能が使えます。"
echo ""
