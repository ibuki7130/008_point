import * as fs from 'fs'
import * as path from 'path'

export interface UtageConfig {
  apiKey: string
  accountId: string
}

export interface MailContent {
  subject: string
  body: string
}

/**
 * UTAGE向けメール内容をファイルに保存する
 * UTAGEのAPI（β版）は一斉配信に未対応のため、
 * 管理画面からの手動配信用にファイル出力する
 */
export async function saveMailForUtage(
  outputDir: string,
  content: MailContent
): Promise<string> {
  fs.mkdirSync(outputDir, { recursive: true })

  const date = new Date().toISOString().slice(0, 10)
  const filePath = path.join(outputDir, `utage_mail_${date}.txt`)

  const fileContent = [
    '========================================',
    '【UTAGE一斉配信用メール】',
    `生成日時: ${new Date().toLocaleString('ja-JP')}`,
    '========================================',
    '',
    `件名: ${content.subject}`,
    '',
    '--- 本文 ---',
    content.body,
    '',
    '========================================',
    '配信手順:',
    '1. https://utage-system.com/account/5L3gcMZGK2Sf にアクセス',
    '2. 「メール・LINE配信」→「一斉送信」',
    '3. 上記の件名・本文をコピーして配信',
    '========================================',
  ].join('\n')

  fs.writeFileSync(filePath, fileContent, 'utf-8')
  return filePath
}

/**
 * UTAGE APIで読者をシナリオに登録する（新規登録者向け）
 * ※ 登録直後の自動ステップメール配信に使用
 */
export async function registerReaderToScenario(
  config: UtageConfig,
  scenarioId: string,
  email: string,
  name?: string
): Promise<boolean> {
  const baseUrl = 'https://api.utage-system.com/v1'
  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  }

  const body: Record<string, string> = { email }
  if (name) body['name'] = name

  const res = await fetch(
    `${baseUrl}/accounts/${config.accountId}/scenarios/${scenarioId}/readers`,
    { method: 'POST', headers, body: JSON.stringify(body) }
  )

  if (!res.ok) {
    const text = await res.text()
    console.error(`[utage] 読者登録失敗 (${res.status}):`, text)
    return false
  }

  console.log(`[utage] 読者登録完了: ${email}`)
  return true
}
