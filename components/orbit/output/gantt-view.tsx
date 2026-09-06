'use client'

import { useMemo, useRef, useState } from 'react'
import type { Task } from '@/lib/orbit/types'
import { useOrbit } from '@/lib/orbit/store'
import { Avatar } from '@/components/orbit/primitives'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/orbit/i18n'
import { computeCriticalPath } from '@/lib/orbit/utils'

// ガントチャート（item 12）— depends_on_ids と due_date/startDate から描画。
// 1日 = DAY_PX px で水平スクロール。依存矢印は別途SVGでオーバーレイしていないが
// 依存元タスクは色を変えて視覚的に区別する。
const DAY_PX = 32
const ROW_H = 44

function toDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export function GanttView({
  tasks,
  onOpenTask,
}: {
  tasks: Task[]
  onOpenTask: (id: string) => void
}) {
  const { members, getProject } = useOrbit()
  const { t: tr } = useI18n()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [today] = useState(() => new Date())

  // 期限あるタスクのみ（開始日なければ期限-3日をデフォルト）
  const rows = useMemo(() => {
    return tasks
      .filter((t) => t.deadline)
      .map((t) => {
        const end = toDate(t.deadline)!
        const start = toDate(t.startDate) ?? new Date(end.getTime() - 3 * 86400000)
        return { task: t, start, end }
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime())
  }, [tasks])

  const minDate = useMemo(() => {
    if (rows.length === 0) return today
    const d = new Date(rows[0].start)
    d.setDate(d.getDate() - 3)
    return d
  }, [rows, today])

  const maxDate = useMemo(() => {
    if (rows.length === 0) {
      const d = new Date(today)
      d.setDate(d.getDate() + 30)
      return d
    }
    const last = rows.reduce((acc, r) => (r.end > acc ? r.end : acc), rows[0].end)
    const d = new Date(last)
    d.setDate(d.getDate() + 5)
    return d
  }, [rows, today])

  // クリティカルパスは表示中の全タスク（期限未設定のものも依存関係の
  // 一部として含む）を対象に計算し、実際にバーが描画される行だけを
  // ハイライトする
  const criticalTaskIds = useMemo(() => computeCriticalPath(tasks), [tasks])

  const totalDays = diffDays(minDate, maxDate)
  const totalWidth = totalDays * DAY_PX
  const todayOffset = diffDays(minDate, today) * DAY_PX

  // ヘッダー: 月ごとのラベル
  const monthLabels = useMemo(() => {
    const labels: { label: string; x: number; width: number }[] = []
    let cursor = new Date(minDate)
    cursor.setDate(1)
    while (cursor < maxDate) {
      const start = Math.max(0, diffDays(minDate, cursor)) * DAY_PX
      const next = new Date(cursor)
      next.setMonth(next.getMonth() + 1)
      const end = Math.min(totalDays, diffDays(minDate, next)) * DAY_PX
      labels.push({
        label: tr('gantt.monthLabel', { year: cursor.getFullYear(), month: cursor.getMonth() + 1 }),
        x: start,
        width: end - start,
      })
      cursor = next
    }
    return labels
  }, [minDate, maxDate, totalDays, tr])

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-20 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          {tr('gantt.noDeadline.title')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {tr('gantt.noDeadline.desc')}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {criticalTaskIds.size > 0 && (
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className="inline-block size-2.5 rounded-full ring-2 ring-offset-1 ring-amber-500 dark:ring-amber-400" />
          {tr('gantt.criticalPath.legend')}
        </div>
      )}
      <div className="flex">
        {/* 左ペイン: タスク名 */}
        <div className="w-60 shrink-0 border-r border-border">
          <div className="h-12 border-b border-border bg-secondary/50 px-3 py-2 text-xs font-medium text-muted-foreground">
            {tr('gantt.taskColumnHeader')}
          </div>
          {rows.map(({ task: t }) => {
            const assignees = t.assigneeIds
              .slice(0, 3)
              .map((id) => members.find((m) => m.id === id))
              .filter(Boolean) as typeof members
            return (
              <div
                key={t.id}
                style={{ height: ROW_H }}
                className="flex cursor-pointer items-center gap-2 border-b border-border/50 px-3 last:border-0 hover:bg-secondary/40"
                onClick={() => onOpenTask(t.id)}
              >
                <div className="flex -space-x-1.5">
                  {assignees.map((m) => (
                    <Avatar key={m.id} member={m} size={20} />
                  ))}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{t.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {getProject(t.projectId)?.name}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* 右ペイン: チャート（横スクロール） */}
        <div ref={scrollRef} className="overflow-x-auto orbit-scroll flex-1">
          <div style={{ width: totalWidth, minWidth: totalWidth }} className="relative">
            {/* ヘッダー: 月ラベル */}
            <div className="sticky top-0 z-10 flex h-12 items-end border-b border-border bg-secondary/50">
              {monthLabels.map((m) => (
                <div
                  key={m.label}
                  style={{ left: m.x, width: m.width }}
                  className="absolute bottom-0 overflow-hidden border-r border-border/50 px-2 pb-1 text-[11px] text-muted-foreground"
                >
                  {m.label}
                </div>
              ))}
            </div>

            {/* 縦グリッドライン（週ごと）と行 */}
            <div className="relative">
              {/* 今日ライン */}
              {todayOffset >= 0 && todayOffset <= totalWidth && (
                <div
                  className="absolute bottom-0 top-0 z-10 w-px bg-primary/60"
                  style={{ left: todayOffset }}
                />
              )}

              {rows.map(({ task: t, start, end }) => {
                const x = diffDays(minDate, start) * DAY_PX
                const w = Math.max(DAY_PX, diffDays(start, end) * DAY_PX)
                const isOverdue = end < today && t.status !== 'done'
                const isDone = t.status === 'done'
                const isCritical = criticalTaskIds.has(t.id)
                return (
                  <div
                    key={t.id}
                    style={{ height: ROW_H }}
                    className="relative flex items-center border-b border-border/30 last:border-0"
                  >
                    <button
                      onClick={() => onOpenTask(t.id)}
                      style={{ left: x, width: w }}
                      title={isCritical ? tr('gantt.criticalPath.tooltip') : undefined}
                      className={cn(
                        'absolute flex h-7 items-center overflow-hidden rounded-md px-2 text-[11px] font-medium text-white transition-opacity hover:opacity-90',
                        isDone
                          ? 'bg-success'
                          : isOverdue
                            ? 'bg-destructive'
                            : 'bg-primary',
                        isCritical && 'ring-2 ring-offset-1 ring-amber-500 dark:ring-amber-400',
                      )}
                    >
                      <span className="truncate">{t.name}</span>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
