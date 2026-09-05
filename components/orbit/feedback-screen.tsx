'use client'

import { useRef, useState, useEffect } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { MessageSquare, Send, CheckCircle2, ImagePlus, X } from 'lucide-react'
import { useI18n } from '@/lib/orbit/i18n'

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
  const { t } = useI18n()

  const [orgName, setOrgName] = useState('')
  const [yourName, setYourName] = useState('') // お名前は任意 — デフォルト空欄
  const [contactType, setContactType] = useState('')
  const [otherDetail, setOtherDetail] = useState('') // 「その他」選択時の追加テキスト
  const [features, setFeatures] = useState<string[]>([])
  const [detail, setDetail] = useState('')
  const [steps, setSteps] = useState('')
  const [severity, setSeverity] = useState('')
  const [wantReply, setWantReply] = useState('')
  const [email, setEmail] = useState('')
  const [screenshots, setScreenshots] = useState<{ name: string; dataUrl: string }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(ORG_NAME_KEY) : null
    setOrgName(saved ?? '')
  }, [])

  const addScreenshot = (file: File) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setScreenshots((prev) => [...prev, { name: file.name, dataUrl }])
    }
    reader.readAsDataURL(file)
  }

  const removeScreenshot = (i: number) => {
    setScreenshots((prev) => prev.filter((_, idx) => idx !== i))
  }

  const toggleFeature = (f: string) => {
    setFeatures((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contactType) { setError(t('feedback.error.contactType')); return }
    if (!detail.trim()) { setError(t('feedback.error.detail')); return }
    if (contactType === '不具合の報告' && !severity) { setError(t('feedback.error.severity')); return }
    if (!wantReply) { setError(t('feedback.error.wantReply')); return }
    setError('')
    setSubmitting(true)

    if (orgName) {
      try { localStorage.setItem(ORG_NAME_KEY, orgName) } catch { /* ignore */ }
    }

    // 「その他」の場合はその内容をcontactTypeとして送信
    const effectiveContactType = contactType === 'その他' && otherDetail.trim()
      ? `その他: ${otherDetail.trim()}`
      : contactType

    // スクリーンショット添付は現在Googleフォーム経由では未対応のため
    // ファイル名のみ詳細テキストに付記する
    const screenshotNote = screenshots.length > 0
      ? `\n\n[添付スクリーンショット: ${screenshots.map((s) => s.name).join(', ')}]`
      : ''

    const body = new URLSearchParams()
    body.append('entry.1307138965', orgName)
    body.append('entry.25271577', yourName)
    body.append('entry.619897353', effectiveContactType)
    for (const f of features) body.append('entry.897435869', f)
    body.append('entry.2125058687', detail + screenshotNote)
    body.append('entry.1872882494', steps)
    body.append('entry.1612805599', severity)
    body.append('entry.2009922288', wantReply)
    body.append('entry.956889890', email)

    try {
      await fetch(FORM_URL, { method: 'POST', mode: 'no-cors', body })
      setSubmitted(true)
    } catch {
      setError(t('feedback.error.submitFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2 className="size-12 text-green-500" />
          <h2 className="text-xl font-semibold">{t('feedback.done.title')}</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {t('feedback.done.body')}
          </p>
          <button
            onClick={goBack}
            className="mt-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t('header.back')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2.5">
        <MessageSquare className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">{t('feedback.title')}</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        {t('feedback.description')}
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 団体名 */}
        <Field label={t('feedback.field.orgName')} required>
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder={t('feedback.orgName.placeholder')}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>

        {/* お名前 */}
        <Field label={t('feedback.field.yourName')}>
          <input
            value={yourName}
            onChange={(e) => setYourName(e.target.value)}
            placeholder={t('feedback.optional')}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>

        {/* ご連絡の種類 */}
        <Field label={t('feedback.field.contactType')} required>
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
          {/* 「その他」選択時にテキストボックスを表示 */}
          {contactType === 'その他' && (
            <input
              value={otherDetail}
              onChange={(e) => setOtherDetail(e.target.value)}
              placeholder={t('feedback.otherDetail.placeholder')}
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          )}
        </Field>

        {/* 対象の機能・画面 */}
        <Field label={t('feedback.field.targetFeature')}>
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
        <Field label={t('feedback.field.detail')} required>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={t('feedback.detail.placeholder')}
            rows={5}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>

        {/* スクリーンショット */}
        <Field label={t('feedback.field.screenshot')}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              Array.from(e.target.files ?? []).forEach(addScreenshot)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-dashed border-border-strong bg-secondary/40 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ImagePlus className="size-4" />
            {t('feedback.addImage')}
          </button>
          {screenshots.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-3">
              {screenshots.map((s, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.dataUrl}
                    alt={s.name}
                    className="h-20 w-20 rounded-lg border border-border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeScreenshot(i)}
                    className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-white shadow"
                    aria-label="削除"
                  >
                    <X className="size-3" />
                  </button>
                  <p className="mt-0.5 max-w-[80px] truncate text-[10px] text-muted-foreground">{s.name}</p>
                </div>
              ))}
            </div>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {t('feedback.previewNote')}
          </p>
        </Field>

        {/* 再現手順・困り具合 — 不具合の報告を選んだ方のみ表示 */}
        {contactType === '不具合の報告' && (
          <>
            <Field label={t('feedback.field.steps')}>
              <textarea
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                placeholder={t('feedback.steps.placeholder')}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
            </Field>

            <Field label={t('feedback.field.severity')} required>
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
          </>
        )}

        {/* 返信希望 */}
        <Field label={t('feedback.field.wantReply')} required>
          <div className="flex gap-4">
            {REPLY_OPTIONS.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="wantReply"
                  value={r}
                  checked={wantReply === r}
                  onChange={() => {
                    setWantReply(r)
                    if (r === '返信してほしい' && currentUser) {
                      if (!yourName) setYourName(currentUser.displayName || currentUser.name || '')
                      if (!email) setEmail(currentUser.email ?? '')
                    }
                  }}
                  className="size-4 accent-primary"
                />
                <span className="text-sm">{r}</span>
              </label>
            ))}
          </div>
        </Field>

        {/* 連絡先メールアドレス — 返信希望の場合のみ表示 */}
        {wantReply === '返信してほしい' && (
          <Field label={t('feedback.field.email')}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('feedback.email.placeholder')}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>
        )}

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
            {submitting ? t('feedback.submitting') : t('feedback.submit')}
          </button>
          <button
            type="button"
            onClick={goBack}
            className="rounded-lg border border-border px-4 py-2.5 text-sm transition-colors hover:bg-secondary"
          >
            {t('feedback.cancel')}
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
