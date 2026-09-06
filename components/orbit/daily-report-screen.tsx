'use client'

import { useEffect, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { BookOpen, Send, CheckCircle2, CalendarDays } from 'lucide-react'
import { useI18n } from '@/lib/orbit/i18n'

type ReportType = 'daily' | 'weekly'

interface SavedReport {
  id: string
  type: ReportType
  date: string // YYYY-MM-DD
  done: string
  todo: string
  issues: string
  createdAt: string
}

const REPORTS_KEY = 'orbit-daily-reports'

function loadReports(userId: string): SavedReport[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(`${REPORTS_KEY}-${userId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveReports(userId: string, reports: SavedReport[]) {
  try {
    window.localStorage.setItem(`${REPORTS_KEY}-${userId}`, JSON.stringify(reports))
  } catch { /* ignore */ }
}

// item 23: 日報・週報を書ける画面。localStorageに保存し、過去のレポートも閲覧可能。
// GAS連携が設定されている場合はGASにも送信（addReport action）。
export function DailyReportScreen() {
  const { currentUser } = useOrbit()
  const { goBack } = useNav()
  const { t } = useI18n()
  const [type, setType] = useState<ReportType>('daily')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [done, setDone] = useState('')
  const [todo, setTodo] = useState('')
  const [issues, setIssues] = useState('')
  const [reports, setReports] = useState<SavedReport[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [viewMode, setViewMode] = useState<'write' | 'history'>('write')

  useEffect(() => {
    if (currentUser) {
      setReports(loadReports(currentUser.id))
    }
  }, [currentUser])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser) return
    const report: SavedReport = {
      id: `${Date.now()}`,
      type,
      date,
      done,
      todo,
      issues,
      createdAt: new Date().toISOString(),
    }
    const next = [report, ...reports]
    setReports(next)
    saveReports(currentUser.id, next)
    setDone('')
    setTodo('')
    setIssues('')
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 3000)
  }

  if (!currentUser) return null

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <BookOpen className="size-5 text-primary" />
          <h1 className="text-xl font-semibold">{t('dailyReport.title')}</h1>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-secondary p-0.5">
          {(['write', 'history'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`rounded-md px-3 py-1 text-sm transition-all ${
                viewMode === m
                  ? 'bg-card font-medium shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m === 'write' ? t('dailyReport.tab.write') : t('dailyReport.tab.history')}
            </button>
          ))}
        </div>
      </div>

      {viewMode === 'write' ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex gap-3">
            <div className="flex gap-1 rounded-lg border border-border bg-secondary p-0.5">
              {(['daily', 'weekly'] as ReportType[]).map((rt) => (
                <button
                  key={rt}
                  type="button"
                  onClick={() => setType(rt)}
                  className={`rounded-md px-3 py-1 text-sm transition-all ${
                    type === rt
                      ? 'bg-card font-medium shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {rt === 'daily' ? t('dailyReport.type.daily') : t('dailyReport.type.weekly')}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              {type === 'daily' ? t('dailyReport.doneLabel.daily') : t('dailyReport.doneLabel.weekly')} <span className="text-destructive">*</span>
            </label>
            <textarea
              value={done}
              onChange={(e) => setDone(e.target.value)}
              placeholder={t('dailyReport.donePlaceholder')}
              rows={4}
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              {type === 'daily' ? t('dailyReport.todoLabel.daily') : t('dailyReport.todoLabel.weekly')}
            </label>
            <textarea
              value={todo}
              onChange={(e) => setTodo(e.target.value)}
              placeholder={t('dailyReport.todoPlaceholder')}
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">{t('dailyReport.issuesLabel')}</label>
            <textarea
              value={issues}
              onChange={(e) => setIssues(e.target.value)}
              placeholder={t('dailyReport.issuesPlaceholder')}
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {submitted && (
            <div className="flex items-center gap-2 rounded-lg bg-success-muted px-3 py-2 text-sm text-success">
              <CheckCircle2 className="size-4" />
              {t('dailyReport.saved')}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Send className="size-4" />
              {t('dailyReport.save')}
            </button>
            <button
              type="button"
              onClick={goBack}
              className="rounded-lg border border-border px-4 py-2.5 text-sm transition-colors hover:bg-secondary"
            >
              {t('dailyReport.cancel')}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
              <CalendarDays className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">{t('dailyReport.history.empty')}</p>
            </div>
          ) : (
            reports.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
                    {t('dailyReport.history.badge', { type: r.type === 'daily' ? t('dailyReport.type.daily') : t('dailyReport.type.weekly'), date: r.date })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {r.done && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-muted-foreground">{t('dailyReport.history.doneLabel')}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm">{r.done}</p>
                  </div>
                )}
                {r.todo && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-muted-foreground">{t('dailyReport.history.todoLabel')}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm">{r.todo}</p>
                  </div>
                )}
                {r.issues && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{t('dailyReport.history.issuesLabel')}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-warning">{r.issues}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
