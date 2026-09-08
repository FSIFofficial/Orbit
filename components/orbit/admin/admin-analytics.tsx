'use client'

import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { SectionLabel, Avatar } from '@/components/orbit/primitives'
import { DIFFICULTY_LABEL, type Member } from '@/lib/orbit/types'
import { useI18n } from '@/lib/orbit/i18n'
import { memberWorkloadCapacity, matchSkills, type WorkloadCapacity } from '@/lib/orbit/utils'

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

interface ScatterMapColumn<T> {
  header: string
  align?: 'left' | 'right'
  render: (point: T) => ReactNode
}

interface ScatterMapProps<T extends { member: Member; x: number; y: number }> {
  points: T[]
  // 省略時は既存ロジックと同様、点群のmax値から自動算出する
  xMax?: number
  yMax?: number
  axisLabel?: string
  tooltip: (point: T) => string
  hoverLabel: (point: T) => string
  columns: ScatterMapColumn<T>[]
  sortRows?: (a: T, b: T) => number
  maxRows?: number
}

// item 14の「スキル数×担当タスク数」散布図の描画部分（相対配置のドット・
// グリッド線・ホバー時のツールチップ・下部のテーブル）を、item 36で3つ目の
// 散布図が増えるにあたって共通コンポーネント化した。テーブルの列は散布図
// ごとに項目が異なるため、汎用的なcolumns定義で構成できるようにしている。
function ScatterMap<T extends { member: Member; x: number; y: number }>({
  points,
  xMax,
  yMax,
  axisLabel,
  tooltip,
  hoverLabel,
  columns,
  sortRows,
  maxRows = 10,
}: ScatterMapProps<T>) {
  const maxX = xMax ?? Math.max(1, ...points.map((p) => p.x))
  const maxY = yMax ?? Math.max(1, ...points.map((p) => p.y))
  const rows = (sortRows ? [...points].sort(sortRows) : points).slice(0, maxRows)
  return (
    <>
      <div className="relative mt-4 h-60 overflow-hidden rounded-md border border-border/40 bg-secondary/20">
        {[25, 50, 75].map((pct) => (
          <div key={pct} className="absolute left-0 right-0 border-t border-dashed border-border/30" style={{ top: `${pct}%` }} />
        ))}
        {[25, 50, 75].map((pct) => (
          <div key={pct} className="absolute top-0 bottom-0 border-l border-dashed border-border/30" style={{ left: `${pct}%` }} />
        ))}
        {points.map((p) => {
          const x = maxX > 0 ? (p.x / maxX) * 88 + 6 : 6
          const y = maxY > 0 ? 94 - (p.y / maxY) * 88 : 94
          return (
            <div
              key={p.member.id}
              className="group absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
              style={{ left: `${x}%`, top: `${y}%` }}
              title={tooltip(p)}
            >
              <Avatar member={p.member} size={22} />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[10px] text-background group-hover:block">
                {hoverLabel(p)}
              </div>
            </div>
          )
        })}
        {axisLabel && (
          <span className="absolute bottom-1 right-2 text-[9px] text-muted-foreground">{axisLabel}</span>
        )}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              {columns.map((c, i) => (
                <th
                  key={i}
                  className={`py-1 font-medium ${i < columns.length - 1 ? 'pr-3' : ''} ${c.align === 'right' ? 'text-right' : ''}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.member.id} className="border-t border-border/30">
                {columns.map((c, i) => (
                  <td
                    key={i}
                    className={`py-1 ${i < columns.length - 1 ? 'pr-3' : ''} ${c.align === 'right' ? 'text-right tabular-nums' : 'font-medium'}`}
                  >
                    {c.render(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// 分析ダッシュボード（人員構成・評価分布・スキル分布）— types.ts の Member
// に既存の evaluationHistory / skillLevels / affiliation / role を集計する
// だけで、新しいデータモデルの追加はしていない。班長など下位ロールは組織
// 全体の統計を見るべきではないので、他の組織全体設定（Members/Tags）と
// 同様に DEFAULT_NON_TOP_SECTIONS には含めていない（Admin → Tagsから
// 個別に許可することは可能）。
// 余力が大きいほど右（X軸の正方向）にするため、fullを0・availableを2とする
const CAPACITY_SCORE: Record<WorkloadCapacity, number> = { full: 0, normal: 1, available: 2 }

const CAPACITY_LABEL_KEY: Record<WorkloadCapacity, 'admin.analytics.capacityFit.capacity.full' | 'admin.analytics.capacityFit.capacity.normal' | 'admin.analytics.capacityFit.capacity.available'> = {
  full: 'admin.analytics.capacityFit.capacity.full',
  normal: 'admin.analytics.capacityFit.capacity.normal',
  available: 'admin.analytics.capacityFit.capacity.available',
}

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

  // 大学別人数（item 2: 大学名等の収集）。3人未満の大学は個別表示すると
  // 実質個人が特定できてしまうため、「その他」にまとめて集計する。
  const universityCountsRaw = new Map<string, number>()
  members.forEach((m) => {
    if (!m.university) return
    universityCountsRaw.set(m.university, (universityCountsRaw.get(m.university) ?? 0) + 1)
  })
  const universityCounts = new Map<string, number>()
  let universityOtherCount = 0
  universityCountsRaw.forEach((count, university) => {
    if (count < 3) {
      universityOtherCount += count
    } else {
      universityCounts.set(university, count)
    }
  })
  const universityRows = sortedCounts(universityCounts)
  if (universityOtherCount > 0) {
    universityRows.push([t('admin.analytics.university.other'), universityOtherCount])
  }
  const maxUniversity = Math.max(1, ...universityRows.map(([, c]) => c))

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
          x: m.skills.length + (m.skillLevels ?? []).length,
          y: activeTasks.length,
          completedCount: doneTasks.length,
          avgDifficulty,
        }
      }),
    [members, visibleTasks, allTasks],
  )

  // item 36 マップ1: スキル×経験数 — yearsOfExperience(自己申告)未設定の
  // メンバーはこのマップから除外する
  const skillExperiencePoints = useMemo(() =>
    members
      .filter((m) => !m.inactive && m.yearsOfExperience != null)
      .map((m) => ({
        member: m,
        x: m.skills.length + (m.skillLevels ?? []).length,
        y: m.yearsOfExperience!,
      })),
    [members],
  )

  // item 36 マップ2: 稼働余力×適合度 — 現在担当中のタスクが1件も無い
  // メンバーはこのマップから除外する（適合度が算出できないため）
  const capacityFitPoints = useMemo(() =>
    members
      .filter((m) => !m.inactive)
      .map((m) => {
        const activeTasks = visibleTasks.filter((t) => t.assigneeIds.includes(m.id) && t.status !== 'done')
        if (activeTasks.length === 0) return null
        const capacity = memberWorkloadCapacity(m.id, allTasks)
        const avgFit = activeTasks.reduce(
          (sum, t) => sum + matchSkills(t, m).length / Math.max(1, t.skills.length),
          0,
        ) / activeTasks.length
        return {
          member: m,
          x: CAPACITY_SCORE[capacity],
          y: avgFit,
          capacity,
        }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null),
    [members, visibleTasks, allTasks],
  )

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
        <SectionLabel>{t('admin.analytics.university.title')}</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">{t('admin.analytics.university.desc')}</p>
        {universityRows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('admin.analytics.university.empty')}</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2.5">
            {universityRows.map(([university, count]) => (
              <BarRow key={university} label={university} count={count} max={maxUniversity} />
            ))}
          </div>
        )}
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
        <ScatterMap
          points={scatterPoints}
          axisLabel={t('admin.analytics.scatter.axisLabel')}
          tooltip={(p) => t('admin.analytics.scatter.tooltip', { name: p.member.displayName || p.member.name, skillCount: p.x, taskCount: p.y })}
          hoverLabel={(p) => t('admin.analytics.scatter.hoverLabel', { name: p.member.displayName || p.member.name, count: p.y })}
          sortRows={(a, b) => a.y - b.y || b.x - a.x}
          columns={[
            { header: t('admin.analytics.scatter.colMember'), render: (p) => p.member.displayName || p.member.name },
            { header: t('admin.analytics.scatter.colSkillCount'), align: 'right', render: (p) => p.x },
            { header: t('admin.analytics.scatter.colActive'), align: 'right', render: (p) => p.y },
            { header: t('admin.analytics.scatter.colCompleted'), align: 'right', render: (p) => p.completedCount },
          ]}
        />
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <SectionLabel>{t('admin.analytics.skillExperience.title')}</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('admin.analytics.skillExperience.desc')}
        </p>
        {skillExperiencePoints.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('admin.analytics.skillExperience.empty')}</p>
        ) : (
          <ScatterMap
            points={skillExperiencePoints}
            axisLabel={t('admin.analytics.skillExperience.axisLabel')}
            tooltip={(p) => t('admin.analytics.skillExperience.tooltip', { name: p.member.displayName || p.member.name, skillCount: p.x, years: p.y })}
            hoverLabel={(p) => t('admin.analytics.skillExperience.hoverLabel', { name: p.member.displayName || p.member.name, years: p.y })}
            sortRows={(a, b) => b.y - a.y || b.x - a.x}
            columns={[
              { header: t('admin.analytics.scatter.colMember'), render: (p) => p.member.displayName || p.member.name },
              { header: t('admin.analytics.skillExperience.colSkillCount'), align: 'right', render: (p) => p.x },
              { header: t('admin.analytics.skillExperience.colYears'), align: 'right', render: (p) => p.y },
            ]}
          />
        )}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <SectionLabel>{t('admin.analytics.capacityFit.title')}</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('admin.analytics.capacityFit.desc')}
        </p>
        {capacityFitPoints.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('admin.analytics.capacityFit.empty')}</p>
        ) : (
          <ScatterMap
            points={capacityFitPoints}
            xMax={2}
            yMax={1}
            axisLabel={t('admin.analytics.capacityFit.axisLabel')}
            tooltip={(p) => t('admin.analytics.capacityFit.tooltip', { name: p.member.displayName || p.member.name, capacity: t(CAPACITY_LABEL_KEY[p.capacity]), fit: Math.round(p.y * 100) })}
            hoverLabel={(p) => t('admin.analytics.capacityFit.hoverLabel', { name: p.member.displayName || p.member.name, fit: Math.round(p.y * 100) })}
            sortRows={(a, b) => b.y - a.y || b.x - a.x}
            columns={[
              { header: t('admin.analytics.scatter.colMember'), render: (p) => p.member.displayName || p.member.name },
              { header: t('admin.analytics.capacityFit.colCapacity'), align: 'right', render: (p) => t(CAPACITY_LABEL_KEY[p.capacity]) },
              { header: t('admin.analytics.capacityFit.colFit'), align: 'right', render: (p) => `${Math.round(p.y * 100)}%` },
            ]}
          />
        )}
      </div>
    </div>
  )
}
