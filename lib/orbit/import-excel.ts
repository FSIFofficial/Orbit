import * as XLSX from 'xlsx'
import type { Department, Difficulty, Member, ParsedTask, Priority, Project } from './types'
import { DEPARTMENTS, DIFFICULTY_LABEL, PRIORITIES } from './types'

// Excelファイルの列は必ずしもOrbitが出力した形式とは限らず、並び順や型は
// 保証されない（日付がテキストだったりExcelの日付型だったり、列自体が
// 無かったりする）。なので取り込みは2段階にする：
//   1. ヘッダー文字列から「たぶんこの列だろう」を自動推測（初期値として提示）
//   2. 実際にどの列を使うか・値の対応をユーザーに確認してもらう（ExcelColumnMapping）
// 自動推測が外れていても、ここでエラーにはせず必ず確認画面に進む。
export type ImportField =
  | 'name'
  | 'project'
  | 'department'
  | 'assignee'
  | 'priority'
  | 'difficulty'
  | 'category'
  | 'skills'
  | 'startDate'
  | 'deadline'

export const IMPORT_FIELD_LABEL: Record<ImportField, string> = {
  name: 'タスク名',
  project: 'プロジェクト',
  department: '部門',
  assignee: '担当',
  priority: '優先度',
  difficulty: '難易度',
  category: 'カテゴリ',
  skills: '必要スキル',
  startDate: '開始日',
  deadline: '期限',
}

// 列の値をそのまま使わず、選択式（enum）や参照先（プロジェクト/メンバー）に
// 対応付けが必要なフィールド — ここだけ「値の対応」の一括修正UIを出す
export const VALUE_MAPPED_FIELDS = ['project', 'department', 'priority', 'difficulty', 'assignee'] as const
export type ValueMappedField = (typeof VALUE_MAPPED_FIELDS)[number]

const HEADER_ALIASES: Record<ImportField, string[]> = {
  name: ['タスク名', 'タスク', '件名', '名前', 'title', 'name', 'task'],
  project: ['プロジェクト', 'project'],
  department: ['部門', '部署', 'department'],
  assignee: ['担当', '担当者', 'アサイン', 'assignee', 'assignees'],
  priority: ['優先度', 'priority'],
  difficulty: ['難易度', 'difficulty'],
  category: ['カテゴリ', 'category', '分類'],
  skills: ['必要スキル', '要求スキル', 'スキル', 'skills'],
  startDate: ['開始日', 'startdate', 'start'],
  deadline: ['期限', '締切', '締め切り', 'deadline', 'due'],
}

function normalizeHeader(h: string): string {
  return String(h).trim().toLowerCase()
}

// ヘッダー行から「どの列がどの意味か」の初期値を推測する
export function detectColumns(headers: string[]): Partial<Record<ImportField, string>> {
  const result: Partial<Record<ImportField, string>> = {}
  for (const header of headers) {
    const normalized = normalizeHeader(header)
    for (const field of Object.keys(HEADER_ALIASES) as ImportField[]) {
      if (result[field]) continue
      if (HEADER_ALIASES[field].some((a) => normalizeHeader(a) === normalized)) {
        result[field] = header
      }
    }
  }
  return result
}

function splitList(value: unknown): string[] {
  if (value == null) return []
  return String(value)
    .split(/[、,,・\/\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function toDateString(value: unknown): string | null {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const str = String(value).trim()
  if (!str) return null
  // YYYY-MM-DD / YYYY/MM/DD
  let m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  // M/D or M月D日 — 年が無ければ今年として扱う
  m = str.match(/^(\d{1,2})[/月](\d{1,2})日?/)
  if (m) {
    const year = new Date().getFullYear()
    return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }
  return null
}

export function guessProject(raw: string, projects: Project[]): string {
  const found = projects.find((p) => p.name.trim() === raw)
  return found ? found.id : (projects[0]?.id ?? '')
}

export function guessDepartment(raw: string): Department {
  const found = DEPARTMENTS.find((d) => d === raw)
  return (found ?? '未分類') as Department
}

export function guessPriority(raw: string): Priority {
  return PRIORITIES.find((p) => p === raw) ?? '中'
}

export function guessDifficulty(raw: string): Difficulty {
  return DIFFICULTY_LABEL.find((d) => d === raw) ?? '新人歓迎'
}

export function guessMember(raw: string, members: Member[]): string {
  const found = members.find(
    (m) => (m.displayName && m.displayName.trim() === raw) || m.name.trim() === raw,
  )
  return found?.id ?? ''
}

export interface SheetData {
  fileName: string
  sheetName: string
  headers: string[]
  rows: Record<string, unknown>[]
}

export async function readExcelFile(file: File): Promise<SheetData> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  if (wb.SheetNames.length === 0) throw new Error('シートが見つかりませんでした')
  // Orbitの「全データエクスポート」由来のファイルなら「タスク」シートを優先する
  const sheetName = wb.SheetNames.includes('タスク') ? 'タスク' : wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  if (rows.length === 0) throw new Error('データ行が見つかりませんでした')
  const headerSet = new Set<string>()
  rows.forEach((r) => Object.keys(r).forEach((k) => headerSet.add(k)))
  return { fileName: file.name, sheetName, headers: Array.from(headerSet), rows }
}

// 列に含まれる値の種類（distinct）を頻度順に返す — 「値の対応」一括修正UI用
export function distinctColumnValues(
  rows: Record<string, unknown>[],
  header: string,
  splitTokens: boolean,
  limit = 30,
): string[] {
  const tally = new Map<string, number>()
  for (const row of rows) {
    const values = splitTokens ? splitList(row[header]) : [String(row[header] ?? '').trim()]
    for (const v of values) {
      if (!v) continue
      tally.set(v, (tally.get(v) ?? 0) + 1)
    }
  }
  return Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([v]) => v)
}

export type ColumnMapping = Partial<Record<ImportField, string>>
export interface ValueMaps {
  project?: Record<string, string>
  department?: Record<string, string>
  priority?: Record<string, string>
  difficulty?: Record<string, string>
  assignee?: Record<string, string>
}

export function buildParsedTasks(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
  valueMaps: ValueMaps,
  projects: Project[],
  members: Member[],
): { parsed: ParsedTask[]; skippedRows: number } {
  let skippedRows = 0
  const parsed: ParsedTask[] = []

  for (const row of rows) {
    const name = mapping.name ? String(row[mapping.name] ?? '').trim() : ''
    if (!name) {
      skippedRows++
      continue
    }

    const projectRaw = mapping.project ? String(row[mapping.project] ?? '').trim() : ''
    const projectId = projectRaw
      ? (valueMaps.project?.[projectRaw] ?? guessProject(projectRaw, projects))
      : (projects[0]?.id ?? '')

    const deptRaw = mapping.department ? String(row[mapping.department] ?? '').trim() : ''
    const department = (deptRaw
      ? (valueMaps.department?.[deptRaw] ?? guessDepartment(deptRaw))
      : '未分類') as Department

    const priorityRaw = mapping.priority ? String(row[mapping.priority] ?? '').trim() : ''
    const priority = (priorityRaw
      ? (valueMaps.priority?.[priorityRaw] ?? guessPriority(priorityRaw))
      : '中') as Priority

    const difficultyRaw = mapping.difficulty ? String(row[mapping.difficulty] ?? '').trim() : ''
    const difficulty = (difficultyRaw
      ? (valueMaps.difficulty?.[difficultyRaw] ?? guessDifficulty(difficultyRaw))
      : '新人歓迎') as Difficulty

    const assigneeIds = mapping.assignee
      ? Array.from(
          new Set(
            splitList(row[mapping.assignee])
              .map((token) => valueMaps.assignee?.[token] ?? guessMember(token, members))
              .filter((id) => !!id),
          ),
        )
      : []

    parsed.push({
      id: `parsed-${Math.random().toString(36).slice(2, 9)}`,
      name,
      projectId,
      department,
      startDate: mapping.startDate ? toDateString(row[mapping.startDate]) : null,
      deadline: mapping.deadline ? toDateString(row[mapping.deadline]) : null,
      category: mapping.category ? String(row[mapping.category] ?? '').trim() || '未分類' : '未分類',
      skills: mapping.skills ? splitList(row[mapping.skills]) : [],
      difficulty,
      priority,
      assigneeIds,
      approved: true,
    })
  }

  return { parsed, skippedRows }
}
