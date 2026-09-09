'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import type { ApprovalStep, ExpenseApplication, ExpenseCategory } from '@/lib/orbit/types'
import { Plus, Trash2, CheckCircle, XCircle, ChevronDown, ChevronUp, Undo2 } from 'lucide-react'
import { Modal } from '@/components/orbit/modal'
import { AdminAccessNote } from '@/components/orbit/primitives'
import { useI18n } from '@/lib/orbit/i18n'

// ---- ApprovalStepEditor ----

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
  const { t } = useI18n()
  const addStep = () => {
    onChange([
      ...steps,
      { id: crypto.randomUUID(), type: 'member', memberId: members[0]?.id ?? '' },
    ])
  }
  const removeStep = (id: string) => onChange(steps.filter((s) => s.id !== id))
  const updateStep = (id: string, patch: Partial<ApprovalStep>) =>
    onChange(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2">
          <span className="mt-1.5 min-w-[1.25rem] text-center text-xs font-semibold text-muted-foreground">
            {i + 1}
          </span>
          <div className="flex flex-1 flex-wrap gap-2">
            <select
              value={step.type}
              onChange={(e) => updateStep(step.id, { type: e.target.value as 'member' | 'role', memberId: undefined, role: undefined })}
              className="rounded border border-border bg-background px-2 py-1 text-xs"
            >
              <option value="member">{t('admin.expenses.approvalStep.person')}</option>
              <option value="role">{t('admin.expenses.approvalStep.role')}</option>
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
                  {roleLevels.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder={t('admin.expenses.approvalStep.departmentPlaceholder')}
                  value={step.department ?? ''}
                  onChange={(e) => updateStep(step.id, { department: e.target.value || undefined })}
                  className="w-28 rounded border border-border bg-background px-2 py-1 text-xs"
                />
                <select
                  value={step.requiredCount === 'all' ? 'all' : (step.requiredCount ?? 1)}
                  onChange={(e) => {
                    const v = e.target.value
                    updateStep(step.id, { requiredCount: v === 'all' ? 'all' : Number(v) })
                  }}
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value={1}>{t('admin.expenses.approvalStep.count1')}</option>
                  <option value={2}>{t('admin.expenses.approvalStep.count2')}</option>
                  <option value={3}>{t('admin.expenses.approvalStep.count3')}</option>
                  <option value="all">{t('admin.expenses.approvalStep.countAll')}</option>
                </select>
              </>
            )}
          </div>
          <button onClick={() => removeStep(step.id)} className="mt-1 text-muted-foreground hover:text-destructive">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <button
        onClick={addStep}
        className="flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <Plus className="size-3" /> {t('admin.expenses.approvalStep.add')}
      </button>
    </div>
  )
}

// ---- CustomFieldsEditor (EXP-005: カテゴリ別カスタム項目) ----

type CustomField = { key: string; label: string; type: 'text' | 'number' | 'date' }

function CustomFieldsEditor({
  fields,
  onChange,
}: {
  fields: CustomField[]
  onChange: (fields: CustomField[]) => void
}) {
  const { t } = useI18n()
  const addField = () => onChange([...fields, { key: crypto.randomUUID(), label: '', type: 'text' }])
  const removeField = (key: string) => onChange(fields.filter((f) => f.key !== key))
  const updateField = (key: string, patch: Partial<CustomField>) =>
    onChange(fields.map((f) => (f.key === key ? { ...f, ...patch } : f)))

  return (
    <div className="space-y-2">
      {fields.map((field) => (
        <div key={field.key} className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2">
          <input
            type="text"
            value={field.label}
            onChange={(e) => updateField(field.key, { label: e.target.value })}
            placeholder={t('admin.expenses.customField.labelPlaceholder')}
            className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
          />
          <select
            value={field.type}
            onChange={(e) => updateField(field.key, { type: e.target.value as CustomField['type'] })}
            className="rounded border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="text">{t('admin.expenses.customField.type.text')}</option>
            <option value="number">{t('admin.expenses.customField.type.number')}</option>
            <option value="date">{t('admin.expenses.customField.type.date')}</option>
          </select>
          <button onClick={() => removeField(field.key)} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <button onClick={addField} className="flex items-center gap-1 text-xs text-primary hover:underline">
        <Plus className="size-3" /> {t('admin.expenses.customField.add')}
      </button>
    </div>
  )
}

// ---- CategoryEditor Modal ----

function CategoryEditor({
  initial,
  onSave,
  onClose,
  members,
  roleLevels,
}: {
  initial?: ExpenseCategory
  onSave: (cat: ExpenseCategory) => void
  onClose: () => void
  members: { id: string; name: string; displayName?: string }[]
  roleLevels: string[]
}) {
  const { t } = useI18n()
  const [label, setLabel] = useState(initial?.label ?? '')
  const [steps, setSteps] = useState<ApprovalStep[]>(initial?.approvalSteps ?? [])
  const [customFields, setCustomFields] = useState<CustomField[]>(initial?.customFields ?? [])

  const handleSave = () => {
    if (!label.trim()) return
    const cleanedFields = customFields.filter((f) => f.label.trim())
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      label: label.trim(),
      approvalSteps: steps,
      customFields: cleanedFields.length > 0 ? cleanedFields : undefined,
    })
    onClose()
  }

  return (
    <Modal open={true} onClose={onClose}>
      <div className="space-y-4 p-4">
        <h3 className="font-semibold">{initial ? t('admin.expenses.category.editTitle') : t('admin.expenses.category.addTitle')}</h3>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t('admin.expenses.category.nameLabel')}</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
            placeholder={t('admin.expenses.category.namePlaceholder')}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t('admin.expenses.category.approvalStepsLabel')}</label>
          <ApprovalStepEditor steps={steps} onChange={setSteps} members={members} roleLevels={roleLevels} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t('admin.expenses.category.customFieldsLabel')}</label>
          <CustomFieldsEditor fields={customFields} onChange={setCustomFields} />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm">
            {t('admin.expenses.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!label.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {t('admin.expenses.save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ---- ApplicationCard ----

function ApplicationCard({
  app,
  onApprove,
  onReject,
  onReturn,
  getMember,
  getCategory,
}: {
  app: ExpenseApplication
  onApprove: (stepId: string) => void
  onReject: (reason: string) => void
  onReturn: (reason: string) => void
  getMember: (id: string | null) => { name: string; displayName?: string } | undefined
  getCategory: (id: string) => ExpenseCategory | undefined
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [actionReason, setActionReason] = useState('')
  // EXP-008: 却下と差し戻しは理由入力モーダルを共有する
  const [actionModal, setActionModal] = useState<'reject' | 'return' | null>(null)

  const applicant = getMember(app.applicantId)
  const category = getCategory(app.categoryId)
  const currentStep = app.approvalSteps[app.currentStepIndex]

  const statusLabel: Record<ExpenseApplication['status'], string> = {
    pending: t('admin.expenses.status.pending'),
    approved: t('admin.expenses.status.approved'),
    rejected: t('admin.expenses.status.rejected'),
    withdrawn: t('admin.expenses.status.withdrawn'),
    returned: t('admin.expenses.status.returned'),
  }
  const statusColor: Record<ExpenseApplication['status'], string> = {
    pending: 'text-yellow-600',
    approved: 'text-green-600',
    rejected: 'text-destructive',
    withdrawn: 'text-muted-foreground',
    returned: 'text-orange-600',
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 space-y-0.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span>{applicant?.displayName ?? applicant?.name ?? app.applicantId}</span>
            <span className="text-muted-foreground">·</span>
            <span>{category?.label ?? app.categoryId}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            ¥{app.amount.toLocaleString()} · {new Date(app.createdAt).toLocaleDateString('ja-JP')}
          </div>
        </div>
        <span className={`text-xs font-semibold ${statusColor[app.status]}`}>
          {statusLabel[app.status]}
        </span>
        {expanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          {app.purpose && (
            <div className="text-sm"><span className="text-muted-foreground">{t('admin.expenses.purposeLabel')}</span>{app.purpose}</div>
          )}
          {app.receiptUrl && (
            <div className="text-sm"><span className="text-muted-foreground">{t('admin.expenses.receiptLabel')}</span>
              <a href={app.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">{t('admin.expenses.receiptShow')}</a>
            </div>
          )}
          {app.justification && (
            <div className="text-sm"><span className="text-muted-foreground">{t('admin.expenses.justificationLabel')}</span>{app.justification}</div>
          )}
          {category?.customFields?.map((field) =>
            app.customFieldAnswers?.[field.key] ? (
              <div key={field.key} className="text-sm">
                <span className="text-muted-foreground">{field.label}: </span>
                {app.customFieldAnswers[field.key]}
              </div>
            ) : null,
          )}

          <div className="space-y-1">
            <div className="text-xs font-semibold text-muted-foreground">{t('admin.expenses.approvalStepsTitle')}</div>
            {app.approvalSteps.map((step, i) => {
              const approvedHere = app.approvals.filter((a) => a.stepId === step.id && a.action === 'approved')
              const isDone = i < app.currentStepIndex || app.status === 'approved'
              const isCurrent = i === app.currentStepIndex && app.status === 'pending'
              return (
                <div key={step.id} className={`flex items-center gap-2 text-xs ${isDone ? 'text-green-600' : isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                  <span className="font-mono">{i + 1}.</span>
                  <span>
                    {step.type === 'member'
                      ? (getMember(step.memberId ?? null)?.displayName ?? getMember(step.memberId ?? null)?.name ?? step.memberId)
                      : `${step.role}${step.department ? `（${step.department}）` : ''}`}
                  </span>
                  {isDone && <span className="text-green-600">{t('admin.expenses.approvedCount', { count: approvedHere.length })}</span>}
                  {isCurrent && <span className="font-semibold text-primary">{t('admin.expenses.currentStep')}</span>}
                </div>
              )
            })}
          </div>

          {app.status === 'pending' && currentStep && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onApprove(currentStep.id)}
                className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700"
              >
                <CheckCircle className="size-3.5" /> {t('admin.expenses.approve')}
              </button>
              <button
                onClick={() => setActionModal('return')}
                className="flex items-center gap-1.5 rounded-md border border-orange-500 px-3 py-1.5 text-xs text-orange-600 hover:bg-orange-500/10"
              >
                <Undo2 className="size-3.5" /> {t('admin.expenses.return')}
              </button>
              <button
                onClick={() => setActionModal('reject')}
                className="flex items-center gap-1.5 rounded-md border border-destructive px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
              >
                <XCircle className="size-3.5" /> {t('admin.expenses.reject')}
              </button>
            </div>
          )}
          {app.rejectionReason && (
            <div className={`rounded-md p-2 text-xs ${app.status === 'returned' ? 'bg-orange-500/10 text-orange-600' : 'bg-destructive/10 text-destructive'}`}>
              {t('admin.expenses.rejectionReasonLabel', { reason: app.rejectionReason })}
            </div>
          )}
        </div>
      )}

      {actionModal && (
        <Modal open={true} onClose={() => setActionModal(null)}>
          <div className="space-y-3 p-4">
            <h3 className="font-semibold">
              {actionModal === 'reject' ? t('admin.expenses.rejectModal.title') : t('admin.expenses.returnModal.title')}
            </h3>
            <textarea
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              rows={3}
              placeholder={actionModal === 'reject' ? t('admin.expenses.rejectModal.placeholder') : t('admin.expenses.returnModal.placeholder')}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setActionModal(null)} className="rounded-md border border-border px-3 py-1.5 text-sm">
                {t('admin.expenses.cancel')}
              </button>
              <button
                disabled={!actionReason.trim()}
                onClick={() => {
                  if (actionModal === 'reject') onReject(actionReason)
                  else onReturn(actionReason)
                  setActionReason('')
                  setActionModal(null)
                }}
                className={`rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-50 ${actionModal === 'reject' ? 'bg-destructive' : 'bg-orange-600'}`}
              >
                {actionModal === 'reject' ? t('admin.expenses.rejectModal.submit') : t('admin.expenses.returnModal.submit')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ---- AdminExpenses ----

export function AdminExpenses() {
  const {
    expenseCategories,
    expenseApplications,
    updateExpenseCategories,
    approveExpenseStep,
    rejectExpense,
    returnExpense,
    members,
    roleLevels,
    getMember,
  } = useOrbit()

  const { t } = useI18n()
  const [tab, setTab] = useState<'categories' | 'applications'>('applications')
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null | 'new'>(null)

  const getCategory = (id: string) => expenseCategories.find((c) => c.id === id)

  const handleSaveCategory = (cat: ExpenseCategory) => {
    const existing = expenseCategories.find((c) => c.id === cat.id)
    if (existing) {
      updateExpenseCategories(expenseCategories.map((c) => (c.id === cat.id ? cat : c)))
    } else {
      updateExpenseCategories([...expenseCategories, cat])
    }
  }

  const handleDeleteCategory = (id: string) => {
    updateExpenseCategories(expenseCategories.filter((c) => c.id !== id))
  }

  const pendingApps = expenseApplications.filter((a) => a.status === 'pending')
  const otherApps = expenseApplications.filter((a) => a.status !== 'pending')

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t('admin.expenses.title')}</h2>
        <div className="flex rounded-md border border-border bg-card">
          {(['applications', 'categories'] as const).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={`px-3 py-1.5 text-sm transition-colors ${tab === tabKey ? 'bg-accent font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {tabKey === 'applications' ? t('admin.expenses.tab.applications') : t('admin.expenses.tab.categories')}
            </button>
          ))}
        </div>
      </div>

      {tab === 'applications' && (
        <div className="space-y-4">
          {pendingApps.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-semibold text-yellow-600">{t('admin.expenses.pendingTitle', { count: pendingApps.length })}</div>
              <div className="space-y-2">
                {pendingApps.map((app) => (
                  <ApplicationCard
                    key={app.id}
                    app={app}
                    onApprove={(stepId) => approveExpenseStep(app.id, stepId)}
                    onReject={(reason) => rejectExpense(app.id, reason)}
                    onReturn={(reason) => returnExpense(app.id, reason)}
                    getMember={getMember}
                    getCategory={getCategory}
                  />
                ))}
              </div>
            </div>
          )}
          {otherApps.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-semibold text-muted-foreground">{t('admin.expenses.pastTitle')}</div>
              <div className="space-y-2">
                {otherApps.map((app) => (
                  <ApplicationCard
                    key={app.id}
                    app={app}
                    onApprove={(stepId) => approveExpenseStep(app.id, stepId)}
                    onReject={(reason) => rejectExpense(app.id, reason)}
                    onReturn={(reason) => returnExpense(app.id, reason)}
                    getMember={getMember}
                    getCategory={getCategory}
                  />
                ))}
              </div>
            </div>
          )}
          {expenseApplications.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">{t('admin.expenses.noApplications')}</div>
          )}
        </div>
      )}

      {tab === 'categories' && (
        <div className="space-y-3">
          <AdminAccessNote level="fullAdmin" />
          <button
            onClick={() => setEditingCategory('new')}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
          >
            <Plus className="size-4" /> {t('admin.expenses.addCategory')}
          </button>
          {expenseCategories.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('admin.expenses.noCategories')}
            </div>
          )}
          {expenseCategories.map((cat) => (
            <div key={cat.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
              <div>
                <div className="font-medium text-sm">{cat.label}</div>
                <div className="text-xs text-muted-foreground">
                  {t('admin.expenses.approvalStepsCount', { count: cat.approvalSteps.length })}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingCategory(cat)}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                >
                  {t('admin.expenses.edit')}
                </button>
                <button
                  onClick={() => handleDeleteCategory(cat.id)}
                  className="rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                >
                  {t('admin.expenses.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingCategory && (
        <CategoryEditor
          initial={editingCategory === 'new' ? undefined : editingCategory}
          onSave={handleSaveCategory}
          onClose={() => setEditingCategory(null)}
          members={members}
          roleLevels={roleLevels}
        />
      )}
    </div>
  )
}
