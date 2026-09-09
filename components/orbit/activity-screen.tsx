'use client'

import { useMemo, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { useTaskDrawer } from '@/lib/orbit/task-drawer'
import { MessageSquare, TrendingUp, CheckCircle2, Filter } from 'lucide-react'
import { useI18n, type TranslationKey } from '@/lib/orbit/i18n'
import { STATUS_LABEL } from '@/lib/orbit/types'

type ActivityKind = 'all' | 'comment' | 'progress' | 'review'

const KIND_LABEL_KEY: Record<ActivityKind, TranslationKey> = {
  all: 'activity.filter.all',
  comment: 'activity.filter.comment',
  progress: 'activity.filter.progress',
  review: 'activity.filter.review',
}

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
      kind: 'comment' | 'progress' | 'review'
      taskId: string
      taskName: string
      text: string
      at: string
    }[] = []

    // ループ変数をtaskと名付ける(以前はtだったが、下のレビュー履歴で
    // useI18nのt()を呼ぶ必要があるため、翻訳関数のtとの衝突を避ける)
    visibleTasks.forEach((task) => {
      if (kind === 'all' || kind === 'comment') {
        task.comments?.forEach((c) => {
          if (memberId && c.byId !== memberId) return
          items.push({
            id: `c-${c.id}`,
            kind: 'comment',
            taskId: task.id,
            taskName: task.name,
            text: c.text,
            at: c.at,
          })
        })
      }
      if (kind === 'all' || kind === 'progress') {
        task.progressHistory?.forEach((p) => {
          if (memberId && p.byId !== memberId) return
          items.push({
            id: `p-${p.id}`,
            kind: 'progress',
            taskId: task.id,
            taskName: task.name,
            text: p.text,
            at: p.at,
          })
        })
      }
      // COM-004: レビュー履歴 — 確認待ち/完了へのステータス変更(task.history)
      // と、複数確認者の承認記録(task.reviewApprovals)を「レビュー」として
      // 統合表示する
      if (kind === 'all' || kind === 'review') {
        task.history?.forEach((h) => {
          if (h.field !== 'status') return
          if (h.to !== STATUS_LABEL.review && h.to !== STATUS_LABEL.done) return
          if (memberId && h.byId !== memberId) return
          items.push({
            id: `h-${h.id}`,
            kind: 'review',
            taskId: task.id,
            taskName: task.name,
            text: t('activity.review.statusChanged', { status: h.to }),
            at: h.at,
          })
        })
        task.reviewApprovals?.forEach((ra, i) => {
          if (memberId && ra.memberId !== memberId) return
          items.push({
            id: `ra-${task.id}-${i}`,
            kind: 'review',
            taskId: task.id,
            taskName: task.name,
            text: t('activity.review.approved'),
            at: ra.at,
          })
        })
      }
    })

    return items.sort((a, b) => b.at.localeCompare(a.at))
  }, [visibleTasks, kind, memberId, t])

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
        {(['all', 'comment', 'progress', 'review'] as ActivityKind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              kind === k
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-foreground hover:bg-secondary'
            }`}
          >
            {t(KIND_LABEL_KEY[k])}
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
                ) : a.kind === 'progress' ? (
                  <TrendingUp className="size-4 text-success" />
                ) : (
                  <CheckCircle2 className="size-4 text-[var(--status-review-fg)]" />
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
