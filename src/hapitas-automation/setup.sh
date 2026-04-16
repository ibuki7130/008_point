#!/bin/bash
# ハピタス自動化 セットアップスクリプト
set -e

echo "=== ハピタス自動化 セットアップ ==="

# 依存ライブラリインストール
echo "[1/3] Pythonライブラリをインストール..."
pip3 install playwright python-dotenv anthropic

# Playwrightブラウザ（既にインストール済みの場合はスキップ）
echo "[2/3] Playwrightブラウザを確認..."
python3 -m playwright install chromium 2>/dev/null || true

# cronジョブ設定（毎朝7:00 JST）
echo "[3/3] cronジョブを設定..."
SCRIPT_PATH="/opt/008_point/src/hapitas-automation/run.py"
CRON_JOB="0 22 * * * python3 $SCRIPT_PATH >> /opt/hapitas-output.log 2>&1"

# 既存のジョブを削除して再登録
(crontab -l 2>/dev/null | grep -v "hapitas-automation" ; echo "$CRON_JOB") | crontab -

echo ""
echo "=== セットアップ完了 ==="
echo "毎朝7:00 JSTに自動実行されます"
echo "ログ: /opt/hapitas-output.log"
echo ""
echo "今すぐテスト実行する場合:"
echo "  python3 $SCRIPT_PATH"
