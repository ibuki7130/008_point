#!/bin/bash
# TAISUN Agent - LiteLLM セットアップ（OpenRouter/Groq経由格安モデル利用）
#
# 使い方（Claude Codeのチャットに貼り付けて実行）:
#
#   OPENROUTER_API_KEY="sk-or-xxxx" GROQ_API_KEY="gsk_xxxx" bash ~/taisun_agent/scripts/setup-litellm.sh
#
# GroqキーなしでOpenRouterだけの場合:
#
#   OPENROUTER_API_KEY="sk-or-xxxx" bash ~/taisun_agent/scripts/setup-litellm.sh

set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LITELLM_CONFIG="$REPO_DIR/config/litellm-config.yaml"
SHELL_RC="$HOME/.zshrc"
[ -f "$HOME/.bashrc" ] && [ ! -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.bashrc"
ENV_FILE="$REPO_DIR/.env"

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  TAISUN LiteLLM セットアップ${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# ─────────────────────────────────────────
# Step 1: litellm インストール
# ─────────────────────────────────────────
echo "1. litellm をインストールします..."

if command -v litellm &>/dev/null; then
    echo -e "  ${GREEN}[OK]${NC} litellm はすでにインストール済みです"
else
    pip3 install 'litellm[proxy]' --quiet && \
        echo -e "  ${GREEN}[OK]${NC} litellm インストール完了" || \
        { echo -e "  ${RED}[ERROR]${NC} インストール失敗。pip3 が使えるか確認してください"; exit 1; }
fi

echo ""

# ─────────────────────────────────────────
# Step 2: APIキーを .env に保存
# ─────────────────────────────────────────
echo "2. APIキーを .env に保存します..."

if [ -n "${OPENROUTER_API_KEY:-}" ]; then
    if grep -q "^OPENROUTER_API_KEY=" "$ENV_FILE" 2>/dev/null; then
        sed -i.bak "s|^OPENROUTER_API_KEY=.*|OPENROUTER_API_KEY=$OPENROUTER_API_KEY|" "$ENV_FILE"
    else
        echo "OPENROUTER_API_KEY=$OPENROUTER_API_KEY" >> "$ENV_FILE"
    fi
    rm -f "$ENV_FILE.bak"
    echo -e "  ${GREEN}[OK]${NC} OPENROUTER_API_KEY を保存しました"
else
    echo -e "  ${YELLOW}[SKIP]${NC} OPENROUTER_API_KEY が未指定です（後で .env に追記してください）"
fi

if [ -n "${GROQ_API_KEY:-}" ]; then
    if grep -q "^GROQ_API_KEY=" "$ENV_FILE" 2>/dev/null; then
        sed -i.bak "s|^GROQ_API_KEY=.*|GROQ_API_KEY=$GROQ_API_KEY|" "$ENV_FILE"
    else
        echo "GROQ_API_KEY=$GROQ_API_KEY" >> "$ENV_FILE"
    fi
    rm -f "$ENV_FILE.bak"
    echo -e "  ${GREEN}[OK]${NC} GROQ_API_KEY を保存しました"
else
    echo -e "  ${YELLOW}[SKIP]${NC} GROQ_API_KEY が未指定です（Groqなしでも動作します）"
fi

echo ""

# ─────────────────────────────────────────
# Step 3: ~/.zshrc にコマンドを追加
# ─────────────────────────────────────────
echo "3. シェルコマンドを追加します（$SHELL_RC）..."

MARKER="# === TAISUN LiteLLM ==="

if grep -q "$MARKER" "$SHELL_RC" 2>/dev/null; then
    echo -e "  ${GREEN}[OK]${NC} すでに設定済みです（スキップ）"
else
    cat >> "$SHELL_RC" << SHELLEOF

$MARKER
# Python パス（litellm コマンドを使えるように）
export PATH="\$HOME/Library/Python/3.9/bin:\$HOME/Library/Python/3.11/bin:\$HOME/.local/bin:\$PATH"

# taisun_agent の .env を自動読み込み
[ -f "$REPO_DIR/.env" ] && export \$(grep -v '^#' "$REPO_DIR/.env" | xargs)

# claude-lite: OpenRouter経由でClaude Codeを起動（claude より安い）
function claude-lite() {
  if ! curl -s http://localhost:4000/health > /dev/null 2>&1; then
    echo "🚀 OpenRouterプロキシを起動中..."
    nohup litellm --config "$LITELLM_CONFIG" --port 4000 > /tmp/litellm.log 2>&1 &
    sleep 4
    if ! curl -s http://localhost:4000/health > /dev/null 2>&1; then
      echo "❌ 起動に失敗しました。ログを確認: cat /tmp/litellm.log"
      return 1
    fi
    echo "✅ 起動完了"
  fi
  ANTHROPIC_BASE_URL="http://localhost:4000" ANTHROPIC_API_KEY="dummy" claude "\$@"
}

alias litellm-stop='pkill -f "litellm --config" 2>/dev/null && echo "✅ 停止しました" || echo "⚠ すでに停止しています"'
alias litellm-health='curl -s http://localhost:4000/health | python3 -m json.tool 2>/dev/null || echo "⚠ LiteLLM は起動していません"'
alias litellm-log='tail -f /tmp/litellm.log'
# === END TAISUN LiteLLM ===
SHELLEOF

    echo -e "  ${GREEN}[OK]${NC} $SHELL_RC に追加しました"
fi

echo ""

# ─────────────────────────────────────────
# 完了メッセージ
# ─────────────────────────────────────────
echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}  ✅ セットアップ完了！${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo "  次のコマンドを実行して設定を反映："
echo ""
echo -e "  ${CYAN}source $SHELL_RC${NC}"
echo ""
echo "  以後の使い方："
echo ""
echo "    claude-lite      ← 安いモデル経由でClaude Codeを起動"
echo "    litellm-stop     ← 止める"
echo "    litellm-health   ← 起動状態を確認"
echo "    litellm-log      ← ログを見る"
echo ""
