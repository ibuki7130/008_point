export interface MailerLiteConfig {
  apiKey: string
  groupId: string // 配信対象のグループID
}

export async function sendDailyMail(
  config: MailerLiteConfig,
  subject: string,
  body: string
): Promise<boolean> {
  // MailerLite APIでキャンペーン作成→即時送信
  const baseUrl = 'https://connect.mailerlite.com/api'
  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }

  // 1. キャンペーン作成
  const campaignRes = await fetch(`${baseUrl}/campaigns`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `毎日案件配信_${new Date().toISOString().slice(0, 10)}`,
      type: 'regular',
      status: 'draft',
      emails: [{
        subject,
        from_name: '大谷',
        from: process.env.MAIL_FROM_ADDRESS,
        content: buildHtmlBody(body),
        plain_text: body,
      }],
      groups: [config.groupId],
    }),
  })

  if (!campaignRes.ok) {
    console.error('[mailerlite] キャンペーン作成失敗:', await campaignRes.text())
    return false
  }

  const campaign = await campaignRes.json()
  const campaignId = campaign.data?.id

  if (!campaignId) return false

  // 2. 即時送信
  const sendRes = await fetch(`${baseUrl}/campaigns/${campaignId}/schedule`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ delivery: 'instant' }),
  })

  if (!sendRes.ok) {
    console.error('[mailerlite] 送信失敗:', await sendRes.text())
    return false
  }

  console.log(`[mailerlite] 送信完了: ${subject}`)
  return true
}

function buildHtmlBody(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')

  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; font-size: 15px; line-height: 1.8; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
${escaped}
</body>
</html>`
}
