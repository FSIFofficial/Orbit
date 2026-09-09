'use client'

import { useEffect, useMemo, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useI18n } from '@/lib/orbit/i18n'
import type { DailyReportEntry, DailyReportType } from '@/lib/orbit/types'
import { Loader2, RefreshCw } from 'lucide-react'

// REP-005: 管理者向けの日報・週報閲覧画面。経費申請のようにローカル
// stateにしか無くて他ブラウザから見えない、という状態を避けるため、
// 画面を開いたタイミング(と再読み込みボタン)で明示的にfetchDailyReports
// を呼び、常に最新のDailyReportsシートの内容を表示する。
export function AdminDailyReports() {
  const { fetchDailyReports, members, getMember } = useOrbit()
  const { t } = useI18n()
  const [reports, setReports] = useState<DailyReportEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [memberFilter, setMemberFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<'' | DailyReportType>('')
  const [dateFilter, setDateFilter] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    fetchDailyReports()
      .then((data) => setReports(data))
      .catch(() => setError(t('admin.dailyReports.loadFailed')))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const filtered = useMemo(
    () =>
      reports
        .filter((r) => !memberFilter || r.memberId === memberFilter)
        .filter((r) => !typeFilter || r.type === typeFilter)
        .filter((r) => !dateFilter || r.date === dateFilter)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [reports, memberFilter, typeFilter, dateFilter],
  )

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t('admin.dailyReports.title')}</h2>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          {t('admin.dailyReports.refresh')}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={memberFilter}
          onChange={(e) => setMemberFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">{t('admin.dailyReports.filterAllMembers')}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.displayName ?? m.name}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as '' | DailyReportType)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">{t('admin.dailyReports.filterAllTypes')}</option>
          <option value="daily">{t('dailyReport.type.daily')}</option>
          <option value="weekly">{t('dailyReport.type.weekly')}</option>
        </select>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        />
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}

      {!loading && filtered.length === 0 && !error && (
        <div className="py-12 text-center text-sm text-muted-foreground">{t('admin.dailyReports.empty')}</div>
      )}

      <div className="space-y-2">
        {filtered.map((r) => {
          const member = getMember(r.memberId)
          return (
            <div key={r.id} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>{member?.displayName ?? member?.name ?? r.memberId}</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                    {r.type === 'daily' ? t('dailyReport.type.daily') : t('dailyReport.type.weekly')} — {r.date}
                  </span>
                </div>
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
          )
        })}
      </div>
    </div>
  )
}
