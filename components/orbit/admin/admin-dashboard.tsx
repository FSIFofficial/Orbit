'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useTaskDrawer } from '@/lib/orbit/task-drawer'
import { useToast } from '@/components/orbit/toast'
import { Avatar, ProjectTag } from '@/components/orbit/primitives'
import { isOverdue, daysSince, formatDeadline, computeProjectAutoHealth, computeAvgSkillPoints } from '@/lib/orbit/utils'
import { DEFAULT_TIMEZONE } from '@/lib/orbit/timezone'
import { STATUS_LABEL } from '@/lib/orbit/types'
import { useI18n } from '@/lib/orbit/i18n'
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
  Send,
  Award,
} from 'lucide-react'

export function AdminDashboard() {
  const {
    adminTasks: tasks,
    adminPendingTasks: pendingTasks,
    adminProjects,
    members,
    isFullAdmin,
    getProject,
    currentUser,
    updateProjectHealth,
    triggerOverdueReminders,
    awardSkillPoints,
  } = useOrbit()
  const { openTask } = useTaskDrawer()
  const toast = useToast()
  const { t: tr } = useI18n()
  const tz = currentUser?.timezone ?? DEFAULT_TIMEZONE
  // NTF-005: 期限超過リマインドの手動発火。連打で重複送信されないよう
  // 送信中はボタンをdisabledにする
  const [sendingReminders, setSendingReminders] = useState(false)

  const inProgress = tasks.filter((t) => t.status === 'progress')
  const needsSupport = tasks.filter((t) => t.status === 'support')
  const waiting = tasks.filter((t) => t.status === 'review')
  const overdue = tasks.filter((t) => isOverdue(t, tz))
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
  // SKL-014: 完了したがまだスキルポイントが付与されていないタスク
  const pendingPoints = tasks.filter(
    (t) => t.status === 'done' && (!t.awardedPoints || Object.keys(t.awardedPoints).length === 0),
  )

  // item 18: プロジェクト健全性の説明型ダッシュボード — per-project rollup
  // of the same signals above (期限超過/確認待ち/Blocked/負荷), so an admin
  // can see which project needs attention without opening every task.
  // item 26: 幹部による手動上書き(healthOverride)があれば自動判定より優先する。
  const projectHealth = adminProjects
    .map((p) => {
      const stats = computeProjectAutoHealth(p, tasks, tz)
      const health = p.healthOverride ?? stats.health
      return { project: p, ...stats, autoHealth: stats.health, health, isOverridden: !!p.healthOverride }
    })
    .filter((h) => h.pLoad > 0)
    .sort((a, b) => b.issues - a.issues)

  // item 20: 管理者ダッシュボードでのAIによる次アクション提案 — a
  // rule-based synthesis of the signals already on this page into short,
  // prioritized action sentences (same "fake AI" heuristic approach the
  // rest of this app uses, e.g. input-screen.tsx's parser)
  const nextActions: string[] = []
  if (overdue.length > 0) {
    nextActions.push(tr('admin.dashboard.nextActions.overdue', { count: overdue.length }))
  }
  if (blocked.length > 0) {
    nextActions.push(tr('admin.dashboard.nextActions.blocked', { count: blocked.length }))
  }
  if (staleReview.length > 0) {
    nextActions.push(tr('admin.dashboard.nextActions.staleReview', { count: staleReview.length }))
  }
  if (unassigned.length > 0) {
    nextActions.push(tr('admin.dashboard.nextActions.unassigned', { count: unassigned.length }))
  }
  const attentionProjects = projectHealth.filter((h) => h.health === 'attention')
  if (attentionProjects.length > 0) {
    nextActions.push(
      tr('admin.dashboard.nextActions.unhealthyProjects', {
        projects: attentionProjects.map((h) => h.project.name).join('、'),
      }),
    )
  }
  if (nextActions.length === 0) {
    nextActions.push(tr('admin.dashboard.nextActions.none'))
  }

  const metrics = [
    { label: tr('admin.dashboard.label.allTasks'), value: tasks.length, tone: 'neutral' as const },
    { label: tr('admin.dashboard.label.pending'), value: pendingTasks.length, tone: 'accent' as const },
    { label: tr('admin.dashboard.label.inProgress'), value: inProgress.length, tone: 'neutral' as const },
    { label: tr('admin.dashboard.label.needsSupport'), value: needsSupport.length, tone: 'warn' as const },
    { label: tr('admin.dashboard.label.waiting'), value: waiting.length, tone: 'warn' as const },
    { label: tr('admin.dashboard.label.overdue'), value: overdue.length, tone: 'danger' as const },
    { label: tr('admin.dashboard.label.unassigned'), value: unassigned.length, tone: 'accent' as const },
    { label: tr('admin.dashboard.label.blocked'), value: blocked.length, tone: 'danger' as const },
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
              ? tr('admin.dashboard.subtitle.full')
              : tr('admin.dashboard.subtitle.scoped')}
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
            {tr('admin.dashboard.exportAll')}
          </Button>
        )}
      </div>

      {/* 次アクション提案 (item 20) */}
      <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">{tr('admin.dashboard.nextActions.title')}</h2>
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
        <h2 className="text-sm font-semibold">{tr('admin.dashboard.attentionRequired')}</h2>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <AttentionGroup
            title={tr('admin.dashboard.label.pending')}
            icon={<FileClock className="size-4 text-primary" />}
            tasks={pendingTasks}
            renderMeta={(t) => getProject(t.projectId)?.name ?? ''}
            onOpen={openTask}
            getProject={getProject}
          />
          <AttentionGroup
            title={tr('admin.dashboard.label.needsSupport')}
            icon={<LifeBuoy className="size-4 text-[var(--status-support)]" />}
            tasks={needsSupport}
            renderMeta={(t) => getProject(t.projectId)?.name ?? ''}
            onOpen={openTask}
            getProject={getProject}
          />
          <AttentionGroup
            title={tr('admin.dashboard.label.waiting')}
            icon={<Clock className="size-4 text-[var(--status-review-fg)]" />}
            tasks={waiting}
            renderMeta={(t) => {
              const d = daysSince(t.lastActivity)
              return d && d > 0 ? tr('admin.dashboard.meta.waitingReviewDays', { days: d }) : tr('admin.dashboard.meta.waitingReview')
            }}
            onOpen={openTask}
            getProject={getProject}
          />
          <AttentionGroup
            title={tr('admin.dashboard.label.overdue')}
            icon={<CircleAlert className="size-4 text-destructive" />}
            tasks={overdue}
            renderMeta={(t) => tr('admin.dashboard.meta.deadline', { date: formatDeadline(t.deadline) })}
            onOpen={openTask}
            getProject={getProject}
            action={
              overdue.length > 0 ? (
                <button
                  disabled={sendingReminders}
                  onClick={async (e) => {
                    e.stopPropagation()
                    setSendingReminders(true)
                    try {
                      await triggerOverdueReminders()
                      toast(tr('admin.dashboard.overdueReminders.toast'))
                    } finally {
                      setSendingReminders(false)
                    }
                  }}
                  className="flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send className="size-3" />
                  {tr('admin.dashboard.overdueReminders.button')}
                </button>
              ) : undefined
            }
          />
          <AttentionGroup
            title={tr('admin.dashboard.label.unassigned')}
            icon={<UserX className="size-4 text-primary" />}
            tasks={unassigned}
            renderMeta={(t) => getProject(t.projectId)?.name ?? ''}
            onOpen={openTask}
            getProject={getProject}
          />
          <AttentionGroup
            title={tr('admin.dashboard.label.stale')}
            icon={<Activity className="size-4 text-muted-foreground" />}
            tasks={stale}
            renderMeta={(t) => tr('admin.dashboard.meta.staleDays', { days: daysSince(t.lastActivity) ?? 0 })}
            onOpen={openTask}
            getProject={getProject}
          />
          <AttentionGroup
            title={tr('admin.dashboard.label.blockedTasks')}
            icon={<Ban className="size-4 text-destructive" />}
            tasks={blocked}
            renderMeta={(t) => t.blocker?.note ?? ''}
            onOpen={openTask}
            getProject={getProject}
          />
        </div>
      </div>

      {/* SKL-014: 推定ポイントの承認待ち */}
      {pendingPoints.length > 0 && (
        <div className="mt-8">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Award className="size-4 text-muted-foreground" />
            {tr('admin.dashboard.pendingPoints.title')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {tr('admin.dashboard.pendingPoints.desc')}
          </p>
          <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {pendingPoints.slice(0, 6).map((t) => {
                const avgPoints = computeAvgSkillPoints(t, tasks)
                const finalPoints = Object.fromEntries(
                  t.skills.map((skill) => [skill, avgPoints[skill] ?? 10]),
                )
                const assigneeId = t.assigneeIds[0]
                return (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <button
                      onClick={() => openTask(t.id)}
                      className="min-w-0 flex-1 text-left transition-colors hover:text-primary"
                    >
                      <div className="truncate text-sm font-medium">{t.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <ProjectTag name={getProject(t.projectId)?.name ?? ''} />
                        <span>
                          {t.skills
                            .map((skill) => `${skill}: ${finalPoints[skill]}${tr('admin.dashboard.pendingPoints.pointsSuffix')}`)
                            .join('、')}
                        </span>
                      </div>
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!assigneeId}
                      onClick={() => {
                        if (!assigneeId) return
                        awardSkillPoints(t.id, assigneeId, finalPoints)
                        toast(tr('admin.dashboard.pendingPoints.awardedToast', { name: t.name }))
                      }}
                    >
                      <Award className="size-3.5" />
                      {tr('admin.dashboard.pendingPoints.approveButton')}
                    </Button>
                  </li>
                )
              })}
            </ul>
          </div>
          {pendingPoints.length > 6 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {tr('admin.dashboard.pendingPoints.moreCount', { count: pendingPoints.length - 6 })}
            </p>
          )}
        </div>
      )}

      {/* プロジェクト健全性 (item 18) */}
      {projectHealth.length > 0 && (
        <div className="mt-8">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <HeartPulse className="size-4 text-muted-foreground" />
            {tr('admin.dashboard.projectHealth.title')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {tr('admin.dashboard.projectHealth.desc')}
          </p>
          <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">{tr('admin.dashboard.projectHealth.colProject')}</th>
                  <th className="px-4 py-2.5 font-medium">{tr('admin.dashboard.projectHealth.colHealth')}</th>
                  <th className="px-4 py-2.5 font-medium">{tr('admin.dashboard.label.overdue')}</th>
                  <th className="px-4 py-2.5 font-medium">{tr('admin.dashboard.label.waiting')}</th>
                  <th className="px-4 py-2.5 font-medium">{tr('admin.dashboard.label.blocked')}</th>
                  <th className="px-4 py-2.5 font-medium">{tr('admin.dashboard.projectHealth.colLoad')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projectHealth.map((h) => (
                  <tr key={h.project.id}>
                    <td className="px-4 py-3 font-medium">{h.project.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${
                            h.health === 'good'
                              ? 'bg-primary-muted text-accent-foreground'
                              : h.health === 'watch'
                                ? 'bg-warning-muted text-warning'
                                : 'bg-destructive/10 text-destructive'
                          }`}
                        >
                          {h.health === 'good' ? tr('admin.dashboard.health.good') : h.health === 'watch' ? tr('admin.dashboard.health.watch') : tr('admin.dashboard.health.attention')}
                          {h.isOverridden && ` (${tr('admin.dashboard.health.overriddenSuffix')})`}
                        </span>
                        {isFullAdmin && (
                          <select
                            value={h.project.healthOverride ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              updateProjectHealth(h.project.id, v ? (v as 'good' | 'watch' | 'attention') : null)
                            }}
                            className="h-6 cursor-pointer rounded-md border border-border bg-background px-1 text-[11px] outline-none focus:border-primary"
                          >
                            <option value="">{tr('admin.dashboard.health.overrideAuto')}</option>
                            <option value="good">{tr('admin.dashboard.health.good')}</option>
                            <option value="watch">{tr('admin.dashboard.health.watch')}</option>
                            <option value="attention">{tr('admin.dashboard.health.attention')}</option>
                          </select>
                        )}
                      </div>
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
  action,
}: {
  title: string
  icon: React.ReactNode
  tasks: import('@/lib/orbit/types').Task[]
  renderMeta: (t: import('@/lib/orbit/types').Task) => string
  onOpen: (id: string) => void
  getProject: (id: string) => import('@/lib/orbit/types').Project | undefined
  action?: React.ReactNode
}) {
  const { t: tr } = useI18n()
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        {icon}
        <span className="text-sm font-medium">{title}</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
        {action}
      </div>
      {tasks.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">{tr('admin.dashboard.noneFound')}</div>
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
