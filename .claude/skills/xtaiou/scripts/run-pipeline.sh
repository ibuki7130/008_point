#!/usr/bin/env bash
# xtaiou パイプライン実行スクリプト
# Usage:
#   ./run-pipeline.sh              # 全ステージ本番実行
#   ./run-pipeline.sh --dry-run    # ドライラン
#   ./run-pipeline.sh --stage 2    # Stage指定
#   ./run-pipeline.sh --account 3  # マルチアカウント
set -euo pipefail

PROJECT_DIR="$HOME/Desktop/開発2026/X記事投稿システム"
DRY_RUN=""
STAGE=""
ACCOUNT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --stage)
      STAGE="$2"
      shift 2
      ;;
    --account)
      ACCOUNT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

cd "$PROJECT_DIR"

# .env読み込み
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# Ollamaデフォルト設定
export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-http://localhost:11434/v1}"
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-ollama}"
export ARTICLE_MODEL="${ARTICLE_MODEL:-qwen2.5:72b}"
export TWEET_MODEL="${TWEET_MODEL:-qwen3:8b}"

echo "=== xtaiou Pipeline ==="
echo "Base URL: $ANTHROPIC_BASE_URL"
echo "Article Model: $ARTICLE_MODEL"
echo "Tweet Model: $TWEET_MODEL"
echo ""

if [ -n "$STAGE" ]; then
  echo "Running Stage $STAGE..."
  if [ -n "$DRY_RUN" ]; then
    npx tsx src/pipeline/run-pipeline.ts --stage "$STAGE" --dry-run
  else
    npx tsx src/pipeline/run-pipeline.ts --stage "$STAGE"
  fi
elif [ -n "$DRY_RUN" ]; then
  echo "Running full pipeline (dry-run)..."
  npm run pipeline:dry
elif [ -n "$ACCOUNT" ]; then
  echo "Running full pipeline (account $ACCOUNT)..."
  npm run pipeline -- --account "$ACCOUNT"
else
  echo "Running full pipeline..."
  npm run pipeline
fi

echo ""
echo "=== Pipeline Complete ==="
echo "Results: data/runs/"
ls -lt data/runs/ 2>/dev/null | head -5 || echo "(no runs yet)"
