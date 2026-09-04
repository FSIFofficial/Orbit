'use client'

import { useState, useEffect } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { ArrowLeft, ClipboardList, Check, ChevronRight } from 'lucide-react'

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

const DEFAULT_QUESTIONS: SurveyQuestion[] = [
  { id: 'q1', text: '今月の活動に全体的に満足していますか？', type: 'scale', scaleMin: '全く満足していない', scaleMax: '非常に満足している' },
  { id: 'q2', text: 'タスクや役割が自分のスキルや志向に合っていると感じますか？', type: 'scale', scaleMin: '全く合っていない', scaleMax: '非常に合っている' },
  { id: 'q3', text: 'チームメンバーとの連携や協力関係は良好ですか？', type: 'scale', scaleMin: '全く良くない', scaleMax: '非常に良い' },
  { id: 'q4', text: '成長や学習の機会があると感じますか？', type: 'scale', scaleMin: '全くない', scaleMax: '十分にある' },
  { id: 'q5', text: '団体への貢献度や参加意欲はどのくらいですか？', type: 'scale', scaleMin: '低い', scaleMax: '高い' },
  { id: 'q6', text: '自由記述：気になっていることや改善提案があれば書いてください', type: 'text' },
]

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
  const { currentUser, members } = useOrbit()
  const { go } = useNav()
  const [mode, setMode] = useState<'form' | 'history' | 'admin'>('form')
  const [answers, setAnswers] = useState<Record<string, number | string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [myHistory, setMyHistory] = useState<SurveyResponse[]>([])
  const [allResponses, setAllResponses] = useState<SurveyResponse[]>([])

  const isAdmin = !!currentUser && currentUser.role !== '一般'

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

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <button
        onClick={() => go({ name: 'output' })}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        ワークスペースへ戻る
      </button>

      <div className="mb-5 flex items-center gap-2.5">
        <ClipboardList className="size-5 text-primary" />
        <h1 className="text-lg font-semibold">メンバー体験アンケート</h1>
      </div>

      {/* タブ */}
      <div className="mb-5 flex gap-1 border-b border-border">
        {([['form', '回答する'], ['history', '過去の回答']] as const).map(([key, label]) => (
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
            全回答（管理者）
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
                  placeholder="任意記入"
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
            送信する
          </button>
        </div>
      )}

      {mode === 'form' && submitted && (
        <div className="flex flex-col items-center gap-3 py-12">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Check className="size-6 text-primary" />
          </div>
          <p className="text-base font-semibold">回答を送信しました</p>
          <p className="text-sm text-muted-foreground">ご協力ありがとうございます。</p>
          <button
            onClick={() => setSubmitted(false)}
            className="mt-2 rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
          >
            もう一度回答する
          </button>
        </div>
      )}

      {mode === 'history' && (
        <div className="space-y-3">
          {myHistory.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">回答がまだありません</p>
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
                          {q.type === 'scale' ? `${r.answers[q.id]} / 5` : (r.answers[q.id] as string || '—')}
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
            <p className="py-10 text-center text-sm text-muted-foreground">まだ回答がありません</p>
          ) : (
            <>
              {/* 平均スコアサマリー */}
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="mb-3 text-sm font-semibold">全体平均スコア</p>
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
                <p className="mt-2 text-[10px] text-muted-foreground">回答数: {allResponses.length}件</p>
              </div>

              {/* 個別回答一覧 */}
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
                            {q.type === 'scale' ? `${r.answers[q.id]}点` : (r.answers[q.id] as string || '—')}
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
