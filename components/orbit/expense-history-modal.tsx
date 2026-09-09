'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { Modal } from '@/components/orbit/modal'
import { ExpenseApplicationModal } from '@/components/orbit/expense-application-modal'
import { useI18n } from '@/lib/orbit/i18n'
import type { ExpenseApplication } from '@/lib/orbit/types'

// EXP-009: 申請者本人が自分の経費申請の履歴を確認し、pending申請の取り下げ
// (withdrawExpense — これまで呼び出し箇所がなかったdead code)と、
// returned申請の編集・再提出(EXP-008のresubmitExpense)ができる画面。
export function ExpenseHistoryModal({ onClose }: { onClose: () => void }) {
  const { expenseApplications, expenseCategories, withdrawExpense, currentUser } = useOrbit()
  const { t } = useI18n()
  const [editing, setEditing] = useState<ExpenseApplication | null>(null)

  const myApplications = expenseApplications
    .filter((a) => a.applicantId === currentUser?.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

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

  if (editing) {
    return <ExpenseApplicationModal editApplication={editing} onClose={() => { setEditing(null); onClose() }} />
  }

  return (
    <Modal open={true} onClose={onClose}>
      <div className="space-y-4 p-5" style={{ minWidth: 420 }}>
        <h2 className="text-lg font-semibold">{t('expenseHistory.title')}</h2>

        {myApplications.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">{t('expenseHistory.empty')}</div>
        )}

        <div className="space-y-2">
          {myApplications.map((app) => {
            const category = expenseCategories.find((c) => c.id === app.categoryId)
            return (
              <div key={app.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">
                      ¥{app.amount.toLocaleString()} · {category?.label ?? app.categoryId}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(app.createdAt).toLocaleDateString('ja-JP')}
                      {app.status === 'pending' && ` · ${t('expenseHistory.stepProgress', { current: app.currentStepIndex + 1, total: app.approvalSteps.length })}`}
                    </div>
                  </div>
                  <span className={`text-xs font-semibold ${statusColor[app.status]}`}>{statusLabel[app.status]}</span>
                </div>
                {app.rejectionReason && (app.status === 'rejected' || app.status === 'returned') && (
                  <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                    {t('expenseHistory.rejectionReason', { reason: app.rejectionReason })}
                  </div>
                )}
                {app.status === 'pending' && (
                  <button
                    onClick={() => withdrawExpense(app.id)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {t('expenseHistory.withdraw')}
                  </button>
                )}
                {app.status === 'returned' && (
                  <button
                    onClick={() => setEditing(app)}
                    className="rounded-md border border-primary px-3 py-1.5 text-xs text-primary hover:bg-primary/10"
                  >
                    {t('expenseHistory.editResubmit')}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex justify-end pt-1">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">
            {t('admin.expenses.cancel')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
