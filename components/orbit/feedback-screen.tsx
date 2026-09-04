'use client'

import { useState, useEffect } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { MessageSquare, Send, CheckCircle2 } from 'lucide-react'

const FORM_URL =
  'https://docs.google.com/forms/u/0/d/e/1FAIpQLSdiyZI93Tvf-lFOxy49H48mMh2MOgQCsxbZvkoQk07x_P-3sA/formResponse'

const CONTACT_TYPES = [
  '不具合の報告',
  '機能の改善要望',
  '新機能の提案',
  '使い方が分からない',
  'その他',
]

const SEVERITY_OPTIONS = [
  '今困っていて業務が止まっている',
  'できれば近いうちに直してほしい',
  '急ぎではないが伝えておきたい',
]

const REPLY_OPTIONS = ['返信してほしい', '返信は不要']

const FEATURE_OPTIONS = [
  'INPUT（タスク登録）',
  'OUTPUT（カンバン/カレンダー/リスト）',
  '個人ページ',
  'プロジェクトページ',
  'Admin – ダッシュボード',
  'Admin – 承認',
  'Admin – アサイン',
  'Admin – プロジェクト',
  'Admin – メンバー',
  'Admin – 分析',
  'Admin – タグ設定',
  'Admin – 組織図',
  'Admin – 検定',
  'Admin – レーダー',
  'Admin – 経費申請',
  'Admin – フォーム',
  'Admin – 人材DB',
  'その他',
]

const ORG_NAME_KEY = 'orbit_feedback_org_name'

export function FeedbackScreen() {
  const { currentUser } = useOrbit()
  const { goBack } = useNav()

  const [orgName, setOrgName] = useState('')
  const [yourName, setYourName] = useState('')
  const [contactType, setContactType] = useState('')
  const [features, setFeatures] = useState<string[]>([])
  const [detail, setDetail] = useState('')
  const [steps, setSteps] = useState('')
  const [severity, setSeverity] = useState('')
  const [wantReply, setWantReply] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(ORG_NAME_KEY) : null
    setOrgName(saved ?? '')
    if (currentUser) {
      setYourName(currentUser.displayName || currentUser.name)
      setEmail(currentUser.email ?? '')
    }
  }, [currentUser])

  const toggleFeature = (f: string) => {
    setFeatures((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contactType) { setError('ご連絡の種類を選択してください'); return }
    if (!detail.trim()) { setError('詳細を入力してください'); return }
    if (!severity) { setError('困り具合を選択してください'); return }
    if (!wantReply) { setError('返信希望を選択してください'); return }
    setError('')
    setSubmitting(true)

    if (orgName) {
      try { localStorage.setItem(ORG_NAME_KEY, orgName) } catch { /* ignore */ }
    }

    const body = new URLSearchParams()
    body.append('entry.1307138965', orgName)
    body.append('entry.25271577', yourName)
    body.append('entry.619897353', contactType)
    for (const f of features) body.append('entry.897435869', f)
    body.append('entry.2125058687', detail)
    body.append('entry.1872882494', steps)
    body.append('entry.1612805599', severity)
    body.append('entry.2009922288', wantReply)
    body.append('entry.956889890', email)

    try {
      await fetch(FORM_URL, { method: 'POST', mode: 'no-cors', body })
      setSubmitted(true)
    } catch {
      setError('送信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2 className="size-12 text-green-500" />
          <h2 className="text-xl font-semibold">送信しました。ありがとうございます！</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            フィードバックは開発チームに届けられます。返信を希望された場合は、
            できる限り対応いたします。
          </p>
          <button
            onClick={goBack}
            className="mt-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            戻る
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2.5">
        <MessageSquare className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">改善要望・フィードバック</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        不具合の報告・機能の改善要望・新機能の提案など、お気軽にお知らせください。
        いただいたフィードバックは開発の参考にさせていただきます。
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 団体名 */}
        <Field label="団体名" required>
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="例: ○○大学 △△サークル"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>

        {/* お名前 */}
        <Field label="お名前">
          <input
            value={yourName}
            onChange={(e) => setYourName(e.target.value)}
            placeholder="任意"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>

        {/* ご連絡の種類 */}
        <Field label="ご連絡の種類" required>
          <div className="flex flex-wrap gap-2">
            {CONTACT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setContactType(t)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  contactType === t
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-secondary'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        {/* 対象の機能・画面 */}
        <Field label="対象の機能・画面">
          <div className="flex flex-wrap gap-2">
            {FEATURE_OPTIONS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => toggleFeature(f)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  features.includes(f)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-secondary'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </Field>

        {/* 詳しく教えてください */}
        <Field label="詳しく教えてください" required>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="どんな問題が起きているか、どんな機能が欲しいかを具体的に教えてください"
            rows={5}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>

        {/* 再現手順 */}
        <Field label="再現手順（不具合の場合）">
          <textarea
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder="例: 1. ○○画面を開く 2. △△ボタンを押す 3. エラーが出る"
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>

        {/* 困り具合 */}
        <Field label="困り具合" required>
          <div className="space-y-2">
            {SEVERITY_OPTIONS.map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="radio"
                  name="severity"
                  value={s}
                  checked={severity === s}
                  onChange={() => setSeverity(s)}
                  className="size-4 accent-primary"
                />
                <span className="text-sm">{s}</span>
              </label>
            ))}
          </div>
        </Field>

        {/* 返信希望 */}
        <Field label="返信を希望しますか" required>
          <div className="flex gap-4">
            {REPLY_OPTIONS.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="wantReply"
                  value={r}
                  checked={wantReply === r}
                  onChange={() => setWantReply(r)}
                  className="size-4 accent-primary"
                />
                <span className="text-sm">{r}</span>
              </label>
            ))}
          </div>
        </Field>

        {/* 連絡先メールアドレス */}
        <Field label="連絡先メールアドレス">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="返信を希望する場合はご入力ください"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Send className="size-4" />
            {submitting ? '送信中…' : '送信する'}
          </button>
          <button
            type="button"
            onClick={goBack}
            className="rounded-lg border border-border px-4 py-2.5 text-sm transition-colors hover:bg-secondary"
          >
            キャンセル
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {children}
    </div>
  )
}
