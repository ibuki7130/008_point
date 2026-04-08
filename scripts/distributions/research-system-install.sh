#!/bin/bash
# ═══════════════════════════════════════════
# research-system スキル ワンクリックインストーラー
# ═══════════════════════════════════════════
# ターミナルに以下を貼り付けて実行するだけ:
# bash ~/Downloads/research-system-install.sh
# または
# bash ~/Downloads/research-system-配布用/research-system-install.sh

echo ""
echo "═══════════════════════════════════════════"
echo " research-system スキル インストール中..."
echo "═══════════════════════════════════════════"
echo ""

# ZIPファイルを複数の場所から探す
ZIP_FILE=""
for DIR in \
    "$(cd "$(dirname "$0")" && pwd)" \
    ~/Downloads \
    ~/Downloads/research-system-配布用 \
    ~/Desktop \
    ~/Desktop/research-system-配布用 \
    ~/Documents \
    ~
do
    if [ -f "$DIR/research-system-skill.zip" ]; then
        ZIP_FILE="$DIR/research-system-skill.zip"
        break
    fi
done

if [ -z "$ZIP_FILE" ]; then
    echo "エラー: research-system-skill.zip が見つかりませんでした"
    echo ""
    echo "以下のどこかに research-system-skill.zip を置いてください:"
    echo "  - ダウンロードフォルダ"
    echo "  - デスクトップ"
    echo ""
    exit 1
fi

echo "ZIPファイル発見: $ZIP_FILE"
echo ""

# スキルフォルダを作成
mkdir -p ~/.claude/skills

# 既存があればバックアップ
if [ -d ~/.claude/skills/research-system ]; then
    mv ~/.claude/skills/research-system ~/.claude/skills/research-system.bak.$(date +%Y%m%d%H%M%S)
fi

# 解凍・配置
unzip -o "$ZIP_FILE" -d ~/.claude/skills/

echo ""
echo "═══════════════════════════════════════════"
echo ""
echo " インストール完了!"
echo ""
echo " Claude Code で以下を入力して使えます:"
echo ""
echo "   /research-system 作りたいシステムの説明"
echo ""
echo " 例:"
echo "   /research-system Kindleの本を自動作成するシステム"
echo ""
echo "═══════════════════════════════════════════"
