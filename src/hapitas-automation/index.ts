import * as fs from 'fs'
import * as path from 'path'
import * as cron from 'node-cron'
import { scrapeHapitasDeals } from './scraper'
import { generateContent } from './generator'
import { saveMailForUtage } from './utage'

const OUTPUT_DIR = path.join(process.cwd(), 'hapitas-output')

async function runDaily() {
  console.log(`\n[hapitas-automation] 実行開始: ${new Date().toLocaleString('ja-JP')}`)

  // 1. 案件取得
  console.log('[1/3] ハピタスから案件取得中...')
  const deals = await scrapeHapitasDeals()
  console.log(`  → ${deals.length}件取得`)
  deals.forEach(d => console.log(`  ・${d.name}: ${d.points}`))

  // 2. 文章生成
  console.log('[2/3] Claude APIで文章生成中...')
  const content = await generateContent(deals)

  // 3. LINE投稿文をファイル出力
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  const date = new Date().toISOString().slice(0, 10)
  const lineFile = path.join(OUTPUT_DIR, `line_${date}.txt`)
  fs.writeFileSync(lineFile, content.linePost, 'utf-8')
  console.log(`  → LINE投稿文: ${lineFile}`)

  // 4. UTAGE用メール内容をファイル出力
  console.log('[3/3] UTAGE配信用ファイル生成中...')
  const mailFile = await saveMailForUtage(OUTPUT_DIR, {
    subject: content.mailSubject,
    body: content.mailBody,
  })
  console.log(`  → UTAGE配信用ファイル: ${mailFile}`)
  console.log('  → UTAGEの管理画面から手動で一斉配信してください')

  console.log('[hapitas-automation] 完了\n')
}

// 毎朝7:00に自動実行
cron.schedule('0 7 * * *', runDaily, { timezone: 'Asia/Tokyo' })
console.log('[hapitas-automation] スケジューラー起動。毎朝7:00に自動実行します。')
console.log('今すぐ実行する場合: node -e "require(\'./dist/hapitas-automation/index\').runNow()"')

// 手動実行用にエクスポート
export { runDaily as runNow }
