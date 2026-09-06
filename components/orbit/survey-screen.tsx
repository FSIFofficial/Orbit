'use client'

import { useState, useEffect } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { ArrowLeft, ClipboardList, Check, ChevronRight } from 'lucide-react'
import { useI18n } from '@/lib/orbit/i18n'

// item 22: メンバー体験定点測定（簡易アンケートフォーム）
// 回答はlocalStorageに保存し、管理者は記録を閲覧できる
// 仮決め: 質問項目は6つ固定（団体ごとのカスタマイズはadmin-tags等で将来対応）

interface SurveyQuestion {
  id: string
  text: string
  type: 'scale' | 'text'
  scaleMin?: string
  scaleMax?: string
}

function buildDefaultQuestions(t: (key: import('@/lib/orbit/i18n').TranslationKey) => string): SurveyQuestion[] {
  return [
    { id: 'q1', text: t('survey.q1.text'), type: 'scale', scaleMin: t('survey.q1.scaleMin'), scaleMax: t('survey.q1.scaleMax') },
    { id: 'q2', text: t('survey.q2.text'), type: 'scale', scaleMin: t('survey.q2.scaleMin'), scaleMax: t('survey.q2.scaleMax') },
    { id: 'q3', text: t('survey.q3.text'), type: 'scale', scaleMin: t('survey.q3.scaleMin'), scaleMax: t('survey.q3.scaleMax') },
    { id: 'q4', text: t('survey.q4.text'), type: 'scale', scaleMin: t('survey.q4.scaleMin'), scaleMax: t('survey.q4.scaleMax') },
    { id: 'q5', text: t('survey.q5.text'), type: 'scale', scaleMin: t('survey.q5.scaleMin'), scaleMax: t('survey.q5.scaleMax') },
    { id: 'q6', text: t('survey.q6.text'), type: 'text' },
  ]
}

interface SurveyResponse {
  id: string
  memberId: string
  at: string // ISO datetime
  answers: Record<string, number | string>
}

const SURVEY_STORAGE_KEY = 'orbit-survey-responses'

function loadResponses(memberId: string): SurveyResponse[] {
  try {
    const raw = localStorage.getItem(SURVEY_STORAGE_KEY)
    const all: SurveyResponse[] = raw ? JSON.parse(raw) : []
    return all.filter((r) => r.memberId === memberId)
  } catch {
    return []
  }
}

function saveResponse(response: SurveyResponse) {
  try {
    const raw = localStorage.getItem(SURVEY_STORAGE_KEY)
    const all: SurveyResponse[] = raw ? JSON.parse(raw) : []
    all.push(response)
    localStorage.setItem(SURVEY_STORAGE_KEY, JSON.stringify(all))
  } catch {}
}

function loadAllResponses(): SurveyResponse[] {
  try {
    const raw = localStorage.getItem(SURVEY_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function SurveyScreen() {
  const { currentUser, members, surveyInvitedIds } = useOrbit()
  const { go } = useNav()
  const { t } = useI18n()
  const DEFAULT_QUESTIONS = buildDefaultQuestions(t)
  const [mode, setMode] = useState<'form' | 'history' | 'admin'>('form')
  const [answers, setAnswers] = useState<Record<string, number | string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [myHistory, setMyHistory] = useState<SurveyResponse[]>([])
  const [allResponses, setAllResponses] = useState<SurveyResponse[]>([])

  const isAdmin = !!currentUser && currentUser.role !== '一般'
  // 招待制アンケート: invitedIdsが空なら全員回答可。管理者は設定のため常にアクセス可
  const isInvited =
    surveyInvitedIds.length === 0 || isAdmin || (!!currentUser && surveyInvitedIds.includes(currentUser.id))

  useEffect(() => {
    if (!currentUser) return
    setMyHistory(loadResponses(currentUser.id))
    if (isAdmin) setAllResponses(loadAllResponses())
  }, [currentUser, isAdmin])

  const canSubmit = DEFAULT_QUESTIONS
    .filter((q) => q.type === 'scale')
    .every((q) => answers[q.id] !== undefined)

  const handleSubmit = () => {
    if (!currentUser || !canSubmit) return
    const response: SurveyResponse = {
      id: `survey-${Date.now()}`,
      memberId: currentUser.id,
      at: new Date().toISOString(),
      answers,
    }
    saveResponse(response)
    setMyHistory((prev) => [...prev, response])
    if (isAdmin) setAllResponses((prev) => [...prev, response])
    setSubmitted(true)
    setAnswers({})
  }

  const memberName = (id: string) => {
    const m = members.find((m) => m.id === id)
    return m ? (m.displayName || m.name) : id
  }

  if (!isInvited) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <button
          onClick={() => go({ name: 'output' })}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t('survey.back')}
        </button>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <ClipboardList className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">{t('survey.notInvited')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <button
        onClick={() => go({ name: 'output' })}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('survey.back')}
      </button>

      <div className="mb-5 flex items-center gap-2.5">
        <ClipboardList className="size-5 text-primary" />
        <h1 className="text-lg font-semibold">{t('survey.title')}</h1>
      </div>

      <div className="mb-5 flex gap-1 border-b border-border">
        {([['form', t('survey.tab.form')], ['history', t('survey.tab.history')]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setMode(key); setSubmitted(false) }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              mode === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
        {isAdmin && (
          <button
            onClick={() => { setMode('admin'); setSubmitted(false) }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'admin' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('survey.tab.admin')}
          </button>
        )}
      </div>

      {mode === 'form' && !submitted && (
        <div className="space-y-5">
          {DEFAULT_QUESTIONS.map((q) => (
            <div key={q.id} className="rounded-xl border border-border bg-card p-4">
              <p className="mb-3 text-sm font-medium">{q.text}</p>
              {q.type === 'scale' ? (
                <div className="space-y-2">
                  <div className="flex justify-between gap-1">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                        className={`flex-1 rounded-lg border py-2 text-sm font-semibold transition-colors ${
                          answers[q.id] === v
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border hover:border-primary/40 hover:bg-secondary'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{q.scaleMin}</span>
                    <span>{q.scaleMax}</span>
                  </div>
                </div>
              ) : (
                <textarea
                  value={(answers[q.id] as string) ?? ''}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  rows={3}
                  placeholder={t('survey.textPlaceholder')}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              )}
            </div>
          ))}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
          >
            {t('survey.submit')}
          </button>
        </div>
      )}

      {mode === 'form' && submitted && (
        <div className="flex flex-col items-center gap-3 py-12">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Check className="size-6 text-primary" />
          </div>
          <p className="text-base font-semibold">{t('survey.submitted.title')}</p>
          <p className="text-sm text-muted-foreground">{t('survey.submitted.desc')}</p>
          <button
            onClick={() => setSubmitted(false)}
            className="mt-2 rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
          >
            {t('survey.submitAgain')}
          </button>
        </div>
      )}

      {mode === 'history' && (
        <div className="space-y-3">
          {myHistory.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('survey.history.empty')}</p>
          ) : (
            myHistory
              .slice()
              .reverse()
              .map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                  <p className="mb-3 text-xs text-muted-foreground">
                    {new Date(r.at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                  <div className="space-y-2">
                    {DEFAULT_QUESTIONS.filter((q) => r.answers[q.id] !== undefined).map((q) => (
                      <div key={q.id} className="flex items-start gap-2 text-sm">
                        <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-muted-foreground">{q.text.slice(0, 20)}…</span>
                        <span className="ml-auto font-medium">
                          {q.type === 'scale' ? t('survey.scaleScore', { score: r.answers[q.id] as number }) : (r.answers[q.id] as string || '—')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
          )}
        </div>
      )}

      {mode === 'admin' && isAdmin && (
        <div className="space-y-3">
          {allResponses.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('survey.admin.empty')}</p>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="mb-3 text-sm font-semibold">{t('survey.admin.avgScoreTitle')}</p>
                {DEFAULT_QUESTIONS.filter((q) => q.type === 'scale').map((q) => {
                  const vals = allResponses
                    .map((r) => r.answers[q.id] as number)
                    .filter((v) => typeof v === 'number')
                  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
                  return (
                    <div key={q.id} className="mb-2 flex items-center gap-2">
                      <span className="w-48 truncate text-xs text-muted-foreground">{q.text.slice(0, 22)}…</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(avg / 5) * 100}%` }} />
                      </div>
                      <span className="w-10 text-right text-xs tabular-nums">{avg.toFixed(1)} / 5</span>
                    </div>
                  )
                })}
                <p className="mt-2 text-[10px] text-muted-foreground">{t('survey.admin.responseCount', { count: allResponses.length })}</p>
              </div>

              {allResponses
                .slice()
                .reverse()
                .map((r) => (
                  <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium">{memberName(r.memberId)}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.at).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {DEFAULT_QUESTIONS.filter((q) => r.answers[q.id] !== undefined).map((q) => (
                        <div key={q.id} className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground truncate max-w-48">{q.text.slice(0, 20)}…</span>
                          <span className="ml-auto font-medium">
                            {q.type === 'scale' ? t('survey.admin.scalePoint', { score: r.answers[q.id] as number }) : (r.answers[q.id] as string || '—')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
