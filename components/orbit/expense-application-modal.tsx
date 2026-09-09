'use client'

import { useRef, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { Modal } from '@/components/orbit/modal'
import { useI18n } from '@/lib/orbit/i18n'
import type { ExpenseApplication } from '@/lib/orbit/types'
import { Loader2, Paperclip } from 'lucide-react'

// EXP-003: 領収書ファイルをそのままdata URLとして読み込む。アバターの
// resizeImageToDataUrlと異なり、領収書は正方形クロップ不要な画像やPDFも
// あり得るため、リサイズせず生のdata URLを返すだけの単純なヘルパーにする。
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

// EXP-008: 差し戻された申請を編集・再提出する場合はeditApplicationを渡す。
// 未指定なら新規申請フォームとして動作する。
export function ExpenseApplicationModal({
  onClose,
  editApplication,
}: {
  onClose: () => void
  editApplication?: ExpenseApplication
}) {
  const { expenseCategories, submitExpenseApplication, resubmitExpense, uploadExpenseReceipt, driveEnabled, currentUser } = useOrbit()
  const { t } = useI18n()

  const [categoryId, setCategoryId] = useState(editApplication?.categoryId ?? expenseCategories[0]?.id ?? '')
  const [amount, setAmount] = useState(editApplication ? String(editApplication.amount) : '')
  const [receiptUrl, setReceiptUrl] = useState(editApplication?.receiptUrl ?? '')
  const [justification, setJustification] = useState(editApplication?.justification ?? '')
  const [purpose, setPurpose] = useState(editApplication?.purpose ?? '')
  const [customFieldAnswers, setCustomFieldAnswers] = useState<Record<string, string>>(editApplication?.customFieldAnswers ?? {})
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const category = expenseCategories.find((c) => c.id === categoryId)

  const handleFileSelect = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const dataUrl = await readFileAsDataUrl(file)
      const url = await uploadExpenseReceipt(dataUrl, file.name)
      setReceiptUrl(url)
    } catch {
      setError(t('expenseApplication.receiptUpload.failed'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

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

    const fields = {
      amount: amt,
      categoryId,
      receiptUrl: receiptUrl.trim() || undefined,
      justification: justification.trim() || undefined,
      purpose: purpose.trim() || undefined,
      customFieldAnswers: Object.keys(customFieldAnswers).length > 0 ? customFieldAnswers : undefined,
    }

    if (editApplication) {
      resubmitExpense(editApplication.id, fields)
    } else {
      submitExpenseApplication({ applicantId: currentUser.id, ...fields, approvalSteps: category?.approvalSteps ?? [] })
    }
    onClose()
  }

  return (
    <Modal open={true} onClose={onClose}>
      <div className="space-y-4 p-5" style={{ minWidth: 400 }}>
        <h2 className="text-lg font-semibold">{editApplication ? t('expenseApplication.editTitle') : t('admin.expenses.title')}</h2>

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
          {driveEnabled ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
                {uploading ? t('expenseApplication.receiptUpload.uploading') : t('expenseApplication.receiptUpload.button')}
              </button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{t('expenseApplication.receiptUpload.driveDisabled')}</p>
          )}
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

        {/* EXP-005: カテゴリ別カスタム項目 */}
        {category?.customFields?.map((field) => (
          <div key={field.key} className="space-y-1">
            <label className="text-xs text-muted-foreground">{field.label}</label>
            <input
              type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
              value={customFieldAnswers[field.key] ?? ''}
              onChange={(e) => setCustomFieldAnswers((prev) => ({ ...prev, [field.key]: e.target.value }))}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        ))}

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
            {editApplication ? t('expenseApplication.resubmit') : t('expenseApplication.submit')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
