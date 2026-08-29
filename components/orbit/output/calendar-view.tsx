'use client'

import { useMemo, useState } from 'react'
import type { Task } from '@/lib/orbit/types'
import { useOrbit } from '@/lib/orbit/store'
import { Avatar } from '../primitives'
import { todayStr } from '@/lib/orbit/utils'
import { Button } from '@/components/ui/button'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export function CalendarView({
  tasks,
  onOpenTask,
}: {
  tasks: Task[]
  onOpenTask: (id: string) => void
}) {
  const { getMember } = useOrbit()
  // default to month containing the demo deadline (2026-09) or current
  const initial = useMemo(() => {
    const withDeadline = tasks.find((t) => t.deadline)
    const d = withDeadline?.deadline ? new Date(withDeadline.deadline) : new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [view, setView] = useState(initial)

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.deadline) continue
      const arr = map.get(t.deadline) ?? []
      arr.push(t)
      map.set(t.deadline, arr)
    }
    return map
  }, [tasks])

  const firstDay = new Date(view.year, view.month, 1)
  const startWeekday = firstDay.getDay()
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const today = todayStr()

  const cells: (number | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const dateKey = (d: number) =>
    `${view.year}-${String(view.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  const move = (delta: number) => {
    let m = view.month + delta
    let y = view.year
    if (m < 0) {
      m = 11
      y--
    } else if (m > 11) {
      m = 0
      y++
    }
    setView({ year: y, month: m })
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-base font-semibold">
          {view.year}年{view.month + 1}月
        </h3>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => move(-1)} aria-label="前の月">
            <ChevronRight className="size-4 rotate-180" />
          </Button>
          <Button
            variant="outline"
            className="h-7 px-2.5 text-xs"
            onClick={() => {
              const n = new Date()
              setView({ year: n.getFullYear(), month: n.getMonth() })
            }}
          >
            今月
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => move(1)} aria-label="次の月">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={cn(
              'py-2 text-center text-xs font-medium',
              i === 0 ? 'text-danger' : i === 6 ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const key = d ? dateKey(d) : `empty-${i}`
          const dayTasks = d ? byDay.get(dateKey(d)) ?? [] : []
          const isToday = d && dateKey(d) === today
          return (
            <div
              key={key}
              className={cn(
                'min-h-[104px] border-b border-r border-border p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0',
                !d && 'bg-secondary/30',
              )}
            >
              {d && (
                <>
                  <div
                    className={cn(
                      'mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs',
                      isToday ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {d}
                  </div>
                  <div className="space-y-1">
                    {dayTasks
                      .slice()
                      .sort((a, b) => (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99'))
                      .map((t) => {
                      const overdue = t.status !== 'done' && t.deadline! < today
                      const assignee = getMember(t.assigneeIds[0] ?? null)
                      return (
                        <button
                          key={t.id}
                          onClick={() => onOpenTask(t.id)}
                          className={cn(
                            'flex w-full items-center gap-1 rounded-md border px-1.5 py-1 text-left transition-colors',
                            overdue
                              ? 'border-danger-border bg-danger-muted hover:brightness-95'
                              : 'border-border bg-secondary hover:bg-muted',
                          )}
                        >
                          <Avatar member={assignee} size={16} />
                          {t.dueTime && (
                            <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                              {t.dueTime}
                            </span>
                          )}
                          <span className="truncate text-[11px] font-medium leading-tight">
                            {t.name}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
