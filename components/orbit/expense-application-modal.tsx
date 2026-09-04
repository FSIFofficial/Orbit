'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { Modal } from '@/components/orbit/modal'

export function ExpenseApplicationModal({ onClose }: { onClose: () => void }) {
  const { expenseCategories, submitExpenseApplication, currentUser } = useOrbit()

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
    if (!categoryId) { setError('カテゴリを選択してください'); return }
    if (!amount || isNaN(amt) || amt <= 0) { setError('金額を正しく入力してください'); return }
    if (!receiptUrl.trim() && !justification.trim()) {
      setError('領収書URLまたは理由のいずれかを入力してください')
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
        <h2 className="text-lg font-semibold">経費申請</h2>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">カテゴリ <span className="text-destructive">*</span></label>
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
          <label className="text-xs text-muted-foreground">金額（円） <span className="text-destructive">*</span></label>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="例: 3500"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">用途（任意）</label>
          <input
            type="text"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="例: 懇親会費、交通費など"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            領収書URL <span className="text-muted-foreground">（いずれか必須）</span>
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
            正当な理由テキスト <span className="text-muted-foreground">（領収書がない場合）</span>
          </label>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="領収書がない場合、理由を詳しく記載してください"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            rows={3}
          />
        </div>

        {category && category.approvalSteps.length > 0 && (
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            承認フロー: {category.approvalSteps.length}段階の承認が必要です
          </div>
        )}

        {error && <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            申請する
          </button>
        </div>
      </div>
    </Modal>
  )
}
