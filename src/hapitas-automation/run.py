#!/usr/bin/env python3
"""
ハピタス高還元案件 自動取得・文章生成
requests + BeautifulSoupのみ（ブラウザ不要）
"""
import os
import json
import datetime
import requests
from pathlib import Path
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# .env読み込み
project_root = Path(__file__).parent.parent.parent
load_dotenv(project_root / '.env')

EMAIL = os.getenv('HAPITAS_EMAIL')
PASSWORD = os.getenv('HAPITAS_PASSWORD')
API_KEY = os.getenv('ANTHROPIC_API_KEY')
INVITE_URL = 'https://hapitas.jp/appinvite?i=22890198&route=pcText'
OUTPUT_DIR = Path('/opt/hapitas-output')


def scrape():
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })

    # ログインページ取得（CSRFトークン）
    r = session.get('https://hapitas.jp/login')
    soup = BeautifulSoup(r.text, 'html.parser')
    token = ''
    t = soup.find('input', {'name': '_token'})
    if t:
        token = t.get('value', '')

    # ログイン
    r = session.post('https://hapitas.jp/login', data={
        'email': EMAIL,
        'password': PASSWORD,
        '_token': token,
    })

    if 'login' in r.url:
        raise Exception('ログイン失敗')
    print('  → ログイン成功')

    # 高還元案件ページ
    r = session.get('https://hapitas.jp/item/list?sort=point&order=desc')
    soup = BeautifulSoup(r.text, 'html.parser')

    deals = []
    for item in soup.select('.item-list__item, [class*="item-card"], .ad-item'):
        name_el = item.select_one('[class*="name"], [class*="title"], h3, h4')
        point_el = item.select_one('[class*="point"], [class*="pt"]')
        link_el = item.select_one('a')

        name = name_el.get_text(strip=True) if name_el else ''
        point_text = point_el.get_text(strip=True) if point_el else ''
        url = link_el.get('href', '') if link_el else ''

        if not name or not point_text:
            continue

        num = int(''.join(filter(str.isdigit, point_text)) or '0')
        if num < 500:
            continue

        deals.append({'name': name, 'points': point_text, 'num': num, 'url': url})

    seen, unique = set(), []
    for d in deals:
        if d['name'] not in seen:
            seen.add(d['name'])
            unique.append(d)

    result = sorted(unique, key=lambda x: x['num'], reverse=True)[:5]
    print(f'  → {len(result)}件取得')
    return result


def generate(deals):
    if not API_KEY or API_KEY == 'dummy_for_now':
        return fallback()

    import anthropic
    top = deals[0] if deals else None
    others = deals[1:3] if len(deals) > 1 else []

    prompt = f"""ポイ活ライターとして、以下の案件でLINE投稿文とメルマガを作成してください。

【メイン案件】{top['name'] if top else 'なし'} {top['points'] if top else ''}
{'【他の案件】' + ' / '.join(f"{d['name']} {d['points']}" for d in others) if others else ''}

ルール: 親しみやすいトーン・断定表現なし・紹介リンク: {INVITE_URL}・件名末尾に【PR】

JSON形式のみで出力（他の文字不要）:
{{"linePost": "LINE文（300字以内）", "mailSubject": "件名（40字・末尾【PR】）", "mailBody": "本文（500〜700字）"}}"""

    client = anthropic.Anthropic(api_key=API_KEY)
    msg = client.messages.create(
        model='claude-haiku-4-5-20251001',
        max_tokens=1024,
        messages=[{'role': 'user', 'content': prompt}]
    )
    text = msg.content[0].text
    try:
        return json.loads(text.replace('```json', '').replace('```', '').strip())
    except Exception:
        return fallback()


def fallback():
    return {
        'linePost': f'本日の高還元案件はハピタスで確認してください。\n{INVITE_URL}',
        'mailSubject': '【本日の高還元案件】【PR】',
        'mailBody': f'本日の案件情報はハピタスで確認ください。\n{INVITE_URL}'
    }


def save(content):
    OUTPUT_DIR.mkdir(exist_ok=True)
    date = datetime.date.today().isoformat()
    (OUTPUT_DIR / f'line_{date}.txt').write_text(content['linePost'], encoding='utf-8')
    (OUTPUT_DIR / f'mail_{date}.txt').write_text(
        f"件名: {content['mailSubject']}\n\n{content['mailBody']}", encoding='utf-8'
    )
    print(f'  → 保存完了: /opt/hapitas-output/line_{date}.txt')
    print(f'  → 保存完了: /opt/hapitas-output/mail_{date}.txt')


def main():
    print(f'[hapitas] 開始: {datetime.datetime.now().strftime("%Y-%m-%d %H:%M")}')
    try:
        print('[1/3] 案件取得中...')
        deals = scrape()
        for d in deals:
            print(f'  ・{d["name"]}: {d["points"]}')
        print('[2/3] 文章生成中...')
        content = generate(deals)
        print('[3/3] 保存中...')
        save(content)
        print('[hapitas] 完了')
    except Exception as e:
        print(f'[エラー] {e}')
        save(fallback())


if __name__ == '__main__':
    main()
