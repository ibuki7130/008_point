#!/bin/bash
# TAISUN Agent - SDD スキルセットアップスクリプト
#
# SDD（Software Design Document）スキル13本を最適なモデルで動作させるセットアップ。
# 使っている環境に合わせて3パターンから選択できます。
#
# 使い方:
#   bash ~/taisun_agent/scripts/setup-sdd.sh
#
# パターン:
#   1. Claude MAX/Pro プラン（APIキーあり）  ← Anthropic直接・最高品質
#   2. Ollama ローカルモデル（Mac 16GB以上）  ← 完全無料・プライバシー保護
#   3. OpenRouter 格安API                    ← APIキーのみ・どのマシンでも動作

set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_DIR="$REPO_DIR/.claude/skills"
LITELLM_CONFIG="$REPO_DIR/config/litellm-config.yaml"

# ─────────────────────────────────────────
# 関数定義
# ─────────────────────────────────────────

check_command() {
    command -v "$1" &>/dev/null
}

check_ollama_model() {
    ollama list 2>/dev/null | grep -q "$1"
}

print_header() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}  TAISUN SDD スキル セットアップ${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
}

print_sdd_skills() {
    echo -e "  ${BLUE}推論系スキル（5本）:${NC}"
    echo "    sdd-full, sdd-req100, sdd-design, sdd-threat, sdd-adr"
    echo -e "  ${BLUE}構造化・日本語系スキル（8本）:${NC}"
    echo "    sdd-tasks, sdd-slo, sdd-runbook, sdd-guardrails,"
    echo "    sdd-context, sdd-glossary, sdd-stakeholder, sdd-event-storming"
    echo ""
}

# SDD スキルのmodelフィールドを一括変更する関数
update_skill_models() {
    local reasoning_model="$1"
    local structured_model="$2"

    echo "  SDDスキルのモデルを更新中..."

    local reasoning_skills=("sdd-full" "sdd-req100" "sdd-design" "sdd-threat" "sdd-adr")
    local structured_skills=("sdd-tasks" "sdd-slo" "sdd-runbook" "sdd-guardrails" "sdd-context" "sdd-glossary" "sdd-stakeholder" "sdd-event-storming")

    for skill in "${reasoning_skills[@]}"; do
        local skill_file="$SKILLS_DIR/$skill/SKILL.md"
        if [ -f "$skill_file" ]; then
            sed -i.bak "s/^model: .*$/model: $reasoning_model/" "$skill_file"
            rm -f "${skill_file}.bak"
            echo -e "    ${GREEN}[OK]${NC} $skill → $reasoning_model"
        else
            echo -e "    ${YELLOW}[SKIP]${NC} $skill (ファイル未検出)"
        fi
    done

    for skill in "${structured_skills[@]}"; do
        local skill_file="$SKILLS_DIR/$skill/SKILL.md"
        if [ -f "$skill_file" ]; then
            sed -i.bak "s/^model: .*$/model: $structured_model/" "$skill_file"
            rm -f "${skill_file}.bak"
            echo -e "    ${GREEN}[OK]${NC} $skill → $structured_model"
        else
            echo -e "    ${YELLOW}[SKIP]${NC} $skill (ファイル未検出)"
        fi
    done

    echo ""
    echo -e "  ${GREEN}✅ SDD スキル 13本のモデル設定完了${NC}"
}

# ─────────────────────────────────────────
# メイン処理
# ─────────────────────────────────────────

print_header

# SDD スキルの存在確認
if [ ! -d "$SKILLS_DIR/sdd-req100" ]; then
    echo -e "${RED}[ERROR]${NC} SDD スキルが見つかりません: $SKILLS_DIR"
    echo "  taisun_agent がインストールされているか確認してください。"
    exit 1
fi

echo "対象スキル（13本）:"
print_sdd_skills

# ─────────────────────────────────────────
# プラン選択
# ─────────────────────────────────────────

echo -e "${CYAN}どのプランを使いますか？${NC}"
echo ""
echo "  1) Claude MAX/Pro プラン（APIキーあり）"
echo "     → Anthropic直接接続・最高品質・月額制で追加費用なし"
echo "     → 推奨: MAX \$200 プラン加入済みの方"
echo ""
echo "  2) Ollama ローカルモデル（Mac/Linux 16GB以上推奨）"
echo "     → 完全無料・プライバシー保護・オフライン動作"
echo "     → 推奨: MacBook Pro M1/M2/M3/M4（32GB以上でベスト）"
echo ""
echo "  3) OpenRouter 格安API（どのマシンでも動作）"
echo "     → APIキーのみ必要・セットアップ簡単・低コスト"
echo "     → 推奨: MAX未加入・Ollamaが使えない環境"
echo ""

read -rp "選択 [1/2/3]: " PLAN_CHOICE

echo ""

case "$PLAN_CHOICE" in
    1)
        # ─────────────────────────────────────────
        # パターン1: Claude MAX/Pro プラン
        # ─────────────────────────────────────────
        echo -e "${CYAN}── パターン1: Claude MAX/Pro プラン ──${NC}"
        echo ""

        # APIキー確認
        if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
            echo -e "${YELLOW}ANTHROPIC_API_KEY が未設定です。${NC}"
            read -rp "  ANTHROPIC_API_KEY を入力してください（sk-ant-...）: " ANTHROPIC_API_KEY_INPUT
            if [ -z "$ANTHROPIC_API_KEY_INPUT" ]; then
                echo -e "${RED}[ERROR]${NC} APIキーが必要です。"
                exit 1
            fi
            ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY_INPUT"
        else
            echo -e "  ${GREEN}[OK]${NC} ANTHROPIC_API_KEY 検出済み"
        fi

        # .env に保存
        ENV_FILE="$REPO_DIR/.env"
        if grep -q "^ANTHROPIC_API_KEY=" "$ENV_FILE" 2>/dev/null; then
            sed -i.bak "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY|" "$ENV_FILE"
            rm -f "$ENV_FILE.bak"
        else
            echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" >> "$ENV_FILE"
        fi
        echo -e "  ${GREEN}[OK]${NC} ANTHROPIC_API_KEY を .env に保存"

        echo ""
        echo "  モデル割り当て:"
        echo "    推論系（sdd-full, req100, design, threat, adr） → claude-opus"
        echo "    構造化系（tasks, slo, runbook, guardrails 等）  → claude-sonnet"
        echo ""

        update_skill_models "claude-opus" "claude-sonnet"

        echo ""
        echo "  ✨ SDD スキルが Claude MAX/Pro モードに設定されました"
        echo "     claude-opus: 推論・設計・脅威分析"
        echo "     claude-sonnet: タスク・SLO・Runbook・用語集"
        ;;

    2)
        # ─────────────────────────────────────────
        # パターン2: Ollama ローカルモデル
        # ─────────────────────────────────────────
        echo -e "${CYAN}── パターン2: Ollama ローカルモデル ──${NC}"
        echo ""

        # Ollama インストール確認
        if ! check_command ollama; then
            echo -e "${YELLOW}[WARNING]${NC} ollama コマンドが見つかりません。"
            echo ""
            echo "  Ollama のインストール方法:"
            echo "    macOS:  brew install ollama"
            echo "    Linux:  curl -fsSL https://ollama.com/install.sh | sh"
            echo ""
            read -rp "  インストール後に続けますか？ [y/N]: " CONTINUE
            if [[ ! "$CONTINUE" =~ ^[Yy]$ ]]; then
                echo "セットアップを中断しました。Ollamaをインストール後に再実行してください。"
                exit 0
            fi
        else
            echo -e "  ${GREEN}[OK]${NC} Ollama インストール済み: $(ollama --version 2>/dev/null | head -1)"
        fi

        echo ""
        echo "  必要なモデルを確認中..."
        echo ""

        # モデルリスト
        declare -A MODELS=(
            ["ollama-deepseek-r1"]="deepseek-r1:70b"
            ["ollama-qwen25-72b"]="qwen2.5:72b-instruct-q8_0"
        )

        MISSING_MODELS=()

        for model_alias in "${!MODELS[@]}"; do
            model_name="${MODELS[$model_alias]}"
            if check_ollama_model "${model_name%%:*}"; then
                echo -e "    ${GREEN}[OK]${NC} $model_name 検出済み"
            else
                echo -e "    ${YELLOW}[MISSING]${NC} $model_name（ダウンロード必要）"
                MISSING_MODELS+=("$model_name")
            fi
        done

        echo ""

        if [ ${#MISSING_MODELS[@]} -gt 0 ]; then
            echo -e "  ${YELLOW}以下のモデルが未ダウンロードです:${NC}"
            for m in "${MISSING_MODELS[@]}"; do
                echo "    - $m"
            done
            echo ""
            echo "  モデルサイズの目安:"
            echo "    deepseek-r1:70b              ≈ 40GB（推論特化）"
            echo "    qwen2.5:72b-instruct-q8_0    ≈ 78GB（日本語・構造化出力特化）"
            echo ""

            # RAM チェック
            TOTAL_RAM_GB=0
            if check_command sysctl; then
                TOTAL_RAM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo "0")
                TOTAL_RAM_GB=$((TOTAL_RAM_BYTES / 1073741824))
            fi

            if [ "$TOTAL_RAM_GB" -gt 0 ]; then
                echo -e "  システムRAM: ${CYAN}${TOTAL_RAM_GB}GB${NC}"
                if [ "$TOTAL_RAM_GB" -lt 32 ]; then
                    echo -e "  ${YELLOW}[警告]${NC} 70Bモデルには32GB以上推奨。32BモデルのAlternativeを検討してください。"
                    echo "         代替案: qwen2.5:32b（16GB RAM以上で動作）"
                fi
            fi

            echo ""
            read -rp "  今すぐダウンロードしますか？ [y/N]: " DOWNLOAD_NOW

            if [[ "$DOWNLOAD_NOW" =~ ^[Yy]$ ]]; then
                for m in "${MISSING_MODELS[@]}"; do
                    echo ""
                    echo -e "  ${CYAN}ダウンロード中: $m${NC}"
                    echo "  （大きなモデルはダウンロードに時間がかかります）"
                    if ollama pull "$m"; then
                        echo -e "  ${GREEN}[OK]${NC} $m ダウンロード完了"
                    else
                        echo -e "  ${RED}[ERROR]${NC} $m のダウンロードに失敗"
                        echo "  後で手動で実行: ollama pull $m"
                    fi
                done
            else
                echo ""
                echo -e "  ${YELLOW}スキップ${NC}: ダウンロードをスキップしました"
                echo "  後で手動で実行してください:"
                for m in "${MISSING_MODELS[@]}"; do
                    echo "    ollama pull $m"
                done
                echo ""
                read -rp "  ダウンロードなしで設定だけ進めますか？ [y/N]: " CONTINUE_WITHOUT_DL
                if [[ ! "$CONTINUE_WITHOUT_DL" =~ ^[Yy]$ ]]; then
                    echo "セットアップを中断しました。モデルのダウンロード後に再実行してください。"
                    exit 0
                fi
            fi
        fi

        echo ""
        echo "  モデル割り当て:"
        echo "    推論系（sdd-full, req100, design, threat, adr）    → ollama-deepseek-r1"
        echo "    構造化系（tasks, slo, runbook, guardrails 等）      → ollama-qwen25-72b"
        echo ""

        update_skill_models "ollama-deepseek-r1" "ollama-qwen25-72b"

        # litellm の起動確認
        echo ""
        echo -e "  ${CYAN}LiteLLM プロキシの設定${NC}"
        echo ""
        if curl -s "http://localhost:4000/health" > /dev/null 2>&1; then
            echo -e "  ${GREEN}[OK]${NC} LiteLLM プロキシ起動済み (http://localhost:4000)"
        else
            echo -e "  ${YELLOW}[INFO]${NC} LiteLLM プロキシが停止中です"
            echo ""
            echo "  SDDスキルを使う前に以下を実行してください:"
            echo ""
            echo -e "    ${CYAN}litellm --config $LITELLM_CONFIG --port 4000 &${NC}"
            echo ""
            echo "  または claude-lite コマンドが設定済みなら:"
            echo -e "    ${CYAN}claude-lite${NC}"
        fi

        echo ""
        echo "  ✨ SDD スキルが Ollama ローカルモードに設定されました"
        echo "     deepseek-r1:70b: 推論・設計・脅威分析（無料）"
        echo "     qwen2.5:72b:     タスク・SLO・Runbook・日本語処理（無料）"
        ;;

    3)
        # ─────────────────────────────────────────
        # パターン3: OpenRouter 格安API
        # ─────────────────────────────────────────
        echo -e "${CYAN}── パターン3: OpenRouter 格安API ──${NC}"
        echo ""

        # OpenRouter APIキー確認
        if [ -z "${OPENROUTER_API_KEY:-}" ]; then
            echo -e "${YELLOW}OPENROUTER_API_KEY が未設定です。${NC}"
            echo ""
            echo "  OpenRouterのAPIキー取得方法:"
            echo "    1. openrouter.ai でアカウント作成（無料）"
            echo "    2. Keys → Create Key"
            echo "    3. 新規クレジット追加（\$5〜 / クレカ）"
            echo ""
            read -rp "  OPENROUTER_API_KEY を入力してください（sk-or-...）: " OPENROUTER_API_KEY_INPUT
            if [ -z "$OPENROUTER_API_KEY_INPUT" ]; then
                echo -e "${RED}[ERROR]${NC} APIキーが必要です。"
                exit 1
            fi
            OPENROUTER_API_KEY="$OPENROUTER_API_KEY_INPUT"
        else
            echo -e "  ${GREEN}[OK]${NC} OPENROUTER_API_KEY 検出済み"
        fi

        # .env に保存
        ENV_FILE="$REPO_DIR/.env"
        if grep -q "^OPENROUTER_API_KEY=" "$ENV_FILE" 2>/dev/null; then
            sed -i.bak "s|^OPENROUTER_API_KEY=.*|OPENROUTER_API_KEY=$OPENROUTER_API_KEY|" "$ENV_FILE"
            rm -f "$ENV_FILE.bak"
        else
            echo "OPENROUTER_API_KEY=$OPENROUTER_API_KEY" >> "$ENV_FILE"
        fi
        echo -e "  ${GREEN}[OK]${NC} OPENROUTER_API_KEY を .env に保存"

        echo ""
        echo "  モデル割り当て（OpenRouter経由）:"
        echo "    推論系（sdd-full, req100, design, threat, adr）    → deepseek"
        echo "    構造化系（tasks, slo, runbook, guardrails 等）      → deepseek"
        echo ""
        echo "  コスト目安:"
        echo "    deepseek-chat: 約 \$0.07-0.27 / 1M tokens（非常に低コスト）"
        echo ""

        update_skill_models "deepseek" "deepseek"

        # LiteLLM pip インストール確認
        echo ""
        if ! check_command litellm; then
            echo "  LiteLLM をインストール中..."
            pip3 install 'litellm[proxy]' --quiet && \
                echo -e "  ${GREEN}[OK]${NC} litellm インストール完了" || \
                echo -e "  ${YELLOW}[WARNING]${NC} litellm のインストールに失敗。手動で: pip3 install 'litellm[proxy]'"
        else
            echo -e "  ${GREEN}[OK]${NC} litellm インストール済み"
        fi

        echo ""
        echo "  SDDスキルを使う前に以下を実行してください:"
        echo ""
        echo -e "    ${CYAN}source $REPO_DIR/.env && litellm --config $LITELLM_CONFIG --port 4000 &${NC}"
        echo ""
        echo "  ✨ SDD スキルが OpenRouter モードに設定されました"
        echo "     deepseek-chat: 全スキル共通（低コスト・高品質）"
        ;;

    *)
        echo -e "${RED}[ERROR]${NC} 無効な選択です。1、2、または 3 を入力してください。"
        exit 1
        ;;
esac

# ─────────────────────────────────────────
# 共通: ~/.zshrc / ~/.bashrc に .env 読み込みを追加
# ─────────────────────────────────────────

SHELL_RC="$HOME/.zshrc"
[ -f "$HOME/.bashrc" ] && [ ! -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.bashrc"

MARKER="# === TAISUN SDD ==="

if ! grep -q "$MARKER" "$SHELL_RC" 2>/dev/null; then
    cat >> "$SHELL_RC" << SHELLEOF

$MARKER
# taisun_agent の .env を自動読み込み
[ -f "$REPO_DIR/.env" ] && export \$(grep -v '^#' "$REPO_DIR/.env" | xargs 2>/dev/null)
# === END TAISUN SDD ===
SHELLEOF
    echo -e "  ${GREEN}[OK]${NC} $SHELL_RC に .env 読み込みを追加"
fi

# ─────────────────────────────────────────
# 完了メッセージ
# ─────────────────────────────────────────

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}  ✅ セットアップ完了！${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo "  設定を反映するために以下を実行:"
echo ""
echo -e "    ${CYAN}source $SHELL_RC${NC}"
echo ""
echo "  SDD スキルの使い方:"
echo ""
echo "    /sdd-full <spec-slug>        ← 要件定義〜設計まで一括実行"
echo "    /sdd-req100 <spec-slug>      ← EARS準拠 要件定義書作成"
echo "    /sdd-design <spec-slug>      ← アーキテクチャ設計書作成"
echo "    /sdd-adr <title> <spec-slug> ← 技術決定記録（ADR）作成"
echo "    /sdd-context <spec-slug>     ← ビジネスコンテキスト整合"
echo "    /sdd-tasks <spec-slug>       ← 実装タスク分解"
echo "    /sdd-slo <spec-slug>         ← SLO/SLA定義"
echo "    /sdd-threat <spec-slug>      ← STRIDE脅威分析"
echo "    /sdd-guardrails <spec-slug>  ← セキュリティガードレール"
echo "    /sdd-runbook <spec-slug>     ← 運用Runbook作成"
echo ""
echo "  ドキュメント: $REPO_DIR/docs/"
echo ""
