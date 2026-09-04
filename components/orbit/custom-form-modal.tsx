'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import type { CustomFormDef } from '@/lib/orbit/types'
import { Modal } from '@/components/orbit/modal'
import { ChevronLeft } from 'lucide-react'

function FormFillStep({
  form,
  onSubmit,
  onBack,
}: {
  form: CustomFormDef
  onSubmit: (answers: Record<string, string | number>) => void
  onBack: () => void
}) {
  const [answers, setAnswers] = useState<Record<string, string | number>>({})
  const [error, setError] = useState('')

  const handleSubmit = () => {
    setError('')
    for (const field of form.fields) {
      if (field.required) {
        const val = answers[field.id]
        if (val === undefined || val === '') {
          setError(`「${field.label}」は必須です`)
          return
        }
      }
    }
    onSubmit(answers)
  }

  return (
    <div className="space-y-4 p-5" style={{ minWidth: 440 }}>
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
        </button>
        <h2 className="text-lg font-semibold">{form.title}</h2>
      </div>
      {form.description && (
        <p className="text-sm text-muted-foreground">{form.description}</p>
      )}

      <div className="space-y-3">
        {form.fields.map((field) => (
          <div key={field.id} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {field.label}
              {field.required && <span className="ml-0.5 text-destructive">*</span>}
            </label>
            {field.type === 'text' && (
              <input
                type="text"
                value={String(answers[field.id] ?? '')}
                onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            )}
            {field.type === 'number' && (
              <input
                type="number"
                value={String(answers[field.id] ?? '')}
                onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value === '' ? '' : Number(e.target.value) }))}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            )}
            {field.type === 'date' && (
              <input
                type="date"
                value={String(answers[field.id] ?? '')}
                onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            )}
            {field.type === 'select' && (
              <select
                value={String(answers[field.id] ?? '')}
                onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">選択してください</option>
                {(field.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>

      {form.approvalSteps.length > 0 && (
        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          申請後: {form.approvalSteps.length}段階の承認フローに入ります
        </div>
      )}

      {error && <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onBack} className="rounded-md border border-border px-4 py-2 text-sm">
          戻る
        </button>
        <button
          onClick={handleSubmit}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          申請する
        </button>
      </div>
    </div>
  )
}

export function CustomFormModal({ onClose }: { onClose: () => void }) {
  const { customFormDefs, submitCustomForm } = useOrbit()
  const [selectedForm, setSelectedForm] = useState<CustomFormDef | null>(null)
  const [submitted, setSubmitted] = useState(false)

  if (submitted) {
    return (
      <Modal open={true} onClose={onClose}>
        <div className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="text-4xl">✅</div>
          <h2 className="text-lg font-semibold">申請が完了しました</h2>
          <p className="text-sm text-muted-foreground">承認フローに進みます。結果はメールでお知らせします。</p>
          <button onClick={onClose} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
            閉じる
          </button>
        </div>
      </Modal>
    )
  }

  if (selectedForm) {
    return (
      <Modal open={true} onClose={onClose}>
        <FormFillStep
          form={selectedForm}
          onSubmit={(answers) => {
            submitCustomForm(selectedForm.id, answers)
            setSubmitted(true)
          }}
          onBack={() => setSelectedForm(null)}
        />
      </Modal>
    )
  }

  return (
    <Modal open={true} onClose={onClose}>
      <div className="space-y-4 p-5" style={{ minWidth: 400 }}>
        <h2 className="text-lg font-semibold">フォーム申請</h2>
        <p className="text-sm text-muted-foreground">申請するフォームを選択してください</p>
        <div className="space-y-2">
          {customFormDefs.map((form) => (
            <button
              key={form.id}
              onClick={() => setSelectedForm(form)}
              className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-border bg-card p-4 text-left hover:bg-accent transition-colors"
            >
              <span className="font-medium text-sm">{form.title}</span>
              {form.description && (
                <span className="text-xs text-muted-foreground">{form.description}</span>
              )}
              <span className="mt-1 text-xs text-muted-foreground">
                {form.fields.length}項目 · 承認{form.approvalSteps.length}段階
              </span>
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">
            キャンセル
          </button>
        </div>
      </div>
    </Modal>
  )
}
