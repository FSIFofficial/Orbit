import { describe, it, expect } from 'vitest'
import { computeReviewTurnaroundDays } from './utils'
import { STATUS_LABEL, type Task, type TaskHistoryEntry } from './types'

// ANL-013のバグ回帰テスト: history[].to にはSTATUS_LABEL経由の日本語ラベル
// ('完了'/'確認待ち')が保存される(store.tsxのupdateTaskStatus参照)。
// 内部enum値('done'/'review')とうっかり比較すると常にnullを返してしまう
// (実際に本番で起きた不具合)ため、ラベル値で正しく判定できることを検証する。
function historyEntry(at: string, to: string): TaskHistoryEntry {
  return { id: `h-${at}`, at, byId: 'm1', field: 'status', from: '', to }
}

function makeTask(history: TaskHistoryEntry[]): Task {
  return { history } as unknown as Task
}

describe('computeReviewTurnaroundDays', () => {
  it('returns the day count between the review and done transitions', () => {
    const task = makeTask([
      historyEntry('2024-01-01T00:00:00.000Z', STATUS_LABEL.review),
      historyEntry('2024-01-04T00:00:00.000Z', STATUS_LABEL.done),
    ])
    expect(computeReviewTurnaroundDays(task)).toBe(3)
  })

  it('uses the last review transition before completion when bounced back (review→fix→review)', () => {
    const task = makeTask([
      historyEntry('2024-01-01T00:00:00.000Z', STATUS_LABEL.review),
      historyEntry('2024-01-02T00:00:00.000Z', '修正中'),
      historyEntry('2024-01-05T00:00:00.000Z', STATUS_LABEL.review),
      historyEntry('2024-01-06T00:00:00.000Z', STATUS_LABEL.done),
    ])
    expect(computeReviewTurnaroundDays(task)).toBe(1)
  })

  it('returns null when the task never went through review', () => {
    const task = makeTask([historyEntry('2024-01-01T00:00:00.000Z', STATUS_LABEL.done)])
    expect(computeReviewTurnaroundDays(task)).toBeNull()
  })

  it('returns null when the task was never completed', () => {
    const task = makeTask([historyEntry('2024-01-01T00:00:00.000Z', STATUS_LABEL.review)])
    expect(computeReviewTurnaroundDays(task)).toBeNull()
  })

  it('returns null when history is empty (no reviewer configured)', () => {
    expect(computeReviewTurnaroundDays(makeTask([]))).toBeNull()
  })
})
