#!/usr/bin/env python3
"""
ハピタス高還元案件 自動取得・文章生成スクリプト
毎朝7時にcronで実行
"""
import os
import json
import datetime
from pathlib import Path
from dotenv import load_dotenv

# .envを読み込む（プロジェクトルートから）
script_dir = Path(__file__).parent
project_root = script_dir.parent.parent
load_dotenv(project_root / '.env')

HAPITAS_EMAIL = os.getenv('HAPITAS_EMAIL')
HAPITAS_PASSWORD = os.getenv('HAPITAS_PASSWORD')
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')
HAPITAS_INVITE_URL = 'https://hapitas.jp/appinvite?i=22890198&route=pcText'
OUTPUT_DIR = project_root / 'hapitas-output'


def scrape_hapitas():
    """ハピタスにログインして高還元案件を取得"""
    from playwright.sync_api import sync_playwright

    deals = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            locale='ja-JP'
        )
        page = context.new_page()

        try:
            # ログイン
            print('[1/3] ハピタスにログイン中...')
            page.goto('https://hapitas.jp/login', wait_until='networkidle')
            page.fill('input[type="email"]', HAPITAS_EMAIL)
            page.fill('input[type="password"]', HAPITAS_PASSWORD)
            page.click('button[type="submit"], input[type="submit"]')
            page.wait_for_load_state('networkidle')

            if 'login' in page.url:
                raise Exception('ログイン失敗。メール・パスワードを確認してください')

            print('  → ログイン成功')

            # 高還元案件ページを取得
            print('[2/3] 高還元案件を取得中...')
            page.goto('https://hapitas.jp/item/list?sort=point&order=desc', wait_until='networkidle')

            items = page.query_selector_all('.item-list__item, .js-item, [class*="item-card"]')

            for item in items:
                name_el = item.query_selector('[class*="name"], [class*="title"], h3, h4')
                point_el = item.query_selector('[class*="point"], [class*="pt"]')
                link_el = item.query_selector('a')

                name = name_el.inner_text().strip() if name_el else ''
                point_text = point_el.inner_text().strip() if point_el else ''
                url = link_el.get_attribute('href') if link_el else ''

                if not name or not point_text:
                    continue

                point_num = int(''.join(filter(str.isdigit, point_text)) or '0')
                if point_num < 500:
                    continue

                deals.append({
                    'name': name,
                    'points': point_text,
                    'pointsNum': point_num,
                    'url': url or 'https://hapitas.jp'
                })

        finally:
            browser.close()

    # 重複除去・降順・上位5件
    seen = set()
    unique = []
    for d in deals:
        if d['name'] not in seen:
            seen.add(d['name'])
            unique.append(d)

    result = sorted(unique, key=lambda x: x['pointsNum'], reverse=True)[:5]
    print(f'  → {len(result)}件取得')
    return result


def generate_content(deals):
    """Claude APIで文章生成"""
    import anthropic

    if not deals:
        return get_fallback_content()

    top = deals[0]
    others = deals[1:3]

    others_text = ''
    if others:
        others_text = '\n【その他の注目案件】\n' + '\n'.join(f'・{d["name"]} {d["points"]}' for d in others)

    prompt = f"""あなたはポイ活情報を発信するライターです。
以下の案件情報をもとに、LINEオープンチャット投稿文とメルマガ（件名・本文）を作成してください。

【本日のメイン案件】
案件名: {top['name']}
還元: {top['points']}
{others_text}

【出力ルール】
- 親しみやすいトーン。情報提供型で勧誘感なし
- 「稼げる」「お金になる」等の断定表現は使わない
- ハピタス紹介リンク: {HAPITAS_INVITE_URL}
- メルマガ件名には必ず「【PR】」を末尾に付ける

以下のJSON形式で出力してください（他の文字は一切出力しない）:
{{
  "linePost": "LINE投稿文（300文字以内）",
  "mailSubject": "メルマガ件名（40文字以内）",
  "mailBody": "メルマガ本文（500〜700文字）"
}}"""

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    message = client.messages.create(
        model='claude-haiku-4-5-20251001',
        max_tokens=1024,
        messages=[{'role': 'user', 'content': prompt}]
    )

    text = message.content[0].text
    try:
        cleaned = text.replace('```json', '').replace('```', '').strip()
        return json.loads(cleaned)
    except Exception:
        print('[警告] JSON解析失敗。フォールバックを使用')
        return get_fallback_content()


def get_fallback_content():
    return {
        'linePost': f'本日は案件情報の取得に失敗しました。\nハピタスのサイトで直接ご確認ください。\n{HAPITAS_INVITE_URL}',
        'mailSubject': '【本日の高還元案件情報】【PR】',
        'mailBody': f'本日は案件情報の自動取得に失敗しました。\nハピタスのサイトで直接ご確認ください。\n\n{HAPITAS_INVITE_URL}'
    }


def save_files(content):
    """LINE用・メルマガ用ファイルを保存"""
    OUTPUT_DIR.mkdir(exist_ok=True)
    date = datetime.date.today().isoformat()

    line_file = OUTPUT_DIR / f'line_{date}.txt'
    mail_file = OUTPUT_DIR / f'mail_{date}.txt'

    line_file.write_text(content['linePost'], encoding='utf-8')
    mail_file.write_text(
        f"件名: {content['mailSubject']}\n\n{content['mailBody']}",
        encoding='utf-8'
    )

    print(f'  → LINE投稿文: {line_file}')
    print(f'  → メルマガ: {mail_file}')


def main():
    print(f'\n[hapitas-auto] 実行開始: {datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')

    # 案件取得
    deals = scrape_hapitas()
    for d in deals:
        print(f'  ・{d["name"]}: {d["points"]}')

    # 文章生成
    if ANTHROPIC_API_KEY and ANTHROPIC_API_KEY != 'dummy_for_now':
        print('[3/3] Claude APIで文章生成中...')
        content = generate_content(deals)
    else:
        print('[3/3] APIキー未設定のためフォールバックを使用')
        content = get_fallback_content()

    # 保存
    save_files(content)
    print('[hapitas-auto] 完了\n')


if __name__ == '__main__':
    main()
