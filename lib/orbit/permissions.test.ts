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

// Default 3-tier setup used across the app (Admin > Tags): 班長 (bottom) <
// 事業責任者 < 代表 (top). Only the bottom tier is scoped/non-full-admin.
const ROLE_LEVELS = ['班長', '事業責任者', '代表']

describe('isFullAdminRole', () => {
  it('一般 (BASE_ROLE) is never full admin', () => {
    expect(isFullAdminRole(BASE_ROLE, ROLE_LEVELS)).toBe(false)
  })

  it('null/undefined role is never full admin', () => {
    expect(isFullAdminRole(null, ROLE_LEVELS)).toBe(false)
    expect(isFullAdminRole(undefined, ROLE_LEVELS)).toBe(false)
  })

  it('the bottom-most configured tier is not full admin', () => {
    expect(isFullAdminRole('班長', ROLE_LEVELS)).toBe(false)
  })

  it('every tier above the bottom is full admin, including the middle tier', () => {
    expect(isFullAdminRole('事業責任者', ROLE_LEVELS)).toBe(true)
    expect(isFullAdminRole('代表', ROLE_LEVELS)).toBe(true)
  })

  it('with zero configured role levels, any non-一般 role is full admin', () => {
    expect(isFullAdminRole('何か', [])).toBe(true)
    expect(isFullAdminRole(BASE_ROLE, [])).toBe(false)
  })

  it('with a single configured role level, that tier is trivially full admin', () => {
    expect(isFullAdminRole('幹部', ['幹部'])).toBe(true)
  })

  it('a role name unrelated to roleLevels[0] is still full admin (only the exact bottom string is scoped)', () => {
    expect(isFullAdminRole('未知の役職', ROLE_LEVELS)).toBe(true)
  })
})

describe('resolveVisibleAdminSections', () => {
  it('a full admin sees every admin section', () => {
    const sections = resolveVisibleAdminSections('代表', ROLE_LEVELS, {})
    expect(sections).toEqual(
      expect.arrayContaining(['dashboard', 'approvals', 'assignments', 'projects', 'members', 'analytics', 'tags']),
    )
  })

  it('一般 sees no admin sections at all', () => {
    expect(resolveVisibleAdminSections(BASE_ROLE, ROLE_LEVELS, {})).toEqual([])
  })

  it('the bottom tier falls back to DEFAULT_NON_TOP_SECTIONS when unconfigured', () => {
    const sections = resolveVisibleAdminSections('班長', ROLE_LEVELS, {})
    expect(sections).toEqual(expect.arrayContaining(['dashboard', 'approvals', 'assignments', 'projects']))
    expect(sections).not.toContain('members')
    expect(sections).not.toContain('tags')
  })

  it('an explicit rolePermissions entry overrides the default for the bottom tier', () => {
    const sections = resolveVisibleAdminSections('班長', ROLE_LEVELS, { 班長: ['projects'] })
    expect(sections).toEqual(expect.arrayContaining(['projects', 'dashboard']))
    expect(sections).not.toContain('approvals')
  })

  it('always includes dashboard even if the configured list omits it, to avoid a redirect loop', () => {
    const sections = resolveVisibleAdminSections('班長', ROLE_LEVELS, { 班長: ['projects'] })
    expect(sections).toContain('dashboard')
  })
})

describe('canChangeTaskStatus', () => {
  it('an admin can always change status', () => {
    expect(canChangeTaskStatus(true, false)).toBe(true)
  })

  it('the assignee can change status', () => {
    expect(canChangeTaskStatus(false, true)).toBe(true)
  })

  it('neither admin nor assignee cannot change status', () => {
    expect(canChangeTaskStatus(false, false)).toBe(false)
  })
})

describe('allowedStatusOptions', () => {
  it('a non-admin cannot set 完了 (done) directly', () => {
    const options = allowedStatusOptions(false)
    expect(options).not.toContain('done')
    // every other status stays reachable
    expect(options).toEqual(STATUS_ORDER.filter((s) => s !== 'done'))
  })

  it('an admin can set every status, including 完了', () => {
    expect(allowedStatusOptions(true)).toEqual(STATUS_ORDER)
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
