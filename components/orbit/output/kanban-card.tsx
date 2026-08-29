'use client'

import type { Task } from '@/lib/orbit/types'
import { PRIORITY_LINE } from '@/lib/orbit/types'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { Avatar, DifficultyBadge, DepartmentTag } from '../primitives'
import { formatDeadline, deadlineLevel } from '@/lib/orbit/utils'
import { cn } from '@/lib/utils'
import { TriangleAlert } from 'lucide-react'

// タスクが増えてくるとスクロールが大変、というフィードバックを受けて
// 表示項目を選べるようにした（デフォルトは全項目表示）。タスク名は
// 常に表示され、それ以外はここでON/OFFできる
export type KanbanCardField = 'project' | 'assignee' | 'deadline' | 'category' | 'difficulty'
export const KANBAN_CARD_FIELDS: KanbanCardField[] = [
  'project',
  'assignee',
  'deadline',
  'category',
  'difficulty',
]
export const KANBAN_CARD_FIELD_LABEL: Record<KanbanCardField, string> = {
  project: 'プロジェクト',
  assignee: '担当者',
  deadline: '期限',
  category: 'カテゴリ',
  difficulty: '難易度',
}

export function KanbanCard({
  task,
  onClick,
  onDragStart,
  dragging,
  fields = new Set(KANBAN_CARD_FIELDS),
}: {
  task: Task
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
  dragging?: boolean
  fields?: Set<KanbanCardField>
}) {
  const { getMember, getProject, currentUser } = useOrbit()
  const { go } = useNav()
  const assignees = task.assigneeIds.map((id) => getMember(id)).filter(Boolean) as Array<
    NonNullable<ReturnType<typeof getMember>>
  >
  const project = getProject(task.projectId)
  const deadline = deadlineLevel(task)
  const urgent = deadline.level === 'overdue' || deadline.level === 'today'
  const soon = deadline.level === 'soon' || deadline.level === 'near'
  const showProject = fields.has('project')
  const showAssignee = fields.has('assignee')
  const showDeadline = fields.has('deadline')
  const showCategory = fields.has('category')
  const showDifficulty = fields.has('difficulty')
  const showMetaRow = showAssignee || showDeadline
  const showBottomRow = showCategory || showDifficulty
  const needsScheduleResponse =
    !!currentUser &&
    !!task.schedule?.invitedIds.includes(currentUser.id) &&
    task.schedule.candidates.some((c) => !task.schedule!.responses[currentUser.id]?.[c.id])

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      style={{ borderLeftColor: PRIORITY_LINE[task.priority], borderLeftWidth: 3 }}
      className={cn(
        'group cursor-pointer rounded-lg border border-border bg-card p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:border-border-strong hover:shadow-[0_2px_8px_rgba(16,24,40,0.07)]',
        urgent && 'border-danger-border bg-danger-muted/40',
        !urgent && soon && 'border-warning-border bg-warning-muted/30',
        dragging && 'opacity-40',
      )}
    >
      {showProject && (
        <div className="mb-2 flex items-center gap-1.5">
          <span className="size-1.5 shrink-0 rounded-full bg-primary/60" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              go({ name: 'project', id: task.projectId })
            }}
            className="truncate text-[11px] text-muted-foreground hover:text-foreground hover:underline"
          >
            {project?.name}
          </button>
          <span className="ml-auto shrink-0">
            <DepartmentTag name={task.department} />
          </span>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-sm font-medium leading-snug text-pretty">
        {task.name}
        {task.pendingApproval && (
          <span
            className="shrink-0 rounded-md bg-amber-50 px-1 py-0.5 text-[10px] font-semibold text-amber-700"
            title="管理者の承認待ちです。承認されるまで自分以外には表示されません"
          >
            承認待ち
          </span>
        )}
        {needsScheduleResponse && (
          <span
            className="shrink-0 rounded-md bg-primary-muted px-1 py-0.5 text-[10px] font-semibold text-primary"
            title="日程調整への回答が必要です"
          >
            要回答
          </span>
        )}
      </p>

      {showMetaRow && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {!showAssignee ? null : assignees.length > 0 ? (
              <div className="flex min-w-0 items-center gap-1">
                <div className="flex shrink-0 -space-x-1.5">
                  {assignees.slice(0, 3).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        go({ name: 'person', id: m.id })
                      }}
                      className="rounded-full ring-2 ring-card hover:z-10"
                    >
                      <Avatar member={m} size={20} />
                    </button>
                  ))}
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {assignees.map((m) => m.displayName || m.name).join('、')}
                </span>
              </div>
            ) : (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                未アサイン
              </span>
            )}
          </div>
          {showDeadline && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[11px]',
                urgent ? 'font-medium text-destructive' : soon ? 'font-medium text-warning' : 'text-muted-foreground',
              )}
            >
              {urgent && <TriangleAlert className="size-3" />}
              {formatDeadline(task.deadline)}
            </span>
          )}
        </div>
      )}

      {showBottomRow && (
        <div className="mt-2 flex items-center justify-between gap-2">
          {showCategory && (
            <span className="truncate text-[11px] text-muted-foreground">{task.category}</span>
          )}
          {showDifficulty && <DifficultyBadge difficulty={task.difficulty} />}
        </div>
      )}
    </div>
  )
}
