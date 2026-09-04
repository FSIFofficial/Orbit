'use client'

import { useMemo } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { SectionLabel, Avatar } from '@/components/orbit/primitives'
import { DIFFICULTY_LABEL } from '@/lib/orbit/types'

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
        {suffix ?? `${count}人`}
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

  const roleCounts = new Map<string, number>()
  const affiliationCounts = new Map<string, number>()
  members.forEach((m) => {
    roleCounts.set(m.role, (roleCounts.get(m.role) ?? 0) + 1)
    const aff = m.affiliation || '未設定'
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
        メンバーの登録データから集計した人員構成・スキル・評価の分布です。データの入力は
        個人ページの「経歴・キャリア」タブ、または Admin → Members から行えます。
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <SectionLabel>人員構成（役職別）</SectionLabel>
          <div className="mt-4 flex flex-col gap-2.5">
            {roleRows.map(([role, count]) => (
              <BarRow key={role} label={role} count={count} max={maxRole} />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <SectionLabel>人員構成（所属別）</SectionLabel>
          <div className="mt-4 flex flex-col gap-2.5">
            {affiliationRows.map(([aff, count]) => (
              <BarRow key={aff} label={aff} count={count} max={maxAffiliation} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <SectionLabel>スキル分布（習熟度入力ベース）</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">
          個人ページの「経歴・キャリア」タブでスキルレベル（1〜5）を入力しているメンバーの
          集計です。人数はそのスキルを保有すると回答した人数、括弧内は習熟度の平均値です。
        </p>
        {skillRows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">まだ入力がありません。</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2.5">
            {skillRows.map(({ skill, count, avg }) => (
              <BarRow
                key={skill}
                label={skill}
                count={count}
                max={maxSkill}
                suffix={`${count}人（${avg.toFixed(1)}）`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <SectionLabel>評価分布（各メンバーの直近評価）</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">
          個人ページの「経歴・キャリア」タブに管理者が入力した評価履歴のうち、各メンバーの
          最新の評価を集計しています（評価データがあるメンバー: {evaluatedCount}人）。
        </p>
        {ratingRows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">まだ評価データがありません。</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2.5">
            {ratingRows.map(([rating, count]) => (
              <BarRow key={rating} label={rating} count={count} max={maxRating} />
            ))}
          </div>
        )}
      </div>

      {/* item 14: スキル×稼働量 散布図 */}
      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <SectionLabel>スキル数 × 担当中タスク数（稼働マップ）</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">
          横軸：スキル数（能力の幅）、縦軸：担当中タスク数（現在の稼働量）。
          右下ほど能力があって余力があるメンバーです。
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
                title={`${m.displayName || m.name}: スキル${skillCount} / 担当${activeTaskCount}件`}
              >
                <Avatar member={m} size={22} />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[10px] text-background group-hover:block">
                  {m.displayName || m.name} ({activeTaskCount}件)
                </div>
              </div>
            )
          })}
          <span className="absolute bottom-1 right-2 text-[9px] text-muted-foreground">スキル数 →</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3 font-medium">メンバー</th>
                <th className="py-1 pr-3 text-right font-medium">スキル数</th>
                <th className="py-1 pr-3 text-right font-medium">担当中</th>
                <th className="py-1 text-right font-medium">完了累計</th>
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
