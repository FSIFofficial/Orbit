'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import type { ApprovalStep, ExpenseApplication, ExpenseCategory } from '@/lib/orbit/types'
import { Plus, Trash2, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Modal } from '@/components/orbit/modal'
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

  const handleSave = () => {
    if (!label.trim()) return
    onSave({ id: initial?.id ?? crypto.randomUUID(), label: label.trim(), approvalSteps: steps })
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
  getMember,
  getCategory,
}: {
  app: ExpenseApplication
  onApprove: (stepId: string) => void
  onReject: (reason: string) => void
  getMember: (id: string | null) => { name: string; displayName?: string } | undefined
  getCategory: (id: string) => ExpenseCategory | undefined
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectOpen, setRejectOpen] = useState(false)

  const applicant = getMember(app.applicantId)
  const category = getCategory(app.categoryId)
  const currentStep = app.approvalSteps[app.currentStepIndex]

  const statusLabel: Record<ExpenseApplication['status'], string> = {
    pending: t('admin.expenses.status.pending'),
    approved: t('admin.expenses.status.approved'),
    rejected: t('admin.expenses.status.rejected'),
    withdrawn: t('admin.expenses.status.withdrawn'),
  }
  const statusColor: Record<ExpenseApplication['status'], string> = {
    pending: 'text-yellow-600',
    approved: 'text-green-600',
    rejected: 'text-destructive',
    withdrawn: 'text-muted-foreground',
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
                onClick={() => setRejectOpen(true)}
                className="flex items-center gap-1.5 rounded-md border border-destructive px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
              >
                <XCircle className="size-3.5" /> {t('admin.expenses.reject')}
              </button>
            </div>
          )}
          {app.rejectionReason && (
            <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
              {t('admin.expenses.rejectionReasonLabel', { reason: app.rejectionReason })}
            </div>
          )}
        </div>
      )}

      {rejectOpen && (
        <Modal open={true} onClose={() => setRejectOpen(false)}>
          <div className="space-y-3 p-4">
            <h3 className="font-semibold">{t('admin.expenses.rejectModal.title')}</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              rows={3}
              placeholder={t('admin.expenses.rejectModal.placeholder')}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRejectOpen(false)} className="rounded-md border border-border px-3 py-1.5 text-sm">
                {t('admin.expenses.cancel')}
              </button>
              <button
                disabled={!rejectReason.trim()}
                onClick={() => { onReject(rejectReason); setRejectOpen(false) }}
                className="rounded-md bg-destructive px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {t('admin.expenses.rejectModal.submit')}
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
