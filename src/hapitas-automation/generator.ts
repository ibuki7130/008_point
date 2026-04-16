import Anthropic from '@anthropic-ai/sdk'
import { HapitasDeal } from './scraper'

const client = new Anthropic()

const HAPITAS_INVITE_URL = 'https://hapitas.jp/appinvite?i=22890198&route=pcText'

export interface GeneratedContent {
  linePost: string
  mailSubject: string
  mailBody: string
}

export async function generateContent(deals: HapitasDeal[]): Promise<GeneratedContent> {
  if (deals.length === 0) {
    return getFallbackContent()
  }

  const topDeal = deals[0]
  const otherDeals = deals.slice(1, 3)

  const prompt = `
あなたはポイ活情報を発信するライターです。
以下の案件情報をもとに、LINEオープンチャット投稿文とメルマガ（件名・本文）を作成してください。

【本日のメイン案件】
案件名: ${topDeal.name}
還元: ${topDeal.points}
条件: ${topDeal.condition}

${otherDeals.length > 0 ? `【その他の注目案件】\n${otherDeals.map(d => `・${d.name} ${d.points}`).join('\n')}` : ''}

【出力ルール】
- 親しみやすいトーン。情報提供型で勧誘感なし
- 「稼げる」「お金になる」等の断定表現は使わない
- 実績の保証表現は使わない
- ハピタス紹介リンク: ${HAPITAS_INVITE_URL}
- メルマガ件名には必ず「【PR】」を末尾に付ける

以下のJSON形式で出力してください（他の文字は一切出力しない）:
{
  "linePost": "LINE投稿文（300文字以内）",
  "mailSubject": "メルマガ件名（40文字以内）",
  "mailBody": "メルマガ本文（500〜700文字）"
}
`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim())
    return {
      linePost: json.linePost,
      mailSubject: json.mailSubject,
      mailBody: json.mailBody,
    }
  } catch {
    console.error('[generator] JSON解析失敗。フォールバックを使用します')
    return getFallbackContent()
  }
}

function getFallbackContent(): GeneratedContent {
  return {
    linePost: `━━━━━━━━━━━━━━
【本日の高還元案件】
本日は案件情報の取得に失敗しました。
ハピタスのサイトで直接ご確認ください。

📌まだハピタス未登録の方
↓概要欄のリンクから登録で特典あり
━━━━━━━━━━━━━━`,
    mailSubject: '【本日の高還元案件情報】【PR】',
    mailBody: `本日は案件情報の自動取得に失敗しました。
ハピタスのサイトで直接高還元案件をご確認ください。

▶ ハピタスへ: https://hapitas.jp

---
まだハピタスに未登録の方はこちらから登録すると特典があります:
${HAPITAS_INVITE_URL}

配信停止はこちら: {unsubscribe_url}
送信者: 大谷`,
  }
}
