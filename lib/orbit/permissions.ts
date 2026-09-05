// Pure, framework-free permission/routing logic pulled out of store.tsx and
// the admin components so it can be unit-tested (see permissions.test.ts)
// without mounting the whole React context. These are the actual functions
// the app calls, not a parallel reimplementation — keep them in sync by
// editing here, not by re-inlining the logic elsewhere.
import { ADMIN_SECTIONS, BASE_ROLE, DEFAULT_NON_TOP_SECTIONS, STATUS_ORDER } from './types'
import type { AdminSection, Role, TaskImportance, TaskStatus } from './types'

// A role is full admin when it is neither BASE_ROLE nor in the explicit
// restrictedRoles list (configured per-role in the Tags admin screen).
// An empty restrictedRoles means all configured roles are full admin.
// See store.tsx's isFullAdminMember for the Member-object wrapper.
export function isFullAdminRole(role: Role | null | undefined, restrictedRoles: string[]): boolean {
  if (!role || role === BASE_ROLE) return false
  return !restrictedRoles.includes(role)
}

// Which admin-screen sections a role can see — falls back to
// DEFAULT_NON_TOP_SECTIONS (everything but Members/Tags/Analytics) when no
// explicit per-role choice was configured. See store.tsx's
// visibleAdminSections for the currentUser-bound wrapper.
export function resolveVisibleAdminSections(
  role: Role | null | undefined,
  restrictedRoles: string[],
  rolePermissions: Record<string, AdminSection[]>,
): AdminSection[] {
  if (isFullAdminRole(role, restrictedRoles)) return ADMIN_SECTIONS.map((s) => s.key)
  if (!role || role === BASE_ROLE) return []
  const sections = rolePermissions[role] ?? DEFAULT_NON_TOP_SECTIONS
  // dashboard is the redirect target for a disallowed section, so it must
  // always stay reachable to avoid a redirect loop
  return sections.includes('dashboard') ? sections : ['dashboard', ...sections]
}

// ---- タスクのステータス遷移 --------------------------------------------------

// Only an admin or the task's own assignee may change its status at all.
export function canChangeTaskStatus(isAdmin: boolean, isAssignee: boolean): boolean {
  return isAdmin || isAssignee
}

// Which status an assignee/admin/reviewer may set the task to. Every status
// is reachable from every other status (no from-state restriction) except
// 完了, which only an admin or reviewer can set — an assignee's own "I'm
// done" signal is 確認待ち, which a reviewer/admin then confirms into 完了.
// See task-detail-drawer.tsx's statusOptions and list-view.tsx's inline
// status dropdown.
export function allowedStatusOptions(isAdmin: boolean, isReviewer?: boolean): TaskStatus[] {
  return STATUS_ORDER.filter((s) => s !== 'done' || isAdmin || isReviewer)
}

// ---- 承認ルート（importanceに応じた承認者判定）------------------------------

// 重要/対外公開 タスクは登録者の報告先チェーンを経由せず、最上位の管理者
// （isFullAdmin）のみが承認できる（item 9: 承認ルートの拡張）。
export function isEscalatedTask(importance: TaskImportance | undefined): boolean {
  return importance === '重要' || importance === '対外公開'
}

// Mirrors admin-approvals.tsx's canApprove: a full admin can always
// approve. Otherwise, an escalated (重要/対外公開) task can only be
// approved by a full admin — nobody else, regardless of reportsToId.
// A non-escalated task can be approved by anyone unless the task
// creator's reportsToId names a specific approver, in which case only
// that approver (or a full admin) may approve it.
export function canApproveTask(
  isFullAdmin: boolean,
  importance: TaskImportance | undefined,
  approverId: string | undefined,
  currentUserId: string | null | undefined,
): boolean {
  if (isFullAdmin) return true
  if (isEscalatedTask(importance)) return false
  return !approverId || approverId === currentUserId
}
