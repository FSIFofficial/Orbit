// gas/Code.gs の権限の例外(permission_overrides)を、Apps Script を使わずに
// Node の vm で読み込んでテストする。例外を持つ人が、関係のない操作や代表専用の
// 操作を実行できないこと、本来の範囲の操作は実行できることを確かめる。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const CODE_GS = readFileSync(join(__dirname, '..', '..', 'gas', 'Code.gs'), 'utf8')

// シート上のタスク(t1 はプロジェクト p1・部署「広報」、t2 はプロジェクト p2)
const TASKS: Record<string, Record<string, string>> = {
  t1: { id: 't1', project_id: 'p1', department: '広報', importance: '一般', creator_id: '' },
  t2: { id: 't2', project_id: 'p2', department: '開発', importance: '一般', creator_id: '' },
}

function loadGas() {
  const context = vm.createContext({ console })
  vm.runInContext(CODE_GS, context)
  // シートを読む関数を差し替える(関数の呼び出しは実行時に context から解決される)
  context.findRow = (_sheet: string, id: string) => TASKS[id] ?? null
  context.getSettingValue = (key: string) => (key === 'restricted_roles' ? '班長' : '')
  return context as unknown as {
    authorizeAction: (acting: unknown, action: string, body: unknown) => void
    checkPermissionOverride: (acting: unknown, action: string, body: unknown) => boolean
  }
}

const gas = loadGas()

type Override = { targetType: string; targetId: string; access: string }
const member = (overrides: Override[], role = '一般') => ({
  id: 'm1',
  role,
  project_ids: [],
  permission_overrides: overrides,
})
const allowed = (acting: unknown, action: string, body: Record<string, unknown> = {}) => {
  try {
    gas.authorizeAction(acting, action, body)
    return true
  } catch {
    return false
  }
}

const recruiter = member([{ targetType: 'recruiting', targetId: 'all', access: 'edit' }])
const projectEditor = member([{ targetType: 'project', targetId: 'p1', access: 'edit' }])
const taskEditor = member([{ targetType: 'task', targetId: 't1', access: 'edit' }])
const departmentApprover = member([{ targetType: 'department', targetId: '広報', access: 'approve' }])

// 代表専用の操作(authorizeAction の daihyoOnly のうち採用関連以外)
const DAIHYO_ONLY = [
  'updateRole', 'removeMember', 'removeProject', 'uploadOrgLogo', 'addMember', 'updateEmail',
  'updateJoinedAt', 'updateReportsTo', 'updateMentor', 'notifyTrainingDecision',
  'updatePermissionOverrides', 'updateMemberProjects',
]
// 例外を持つ人がリクエストに入れられる値(対象IDの偽装を含む)
const SPOOFED_BODY = { taskId: 't1', projectId: 'p1', department: '広報', memberId: 'm2' }

describe('採用の権限の例外', () => {
  it('採用関連の操作は実行できる', () => {
    expect(allowed(recruiter, 'addCandidate', { candidate: {} })).toBe(true)
    expect(allowed(recruiter, 'updateCandidate', { candidateId: 'c1' })).toBe(true)
    expect(allowed(recruiter, 'removeCandidate', { candidateId: 'c1' })).toBe(true)
    expect(allowed(recruiter, 'convertCandidateToMember', { candidateId: 'c1', role: '一般' })).toBe(true)
  })

  it('候補者を一般以外の役職でメンバー登録することはできない(役職の付与は代表専用)', () => {
    expect(allowed(recruiter, 'convertCandidateToMember', { candidateId: 'c1', role: '代表' })).toBe(false)
    expect(allowed(recruiter, 'convertCandidateToMember', { candidateId: 'c1', role: '班長' })).toBe(false)
  })

  it('代表専用の操作や設定の変更など、採用と関係のない操作は実行できない', () => {
    for (const action of [...DAIHYO_ONLY, 'updateSetting', 'updateDiscordWebhookUrl', 'updateSlackWebhookUrl', 'testDiscordWebhook', 'testSlackWebhook', 'updateProjectHealth', 'approveTask', 'updateTaskDetails', 'updateJudgment', 'approveExpenseStep', 'fetchDailyReports']) {
      expect(allowed(recruiter, action, SPOOFED_BODY), action).toBe(false)
    }
  })
})

describe('タスク・プロジェクト・部署の権限の例外', () => {
  it('代表専用の操作は、対象IDを偽装してもどの例外でも実行できない', () => {
    for (const acting of [projectEditor, taskEditor, departmentApprover]) {
      for (const action of [...DAIHYO_ONLY, 'addCandidate', 'convertCandidateToMember']) {
        expect(allowed(acting, action, SPOOFED_BODY), action).toBe(false)
      }
    }
  })

  it('設定・Webhook の変更、メンバー情報の変更、経費・フォームの承認は、どの例外でも実行できない', () => {
    for (const acting of [projectEditor, taskEditor, departmentApprover]) {
      for (const action of ['updateSetting', 'updateDiscordWebhookUrl', 'updateSlackWebhookUrl', 'updateJudgment', 'updateEvaluationHistory', 'updateOneOnOnes', 'awardSkillPoints', 'bulkUpdateSkills', 'approveExpenseStep', 'rejectExpense', 'approveFormStep', 'fetchDailyReports', 'createProject']) {
        expect(allowed(acting, action, SPOOFED_BODY), action).toBe(false)
      }
    }
  })

  it('対象のタスク・プロジェクトの操作は実行できる', () => {
    expect(allowed(taskEditor, 'updateTaskDetails', { taskId: 't1' })).toBe(true)
    expect(allowed(projectEditor, 'updateTaskDetails', { taskId: 't1' })).toBe(true)
    expect(allowed(departmentApprover, 'approveTask', { taskId: 't1' })).toBe(true)
    expect(allowed(projectEditor, 'updateProjectDetails', { projectId: 'p1' })).toBe(true)
    expect(allowed(projectEditor, 'updateProjectHealth', { projectId: 'p1' })).toBe(true)
  })

  it('タスクの操作では、リクエストに入れたプロジェクト・部署ではなくシート上の値で判定する', () => {
    // t2 はプロジェクト p2・部署「開発」 — p1 / 広報 と偽装しても通らない
    expect(allowed(projectEditor, 'updateTaskDetails', { taskId: 't2', projectId: 'p1' })).toBe(false)
    expect(allowed(departmentApprover, 'approveTask', { taskId: 't2', department: '広報' })).toBe(false)
    expect(allowed(taskEditor, 'updateTaskDetails', { taskId: 't2' })).toBe(false)
  })

  it('対象外のプロジェクトの操作や、水準が足りない操作は実行できない', () => {
    expect(allowed(projectEditor, 'updateProjectDetails', { projectId: 'p2' })).toBe(false)
    // タスクの承認には approve が必要
    expect(allowed(taskEditor, 'approveTask', { taskId: 't1' })).toBe(false)
    const viewer = member([{ targetType: 'project', targetId: 'p1', access: 'view' }])
    expect(allowed(viewer, 'updateProjectDetails', { projectId: 'p1' })).toBe(false)
  })
})

describe('例外を持たない一般', () => {
  it('管理者の操作も代表専用の操作も実行できない', () => {
    const plain = member([])
    for (const action of [...DAIHYO_ONLY, 'addCandidate', 'updateSetting', 'updateTaskDetails', 'updateProjectDetails']) {
      expect(allowed(plain, action, SPOOFED_BODY), action).toBe(false)
    }
  })
})
