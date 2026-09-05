'use client'

import { useMemo, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { useTaskDrawer } from '@/lib/orbit/task-drawer'
import { MessageSquare, TrendingUp, Filter } from 'lucide-react'
import { useI18n } from '@/lib/orbit/i18n'

type ActivityKind = 'all' | 'comment' | 'progress'

// item 6: 個人が発言したコメント・進捗報告を、タスクをまたいで横断的に一覧表示。
// currentUser の発言のみデフォルト表示。フィルタで他メンバーも見られる。
export function ActivityScreen() {
  const { currentUser, members, visibleTasks } = useOrbit()
  const { goBack } = useNav()
  const { openTask } = useTaskDrawer()
  const { t } = useI18n()
  const [kind, setKind] = useState<ActivityKind>('all')
  const [memberId, setMemberId] = useState(currentUser?.id ?? '')

  const activities = useMemo(() => {
    const items: {
      id: string
      kind: 'comment' | 'progress'
      taskId: string
      taskName: string
      text: string
      at: string
    }[] = []

    visibleTasks.forEach((t) => {
      if (kind !== 'progress') {
        t.comments?.forEach((c) => {
          if (memberId && c.byId !== memberId) return
          items.push({
            id: `c-${c.id}`,
            kind: 'comment',
            taskId: t.id,
            taskName: t.name,
            text: c.text,
            at: c.at,
          })
        })
      }
      if (kind !== 'comment') {
        t.progressHistory?.forEach((p) => {
          if (memberId && p.byId !== memberId) return
          items.push({
            id: `p-${p.id}`,
            kind: 'progress',
            taskId: t.id,
            taskName: t.name,
            text: p.text,
            at: p.at,
          })
        })
      }
    })

    return items.sort((a, b) => b.at.localeCompare(a.at))
  }, [visibleTasks, kind, memberId])

  const member = members.find((m) => m.id === memberId)

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2.5">
        <MessageSquare className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">{t('activity.title')}</h1>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Filter className="size-4 text-muted-foreground" />
        <select
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          className="h-8 rounded-lg border border-border bg-card px-2 text-sm outline-none focus:border-primary"
        >
          <option value="">{t('common.everyone')}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName || m.name}
            </option>
          ))}
        </select>
        {(['all', 'comment', 'progress'] as ActivityKind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              kind === k
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-foreground hover:bg-secondary'
            }`}
          >
            {k === 'all' ? t('activity.filter.all') : k === 'comment' ? t('activity.filter.comment') : t('activity.filter.progress')}
          </button>
        ))}
      </div>

      {activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <MessageSquare className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {member ? t('activity.emptyForMember', { name: member.displayName || member.name }) : t('activity.emptyGeneric')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activities.map((a) => (
            <button
              key={a.id}
              onClick={() => openTask(a.taskId)}
              className="flex w-full items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-secondary/50"
            >
              <div className="mt-0.5 shrink-0">
                {a.kind === 'comment' ? (
                  <MessageSquare className="size-4 text-primary" />
                ) : (
                  <TrendingUp className="size-4 text-success" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-muted-foreground">{a.taskName}</p>
                <p className="mt-0.5 line-clamp-2 text-sm">{a.text}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {a.at ? new Date(a.at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        <button onClick={goBack} className="text-sm text-muted-foreground hover:text-foreground">
          {t('activity.back')}
        </button>
      </div>
    </div>
  )
}
