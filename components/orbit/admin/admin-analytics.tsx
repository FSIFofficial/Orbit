'use client'

import { useMemo } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { SectionLabel, Avatar } from '@/components/orbit/primitives'
import { DIFFICULTY_LABEL } from '@/lib/orbit/types'
import { useI18n } from '@/lib/orbit/i18n'

function BarRow({
  label,
  count,
  max,
  suffix,
}: {
  label: string
  count: number
  max: number
  suffix?: string
}) {
  const { t } = useI18n()
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 shrink-0 truncate text-sm" title={label}>
        {label}
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {suffix ?? t('admin.analytics.peopleSuffix', { count })}
      </div>
    </div>
  )
}

function sortedCounts(map: Map<string, number>): [string, number][] {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
}

// 分析ダッシュボード（人員構成・評価分布・スキル分布）— types.ts の Member
// に既存の evaluationHistory / skillLevels / affiliation / role を集計する
// だけで、新しいデータモデルの追加はしていない。班長など下位ロールは組織
// 全体の統計を見るべきではないので、他の組織全体設定（Members/Tags）と
// 同様に DEFAULT_NON_TOP_SECTIONS には含めていない（Admin → Tagsから
// 個別に許可することは可能）。
export function AdminAnalytics() {
  const { members, visibleTasks, archivedTasks } = useOrbit()
  const { t } = useI18n()

  const roleCounts = new Map<string, number>()
  const affiliationCounts = new Map<string, number>()
  members.forEach((m) => {
    roleCounts.set(m.role, (roleCounts.get(m.role) ?? 0) + 1)
    const aff = m.affiliation || t('admin.analytics.unset')
    affiliationCounts.set(aff, (affiliationCounts.get(aff) ?? 0) + 1)
  })
  const roleRows = sortedCounts(roleCounts)
  const affiliationRows = sortedCounts(affiliationCounts)

  const skillCounts = new Map<string, number>()
  const skillLevelSum = new Map<string, number>()
  members.forEach((m) => {
    ;(m.skillLevels ?? []).forEach((sl) => {
      skillCounts.set(sl.skill, (skillCounts.get(sl.skill) ?? 0) + 1)
      skillLevelSum.set(sl.skill, (skillLevelSum.get(sl.skill) ?? 0) + sl.level)
    })
  })
  const skillRows = sortedCounts(skillCounts).map(([skill, count]) => ({
    skill,
    count,
    avg: skillLevelSum.get(skill)! / count,
  }))

  const ratingCounts = new Map<string, number>()
  let evaluatedCount = 0
  members.forEach((m) => {
    const history = m.evaluationHistory ?? []
    if (history.length === 0) return
    const latest = [...history].sort((a, b) => b.date.localeCompare(a.date))[0]
    ratingCounts.set(latest.rating, (ratingCounts.get(latest.rating) ?? 0) + 1)
    evaluatedCount += 1
  })
  const ratingRows = sortedCounts(ratingCounts)

  const maxRole = Math.max(1, ...roleRows.map(([, c]) => c))
  const maxAffiliation = Math.max(1, ...affiliationRows.map(([, c]) => c))
  const maxSkill = Math.max(1, ...skillRows.map((r) => r.count))
  const maxRating = Math.max(1, ...ratingRows.map(([, c]) => c))

  // item 14: メンバー別 スキル数×担当タスク数 散布図（稼働余力可視化）
  // x軸: スキル数（能力の幅）, y軸: 担当中タスク数（稼働量）
  const allTasks = useMemo(() => [...visibleTasks, ...archivedTasks], [visibleTasks, archivedTasks])
  const scatterPoints = useMemo(() =>
    members
      .filter((m) => !m.inactive)
      .map((m) => {
        const activeTasks = visibleTasks.filter((t) => t.assigneeIds.includes(m.id) && t.status !== 'done')
        const doneTasks = allTasks.filter((t) => t.assigneeIds.includes(m.id) && t.status === 'done')
        const avgDifficulty = doneTasks.length > 0
          ? doneTasks.reduce((sum, t) => sum + DIFFICULTY_LABEL.indexOf(t.difficulty), 0) / doneTasks.length
          : 0
        return {
          member: m,
          skillCount: m.skills.length + (m.skillLevels ?? []).length,
          activeTaskCount: activeTasks.length,
          completedCount: doneTasks.length,
          avgDifficulty,
        }
      }),
    [members, visibleTasks, allTasks],
  )
  const maxSkillCount = Math.max(1, ...scatterPoints.map((p) => p.skillCount))
  const maxTaskCount = Math.max(1, ...scatterPoints.map((p) => p.activeTaskCount))

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('admin.analytics.subtitle')}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <SectionLabel>{t('admin.analytics.roleComposition')}</SectionLabel>
          <div className="mt-4 flex flex-col gap-2.5">
            {roleRows.map(([role, count]) => (
              <BarRow key={role} label={role} count={count} max={maxRole} />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <SectionLabel>{t('admin.analytics.affiliationComposition')}</SectionLabel>
          <div className="mt-4 flex flex-col gap-2.5">
            {affiliationRows.map(([aff, count]) => (
              <BarRow key={aff} label={aff} count={count} max={maxAffiliation} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <SectionLabel>{t('admin.analytics.skillDistribution.title')}</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('admin.analytics.skillDistribution.desc')}
        </p>
        {skillRows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('admin.analytics.skillDistribution.empty')}</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2.5">
            {skillRows.map(({ skill, count, avg }) => (
              <BarRow
                key={skill}
                label={skill}
                count={count}
                max={maxSkill}
                suffix={t('admin.analytics.skillDistribution.suffix', { count, avg: avg.toFixed(1) })}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <SectionLabel>{t('admin.analytics.ratingDistribution.title')}</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('admin.analytics.ratingDistribution.desc', { count: evaluatedCount })}
        </p>
        {ratingRows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('admin.analytics.ratingDistribution.empty')}</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2.5">
            {ratingRows.map(([rating, count]) => (
              <BarRow key={rating} label={rating} count={count} max={maxRating} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <SectionLabel>{t('admin.analytics.scatter.title')}</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('admin.analytics.scatter.desc')}
        </p>
        <div className="relative mt-4 h-60 overflow-hidden rounded-md border border-border/40 bg-secondary/20">
          {[25, 50, 75].map((pct) => (
            <div key={pct} className="absolute left-0 right-0 border-t border-dashed border-border/30" style={{ top: `${pct}%` }} />
          ))}
          {[25, 50, 75].map((pct) => (
            <div key={pct} className="absolute top-0 bottom-0 border-l border-dashed border-border/30" style={{ left: `${pct}%` }} />
          ))}
          {scatterPoints.map(({ member: m, skillCount, activeTaskCount }) => {
            const x = maxSkillCount > 0 ? (skillCount / maxSkillCount) * 88 + 6 : 6
            const y = maxTaskCount > 0 ? 94 - (activeTaskCount / maxTaskCount) * 88 : 94
            return (
              <div
                key={m.id}
                className="group absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                style={{ left: `${x}%`, top: `${y}%` }}
                title={t('admin.analytics.scatter.tooltip', { name: m.displayName || m.name, skillCount, taskCount: activeTaskCount })}
              >
                <Avatar member={m} size={22} />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[10px] text-background group-hover:block">
                  {t('admin.analytics.scatter.hoverLabel', { name: m.displayName || m.name, count: activeTaskCount })}
                </div>
              </div>
            )
          })}
          <span className="absolute bottom-1 right-2 text-[9px] text-muted-foreground">{t('admin.analytics.scatter.axisLabel')}</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3 font-medium">{t('admin.analytics.scatter.colMember')}</th>
                <th className="py-1 pr-3 text-right font-medium">{t('admin.analytics.scatter.colSkillCount')}</th>
                <th className="py-1 pr-3 text-right font-medium">{t('admin.analytics.scatter.colActive')}</th>
                <th className="py-1 text-right font-medium">{t('admin.analytics.scatter.colCompleted')}</th>
              </tr>
            </thead>
            <tbody>
              {scatterPoints
                .sort((a, b) => a.activeTaskCount - b.activeTaskCount || b.skillCount - a.skillCount)
                .slice(0, 10)
                .map(({ member: m, skillCount, activeTaskCount, completedCount }) => (
                  <tr key={m.id} className="border-t border-border/30">
                    <td className="py-1 pr-3 font-medium">{m.displayName || m.name}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{skillCount}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{activeTaskCount}</td>
                    <td className="py-1 text-right tabular-nums">{completedCount}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
