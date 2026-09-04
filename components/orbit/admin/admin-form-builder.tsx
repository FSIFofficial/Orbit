'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import type { ApprovalStep, CustomFormDef, CustomFormField, CustomFormFieldType } from '@/lib/orbit/types'
import { Plus, Trash2, GripVertical } from 'lucide-react'
import { Modal } from '@/components/orbit/modal'

// 承認ステップエディタは admin-expenses.tsx と同じロジックで inline 定義
function ApprovalStepEditor({
  steps,
  onChange,
  members,
  roleLevels,
}: {
  steps: ApprovalStep[]
  onChange: (steps: ApprovalStep[]) => void
  members: { id: string; name: string; displayName?: string }[]
  roleLevels: string[]
}) {
  const addStep = () =>
    onChange([...steps, { id: crypto.randomUUID(), type: 'member', memberId: members[0]?.id ?? '' }])
  const removeStep = (id: string) => onChange(steps.filter((s) => s.id !== id))
  const updateStep = (id: string, patch: Partial<ApprovalStep>) =>
    onChange(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2">
          <span className="mt-1.5 min-w-[1.25rem] text-center text-xs font-semibold text-muted-foreground">{i + 1}</span>
          <div className="flex flex-1 flex-wrap gap-2">
            <select
              value={step.type}
              onChange={(e) => updateStep(step.id, { type: e.target.value as 'member' | 'role', memberId: undefined, role: undefined })}
              className="rounded border border-border bg-background px-2 py-1 text-xs"
            >
              <option value="member">特定の個人</option>
              <option value="role">役職（誰でも）</option>
            </select>
            {step.type === 'member' ? (
              <select
                value={step.memberId ?? ''}
                onChange={(e) => updateStep(step.id, { memberId: e.target.value })}
                className="rounded border border-border bg-background px-2 py-1 text-xs"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.displayName ?? m.name}</option>
                ))}
              </select>
            ) : (
              <>
                <select
                  value={step.role ?? ''}
                  onChange={(e) => updateStep(step.id, { role: e.target.value })}
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  {roleLevels.map((r) => (<option key={r} value={r}>{r}</option>))}
                </select>
                <input
                  type="text"
                  placeholder="部署名（任意）"
                  value={step.department ?? ''}
                  onChange={(e) => updateStep(step.id, { department: e.target.value || undefined })}
                  className="w-28 rounded border border-border bg-background px-2 py-1 text-xs"
                />
              </>
            )}
          </div>
          <button onClick={() => removeStep(step.id)} className="mt-1 text-muted-foreground hover:text-destructive">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <button onClick={addStep} className="flex items-center gap-1 text-xs text-primary hover:underline">
        <Plus className="size-3" /> ステップを追加
      </button>
    </div>
  )
}

// ---- フィールドエディタ ----

const FIELD_TYPE_LABELS: Record<CustomFormFieldType, string> = {
  text: 'テキスト',
  number: '数値',
  select: '選択肢',
  date: '日付',
}

function FieldEditor({
  field,
  onChange,
  onRemove,
}: {
  field: CustomFormField
  onChange: (f: CustomFormField) => void
  onRemove: () => void
}) {
  const [optionInput, setOptionInput] = useState('')

  const addOption = () => {
    if (!optionInput.trim()) return
    onChange({ ...field, options: [...(field.options ?? []), optionInput.trim()] })
    setOptionInput('')
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <GripVertical className="mt-1 size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={field.label}
              onChange={(e) => onChange({ ...field, label: e.target.value })}
              placeholder="フィールド名"
              className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
            />
            <select
              value={field.type}
              onChange={(e) => onChange({ ...field, type: e.target.value as CustomFormFieldType, options: [] })}
              className="rounded border border-border bg-background px-2 py-1 text-sm"
            >
              {(Object.keys(FIELD_TYPE_LABELS) as CustomFormFieldType[]).map((t) => (
                <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => onChange({ ...field, required: e.target.checked })}
              />
              必須
            </label>
          </div>
          {field.type === 'select' && (
            <div className="space-y-1 pl-2">
              <div className="flex flex-wrap gap-1">
                {(field.options ?? []).map((opt, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs">
                    {opt}
                    <button
                      onClick={() => onChange({ ...field, options: (field.options ?? []).filter((_, j) => j !== i) })}
                      className="text-muted-foreground hover:text-destructive"
                    >×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={optionInput}
                  onChange={(e) => setOptionInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption() } }}
                  placeholder="選択肢を追加 (Enter)"
                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                />
                <button onClick={addOption} className="rounded border border-border px-2 py-1 text-xs hover:bg-accent">追加</button>
              </div>
            </div>
          )}
        </div>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  )
}

// ---- フォームエディタ Modal ----

function FormEditor({
  initial,
  onSave,
  onClose,
  members,
  roleLevels,
}: {
  initial?: CustomFormDef
  onSave: (form: CustomFormDef) => void
  onClose: () => void
  members: { id: string; name: string; displayName?: string }[]
  roleLevels: string[]
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [fields, setFields] = useState<CustomFormField[]>(initial?.fields ?? [])
  const [steps, setSteps] = useState<ApprovalStep[]>(initial?.approvalSteps ?? [])

  const addField = () => {
    setFields((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: '', type: 'text', required: false },
    ])
  }

  const handleSave = () => {
    if (!title.trim()) return
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim() || undefined,
      fields,
      approvalSteps: steps,
    })
    onClose()
  }

  return (
    <Modal open={true} onClose={onClose}>
      <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto space-y-4 p-4 sm:min-w-[500px]">
        <h3 className="font-semibold">{initial ? 'フォーム編集' : 'フォーム作成'}</h3>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">タイトル</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
            placeholder="フォームのタイトル"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">説明（任意）</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">フィールド</div>
          {fields.map((f) => (
            <FieldEditor
              key={f.id}
              field={f}
              onChange={(updated) => setFields((prev) => prev.map((x) => (x.id === f.id ? updated : x)))}
              onRemove={() => setFields((prev) => prev.filter((x) => x.id !== f.id))}
            />
          ))}
          <button onClick={addField} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <Plus className="size-3" /> フィールドを追加
          </button>
        </div>

        <div className="space-y-1">
          <div className="text-xs font-semibold text-muted-foreground">承認ステップ</div>
          <ApprovalStepEditor steps={steps} onChange={setSteps} members={members} roleLevels={roleLevels} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm">
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ---- AdminFormBuilder ----

export function AdminFormBuilder() {
  const {
    customFormDefs,
    customFormSubmissions,
    updateCustomFormDefs,
    approveFormStep,
    rejectFormSubmission,
    members,
    roleLevels,
    getMember,
  } = useOrbit()

  const [tab, setTab] = useState<'submissions' | 'forms'>('submissions')
  const [editingForm, setEditingForm] = useState<CustomFormDef | null | 'new'>(null)
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const handleSaveForm = (form: CustomFormDef) => {
    const existing = customFormDefs.find((f) => f.id === form.id)
    if (existing) {
      updateCustomFormDefs(customFormDefs.map((f) => (f.id === form.id ? form : f)))
    } else {
      updateCustomFormDefs([...customFormDefs, form])
    }
  }

  const handleDeleteForm = (id: string) => {
    updateCustomFormDefs(customFormDefs.filter((f) => f.id !== id))
  }

  const pendingSubs = customFormSubmissions.filter((s) => s.status === 'pending')
  const otherSubs = customFormSubmissions.filter((s) => s.status !== 'pending')

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">申請フォームビルダー</h2>
        <div className="flex rounded-md border border-border bg-card">
          {(['submissions', 'forms'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-sm transition-colors ${tab === t ? 'bg-accent font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t === 'submissions' ? '申請一覧' : 'フォーム管理'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'forms' && (
        <div className="space-y-3">
          <button
            onClick={() => setEditingForm('new')}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
          >
            <Plus className="size-4" /> フォームを作成
          </button>
          {customFormDefs.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              フォームがまだありません。作成してください。
            </div>
          )}
          {customFormDefs.map((form) => (
            <div key={form.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{form.title}</div>
                  {form.description && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{form.description}</div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    フィールド: {form.fields.length} · 承認ステップ: {form.approvalSteps.length}段階
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingForm(form)}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => handleDeleteForm(form.id)}
                    className="rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                  >
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'submissions' && (
        <div className="space-y-4">
          {pendingSubs.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-semibold text-yellow-600">承認待ち ({pendingSubs.length})</div>
              <div className="space-y-2">
                {pendingSubs.map((sub) => {
                  const form = customFormDefs.find((f) => f.id === sub.formId)
                  const submitter = getMember(sub.submitterId)
                  const currentStep = form?.approvalSteps[sub.currentStepIndex]
                  return (
                    <div key={sub.id} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">
                            {form?.title ?? sub.formId} — {submitter?.displayName ?? submitter?.name ?? sub.submitterId}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {new Date(sub.createdAt).toLocaleDateString('ja-JP')}
                          </div>
                          <div className="mt-2 space-y-1">
                            {form?.fields.map((f) => (
                              <div key={f.id} className="text-xs">
                                <span className="text-muted-foreground">{f.label}: </span>
                                <span>{String(sub.answers[f.id] ?? '—')}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {currentStep && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => approveFormStep(sub.id, currentStep.id)}
                              className="rounded-md bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700"
                            >
                              承認
                            </button>
                            <button
                              onClick={() => setRejectTarget(sub.id)}
                              className="rounded-md border border-destructive px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                            >
                              却下
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {otherSubs.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-semibold text-muted-foreground">過去の申請</div>
              <div className="space-y-2">
                {otherSubs.map((sub) => {
                  const form = customFormDefs.find((f) => f.id === sub.formId)
                  const submitter = getMember(sub.submitterId)
                  const statusLabel = sub.status === 'approved' ? '承認済み' : '却下'
                  const statusColor = sub.status === 'approved' ? 'text-green-600' : 'text-destructive'
                  return (
                    <div key={sub.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
                      <div className="text-sm">
                        <span className="font-medium">{form?.title ?? sub.formId}</span>
                        <span className="text-muted-foreground"> — {submitter?.displayName ?? submitter?.name}</span>
                      </div>
                      <span className={`text-xs font-semibold ${statusColor}`}>{statusLabel}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {customFormSubmissions.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">申請はまだありません</div>
          )}
        </div>
      )}

      {editingForm && (
        <FormEditor
          initial={editingForm === 'new' ? undefined : editingForm}
          onSave={handleSaveForm}
          onClose={() => setEditingForm(null)}
          members={members}
          roleLevels={roleLevels}
        />
      )}

      {rejectTarget && (
        <Modal open={true} onClose={() => setRejectTarget(null)}>
          <div className="space-y-3 p-4">
            <h3 className="font-semibold">却下理由</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              rows={3}
              placeholder="却下理由を入力してください"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRejectTarget(null)} className="rounded-md border border-border px-3 py-1.5 text-sm">
                キャンセル
              </button>
              <button
                disabled={!rejectReason.trim()}
                onClick={() => {
                  rejectFormSubmission(rejectTarget, rejectReason)
                  setRejectTarget(null)
                  setRejectReason('')
                }}
                className="rounded-md bg-destructive px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                却下する
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
