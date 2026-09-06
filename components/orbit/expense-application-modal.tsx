'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { Modal } from '@/components/orbit/modal'
import { useI18n } from '@/lib/orbit/i18n'

export function ExpenseApplicationModal({ onClose }: { onClose: () => void }) {
  const { expenseCategories, submitExpenseApplication, currentUser } = useOrbit()
  const { t } = useI18n()

  const [categoryId, setCategoryId] = useState(expenseCategories[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [receiptUrl, setReceiptUrl] = useState('')
  const [justification, setJustification] = useState('')
  const [purpose, setPurpose] = useState('')
  const [error, setError] = useState('')

  const category = expenseCategories.find((c) => c.id === categoryId)

  const handleSubmit = () => {
    setError('')
    const amt = Number(amount)
    if (!categoryId) { setError(t('expenseApplication.categoryError')); return }
    if (!amount || isNaN(amt) || amt <= 0) { setError(t('expenseApplication.amountError')); return }
    if (!receiptUrl.trim() && !justification.trim()) {
      setError(t('expenseApplication.receiptOrJustificationError'))
      return
    }
    if (!currentUser) return

    submitExpenseApplication({
      applicantId: currentUser.id,
      amount: amt,
      categoryId,
      receiptUrl: receiptUrl.trim() || undefined,
      justification: justification.trim() || undefined,
      purpose: purpose.trim() || undefined,
      approvalSteps: category?.approvalSteps ?? [],
    })
    onClose()
  }

  return (
    <Modal open={true} onClose={onClose}>
      <div className="space-y-4 p-5" style={{ minWidth: 400 }}>
        <h2 className="text-lg font-semibold">{t('admin.expenses.title')}</h2>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t('expenseApplication.categoryLabel')} <span className="text-destructive">*</span></label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          >
            {expenseCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t('expenseApplication.amountLabel')} <span className="text-destructive">*</span></label>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t('expenseApplication.amountPlaceholder')}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t('expenseApplication.purposeLabel')}</label>
          <input
            type="text"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder={t('expenseApplication.purposePlaceholder')}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            {t('expenseApplication.receiptLabel')} <span className="text-muted-foreground">{t('expenseApplication.eitherRequired')}</span>
          </label>
          <input
            type="url"
            value={receiptUrl}
            onChange={(e) => setReceiptUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            {t('expenseApplication.justificationLabel')} <span className="text-muted-foreground">{t('expenseApplication.justificationNote')}</span>
          </label>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder={t('expenseApplication.justificationPlaceholder')}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            rows={3}
          />
        </div>

        {category && category.approvalSteps.length > 0 && (
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            {t('expenseApplication.approvalFlow', { count: category.approvalSteps.length })}
          </div>
        )}

        {error && <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">
            {t('admin.expenses.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            {t('expenseApplication.submit')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
