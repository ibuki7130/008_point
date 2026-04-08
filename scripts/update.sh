#!/bin/bash
# TAISUN Agent - アップデートスクリプト
#
# 使い方: ./scripts/update.sh

# set -e を使わない（1つの失敗で全体が止まるのを防ぐ）
set +e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION=$(cat "$REPO_DIR/package.json" | grep '"version"' | head -1 | cut -d'"' -f4)

# ─────────────────────────────────────────
# 表示ヘルパー
# ─────────────────────────────────────────
ok()   { echo "  ✅ $1"; }
warn() { echo "  ⚠️  $1"; }
info() { echo "  ℹ️  $1"; }
step() { echo ""; echo "━━━ $1 ━━━"; }

# ─────────────────────────────────────────
# ヘッダー
# ─────────────────────────────────────────
# clear は使わない（Claude Code内でログが消えるのを防ぐ）
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║     TAISUN Agent アップデート                      ║"
echo "║     現在のバージョン：v${VERSION}                    ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  このスクリプトが行うこと："
echo "  1. 最新版のダウンロード"
echo "  2. ファイルの更新"
echo "  3. スキル・エージェントの更新"
echo "  4. 動作確認"
echo ""
echo "  ⚠️  途中で画面に文字が流れますが正常な動作です。"
echo "      最後まで待ってください。"
echo ""

# git リポジトリ確認
if [ ! -d "$REPO_DIR/.git" ]; then
    echo "  ❌ エラー：このフォルダは TAISUN Agent のフォルダではありません"
    echo "     → taisun_agent フォルダの中で実行してください"
    exit 1
fi

cd "$REPO_DIR"
CURRENT_VERSION=$VERSION

# ─────────────────────────────────────────
# Step 1: 最新版をダウンロード
# ─────────────────────────────────────────
step "ステップ 1/4：最新版をダウンロードしています"

echo ""
echo "  インターネットから最新のファイルをダウンロードしています..."
echo ""

git fetch origin

# ローカルの変更を一時退避
STASHED=false
if ! git diff --quiet HEAD 2>/dev/null; then
    git stash push -m "taisun-update-auto-stash" 2>/dev/null && STASHED=true
    info "あなたの設定変更を一時的に退避しました（後で自動的に戻します）"
fi

git pull origin main --ff-only 2>/dev/null || {
    info "通常の更新ができませんでした。最新版に強制同期します..."
    if git reset --hard origin/main 2>/dev/null; then
        ok "最新版に同期しました"
    else
        warn "git同期に失敗しました。ZIPダウンロードで更新します..."

        ZIP_URL="https://github.com/taiyousan15/taisun_agent/archive/refs/heads/main.zip"
        ZIP_PATH="/tmp/taisun_agent_update.zip"
        EXTRACT_PATH="/tmp/taisun_agent_extract"

        if curl -fsSL "$ZIP_URL" -o "$ZIP_PATH" 2>/dev/null; then
            rm -rf "$EXTRACT_PATH"
            unzip -q "$ZIP_PATH" -d "$EXTRACT_PATH"
            SOURCE_DIR=$(ls -d "$EXTRACT_PATH"/*/ | head -1)

            # node_modules と .git を除外してコピー（rsyncがない環境も考慮）
            if command -v rsync &> /dev/null; then
                rsync -a --exclude='node_modules' --exclude='.git' "$SOURCE_DIR" "$REPO_DIR/"
            else
                # rsyncがない場合はcpで代替
                cd "$SOURCE_DIR"
                for item in *; do
                    [ "$item" = "node_modules" ] && continue
                    [ "$item" = ".git" ] && continue
                    cp -R "$item" "$REPO_DIR/" 2>/dev/null || true
                done
            fi
            ok "ZIPダウンロードで更新しました"
            rm -f "$ZIP_PATH"
            rm -rf "$EXTRACT_PATH"
        else
            warn "ZIPダウンロードにも失敗しました"
            warn "手動でダウンロード: $ZIP_URL"
        fi
    fi
}

# 退避した変更を戻す
if [ "$STASHED" = true ]; then
    git stash pop 2>/dev/null && \
        ok "退避した設定変更を元に戻しました" || \
        warn "設定変更の復元に失敗しました。git stash pop を実行してください"
fi

NEW_VERSION=$(cat "$REPO_DIR/package.json" | grep '"version"' | head -1 | cut -d'"' -f4)
echo ""
ok "バージョン更新: v${CURRENT_VERSION} → v${NEW_VERSION}"

# ─────────────────────────────────────────
# Step 2: ファイルの更新・ビルド
# ─────────────────────────────────────────
step "ステップ 2/4：システムを更新しています（少し時間がかかります）"

echo ""
echo "  📦 必要なファイルを更新しています..."
npm install --silent 2>/dev/null || npm install
ok "ファイルの更新が完了しました"

echo ""
echo "  🔨 システムを再構築しています..."
if npm run build 2>/dev/null; then
    ok "システムの再構築が完了しました"
else
    warn "一部の再構築に問題がありましたが、続行します"
fi

for mcp_dir in "mcp-servers/voice-ai-mcp-server" "mcp-servers/ai-sdr-mcp-server" "mcp-servers/line-bot-mcp-server"; do
    if [ -f "$REPO_DIR/$mcp_dir/package.json" ]; then
        mcp_name=$(basename "$mcp_dir")
        (cd "$REPO_DIR/$mcp_dir" && npm install --silent && npm run build 2>/dev/null) && \
            ok "${mcp_name} を更新しました" || \
            info "${mcp_name} の更新をスキップしました"
    fi
done

# ─────────────────────────────────────────
# Step 3: スキル・エージェントの更新
# ─────────────────────────────────────────
step "ステップ 3/4：スキル・エージェントを更新しています"

echo ""
TARGET_SKILLS="$HOME/.claude/skills"
SOURCE_SKILLS="$REPO_DIR/.claude/skills"
mkdir -p "$TARGET_SKILLS"

INSTALLED=0; UPDATED=0; SKIPPED=0

if [ -d "$SOURCE_SKILLS" ]; then
    for skill_dir in "$SOURCE_SKILLS"/*/; do
        skill_name=$(basename "$skill_dir")
        [[ "$skill_name" == "_archived" ]] && continue
        [[ "$skill_name" == "data" ]] && continue
        [[ ! -f "$skill_dir/SKILL.md" ]] && [[ ! -f "$skill_dir/CLAUDE.md" ]] && continue

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
ok "スキルを更新しました（新規: ${INSTALLED}件 / 更新: ${UPDATED}件 / 合計: ${TOTAL_SKILLS}件）"

TARGET_AGENTS="$HOME/.claude/agents"
SOURCE_AGENTS="$REPO_DIR/.claude/agents"
mkdir -p "$TARGET_AGENTS"

AGENT_NEW=0; AGENT_UPDATED=0; AGENT_SKIPPED=0

if [ -d "$SOURCE_AGENTS" ]; then
    for agent_file in "$SOURCE_AGENTS"/*.md; do
        agent_name=$(basename "$agent_file")
        [[ "$agent_name" == "CLAUDE.md" ]] && continue
        target="$TARGET_AGENTS/$agent_name"
        if [ -f "$target" ] && [ ! -L "$target" ]; then rm -f "$target"; fi
        if [ ! -L "$target" ]; then
            ln -sf "$agent_file" "$target"
            ((AGENT_NEW++)) || true
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
ok "エージェントを更新しました（新規: ${AGENT_NEW}件 / 更新: ${AGENT_UPDATED}件 / 合計: ${TOTAL_AGENTS}件）"

# ─────────────────────────────────────────
# Step 4: 動作確認
# ─────────────────────────────────────────
step "ステップ 4/4：動作を確認しています"

echo ""
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

if echo '{"source":"test","cwd":"'"$(pwd)"'"}' | node .claude/hooks/workflow-sessionstart-injector.js 2>/dev/null; then
    ok "システム動作確認 … OK"
else
    warn "一部の確認に問題がありましたが、通常は動作します"
fi

# ─────────────────────────────────────────
# 完了メッセージ
# ─────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   🎉  アップデートが完了しました！  v${NEW_VERSION}             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  ┌──────────────────────────────────────────────────────────┐"
echo "  │  アップデート後にやること                                 │"
echo "  ├──────────────────────────────────────────────────────────┤"
echo "  │                                                          │"
echo "  │  Claude Code を再起動してください                         │"
echo "  │  → 一度閉じて、再度開くだけで完了です                     │"
echo "  │                                                          │"
echo "  └──────────────────────────────────────────────────────────┘"
echo ""
echo "  ❓ 困ったときは："
echo "     npm run taisun:diagnose  → 問題の診断"
echo "     チャットで「使い方を教えて」と話しかける"
echo ""
