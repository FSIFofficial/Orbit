'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { KanbanBoard } from '../output/kanban-board'
import { CalendarView } from '../output/calendar-view'
import { TaskDetailDrawer } from '../output/task-detail-drawer'
import { Avatar } from '@/components/orbit/primitives'
import { isOverdue } from '@/lib/orbit/utils'
import { DEFAULT_TIMEZONE } from '@/lib/orbit/timezone'
import { cn } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'

type Tab = 'overview' | 'workflow' | 'calendar'

export function ProjectDetail({ id }: { id: string }) {
  const { getProject, visibleTasks: tasks, members, getProjectMembers, currentUser } = useOrbit()
  const { go } = useNav()
  const [tab, setTab] = useState<Tab>('overview')
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  const project = getProject(id)
  if (!project) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-muted-foreground">プロジェクトが見つかりません。</p>
      </div>
    )
  }

  const pt = tasks.filter((t) => t.projectId === id)
  const done = pt.filter((t) => t.status === 'done').length
  const waiting = pt.filter((t) => t.status === 'review').length
  const overdue = pt.filter((t) => isOverdue(t, currentUser?.timezone ?? DEFAULT_TIMEZONE)).length
  const completion = pt.length ? Math.round((done / pt.length) * 100) : 0
  const projMembers = getProjectMembers(id)
  const owner = members.find((m) => m.id === project.ownerId)

  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 py-6 sm:px-6 lg:px-8">
      <button
        onClick={() => go({ name: 'output' })}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        ワークスペースへ戻る
      </button>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-primary/60" />
              <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
            </div>
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{project.description}</p>
            {owner && (
              <button
                onClick={() => go({ name: 'person', id: owner.id })}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-secondary"
              >
                <Avatar member={owner} size={18} />
                <span className="text-muted-foreground">責任者:</span>
                {owner.displayName || owner.name}
              </button>
            )}
            <div className="mt-3 flex -space-x-1.5">
              {projMembers.slice(0, 6).map((m) => (
                <span key={m.id} className="rounded-full ring-2 ring-card">
                  <Avatar member={m} size={26} />
                </span>
              ))}
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tabular-nums">{completion}%</p>
            <p className="text-xs text-muted-foreground">完了率</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-5 flex items-center gap-1 border-b border-border">
        {(
          [
            ['overview', 'Overview'],
            ['workflow', 'Workflow'],
            ['calendar', 'Calendar'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'overview' && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="タスク総数" value={pt.length} />
              <Metric label="完了" value={done} />
              <Metric label="確認待ち" value={waiting} accent={waiting > 0 ? 'warning' : undefined} />
              <Metric label="期限超過" value={overdue} accent={overdue > 0 ? 'danger' : undefined} />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                メンバー
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {projMembers.map((m) => {
                  if (!m) return null
                  const count = pt.filter((t) => t.assigneeIds.includes(m.id)).length
                  return (
                    <button
                      key={m.id}
                      onClick={() => go({ name: 'person', id: m.id })}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-secondary/50"
                    >
                      <Avatar member={m} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m.displayName || m.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{m.affiliation}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{count}件</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
        {tab === 'workflow' && <KanbanBoard tasks={pt} onOpenTask={setOpenTaskId} />}
        {tab === 'calendar' && <CalendarView tasks={pt} onOpenTask={setOpenTaskId} />}
      </div>

      <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </div>
  )
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: 'warning' | 'danger'
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p
        className={cn(
          'text-2xl font-semibold tabular-nums',
          accent === 'warning' && 'text-amber-600',
          accent === 'danger' && 'text-destructive',
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
