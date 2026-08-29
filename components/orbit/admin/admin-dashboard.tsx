'use client'

import { useOrbit } from '@/lib/orbit/store'
import { useTaskDrawer } from '@/lib/orbit/task-drawer'
import { Avatar, ProjectTag } from '@/components/orbit/primitives'
import { isOverdue, daysSince, formatDeadline } from '@/lib/orbit/utils'
import { STATUS_LABEL } from '@/lib/orbit/types'
import { exportAllDataToExcel } from '@/lib/orbit/export-excel'
import { Button } from '@/components/ui/button'
import {
  CircleAlert,
  Clock,
  UserX,
  Activity,
  FileClock,
  LifeBuoy,
  Ban,
  Sparkles,
  HeartPulse,
  FileSpreadsheet,
} from 'lucide-react'

export function AdminDashboard() {
  const {
    adminTasks: tasks,
    adminPendingTasks: pendingTasks,
    adminProjects,
    members,
    isFullAdmin,
    getProject,
  } = useOrbit()
  const { openTask } = useTaskDrawer()

  const inProgress = tasks.filter((t) => t.status === 'progress')
  const needsSupport = tasks.filter((t) => t.status === 'support')
  const waiting = tasks.filter((t) => t.status === 'review')
  const overdue = tasks.filter((t) => isOverdue(t))
  const unassigned = tasks.filter((t) => t.assigneeIds.length === 0 && t.status !== 'done')
  const blocked = tasks.filter((t) => !!t.blocker && t.status !== 'done')
  const stale = tasks.filter((t) => {
    const d = daysSince(t.lastActivity)
    return t.status !== 'done' && d !== null && d >= 5
  })
  const staleReview = waiting.filter((t) => {
    const d = daysSince(t.lastActivity)
    return d !== null && d >= 3
  })

  // item 18: プロジェクト健全性の説明型ダッシュボード — per-project rollup
  // of the same signals above (期限超過/確認待ち/Blocked/負荷), so an admin
  // can see which project needs attention without opening every task
  const projectHealth = adminProjects
    .map((p) => {
      const pt = tasks.filter((t) => t.projectId === p.id)
      const pOverdue = pt.filter((t) => isOverdue(t)).length
      const pWaiting = pt.filter((t) => t.status === 'review').length
      const pBlocked = pt.filter((t) => !!t.blocker && t.status !== 'done').length
      const pLoad = pt.filter((t) => t.status !== 'done').length
      const issues = pOverdue + pWaiting + pBlocked
      const health: 'good' | 'watch' | 'attention' =
        issues === 0 ? 'good' : issues <= 2 ? 'watch' : 'attention'
      return { project: p, pOverdue, pWaiting, pBlocked, pLoad, issues, health }
    })
    .filter((h) => h.pLoad > 0)
    .sort((a, b) => b.issues - a.issues)

  // item 20: 管理者ダッシュボードでのAIによる次アクション提案 — a
  // rule-based synthesis of the signals already on this page into short,
  // prioritized action sentences (same "fake AI" heuristic approach the
  // rest of this app uses, e.g. input-screen.tsx's parser)
  const nextActions: string[] = []
  if (overdue.length > 0) {
    nextActions.push(`${overdue.length}件のタスクが期限超過しています。優先的に確認してください。`)
  }
  if (blocked.length > 0) {
    nextActions.push(`${blocked.length}件のタスクがブロックされています。担当者に状況を確認してください。`)
  }
  if (staleReview.length > 0) {
    nextActions.push(
      `${staleReview.length}件のタスクが確認待ちのまま3日以上経過しています。対応をお願いします。`,
    )
  }
  if (unassigned.length > 0) {
    nextActions.push(`${unassigned.length}件のタスクが未アサインです。Assignmentsから担当者を割り当ててください。`)
  }
  const attentionProjects = projectHealth.filter((h) => h.health === 'attention')
  if (attentionProjects.length > 0) {
    nextActions.push(
      `${attentionProjects.map((h) => h.project.name).join('、')}の健全性が低下しています。`,
    )
  }
  if (nextActions.length === 0) {
    nextActions.push('特に対応が必要な項目はありません。')
  }

  const metrics = [
    { label: '全タスク', value: tasks.length, tone: 'neutral' as const },
    { label: '承認待ち', value: pendingTasks.length, tone: 'accent' as const },
    { label: '進行中', value: inProgress.length, tone: 'neutral' as const },
    { label: 'サポート必要', value: needsSupport.length, tone: 'warn' as const },
    { label: '確認待ち', value: waiting.length, tone: 'warn' as const },
    { label: '期限超過', value: overdue.length, tone: 'danger' as const },
    { label: '未アサイン', value: unassigned.length, tone: 'accent' as const },
    { label: 'Blocked', value: blocked.length, tone: 'danger' as const },
  ]

  const toneClass: Record<string, string> = {
    neutral: 'text-foreground',
    warn: 'text-[var(--status-review-fg)]',
    danger: 'text-destructive',
    accent: 'text-primary',
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isFullAdmin
              ? '組織全体のタスク状況と、対応が必要な項目です。'
              : '担当プロジェクトのタスク状況と、対応が必要な項目です。'}
          </p>
        </div>
        {isFullAdmin && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => exportAllDataToExcel(tasks, adminProjects, members)}
          >
            <FileSpreadsheet className="size-4" />
            全データをExcel出力
          </Button>
        )}
      </div>

      {/* 次アクション提案 (item 20) */}
      <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">次にやるべきこと</h2>
        </div>
        <ul className="mt-2 flex flex-col gap-1.5">
          {nextActions.map((a, i) => (
            <li key={i} className="flex items-start gap-1.5 text-sm">
              <span className="mt-1 size-1 shrink-0 rounded-full bg-primary" />
              {a}
            </li>
          ))}
        </ul>
      </div>

      {/* Metric cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{m.label}</div>
            <div className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${toneClass[m.tone]}`}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Attention required */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold">対応が必要</h2>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <AttentionGroup
            title="承認待ち"
            icon={<FileClock className="size-4 text-primary" />}
            tasks={pendingTasks}
            renderMeta={(t) => getProject(t.projectId)?.name ?? ''}
            onOpen={openTask}
            getProject={getProject}
          />
          <AttentionGroup
            title="サポート必要"
            icon={<LifeBuoy className="size-4 text-[var(--status-support)]" />}
            tasks={needsSupport}
            renderMeta={(t) => getProject(t.projectId)?.name ?? ''}
            onOpen={openTask}
            getProject={getProject}
          />
          <AttentionGroup
            title="確認待ち"
            icon={<Clock className="size-4 text-[var(--status-review-fg)]" />}
            tasks={waiting}
            renderMeta={(t) => {
              const d = daysSince(t.lastActivity)
              return d && d > 0 ? `${d}日前から確認待ち` : '確認待ち'
            }}
            onOpen={openTask}
            getProject={getProject}
          />
          <AttentionGroup
            title="期限超過"
            icon={<CircleAlert className="size-4 text-destructive" />}
            tasks={overdue}
            renderMeta={(t) => `期限：${formatDeadline(t.deadline)}`}
            onOpen={openTask}
            getProject={getProject}
          />
          <AttentionGroup
            title="未アサイン"
            icon={<UserX className="size-4 text-primary" />}
            tasks={unassigned}
            renderMeta={(t) => getProject(t.projectId)?.name ?? ''}
            onOpen={openTask}
            getProject={getProject}
          />
          <AttentionGroup
            title="長期間進捗なし"
            icon={<Activity className="size-4 text-muted-foreground" />}
            tasks={stale}
            renderMeta={(t) => `${daysSince(t.lastActivity)}日間更新なし`}
            onOpen={openTask}
            getProject={getProject}
          />
          <AttentionGroup
            title="Blocked Tasks"
            icon={<Ban className="size-4 text-destructive" />}
            tasks={blocked}
            renderMeta={(t) => t.blocker?.note ?? ''}
            onOpen={openTask}
            getProject={getProject}
          />
        </div>
      </div>

      {/* プロジェクト健全性 (item 18) */}
      {projectHealth.length > 0 && (
        <div className="mt-8">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <HeartPulse className="size-4 text-muted-foreground" />
            プロジェクト健全性
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            期限超過・確認待ち・Blockedの件数から、対応が必要な度合いを示しています。
          </p>
          <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">プロジェクト</th>
                  <th className="px-4 py-2.5 font-medium">状態</th>
                  <th className="px-4 py-2.5 font-medium">期限超過</th>
                  <th className="px-4 py-2.5 font-medium">確認待ち</th>
                  <th className="px-4 py-2.5 font-medium">Blocked</th>
                  <th className="px-4 py-2.5 font-medium">進行中件数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projectHealth.map((h) => (
                  <tr key={h.project.id}>
                    <td className="px-4 py-3 font-medium">{h.project.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${
                          h.health === 'good'
                            ? 'bg-primary-muted text-accent-foreground'
                            : h.health === 'watch'
                              ? 'bg-warning-muted text-warning'
                              : 'bg-destructive/10 text-destructive'
                        }`}
                      >
                        {h.health === 'good' ? '良好' : h.health === 'watch' ? '注意' : '要対応'}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{h.pOverdue}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{h.pWaiting}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{h.pBlocked}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{h.pLoad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function AttentionGroup({
  title,
  icon,
  tasks,
  renderMeta,
  onOpen,
  getProject,
}: {
  title: string
  icon: React.ReactNode
  tasks: import('@/lib/orbit/types').Task[]
  renderMeta: (t: import('@/lib/orbit/types').Task) => string
  onOpen: (id: string) => void
  getProject: (id: string) => import('@/lib/orbit/types').Project | undefined
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        {icon}
        <span className="text-sm font-medium">{title}</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">該当なし</div>
      ) : (
        <ul className="divide-y divide-border">
          {tasks.slice(0, 4).map((t) => (
            <li key={t.id}>
              <button
                onClick={() => onOpen(t.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{renderMeta(t)}</div>
                </div>
                <ProjectTag name={getProject(t.projectId)?.name ?? ''} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
