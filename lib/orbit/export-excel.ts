import * as XLSX from 'xlsx'
import type { Member, Project, Task } from './types'
import { STATUS_LABEL } from './types'
import { formatDeadlineFull } from './utils'

function memberLabel(members: Member[], id: string): string {
  const m = members.find((mm) => mm.id === id)
  return m ? m.displayName || m.name : id
}

function autoWidth(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return []
  return Object.keys(rows[0]).map((key) => {
    const longest = rows.reduce((max, row) => {
      const val = row[key]
      const len = val == null ? 0 : String(val).length
      return Math.max(max, len)
    }, key.length)
    return { wch: Math.min(Math.max(longest + 2, 10), 40) }
  })
}

function taskRows(tasks: Task[], projects: Project[], members: Member[]) {
  return tasks.map((t) => ({
    タスク名: t.name,
    プロジェクト: projects.find((p) => p.id === t.projectId)?.name ?? '',
    部門: t.department,
    担当: t.assigneeIds.map((id) => memberLabel(members, id)).join('、'),
    ステータス: STATUS_LABEL[t.status],
    優先度: t.priority,
    難易度: t.difficulty,
    カテゴリ: t.category,
    必要スキル: t.skills.join('、'),
    開始日: t.startDate ?? '',
    期限: t.deadline ? formatDeadlineFull(t.deadline) : '',
    完了日: t.completedDate ?? '',
    進捗: t.progress ?? '',
    説明: t.description ?? '',
  }))
}

function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename)
}

// OUTPUT画面の一覧表示中のタスクをそのままExcelに書き出す（表示中のフィルタが反映される）
export function exportTasksToExcel(tasks: Task[], projects: Project[], members: Member[]) {
  const rows = taskRows(tasks, projects, members)
  const sheet = XLSX.utils.json_to_sheet(rows)
  sheet['!cols'] = autoWidth(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'タスク')
  const today = new Date().toISOString().slice(0, 10)
  downloadWorkbook(wb, `Orbit_タスク一覧_${today}.xlsx`)
}

// プロジェクト単位でタスクをExcelに書き出す
export function exportProjectTasksToExcel(project: Project, tasks: Task[], projects: Project[], members: Member[]) {
  const projectTasks = tasks.filter((t) => t.projectId === project.id)
  const rows = taskRows(projectTasks, projects, members)
  const sheet = XLSX.utils.json_to_sheet(rows)
  sheet['!cols'] = autoWidth(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'タスク')
  const today = new Date().toISOString().slice(0, 10)
  downloadWorkbook(wb, `Orbit_${project.name}_${today}.xlsx`)
}

// 管理者向け：タスク・プロジェクト・メンバーを別シートにまとめた全データエクスポート
export function exportAllDataToExcel(tasks: Task[], projects: Project[], members: Member[]) {
  const wb = XLSX.utils.book_new()

  const tRows = taskRows(tasks, projects, members)
  const tSheet = XLSX.utils.json_to_sheet(tRows)
  tSheet['!cols'] = autoWidth(tRows)
  XLSX.utils.book_append_sheet(wb, tSheet, 'タスク')

  const pRows = projects.map((p) => ({
    プロジェクト名: p.name,
    種別: p.type ?? '',
    責任者: p.ownerId ? memberLabel(members, p.ownerId) : '',
    メンバー: (p.memberIds ?? []).map((id) => memberLabel(members, id)).join('、'),
    アーカイブ: p.archived ? '済' : '',
    説明: p.description,
  }))
  const pSheet = XLSX.utils.json_to_sheet(pRows)
  pSheet['!cols'] = autoWidth(pRows)
  XLSX.utils.book_append_sheet(wb, pSheet, 'プロジェクト')

  const mRows = members.map((m) => ({
    氏名: m.displayName || m.name,
    所属: m.affiliation,
    役割: m.role,
    メール: m.email ?? '',
    要求スキル: m.skills.join('、'),
    スキルレベル: (m.skillLevels ?? []).map((sl) => `${sl.skill}:Lv${sl.level}`).join('、'),
    所属開始日: m.joinedAt ?? '',
  }))
  const mSheet = XLSX.utils.json_to_sheet(mRows)
  mSheet['!cols'] = autoWidth(mRows)
  XLSX.utils.book_append_sheet(wb, mSheet, 'メンバー')

  const today = new Date().toISOString().slice(0, 10)
  downloadWorkbook(wb, `Orbit_全データ_${today}.xlsx`)
}
