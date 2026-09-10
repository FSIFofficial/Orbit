import { describe, it, expect } from 'vitest'
import { computeReviewTurnaroundDays, suggestWorkloadRebalance } from './utils'
import { STATUS_LABEL, type Member, type Task, type TaskHistoryEntry } from './types'

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

// MAT-011: 負荷分散提案。memberWorkloadCapacityは実績データが無いメンバーを
// 「現在の未完了タスク数(時間換算)のみ」で暫定判定する — 4件の未見積もり
// タスク(デフォルト2h/件)=8hは閾値(2h*3=6h)を超えるため'full'、0件は'available'。
function makeMember(id: string, skills: string[]): Member {
  return { id, name: id, skills } as unknown as Member
}

function makeWorkloadTask(id: string, assigneeIds: string[], skills: string[]): Task {
  return { id, assigneeIds, skills, status: 'progress' } as unknown as Task
}

describe('suggestWorkloadRebalance', () => {
  const overloadedTasks: Task[] = [
    makeWorkloadTask('t1', ['m1'], ['react']),
    makeWorkloadTask('t2', ['m1'], ['react']),
    makeWorkloadTask('t3', ['m1'], ['react']),
    makeWorkloadTask('t4', ['m1'], ['react']),
  ]

  it("suggests reassigning an overloaded member's task to an available member with a matching skill", () => {
    const members = [
      makeMember('m1', ['react']), // full: 4 unestimated active tasks = 8h > 6h threshold
      makeMember('m2', ['react']), // available: no active tasks, matching skill
      makeMember('m4', ['python']), // available: no active tasks, no matching skill
    ]
    const suggestions = suggestWorkloadRebalance(members, overloadedTasks)
    expect(suggestions).toHaveLength(4)
    suggestions.forEach((s) => {
      expect(s.from.id).toBe('m1')
      expect(s.to.id).toBe('m2')
      expect(s.matchedSkills).toEqual(['react'])
    })
  })

  it('returns no suggestions when no other member has spare capacity', () => {
    const members = [makeMember('m1', ['react'])]
    expect(suggestWorkloadRebalance(members, overloadedTasks)).toEqual([])
  })

  it('returns no suggestions when the only available member has no matching skill', () => {
    const members = [makeMember('m1', ['react']), makeMember('m4', ['python'])]
    expect(suggestWorkloadRebalance(members, overloadedTasks)).toEqual([])
  })

  it('reassignment removes the original assignee and adds the new one (mirrors the admin-dashboard assignTask call)', () => {
    const members = [makeMember('m1', ['react']), makeMember('m2', ['react'])]
    const suggestion = suggestWorkloadRebalance(members, overloadedTasks)[0]
    // same computation as the "アサインを変更" button's onClick in admin-dashboard.tsx
    const nextAssignees = Array.from(
      new Set(suggestion.task.assigneeIds.filter((id) => id !== suggestion.from.id).concat(suggestion.to.id)),
    )
    expect(nextAssignees).toEqual(['m2'])
  })
})
