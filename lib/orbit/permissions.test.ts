import { describe, it, expect } from 'vitest'
import {
  isFullAdminRole,
  resolveVisibleAdminSections,
  canChangeTaskStatus,
  allowedStatusOptions,
  isEscalatedTask,
  canApproveTask,
} from './permissions'
import { BASE_ROLE, STATUS_ORDER } from './types'

// restrictedRoles is the explicit list of role names with restricted access.
// In this test suite, only '班長' is restricted.
const RESTRICTED = ['班長']

describe('isFullAdminRole', () => {
  it('一般 (BASE_ROLE) is never full admin', () => {
    expect(isFullAdminRole(BASE_ROLE, RESTRICTED)).toBe(false)
  })

  it('null/undefined role is never full admin', () => {
    expect(isFullAdminRole(null, RESTRICTED)).toBe(false)
    expect(isFullAdminRole(undefined, RESTRICTED)).toBe(false)
  })

  it('a role in restrictedRoles is not full admin', () => {
    expect(isFullAdminRole('班長', RESTRICTED)).toBe(false)
  })

  it('roles not in restrictedRoles are full admin', () => {
    expect(isFullAdminRole('事業責任者', RESTRICTED)).toBe(true)
    expect(isFullAdminRole('代表', RESTRICTED)).toBe(true)
  })

  it('with an empty restrictedRoles list, any non-一般 role is full admin', () => {
    expect(isFullAdminRole('班長', [])).toBe(true)
    expect(isFullAdminRole('代表', [])).toBe(true)
    expect(isFullAdminRole(BASE_ROLE, [])).toBe(false)
  })

  it('a role name not in restrictedRoles is still full admin', () => {
    expect(isFullAdminRole('未知の役職', RESTRICTED)).toBe(true)
  })
})

describe('resolveVisibleAdminSections', () => {
  it('a full admin sees every admin section', () => {
    const sections = resolveVisibleAdminSections('代表', RESTRICTED, {})
    expect(sections).toEqual(
      expect.arrayContaining(['dashboard', 'approvals', 'assignments', 'projects', 'members', 'analytics', 'tags']),
    )
  })

  it('一般 sees no admin sections at all', () => {
    expect(resolveVisibleAdminSections(BASE_ROLE, RESTRICTED, {})).toEqual([])
  })

  it('a restricted role falls back to DEFAULT_NON_TOP_SECTIONS when unconfigured', () => {
    const sections = resolveVisibleAdminSections('班長', RESTRICTED, {})
    expect(sections).toEqual(expect.arrayContaining(['dashboard', 'approvals', 'assignments', 'projects']))
    expect(sections).not.toContain('members')
    expect(sections).not.toContain('tags')
  })

  it('an explicit rolePermissions entry overrides the default for a restricted role', () => {
    const sections = resolveVisibleAdminSections('班長', RESTRICTED, { 班長: ['projects'] })
    expect(sections).toEqual(expect.arrayContaining(['projects', 'dashboard']))
    expect(sections).not.toContain('approvals')
  })

  it('always includes dashboard even if the configured list omits it, to avoid a redirect loop', () => {
    const sections = resolveVisibleAdminSections('班長', RESTRICTED, { 班長: ['projects'] })
    expect(sections).toContain('dashboard')
  })
})

describe('canChangeTaskStatus', () => {
  it('a full admin can always change status', () => {
    expect(canChangeTaskStatus(true, false)).toBe(true)
  })

  it('the assignee can change status', () => {
    expect(canChangeTaskStatus(false, true)).toBe(true)
  })

  it('neither a full admin nor the assignee cannot change status — this also covers a restricted admin role (isAdminRole true but not isActingFullAdmin, e.g. a 班長 in restrictedRoles), since merely being a non-一般 admin role is not sufficient on its own, matching gas/Code.gs requiring isActingFullAdmin OR assignee', () => {
    expect(canChangeTaskStatus(false, false)).toBe(false)
  })
})

describe('allowedStatusOptions', () => {
  it('a non-full-admin cannot set 完了 (done) directly', () => {
    const options = allowedStatusOptions(false)
    expect(options).not.toContain('done')
    // every other status stays reachable
    expect(options).toEqual(STATUS_ORDER.filter((s) => s !== 'done'))
  })

  it('a full admin can set every status, including 完了', () => {
    expect(allowedStatusOptions(true)).toEqual(STATUS_ORDER)
  })

  it('when the task has reviewers, 完了 is excluded even for a full admin — only the dedicated approval flow can complete it', () => {
    expect(allowedStatusOptions(true, false, true)).not.toContain('done')
    expect(allowedStatusOptions(true, true, true)).not.toContain('done')
  })

  it('a reviewer (not full admin) can set 完了 only when the task has no reviewers list gating it via hasReviewers=false', () => {
    expect(allowedStatusOptions(false, true, false)).toContain('done')
    expect(allowedStatusOptions(false, false, false)).not.toContain('done')
  })
})

describe('isEscalatedTask', () => {
  it('重要 and 対外公開 are escalated', () => {
    expect(isEscalatedTask('重要')).toBe(true)
    expect(isEscalatedTask('対外公開')).toBe(true)
  })

  it('一般 and unset are not escalated', () => {
    expect(isEscalatedTask('一般')).toBe(false)
    expect(isEscalatedTask(undefined)).toBe(false)
  })
})

describe('canApproveTask', () => {
  it('a full admin can approve anything, escalated or not', () => {
    expect(canApproveTask(true, '対外公開', 'm-someone-else', 'm-me')).toBe(true)
    expect(canApproveTask(true, '一般', undefined, 'm-me')).toBe(true)
  })

  it('a non-admin can never approve an escalated task, even if named as the approver', () => {
    expect(canApproveTask(false, '重要', 'm-me', 'm-me')).toBe(false)
    expect(canApproveTask(false, '対外公開', undefined, 'm-me')).toBe(false)
  })

  it('a non-admin can approve a non-escalated task with no designated approver', () => {
    expect(canApproveTask(false, '一般', undefined, 'm-me')).toBe(true)
    expect(canApproveTask(false, undefined, undefined, 'm-me')).toBe(true)
  })

  it('a non-admin can approve a non-escalated task only if they are the designated approver', () => {
    expect(canApproveTask(false, '一般', 'm-me', 'm-me')).toBe(true)
    expect(canApproveTask(false, '一般', 'm-other', 'm-me')).toBe(false)
  })

  it('a non-admin with no current user id cannot match a designated approver', () => {
    expect(canApproveTask(false, '一般', 'm-other', null)).toBe(false)
    expect(canApproveTask(false, '一般', 'm-other', undefined)).toBe(false)
  })
})
