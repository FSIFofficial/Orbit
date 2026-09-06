'use client'

import { useMemo } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { STATUS_LABEL } from '@/lib/orbit/types'
import { Crown, AlertTriangle, Users, TrendingUp, CheckCircle2, Clock, UserCheck } from 'lucide-react'
import { isOverdue, deadlineLevel } from '@/lib/orbit/utils'
import { DEFAULT_TIMEZONE } from '@/lib/orbit/timezone'
import { Avatar } from '@/components/orbit/primitives'
import { useI18n } from '@/lib/orbit/i18n'

// item 21: 幹部が見れるダッシュボードページ。
// 組織全体の運用状況（承認待ち・期限超過・停滞タスク・稼働率）を1画面で把握。
export function AdminLeadership() {
  const { visibleTasks, pendingTasks, members, projects, archivedTasks, currentUser } = useOrbit()
  const { go } = useNav()
  const { t } = useI18n()
  const tz = currentUser?.timezone ?? DEFAULT_TIMEZONE

  const stats = useMemo(() => {
    const all = [...visibleTasks, ...archivedTasks]
    const overdue = visibleTasks.filter((t) => isOverdue(t, tz) && t.status !== 'done')
    const reviewing = visibleTasks.filter((t) => t.status === 'review')
    const stale = visibleTasks.filter((t) => {
      if (t.status === 'done') return false
      const dl = deadlineLevel(t, tz)
      return dl.level === 'overdue'
    })
    const doneLast30 = all.filter((t) => {
      if (t.status !== 'done' || !t.completedDate) return false
      const d = new Date(t.completedDate)
      const now = new Date()
      return (now.getTime() - d.getTime()) < 30 * 86400000
    })
    const activeMembers = members.filter((m) => !m.inactive)
    const assignedMemberIds = new Set(visibleTasks.flatMap((t) => t.assigneeIds))
    const engagedCount = activeMembers.filter((m) => assignedMemberIds.has(m.id)).length

    return { overdue, reviewing, stale, doneLast30, activeMembers, engagedCount }
  }, [visibleTasks, archivedTasks, members, tz])

  // プロジェクト別進捗サマリー
  const projectSummaries = useMemo(() => {
    return projects
      .filter((p) => !p.archived)
      .map((p) => {
        const pt = visibleTasks.filter((t) => t.projectId === p.id)
        const done = pt.filter((t) => t.status === 'done').length
        const overdue = pt.filter((t) => isOverdue(t, tz) && t.status !== 'done').length
        const review = pt.filter((t) => t.status === 'review').length
        const pct = pt.length ? Math.round((done / pt.length) * 100) : 0
        return { project: p, total: pt.length, done, overdue, review, pct }
      })
      .filter((s) => s.total > 0)
      .sort((a, b) => b.overdue - a.overdue || a.pct - b.pct)
  }, [visibleTasks, projects, tz])

  // メンバー稼働ランキング（担当タスク数でソート）
  const memberRanking = useMemo(() => {
    return members
      .filter((m) => !m.inactive)
      .map((m) => {
        const myTasks = visibleTasks.filter((t) => t.assigneeIds.includes(m.id) && t.status !== 'done')
        const overdueCount = myTasks.filter((t) => isOverdue(t, tz)).length
        return { member: m, count: myTasks.length, overdueCount }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [members, visibleTasks, tz])

  // item 19: 後継者・候補者サジェスト
  // Will/Judgment/skillsのベクトル類似度で現役幹部に近いメンバーをサジェスト
  const successorSuggestions = useMemo(() => {
    const leaders = members.filter((m) => m.role !== '一般' && !m.inactive)
    if (leaders.length === 0) return []
    const nonLeaders = members.filter((m) => m.role === '一般' && !m.inactive)

    return leaders.slice(0, 5).map((leader) => {
      const leaderTags = new Set([...leader.will, ...leader.judgment, ...leader.skills])
      const candidates = nonLeaders
        .map((m) => {
          const tags = [...m.will, ...m.judgment, ...m.skills]
          const matches = tags.filter((t) => leaderTags.has(t))
          const score = leaderTags.size > 0 ? matches.length / leaderTags.size : 0
          return { member: m, matches, score }
        })
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
      return { leader, candidates }
    }).filter((s) => s.candidates.length > 0)
  }, [members])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <Crown className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">{t('admin.leadership.title')}</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={<AlertTriangle className="size-5 text-destructive" />}
          label={t('admin.leadership.kpi.overdue')}
          value={stats.overdue.length}
          sub={t('admin.leadership.kpi.countSuffix')}
          danger={stats.overdue.length > 0}
          onClick={() => go({ name: 'admin', section: 'approvals' })}
        />
        <KpiCard
          icon={<Clock className="size-5 text-warning" />}
          label={t('admin.leadership.kpi.reviewing')}
          value={stats.reviewing.length}
          sub={t('admin.leadership.kpi.countSuffix')}
          warn={stats.reviewing.length > 0}
        />
        <KpiCard
          icon={<CheckCircle2 className="size-5 text-success" />}
          label={t('admin.leadership.kpi.doneLast30')}
          value={stats.doneLast30.length}
          sub={t('admin.leadership.kpi.countSuffix')}
        />
        <KpiCard
          icon={<Users className="size-5 text-primary" />}
          label={t('admin.leadership.kpi.engagedMembers')}
          value={stats.engagedCount}
          sub={t('admin.leadership.kpi.ofMembers', { count: stats.activeMembers.length })}
        />
        <KpiCard
          icon={<TrendingUp className="size-5 text-muted-foreground" />}
          label={t('admin.leadership.kpi.pending')}
          value={pendingTasks.length}
          sub={t('admin.leadership.kpi.countSuffix')}
          warn={pendingTasks.length > 0}
          onClick={() => go({ name: 'admin', section: 'approvals' })}
        />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{t('admin.leadership.projectSummary.title')}</h3>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t('admin.leadership.projectSummary.colProject')}</th>
                <th className="px-4 py-2.5 font-medium text-center">{t('admin.leadership.projectSummary.colTasks')}</th>
                <th className="px-4 py-2.5 font-medium text-center">{t('admin.leadership.projectSummary.colCompletion')}</th>
                <th className="px-4 py-2.5 font-medium text-center">{t('admin.leadership.projectSummary.colReview')}</th>
                <th className="px-4 py-2.5 font-medium text-center">{t('admin.leadership.projectSummary.colOverdue')}</th>
              </tr>
            </thead>
            <tbody>
              {projectSummaries.map(({ project, total, done, overdue, review, pct }) => (
                <tr
                  key={project.id}
                  onClick={() => go({ name: 'project', id: project.id })}
                  className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-secondary/40"
                >
                  <td className="px-4 py-2.5 font-medium">{project.name}</td>
                  <td className="px-4 py-2.5 text-center text-muted-foreground">
                    {done}/{total}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                        {pct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {review > 0 ? (
                      <span className="rounded-full bg-warning-muted px-2 py-0.5 text-xs text-warning">
                        {review}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {overdue > 0 ? (
                      <span className="rounded-full bg-danger-muted px-2 py-0.5 text-xs text-danger">
                        {overdue}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {projectSummaries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {t('admin.leadership.projectSummary.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
          {t('admin.leadership.memberRanking.title')}
        </h3>
        <div className="space-y-1.5">
          {memberRanking.map(({ member: m, count, overdueCount }) => (
            <div
              key={m.id}
              onClick={() => go({ name: 'person', id: m.id })}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:bg-secondary/40"
            >
              <span className="w-32 truncate text-sm font-medium">{m.displayName || m.name}</span>
              <div className="flex-1">
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, (count / 10) * 100)}%` }}
                  />
                </div>
              </div>
              <span className="w-8 text-right text-sm tabular-nums">{count}</span>
              {overdueCount > 0 && (
                <span className="rounded-full bg-danger-muted px-2 py-0.5 text-xs text-danger">
                  {t('admin.leadership.memberRanking.overdue', { count: overdueCount })}
                </span>
              )}
            </div>
          ))}
          {memberRanking.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('admin.leadership.memberRanking.empty')}</p>
          )}
        </div>
      </div>

      {successorSuggestions.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <UserCheck className="size-4 text-primary" />
            <h3 className="text-sm font-semibold text-muted-foreground">{t('admin.leadership.successor.title')}</h3>
          </div>
          <div className="space-y-3">
            {successorSuggestions.map(({ leader, candidates }) => (
              <div key={leader.id} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Avatar member={leader} size={20} />
                  <span className="text-sm font-medium">{leader.displayName || leader.name}</span>
                  <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {leader.role}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {candidates.map(({ member: m, matches, score }) => (
                    <button
                      key={m.id}
                      onClick={() => go({ name: 'person', id: m.id })}
                      className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-left text-xs transition-colors hover:bg-secondary/60"
                    >
                      <Avatar member={m} size={18} />
                      <span className="font-medium">{m.displayName || m.name}</span>
                      <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                        {t('admin.leadership.successor.matchScore', { score: Math.round(score * 100) })}
                      </span>
                      <span className="truncate max-w-40 text-[10px] text-muted-foreground">
                        {matches.slice(0, 3).join(' / ')}
                        {matches.length > 3 && t('admin.leadership.successor.andOthers', { count: matches.length - 3 })}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  danger,
  warn,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: number
  sub: string
  danger?: boolean
  warn?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors ${
        danger
          ? 'border-destructive/30 bg-danger-muted'
          : warn
            ? 'border-warning/30 bg-warning-muted'
            : 'border-border bg-card'
      } ${onClick ? 'hover:border-border-strong cursor-pointer' : 'cursor-default'}`}
    >
      {icon}
      <div>
        <p className="text-2xl font-bold tabular-nums">
          {value}
          <span className="ml-1 text-sm font-normal text-muted-foreground">{sub}</span>
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </button>
  )
}
