import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { readExcelFile, detectColumns, buildParsedTasks } from './import-excel'
import type { Member, Project } from './types'

// xlsxパッケージのバージョン更新(監査F11・F16、0.18.5 -> 0.20.3)で
// 取り込み処理が壊れていないことを確認する回帰テスト。実際にxlsxファイルを
// XLSX.write()で生成し、readExcelFile()(ブラウザのFile.arrayBuffer()経由)
// に通してパース結果を検証する。
function buildSampleXlsxFile(): File {
  const wb = XLSX.utils.book_new()
  const aoa = [
    ['タスク名', 'プロジェクト', '優先度', '難易度', '必要スキル', '開始日', '期限'],
    ['資料作成', 'プロジェクトA', '高', '経験者向け', 'デザイン、企画', '2024/4/1', '2024-04-10'],
    ['見積もり依頼', 'プロジェクトB', '中', '新人歓迎', '営業', new Date(2024, 3, 5), ''],
    ['', '', '', '', '', '', ''], // 名前が空の行はスキップされるはず
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  XLSX.utils.book_append_sheet(wb, ws, 'タスク')
  const buf: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return new File([buf], 'sample.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

describe('import-excel (xlsx 0.20.3との互換性)', () => {
  it('readExcelFileがヘッダーと行を正しく読み取れる', async () => {
    const file = buildSampleXlsxFile()
    const data = await readExcelFile(file)
    expect(data.sheetName).toBe('タスク')
    expect(data.headers).toEqual(
      expect.arrayContaining(['タスク名', 'プロジェクト', '優先度', '難易度', '必要スキル', '開始日', '期限']),
    )
    expect(data.rows.length).toBe(3) // 空行も含め3行(空のタスク名の行はここでは除外しない)
    expect(data.rows[0]['タスク名']).toBe('資料作成')
  })

  it('日付セル(Dateオブジェクトと文字列の両方)が取り込みロジックで正しく解釈される', async () => {
    const file = buildSampleXlsxFile()
    const data = await readExcelFile(file)
    const mapping = detectColumns(data.headers)
    expect(mapping.startDate).toBe('開始日')
    expect(mapping.deadline).toBe('期限')

    const projects: Project[] = [
      { id: 'p-a', name: 'プロジェクトA' } as Project,
      { id: 'p-b', name: 'プロジェクトB' } as Project,
    ]
    const members: Member[] = []
    const { parsed, skippedRows } = buildParsedTasks(data.rows, mapping, {}, projects, members)

    // 名前が空の行は取り込み対象から除外される
    expect(skippedRows).toBe(1)
    expect(parsed.length).toBe(2)

    const first = parsed.find((p) => p.name === '資料作成')
    expect(first?.projectId).toBe('p-a')
    expect(first?.priority).toBe('高')
    expect(first?.skills).toEqual(['デザイン', '企画'])
    // "2024/4/1" というテキスト日付が正しくISO日付文字列に変換される
    expect(first?.startDate).toBe('2024-04-01')
    expect(first?.deadline).toBe('2024-04-10')

    const second = parsed.find((p) => p.name === '見積もり依頼')
    expect(second?.projectId).toBe('p-b')
    // 実際のDateオブジェクトとして書き込んだセル(cellDates:trueで読み取り)が
    // 正しく変換される
    expect(second?.startDate).toBe('2024-04-05')
    expect(second?.deadline).toBeNull()
  })
})
