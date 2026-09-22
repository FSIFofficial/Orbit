'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, FileSpreadsheet, SlidersHorizontal, Check } from 'lucide-react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { STATUS_ORDER, DEPARTMENTS } from '@/lib/orbit/types'
import type { Task } from '@/lib/orbit/types'
import { formatDeadline, isOverdue } from '@/lib/orbit/utils'
import { exportTasksToExcel } from '@/lib/orbit/export-excel'
import { Avatar, DifficultyBadge, ProjectTag, DepartmentTag } from '@/components/orbit/primitives'
import { TranslatedText } from '@/components/orbit/translated-text'
import type { TaskStatus } from '@/lib/orbit/types'
import { Button } from '@/components/ui/button'
import { allowedStatusOptions } from '@/lib/orbit/permissions'
import { useI18n, STATUS_KEY, DEPARTMENT_KEY, type TranslationKey } from '@/lib/orbit/i18n'
import { DEFAULT_TIMEZONE } from '@/lib/orbit/timezone'
import { cn } from '@/lib/utils'

// item: リスト表示(表形式)の列を選べるようにした。Kanbanカードの表示項目
// トグルと同じ考え方 — タスク名列は常に表示、それ以外はここでON/OFFできる
export type ListColumn =
  | 'assignee'
  | 'project'
  | 'department'
  | 'deadline'
  | 'status'
  | 'category'
  | 'difficulty'
export const LIST_COLUMNS: ListColumn[] = [
  'assignee',
  'project',
  'department',
  'deadline',
  'status',
  'category',
  'difficulty',
]
const LIST_COLUMN_KEY: Record<ListColumn, TranslationKey> = {
  assignee: 'output.list.colAssignee',
  project: 'output.list.colProject',
  department: 'output.list.colDepartment',
  deadline: 'output.list.colDeadline',
  status: 'output.list.colStatus',
  category: 'output.list.colCategory',
  difficulty: 'output.list.colDifficulty',
}

// 列の表示/非表示もブラウザごとの個人的な好みなのでlocalStorageに保存する
function listColumnsKey(userId: string | null | undefined): string {
  return `orbit-list-columns-${userId ?? 'anon'}`
}
function loadListColumns(userId: string | null | undefined): Set<ListColumn> {
  if (typeof window === 'undefined') return new Set(LIST_COLUMNS)
  try {
    const raw = window.localStorage.getItem(listColumnsKey(userId))
    if (!raw) return new Set(LIST_COLUMNS)
    const parsed = JSON.parse(raw) as string[]
    return new Set(parsed.filter((c): c is ListColumn => LIST_COLUMNS.includes(c as ListColumn)))
  } catch {
    return new Set(LIST_COLUMNS)
  }
}

export function ListView({
  tasks,
  onOpenTask,
}: {
  tasks: Task[]
  onOpenTask: (id: string) => void
}) {
  const { projects, members, updateTaskStatus, currentUser, isFullAdmin } = useOrbit()
  const { go } = useNav()
  const { t: tr } = useI18n()
  const [query, setQuery] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [columns, setColumns] = useState<Set<ListColumn>>(() => loadListColumns(currentUser?.id))
  const [columnsOpen, setColumnsOpen] = useState(false)
  const columnsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) {
        setColumnsOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const toggleColumn = (col: ListColumn) => {
    setColumns((prev) => {
      const next = new Set(prev)
      if (next.has(col)) next.delete(col)
      else next.add(col)
      try {
        window.localStorage.setItem(listColumnsKey(currentUser?.id), JSON.stringify([...next]))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => {
        if (query && !t.name.toLowerCase().includes(query.toLowerCase())) return false
        if (projectFilter !== 'all' && t.projectId !== projectFilter) return false
        if (statusFilter !== 'all' && t.status !== statusFilter) return false
        if (departmentFilter !== 'all' && t.department !== departmentFilter) return false
        if (assigneeFilter !== 'all') {
          if (
            assigneeFilter === 'unassigned'
              ? t.assigneeIds.length > 0
              : !t.assigneeIds.includes(assigneeFilter)
          )
            return false
        }
        return true
      })
      // deadline soonest first; tasks with no deadline sort last
      .sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0
        if (!a.deadline) return 1
        if (!b.deadline) return -1
        return a.deadline.localeCompare(b.deadline)
      })
  }, [tasks, query, projectFilter, statusFilter, departmentFilter, assigneeFilter])

  const selectCls =
    'h-9 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground outline-none focus:border-primary'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr('output.list.searchPlaceholder')}
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
        <select className={selectCls} value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="all">{tr('output.list.projectAll')}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select className={selectCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">{tr('output.list.statusAll')}</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {tr(STATUS_KEY[s])}
            </option>
          ))}
        </select>
        <select className={selectCls} value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
          <option value="all">{tr('output.list.assigneeAll')}</option>
          <option value="unassigned">{tr('output.list.unassigned')}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName || m.name}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
        >
          <option value="all">{tr('output.list.departmentAll')}</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {tr(DEPARTMENT_KEY[d])}
            </option>
          ))}
        </select>
        <div className="relative ml-auto" ref={columnsRef}>
          <button
            type="button"
            onClick={() => setColumnsOpen((o) => !o)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            aria-expanded={columnsOpen}
          >
            <SlidersHorizontal className="size-3.5" />
            {tr('output.fields.button')}
          </button>
          {columnsOpen && (
            <div className="absolute right-0 top-full z-10 mt-1.5 w-44 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg animate-in fade-in slide-in-from-top-1">
              {LIST_COLUMNS.map((col) => {
                const checked = columns.has(col)
                return (
                  <button
                    key={col}
                    type="button"
                    onClick={() => toggleColumn(col)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded border',
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border-strong text-transparent',
                      )}
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    {tr(LIST_COLUMN_KEY[col])}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={filtered.length === 0}
          onClick={() => exportTasksToExcel(filtered, projects, members)}
        >
          <FileSpreadsheet className="size-4" />
          {tr('output.list.exportExcel')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">{tr('output.list.colTask')}</th>
              {columns.has('assignee') && <th className="px-4 py-2.5 font-medium">{tr('output.list.colAssignee')}</th>}
              {columns.has('project') && <th className="px-4 py-2.5 font-medium">{tr('output.list.colProject')}</th>}
              {columns.has('department') && <th className="px-4 py-2.5 font-medium">{tr('output.list.colDepartment')}</th>}
              {columns.has('deadline') && <th className="px-4 py-2.5 font-medium">{tr('output.list.colDeadline')}</th>}
              {columns.has('status') && <th className="px-4 py-2.5 font-medium">{tr('output.list.colStatus')}</th>}
              {columns.has('category') && <th className="px-4 py-2.5 font-medium">{tr('output.list.colCategory')}</th>}
              {columns.has('difficulty') && <th className="px-4 py-2.5 font-medium">{tr('output.list.colDifficulty')}</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const assignees = t.assigneeIds
                .map((id) => members.find((m) => m.id === id))
                .filter(Boolean) as typeof members
              const project = projects.find((p) => p.id === t.projectId)
              const overdue = isOverdue(t, currentUser?.timezone ?? DEFAULT_TIMEZONE)
              const isAssignee = currentUser ? t.assigneeIds.includes(currentUser.id) : false
              const taskReviewerIds = t.reviewerIds ?? (t.reviewerId ? [t.reviewerId] : [])
              const isReviewer = currentUser ? taskReviewerIds.includes(currentUser.id) : false
              // isReviewerだけでは非'done'ステータスへの変更許可にならない
              // (GAS側のupdateTaskStatusはisActingFullAdmin/担当者のみ許可) ため
              // canChangeには含めない。確認者専用の操作(承認)はタスク詳細
              // ドロワー側の専用ボタンで行う運用（item: 確認者権限判定の是正）
              const canChange = isFullAdmin || isAssignee
              const hasReviewers = taskReviewerIds.length > 0
              const statusOptions = allowedStatusOptions(isFullAdmin, isReviewer, hasReviewers)
              return (
                <tr
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-secondary/50"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    <TranslatedText text={t.name} />
                  </td>
                  {columns.has('assignee') && (
                    <td className="px-4 py-3">
                      {assignees.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {assignees.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                go({ name: 'person', id: m.id })
                              }}
                              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:underline"
                            >
                              <Avatar member={m} size={22} />
                              {m.displayName || m.name}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-amber-600">{tr('output.list.unassigned')}</span>
                      )}
                    </td>
                  )}
                  {columns.has('project') && (
                    <td className="px-4 py-3">
                      {project && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            go({ name: 'project', id: project.id })
                          }}
                          className="hover:underline"
                        >
                          <ProjectTag name={project.name} />
                        </button>
                      )}
                    </td>
                  )}
                  {columns.has('department') && (
                    <td className="px-4 py-3">
                      <DepartmentTag name={t.department} />
                    </td>
                  )}
                  {columns.has('deadline') && (
                    <td className={`px-4 py-3 tabular-nums ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {formatDeadline(t.deadline)}
                    </td>
                  )}
                  {columns.has('status') && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {canChange ? (
                        <select
                          value={t.status}
                          onChange={(e) => updateTaskStatus(t.id, e.target.value as TaskStatus)}
                          className="cursor-pointer rounded-md border border-transparent bg-transparent py-0.5 text-xs outline-none hover:border-border focus:border-border-strong"
                        >
                          {statusOptions.map((s) => (
                            <option key={s} value={s}>{tr(STATUS_KEY[s])}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">{tr(STATUS_KEY[t.status])}</span>
                      )}
                    </td>
                  )}
                  {columns.has('category') && (
                    <td className="px-4 py-3 text-muted-foreground"><TranslatedText text={t.category} /></td>
                  )}
                  {columns.has('difficulty') && (
                    <td className="px-4 py-3">
                      <DifficultyBadge difficulty={t.difficulty} />
                    </td>
                  )}
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={1 + columns.size} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {tr('output.list.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
