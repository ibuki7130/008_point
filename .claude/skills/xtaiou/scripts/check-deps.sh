#!/usr/bin/env bash
# xtaiou 依存コマンド確認スクリプト
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_DIR="$HOME/Desktop/開発2026/X記事投稿システム"
ERRORS=0

check_command() {
  local cmd="$1"
  local min_version="${2:-}"
  if command -v "$cmd" >/dev/null 2>&1; then
    local version
    version=$("$cmd" --version 2>/dev/null | head -1 || echo "unknown")
    printf "${GREEN}[OK]${NC} %s: %s\n" "$cmd" "$version"
  else
    printf "${RED}[NG]${NC} %s: not found\n" "$cmd"
    ERRORS=$((ERRORS + 1))
  fi
}

check_ollama_model() {
  local model="$1"
  if ollama list 2>/dev/null | grep -q "$model"; then
    printf "${GREEN}[OK]${NC} Ollama model: %s\n" "$model"
  else
    printf "${RED}[NG]${NC} Ollama model: %s (run: ollama pull %s)\n" "$model" "$model"
    ERRORS=$((ERRORS + 1))
  fi
}

check_env_var() {
  local var="$1"
  local required="${2:-optional}"
  if [ -n "${!var:-}" ]; then
    printf "${GREEN}[OK]${NC} %s: set\n" "$var"
  elif [ "$required" = "required" ]; then
    printf "${RED}[NG]${NC} %s: not set (required)\n" "$var"
    ERRORS=$((ERRORS + 1))
  else
    printf "${YELLOW}[--]${NC} %s: not set (optional)\n" "$var"
  fi
}

echo "=== xtaiou 依存チェック ==="
echo ""

echo "--- コマンド ---"
check_command "node"
check_command "npm"
check_command "ollama"
check_command "curl"

echo ""
echo "--- Ollama起動状態 ---"
if curl -s http://localhost:11434/v1/models >/dev/null 2>&1; then
  printf "${GREEN}[OK]${NC} Ollama API: responding\n"
else
  printf "${RED}[NG]${NC} Ollama API: not responding (run: ollama serve &)\n"
  ERRORS=$((ERRORS + 1))
fi

echo ""
echo "--- Ollamaモデル ---"
check_ollama_model "qwen2.5:72b"
check_ollama_model "qwen3:8b"

echo ""
echo "--- プロジェクト ---"
if [ -d "$PROJECT_DIR" ]; then
  printf "${GREEN}[OK]${NC} Project dir: %s\n" "$PROJECT_DIR"
else
  printf "${RED}[NG]${NC} Project dir: %s not found\n" "$PROJECT_DIR"
  ERRORS=$((ERRORS + 1))
fi

if [ -f "$PROJECT_DIR/node_modules/.package-lock.json" ]; then
  printf "${GREEN}[OK]${NC} node_modules: installed\n"
else
  printf "${YELLOW}[--]${NC} node_modules: not installed (run: cd %s && npm install)\n" "$PROJECT_DIR"
fi

echo ""
echo "--- 環境変数 ---"
if [ -f "$PROJECT_DIR/.env" ]; then
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env" 2>/dev/null || true
fi
check_env_var "PEXELS_API_KEY" "required"
check_env_var "TWITTER_COOKIES" "optional"
check_env_var "ENCRYPTION_KEY" "optional"

echo ""
if [ "$ERRORS" -eq 0 ]; then
  printf "${GREEN}=== 全チェック通過 ===${NC}\n"
  exit 0
else
  printf "${RED}=== %d 件のエラー ===${NC}\n" "$ERRORS"
  exit 1
fi
