'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Task } from '@/lib/orbit/types'
import { useOrbit } from '@/lib/orbit/store'
import { Avatar } from '../primitives'
import { todayStr } from '@/lib/orbit/utils'
import { Button } from '@/components/ui/button'
import { ChevronRight, Calendar, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getCalendarToken,
  requestCalendarToken,
  isGoogleOAuthConfigured,
} from '@/lib/orbit/google-sheet-sync'
import { fetchCalendarEvents, createCalendarEvent, deleteCalendarEvent, type GCalEvent } from '@/lib/orbit/google-calendar'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

type CalView = 'month' | 'week' | 'day'

// ---- Google Calendar hook --------------------------------------------------

function useGCalEvents(year: number, month: number, weekStart?: Date, dayDate?: Date, view: CalView = 'month') {
  const [events, setEvents] = useState<GCalEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [hasToken, setHasToken] = useState(() => !!getCalendarToken())

  const load = useCallback(async (token: string) => {
    setLoading(true)
    try {
      let tMin: string, tMax: string
      if (view === 'month') {
        tMin = new Date(year, month, 1).toISOString()
        tMax = new Date(year, month + 1, 1).toISOString()
      } else if (view === 'week' && weekStart) {
        tMin = new Date(weekStart).toISOString()
        const end = new Date(weekStart)
        end.setDate(end.getDate() + 7)
        tMax = end.toISOString()
      } else if (view === 'day' && dayDate) {
        tMin = new Date(dayDate).toISOString()
        const end = new Date(dayDate)
        end.setDate(end.getDate() + 1)
        tMax = end.toISOString()
      } else {
        tMin = new Date(year, month, 1).toISOString()
        tMax = new Date(year, month + 1, 1).toISOString()
      }
      const data = await fetchCalendarEvents(token, tMin, tMax)
      setEvents(data)
    } catch {
      // token may have expired — clear so user can re-auth
      setHasToken(false)
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [year, month, view, weekStart, dayDate])

  useEffect(() => {
    const token = getCalendarToken()
    if (token) { setHasToken(true); load(token) }
  }, [load])

  const connect = async () => {
    try {
      const token = await requestCalendarToken()
      setHasToken(true)
      await load(token)
    } catch { /* user dismissed popup */ }
  }

  return { events, loading, hasToken, connect }
}

// ---- Helpers ---------------------------------------------------------------

function isoToDate(s: string) {
  // handles YYYY-MM-DD and full ISO
  return new Date(s.length === 10 ? s + 'T00:00:00' : s)
}

function gcalEventDate(e: GCalEvent): string {
  const raw = e.start.date ?? e.start.dateTime ?? ''
  return raw.slice(0, 10)
}

function gcalEventStartHour(e: GCalEvent): number {
  if (e.start.dateTime) return isoToDate(e.start.dateTime).getHours()
  return 0
}

function gcalEventEndHour(e: GCalEvent): number {
  if (e.end.dateTime) return Math.min(24, isoToDate(e.end.dateTime).getHours() + (isoToDate(e.end.dateTime).getMinutes() > 0 ? 1 : 0))
  return 24
}

// ---- Month view ------------------------------------------------------------

function MonthView({
  tasks,
  gcalEvents,
  view: _v,
  year,
  month,
  absentDates,
  onOpenTask,
  onDayClick,
  onToggleAbsent,
}: {
  tasks: Task[]
  gcalEvents: GCalEvent[]
  view: CalView
  year: number
  month: number
  absentDates: string[]
  onOpenTask: (id: string) => void
  onDayClick: (date: string) => void
  onToggleAbsent: (date: string) => void
}) {
  const { getMember } = useOrbit()
  const today = todayStr()

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

  const gcalByDay = useMemo(() => {
    const map = new Map<string, GCalEvent[]>()
    for (const e of gcalEvents) {
      const d = gcalEventDate(e)
      const arr = map.get(d) ?? []
      arr.push(e)
      map.set(d, arr)
    }
    return map
  }, [gcalEvents])

  const firstDay = new Date(year, month, 1)
  const startWeekday = firstDay.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const dateKey = (d: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  return (
    <>
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={cn('py-2 text-center text-xs font-medium', i === 0 ? 'text-danger' : i === 6 ? 'text-primary' : 'text-muted-foreground')}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const key = d ? dateKey(d) : `empty-${i}`
          const dayTasks = d ? byDay.get(dateKey(d)) ?? [] : []
          const dayGcal = d ? gcalByDay.get(dateKey(d)) ?? [] : []
          const isToday = d && dateKey(d) === today
          return (
            <div
              key={key}
              className={cn('min-h-[104px] border-b border-r border-border p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0', !d && 'bg-secondary/30', d && absentDates.includes(dateKey(d)) && 'bg-rose-50/50 dark:bg-rose-950/20')}
            >
              {d && (
                <>
                  <div className="mb-1 flex items-center gap-1">
                    <button
                      onClick={() => onDayClick(dateKey(d))}
                      className={cn('inline-flex size-6 items-center justify-center rounded-full text-xs hover:bg-secondary', isToday ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground')}
                    >
                      {d}
                    </button>
                    <button
                      onClick={() => onToggleAbsent(dateKey(d))}
                      title={absentDates.includes(dateKey(d)) ? '不在を解除' : '不在日として登録'}
                      className={cn('rounded px-1 text-[9px] transition-colors', absentDates.includes(dateKey(d)) ? 'bg-rose-100 text-rose-600 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-400' : 'text-transparent hover:text-muted-foreground hover:bg-secondary')}
                    >
                      {absentDates.includes(dateKey(d)) ? '不在' : '＋'}
                    </button>
                  </div>
                  <div className="space-y-1">
                    {dayGcal.slice(0, 2).map((e) => (
                      <a key={e.id} href={e.htmlLink ?? '#'} target="_blank" rel="noopener noreferrer"
                        className="flex w-full items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-1 text-left dark:border-blue-800 dark:bg-blue-950/30"
                      >
                        <span className="size-1.5 shrink-0 rounded-full bg-blue-400" />
                        <span className="truncate text-[11px] font-medium text-blue-700 dark:text-blue-300 leading-tight">{e.summary}</span>
                      </a>
                    ))}
                    {dayTasks.slice().sort((a, b) => (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99')).map((t) => {
                      const overdue = t.status !== 'done' && t.deadline! < today
                      const assignee = getMember(t.assigneeIds[0] ?? null)
                      return (
                        <button key={t.id} onClick={() => onOpenTask(t.id)}
                          className={cn('flex w-full items-center gap-1 rounded-md border px-1.5 py-1 text-left transition-colors', overdue ? 'border-danger-border bg-danger-muted hover:brightness-95' : 'border-border bg-secondary hover:bg-muted')}
                        >
                          <Avatar member={assignee} size={16} />
                          {t.dueTime && <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">{t.dueTime}</span>}
                          <span className="truncate text-[11px] font-medium leading-tight">{t.name}</span>
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
    </>
  )
}

// ---- Week view -------------------------------------------------------------

function WeekView({
  tasks,
  gcalEvents,
  weekStart,
  onOpenTask,
}: {
  tasks: Task[]
  gcalEvents: GCalEvent[]
  weekStart: Date
  onOpenTask: (id: string) => void
}) {
  const { getMember } = useOrbit()
  const today = todayStr()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.deadline) continue
      const arr = map.get(t.deadline) ?? []
      arr.push(t)
      map.set(t.deadline, arr)
    }
    return map
  }, [tasks])

  const gcalByDay = useMemo(() => {
    const map = new Map<string, GCalEvent[]>()
    for (const e of gcalEvents) {
      const d = gcalEventDate(e)
      const arr = map.get(d) ?? []
      arr.push(e)
      map.set(d, arr)
    }
    return map
  }, [gcalEvents])

  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

  return (
    <div className="overflow-auto orbit-scroll">
      <div className="grid" style={{ gridTemplateColumns: '3rem repeat(7, 1fr)', minWidth: 640 }}>
        {/* Header */}
        <div className="border-b border-r border-border" />
        {days.map((d, i) => {
          const ds = fmt(d)
          const isToday = ds === today
          return (
            <div key={i} className={cn('border-b border-r border-border py-2 text-center last:border-r-0', isToday && 'bg-primary-muted')}>
              <div className={cn('text-xs font-medium', i === 0 ? 'text-danger' : i === 6 ? 'text-primary' : 'text-muted-foreground')}>{WEEKDAYS[i]}</div>
              <div className={cn('mt-0.5 inline-flex size-6 items-center justify-center rounded-full text-sm font-semibold', isToday ? 'bg-primary text-primary-foreground' : '')}>{d.getDate()}</div>
            </div>
          )
        })}
        {/* Time rows */}
        {HOURS.map((h) => (
          <>
            <div key={`h-${h}`} className="border-r border-border pr-2 pt-1 text-right text-[10px] text-muted-foreground tabular-nums">{String(h).padStart(2,'0')}:00</div>
            {days.map((d, i) => {
              const ds = fmt(d)
              const dayTasks = tasksByDay.get(ds)?.filter((t) => {
                const h2 = t.dueTime ? parseInt(t.dueTime.slice(0, 2)) : -1
                return h2 === h
              }) ?? []
              const dayGcal = gcalByDay.get(ds)?.filter((e) => gcalEventStartHour(e) === h) ?? []
              return (
                <div key={`${i}-${h}`} className={cn('min-h-[40px] border-b border-r border-border p-0.5 last:border-r-0', fmt(d) === today && 'bg-primary-muted/30')}>
                  {dayGcal.map((e) => (
                    <a key={e.id} href={e.htmlLink ?? '#'} target="_blank" rel="noopener noreferrer"
                      className="mb-0.5 flex items-center gap-1 rounded bg-blue-100 px-1 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                    >
                      <span className="truncate">{e.summary}</span>
                    </a>
                  ))}
                  {dayTasks.map((t) => {
                    const assignee = getMember(t.assigneeIds[0] ?? null)
                    return (
                      <button key={t.id} onClick={() => onOpenTask(t.id)}
                        className="mb-0.5 flex w-full items-center gap-1 rounded bg-secondary px-1 py-0.5 text-left text-[10px] hover:bg-muted"
                      >
                        <Avatar member={assignee} size={12} />
                        <span className="truncate">{t.name}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </>
        ))}
      </div>
    </div>
  )
}

// ---- Day view --------------------------------------------------------------

function DayView({
  tasks,
  gcalEvents,
  date,
  onOpenTask,
}: {
  tasks: Task[]
  gcalEvents: GCalEvent[]
  date: Date
  onOpenTask: (id: string) => void
}) {
  const { getMember } = useOrbit()
  const ds = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
  const dayTasks = useMemo(() => tasks.filter((t) => t.deadline === ds), [tasks, ds])
  const dayGcal = useMemo(() => gcalEvents.filter((e) => gcalEventDate(e) === ds), [gcalEvents, ds])

  return (
    <div className="overflow-auto orbit-scroll">
      <div className="grid" style={{ gridTemplateColumns: '3rem 1fr', minWidth: 320 }}>
        {HOURS.map((h) => {
          const hTasks = dayTasks.filter((t) => (t.dueTime ? parseInt(t.dueTime.slice(0, 2)) : -1) === h)
          const hGcal = dayGcal.filter((e) => gcalEventStartHour(e) === h)
          return (
            <>
              <div key={`h-${h}`} className="border-r border-border pr-2 pt-1 text-right text-[10px] text-muted-foreground tabular-nums">{String(h).padStart(2,'0')}:00</div>
              <div key={`c-${h}`} className="min-h-[48px] border-b border-border p-1">
                {hGcal.map((e) => (
                  <a key={e.id} href={e.htmlLink ?? '#'} target="_blank" rel="noopener noreferrer"
                    className="mb-1 flex items-center gap-1 rounded-md bg-blue-100 px-2 py-1 text-xs text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                  >
                    <span className="font-medium">{e.summary}</span>
                    {e.start.dateTime && <span className="ml-auto text-[10px]">{isoToDate(e.start.dateTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>}
                  </a>
                ))}
                {hTasks.map((t) => {
                  const assignee = getMember(t.assigneeIds[0] ?? null)
                  return (
                    <button key={t.id} onClick={() => onOpenTask(t.id)}
                      className="mb-1 flex w-full items-center gap-2 rounded-md bg-secondary px-2 py-1 text-left text-xs hover:bg-muted"
                    >
                      <Avatar member={assignee} size={16} />
                      <span className="font-medium">{t.name}</span>
                      {t.dueTime && <span className="ml-auto text-[10px] text-muted-foreground">{t.dueTime}</span>}
                    </button>
                  )
                })}
              </div>
            </>
          )
        })}
      </div>
    </div>
  )
}

// ---- Main export -----------------------------------------------------------

export function CalendarView({
  tasks,
  onOpenTask,
}: {
  tasks: Task[]
  onOpenTask: (id: string) => void
}) {
  const { currentUser, updateAbsentDates } = useOrbit()
  const myAbsentDates = currentUser?.absentDates ?? []

  const toggleAbsent = useCallback(async (dateStr: string) => {
    if (!currentUser) return
    const token = getCalendarToken()
    if (myAbsentDates.includes(dateStr)) {
      updateAbsentDates(currentUser.id, myAbsentDates.filter((d) => d !== dateStr))
      // GCalのイベントは削除しない（手動削除に任せる — タイトルで検索が必要なため複雑）
    } else {
      updateAbsentDates(currentUser.id, [...myAbsentDates, dateStr])
      if (token) {
        try {
          await createCalendarEvent(token, { summary: `[Orbit] 不在`, startDate: dateStr })
        } catch { /* ignore — calendar sync is best-effort */ }
      }
    }
  }, [currentUser, myAbsentDates, updateAbsentDates])

  const initial = useMemo(() => {
    const withDeadline = tasks.find((t) => t.deadline)
    const d = withDeadline?.deadline ? new Date(withDeadline.deadline) : new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [calView, setCalView] = useState<CalView>('month')
  const [monthView, setMonthView] = useState(initial)
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date())
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay())
    d.setHours(0, 0, 0, 0)
    return d
  })

  const { events: gcalEvents, loading: gcalLoading, hasToken, connect } = useGCalEvents(
    monthView.year, monthView.month, weekStart, selectedDay, calView,
  )

  const moveMonth = (delta: number) => {
    let m = monthView.month + delta
    let y = monthView.year
    if (m < 0) { m = 11; y-- } else if (m > 11) { m = 0; y++ }
    setMonthView({ year: y, month: m })
  }

  const moveWeek = (delta: number) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + delta * 7)
    setWeekStart(d)
  }

  const moveDay = (delta: number) => {
    const d = new Date(selectedDay)
    d.setDate(d.getDate() + delta)
    setSelectedDay(d)
  }

  const goToday = () => {
    const n = new Date()
    setMonthView({ year: n.getFullYear(), month: n.getMonth() })
    setSelectedDay(new Date())
    const ws = new Date()
    ws.setDate(ws.getDate() - ws.getDay())
    ws.setHours(0, 0, 0, 0)
    setWeekStart(ws)
  }

  const headerLabel = () => {
    if (calView === 'month') return `${monthView.year}年${monthView.month + 1}月`
    if (calView === 'week') {
      const end = new Date(weekStart)
      end.setDate(end.getDate() + 6)
      return `${weekStart.getMonth() + 1}月${weekStart.getDate()}日 〜 ${end.getMonth() + 1}月${end.getDate()}日`
    }
    return `${selectedDay.getFullYear()}年${selectedDay.getMonth() + 1}月${selectedDay.getDate()}日（${WEEKDAYS[selectedDay.getDay()]}）`
  }

  const prev = () => { if (calView === 'month') moveMonth(-1); else if (calView === 'week') moveWeek(-1); else moveDay(-1) }
  const next = () => { if (calView === 'month') moveMonth(1); else if (calView === 'week') moveWeek(1); else moveDay(1) }

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={prev} aria-label="前へ">
            <ChevronRight className="size-4 rotate-180" />
          </Button>
          <h3 className="min-w-[160px] text-center text-sm font-semibold">{headerLabel()}</h3>
          <Button variant="outline" size="icon-sm" onClick={next} aria-label="次へ">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" className="h-7 px-2.5 text-xs" onClick={goToday}>今日</Button>
        </div>

        <div className="flex items-center gap-2">
          {/* View switcher */}
          <div className="flex rounded-lg border border-border">
            {(['month', 'week', 'day'] as CalView[]).map((v) => (
              <button key={v} onClick={() => setCalView(v)}
                className={cn('px-2.5 py-1 text-xs font-medium first:rounded-l-md last:rounded-r-md transition-colors',
                  calView === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary')}
              >
                {v === 'month' ? '月' : v === 'week' ? '週' : '日'}
              </button>
            ))}
          </div>

          {/* Google Calendar connect */}
          {isGoogleOAuthConfigured() && (
            hasToken ? (
              <button onClick={connect} title="Googleカレンダーを再読み込み"
                className={cn('flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300', gcalLoading && 'animate-pulse')}
              >
                <RefreshCw className={cn('size-3', gcalLoading && 'animate-spin')} />
                {gcalLoading ? '読み込み中...' : 'GCalと同期中'}
              </button>
            ) : (
              <button onClick={connect}
                className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary"
              >
                <Calendar className="size-3" />
                Googleカレンダーと連携
              </button>
            )
          )}
        </div>
      </div>

      {/* Body */}
      {calView === 'month' && (
        <MonthView
          tasks={tasks}
          gcalEvents={gcalEvents}
          view={calView}
          year={monthView.year}
          month={monthView.month}
          absentDates={myAbsentDates}
          onOpenTask={onOpenTask}
          onDayClick={(ds) => { setSelectedDay(new Date(ds + 'T00:00:00')); setCalView('day') }}
          onToggleAbsent={toggleAbsent}
        />
      )}
      {calView === 'week' && (
        <WeekView tasks={tasks} gcalEvents={gcalEvents} weekStart={weekStart} onOpenTask={onOpenTask} />
      )}
      {calView === 'day' && (
        <DayView tasks={tasks} gcalEvents={gcalEvents} date={selectedDay} onOpenTask={onOpenTask} />
      )}
    </div>
  )
}
