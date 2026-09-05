'use client'

import { useMemo, useState } from 'react'
import { Search, FileSpreadsheet } from 'lucide-react'
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
import { useI18n, STATUS_KEY, DEPARTMENT_KEY } from '@/lib/orbit/i18n'
import { DEFAULT_TIMEZONE } from '@/lib/orbit/timezone'

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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto gap-1.5"
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
              <th className="px-4 py-2.5 font-medium">{tr('output.list.colAssignee')}</th>
              <th className="px-4 py-2.5 font-medium">{tr('output.list.colProject')}</th>
              <th className="px-4 py-2.5 font-medium">{tr('output.list.colDepartment')}</th>
              <th className="px-4 py-2.5 font-medium">{tr('output.list.colDeadline')}</th>
              <th className="px-4 py-2.5 font-medium">{tr('output.list.colStatus')}</th>
              <th className="px-4 py-2.5 font-medium">{tr('output.list.colCategory')}</th>
              <th className="px-4 py-2.5 font-medium">{tr('output.list.colDifficulty')}</th>
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
              const canChange = isFullAdmin || isAssignee || isReviewer
              const statusOptions = allowedStatusOptions(isFullAdmin, isReviewer)
              return (
                <tr
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-secondary/50"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    <TranslatedText text={t.name} />
                  </td>
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
                  <td className="px-4 py-3">
                    <DepartmentTag name={t.department} />
                  </td>
                  <td className={`px-4 py-3 tabular-nums ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {formatDeadline(t.deadline)}
                  </td>
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
                  <td className="px-4 py-3 text-muted-foreground">{t.category}</td>
                  <td className="px-4 py-3">
                    <DifficultyBadge difficulty={t.difficulty} />
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
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
