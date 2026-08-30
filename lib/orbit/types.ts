export type TaskStatus = 'todo' | 'progress' | 'support' | 'review' | 'fix' | 'done'

export type Difficulty = '新人歓迎' | '少し経験必要' | '経験者向け'

// 一般 is the fixed, implicit baseline every member starts at — it carries
// no admin access. Everything above it is an admin-defined permission
// level (default 班長/代表, but admins can add/remove levels freely — see
// store.tsx's roleLevels/addRoleLevel/removeRoleLevel), so Role is just a
// free-form string rather than a fixed union.
export type Role = string

export const BASE_ROLE = '一般'

export function isAdminRole(role: Role): boolean {
  return role !== BASE_ROLE
}

// admin-screen sidebar sections — used by store.tsx's rolePermissions to
// gate which sections each non-top admin role level can see (Admin → Tags)
export type AdminSection =
  | 'dashboard'
  | 'assignments'
  | 'approvals'
  | 'projects'
  | 'members'
  | 'tags'
  | 'analytics'

export const ADMIN_SECTIONS: { key: AdminSection; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'projects', label: 'Projects' },
  { key: 'members', label: 'Members' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'tags', label: 'Tags' },
]

// Members/Tags manage org-wide config (roles, notification routing, the
// shared skill/category/role-level pools) — not "this project's" scope, so
// a non-top admin role doesn't get them unless explicitly granted.
export const DEFAULT_NON_TOP_SECTIONS: AdminSection[] = [
  'dashboard',
  'approvals',
  'assignments',
  'projects',
]

// visibility gate for 幹部 (leadership)-only tasks — see Task.visibility
export function canSeeExecTasks(role: Role): boolean {
  return role !== BASE_ROLE
}

export type Priority = '高' | '中' | '低'

export const PRIORITIES: Priority[] = ['高', '中', '低']

// item 9: 承認ルートの拡張 — 重要/対外公開のタスクは最上位管理者のみが
// 承認できる（Task.importance / admin-approvals.tsx）
export type TaskImportance = '一般' | '重要' | '対外公開'

export const TASK_IMPORTANCE: TaskImportance[] = ['一般', '重要', '対外公開']

export const DEPARTMENTS = [
  '運営',
  '広報',
  '開発',
  'デザイン',
  '渉外',
  'イベント',
  'リサーチ',
  '未分類',
] as const

export type Department = (typeof DEPARTMENTS)[number]

export interface ProgressEntry {
  id: string
  text: string
  at: string // ISO datetime
  byId: string
}

// A single natural-language input, before it is split into tasks
export interface TaskInput {
  id: string
  text: string
  createdById: string
  createdAt: string // ISO datetime
  generatedTaskIds: string[]
}

export interface Member {
  id: string
  name: string
  affiliation: string
  role: Role
  avatarColor: string
  initials: string
  // uploaded profile picture (Google Drive-hosted, see gas/README.md's
  // DRIVE_FOLDER_ID setup) — shown instead of the color+initials circle
  // when set
  avatarUrl?: string
  will: string[]
  judgment: string[]
  facts: { label: string; count: number }[]
  skills: string[]
  // one or more addresses, comma-separated (MailApp/CalendarApp on the GAS
  // side accept a comma-joined "to" string natively, so no backend changes
  // are needed to support multiple notification recipients per member)
  email?: string
  // whether this member should receive an email when a new task is
  // registered and needs approval — see store.tsx's notifyRecipients
  notify?: boolean
  // per-notification-kind email frequency settings (see NotifyFrequency /
  // NotifyKind below). Absent keys fall back to 'immediate' for admins,
  // 'immediate' for mention/rejected, 'none' for others.
  notifySettings?: Partial<Record<NotifyKind, NotifyFrequency>>
  // shown instead of `name` throughout the UI when set (item: display name)
  displayName?: string
  // dates (YYYY-MM-DD) this member has marked themselves unavailable on
  unavailableDates?: string[]
  // "admin of admins": which member notifications about this member's tasks
  // should be routed to (e.g. a 班長's 事業部長/代表) — falls back to the
  // default 代表 recipients when unset, see store.tsx's notifyTargetsFor
  reportsToId?: string
  // projects this member is scoped to manage as an admin (design doc §3).
  // Only meaningful for a non-top admin role — see store.tsx's isFullAdmin.
  // A 代表-equivalent (the highest-ranked role level) always sees/manages
  // everything regardless of this list.
  projectIds?: string[]
  // item 14: メンター/サポート担当の設定 — another member assigned to help
  // this one grow. Set by an admin from the person page's 人材育成 tab.
  mentorId?: string
  // 所属開始日（YYYY-MM-DD）— 「経験年数」（社会人経験など、団体外の経験も
  // 含む自己申告の数値）とは別物で、この団体に所属してからの正確な期間を
  // 表示するために使う（person-detail.tsx の「所属歴」）
  joinedAt?: string

  // ---- talent-management fields (タレントマネジメント) --------------------
  // 人材DB／スキル管理／人材検索／育成・キャリア — wired end-to-end (store.tsx
  // actions, remote.ts mapping, gas/Code.gs columns) and surfaced on the
  // person page's 経歴・キャリア tab, Admin → Membersの人材検索フィルタ, and
  // Admin → Analytics (people/skill/evaluation aggregates — see
  // components/orbit/admin/admin-analytics.tsx). See JobTypeSkillRequirement
  // below for the org-wide (not per-member) job-position requirement
  // config, used by 人材育成タブ.

  // 人材検索: filterable attributes
  yearsOfExperience?: number
  hasManagementExperience?: boolean
  // desired growth areas/skills ("成長したい領域やスキル"), distinct from
  // Will (what they want to do) and skills (what they already have)
  desiredAreas?: string[]

  // 人材データベース
  careerHistory?: CareerHistoryEntry[]
  qualifications?: Qualification[]
  evaluationHistory?: EvaluationRecord[]
  transferHistory?: TransferRecord[]

  // スキル管理: per-skill proficiency level and role-relevant competencies,
  // in addition to the existing flat `skills` list
  skillLevels?: SkillLevel[]
  competencies?: Competency[]

  // 育成・キャリア
  careerAspiration?: string
  desiredFutureRole?: string
  careerPlan?: string
  trainingHistory?: TrainingRecord[]
  developmentPlan?: DevelopmentPlanEntry[]
  oneOnOnes?: OneOnOneRecord[]
}

export interface CareerHistoryEntry {
  id: string
  startDate: string // YYYY-MM-DD
  endDate?: string // absent = current
  affiliation: string
  role: string
  description?: string
}

export interface Qualification {
  id: string
  name: string
  acquiredDate?: string // YYYY-MM-DD
  issuer?: string
}

export interface EvaluationRecord {
  id: string
  date: string // YYYY-MM-DD
  evaluatorId: string
  rating: string
  comment?: string
}

export interface TransferRecord {
  id: string
  date: string // YYYY-MM-DD
  fromAffiliation: string
  toAffiliation: string
  reason?: string
}

// 1 (beginner) – 5 (expert), matching the common skill-map convention
export type SkillLevelValue = 1 | 2 | 3 | 4 | 5

export interface SkillLevel {
  skill: string
  level: SkillLevelValue
}

export interface Competency {
  name: string
  level: SkillLevelValue
}

export interface TrainingRecord {
  id: string
  name: string
  date: string // YYYY-MM-DD
  provider?: string
  // 研修申請の承認フロー — 未設定（過去に直接記録された既存データ）は
  // 承認済み扱い。自己申請すると 'pending' で作成され、管理者の承認/却下
  // を待つ（person-detail.tsx の人材育成タブ／career-tab.tsx）
  status?: 'pending' | 'approved' | 'rejected'
}

export interface DevelopmentPlanEntry {
  id: string
  goal: string
  targetDate?: string // YYYY-MM-DD
  status: 'not_started' | 'in_progress' | 'done'
}

export interface OneOnOneRecord {
  id: string
  date: string // YYYY-MM-DD
  withId: string // the other participant (usually reportsToId's member)
  notes: string
}

// スキル管理: 職種ごとの必要スキルとの比較 — an org-wide config (not
// per-member), mapping a job type to the skills/levels it expects.
export interface JobTypeSkillRequirement {
  jobType: string
  requiredSkills: { skill: string; level: SkillLevelValue }[]
}

export interface Project {
  id: string
  name: string
  description: string
  // project "kind" (e.g. コンテンツ開発) — drives which template tasks get
  // auto-created for it, see store.tsx's projectTemplates
  type?: string
  // members assigned to this project (set from Admin → Projects, and
  // grown automatically whenever someone is assigned a task in this
  // project who isn't already on the list — see store.tsx's assignTask)
  memberIds?: string[]
  // 責任者 — the member accountable for this project overall
  ownerId?: string
  // アーカイブ — 終了したプロジェクトを一覧から隠す（削除とは異なり、
  // タスク履歴などのデータは残したまま非表示にするだけ）
  archived?: boolean
}

// A template task an admin defines for a Project type (store.tsx's
// projectTemplates), auto-created whenever a new project of that type
// is added.
export interface ProjectTemplateTask {
  id: string
  name: string
  department: Department
  category: string
  skills: string[]
  difficulty: Difficulty
  priority: Priority
}

// A reusable named task-set template (item 1: タスクのテンプレート化, e.g.
// "イベント開催") — distinct from ProjectTemplateTask/projectTemplates
// (which auto-apply once, at project creation, keyed by project type).
// This kind can be applied on demand to any existing project, and each
// item can depend on other items in the same template so the generated
// tasks come out pre-wired with dependsOnIds (item 1's "前提タスク構造も
// テンプレート化").
export interface TaskSetTemplateItem {
  id: string // template-local id — referenced by dependsOn within this template
  name: string
  department: Department
  category: string
  skills: string[]
  difficulty: Difficulty
  priority: Priority
  dependsOn?: string[] // template-local ids of prerequisite items in this template
}

export interface TaskSetTemplate {
  id: string
  name: string
  description?: string
  items: TaskSetTemplateItem[]
}

// 定期タスク (item 2) — an admin-defined rule that auto-generates one task
// on a weekly/monthly cadence. There's no server-side cron available in
// this GAS + static-export architecture, so generation is checked
// client-side on load (store.tsx) against lastGeneratedDate.
export type RecurrenceFrequency = 'weekly' | 'monthly'

export interface RecurringTaskRule {
  id: string
  name: string
  projectId: string
  department: Department
  category: string
  skills: string[]
  difficulty: Difficulty
  priority: Priority
  frequency: RecurrenceFrequency
  dayOfWeek?: number // 0 (Sun) – 6 (Sat), for frequency 'weekly'
  dayOfMonth?: number // 1–28, for frequency 'monthly' (capped to stay valid in every month)
  dueInDays?: number // deadline offset in days from the generated task's creation date
  active: boolean
  lastGeneratedDate?: string // YYYY-MM-DD — the last date this rule generated a task for
}

export interface Task {
  id: string
  name: string
  description?: string
  projectId: string
  department: Department
  assigneeIds: string[]
  startDate?: string | null // YYYY-MM-DD, when work is expected to begin
  deadline: string | null // YYYY-MM-DD
  dueTime?: string | null // HH:MM, optional time-of-day on top of deadline
  category: string
  skills: string[]
  difficulty: Difficulty
  priority: Priority
  status: TaskStatus
  role?: string
  completedDate?: string | null
  lastActivity?: string // YYYY-MM-DD, for "no progress" detection
  // provenance
  originalInputId?: string
  createdById?: string
  createdAt?: string // ISO datetime
  // progress tracking
  progress?: string // latest progress snapshot
  progressHistory: ProgressEntry[]
  // tasks created from an INPUT submission start out awaiting an admin's
  // approval, and are hidden from the normal workspace views until then
  pendingApproval?: boolean
  // ids of tasks that must happen before this one can start — powers the
  // 依存関係 (dependency tree) view, separate from the ワークフロー kanban
  dependsOnIds?: string[]
  // '幹部' restricts visibility to 班長/代表 (see canSeeExecTasks); undefined/'all' = everyone
  visibility?: 'all' | '幹部'
  // タスクの重要度（item 9: 承認ルートの拡張）— 重要/対外公開のタスクは
  // 登録者の報告先ではなく、最上位の管理者（isFullAdmin）のみ承認できる。
  // 未設定/一般は既存どおり報告先チェーンで承認できる。
  importance?: TaskImportance
  // distinct from assigneeIds — who signs off on this task (pairs with the
  // 'review' status). Unset = no particular reviewer, any admin can review.
  reviewerId?: string
  // "困っている/作業が止まっている" — separate from status so a task can be
  // flagged blocked without losing its in-progress status; cleared (undefined)
  // once resolved
  blocker?: {
    note: string
    since: string // YYYY-MM-DD
  }
  // links to where the finished work lives (Drive/Canva/GitHub/Figma/…) —
  // also reused on the assignee's achievements page
  deliverables?: TaskDeliverable[]
  // audit trail of field changes (assignee/deadline/priority/status/reviewer)
  history?: TaskHistoryEntry[]
  // discussion thread — distinct from progressHistory (which is a status
  // update log, not a conversation)
  comments?: TaskComment[]
  // 想定/実績の所要時間（時間単位）— estimatedHours is set at INPUT time
  // (see parsed-task-card.tsx's category-average suggestion) or edited
  // later; actualHours is filled in around completion. Together these
  // power the Assignments page's per-member 今週の工数 indicator.
  estimatedHours?: number
  actualHours?: number
  // 完了時の振り返り — shown once status is 'done', and surfaced on any
  // future task the similar-task heuristic (findSimilarTasks) flags as
  // related, so lessons carry over instead of being re-learned
  retrospective?: TaskRetrospective
  // 日程調整ツール — see TaskSchedule
  schedule?: TaskSchedule
  // 汎用フォームツール — see TaskForm
  form?: TaskForm
}

export interface TaskRetrospective {
  good: string
  bad: string
  improve: string
}

// 日程調整ツール — 候補日時を作成者が用意し、招待されたメンバーそれぞれが
// 候補ごとに〇×△で回答する。全員が全候補に回答し終えると自動的に
// status: 'done' になり、作成者へ結果とともに通知が飛ぶ
// （store.tsx の respondToSchedule / gas/Code.gs の notifyScheduleResult）
export type ScheduleResponseValue = '○' | '×' | '△'

export interface ScheduleCandidate {
  id: string
  label: string // 自由記述（例: "8/30(土) 14:00〜"）— 細かい日時表現に対応するため
}

export interface TaskSchedule {
  candidates: ScheduleCandidate[]
  invitedIds: string[]
  // memberId -> candidateId -> response
  responses: Record<string, Record<string, ScheduleResponseValue>>
}

// 汎用フォームツール — 作成者が自由に質問項目を用意し、招待した特定の
// メンバーに回答してもらう。招待者全員が回答し終えると自動的に
// status: 'done' になり、作成者へ回答結果とともに通知が飛ぶ
// （store.tsx の respondToForm / gas/Code.gs の notifyFormResult）
export type FormFieldType = 'text' | 'textarea' | 'select' | 'checkbox'

export interface FormFieldDef {
  id: string
  label: string
  type: FormFieldType
  // 'select'（単一選択）・'checkbox'（複数選択）で使う選択肢
  options?: string[]
  required?: boolean
}

// 'text'/'textarea'/'select' は単一の文字列、'checkbox' は複数選択なので文字列配列
export type FormAnswerValue = string | string[]

export interface TaskForm {
  fields: FormFieldDef[]
  invitedIds: string[]
  // memberId -> fieldId -> answer
  responses: Record<string, Record<string, FormAnswerValue>>
}

export interface TaskDeliverable {
  id: string
  label: string
  url: string
}

export interface TaskHistoryEntry {
  id: string
  at: string // ISO datetime
  byId: string
  field:
    | 'assignee'
    | 'deadline'
    | 'startDate'
    | 'priority'
    | 'status'
    | 'reviewer'
    | 'title'
    | 'description'
    | 'project'
    | 'department'
    | 'category'
    | 'skills'
    | 'difficulty'
    | 'visibility'
    | 'importance'
  from: string
  to: string
}

export interface TaskComment {
  id: string
  text: string
  byId: string
  at: string // ISO datetime
  // @表示名/@氏名 表記から自動抽出されたメンバーID（任意）— コメント投稿時に
  // メール通知される（gas/Code.gs の notifyMention）
  mentionedIds?: string[]
}

// Result of natural-language parsing, before approval
export interface ParsedTask {
  id: string
  name: string
  projectId: string
  department: Department
  startDate?: string | null
  deadline: string | null
  dueTime?: string | null
  category: string
  skills: string[]
  difficulty: Difficulty
  priority: Priority
  assigneeIds: string[]
  approved: boolean
  visibility?: 'all' | '幹部'
  // suggested/entered estimate at registration time — see Task.estimatedHours
  estimatedHours?: number
  // see Task.importance
  importance?: TaskImportance
}

export const STATUS_ORDER: TaskStatus[] = [
  'todo',
  'progress',
  'support',
  'review',
  'fix',
  'done',
]

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '未着手',
  progress: '進行中',
  support: 'サポート必要',
  review: '確認待ち',
  fix: '修正中',
  done: '完了',
}

export const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: 'var(--status-todo)',
  progress: 'var(--status-progress)',
  support: 'var(--status-support)',
  review: 'var(--status-review)',
  fix: 'var(--status-fix)',
  done: 'var(--status-done)',
}

export const DIFFICULTY_LABEL: Difficulty[] = [
  '新人歓迎',
  '少し経験必要',
  '経験者向け',
]

// Priority accent line color (used on card left edge). Uses CSS vars so it
// adapts to dark mode.
export const PRIORITY_LINE: Record<Priority, string> = {
  高: 'var(--priority-high)',
  中: 'var(--priority-medium)',
  低: 'var(--priority-low)',
}

// Email notification frequency per notification kind.
// 'immediate': send right away (current default behaviour)
// '3h' / '6h' / '1d': batch and send at most once per window
// 'none': never send
export type NotifyFrequency = 'immediate' | '3h' | '6h' | '1d' | 'none'

// Kinds of email notifications a member can configure independently.
// new_task / review are primarily admin-facing; mention / rejected / deadline
// apply to all members.
export type NotifyKind = 'new_task' | 'review' | 'mention' | 'rejected' | 'deadline'

// An in-app notification item — derived on the fly from current task/member
// state (see store.tsx's `notifications`), not persisted.
export interface NotificationItem {
  id: string
  // 'stale' = item 10 (SLA/放置アラート): 確認待ちが3日以上、または
  // 進行中タスクの更新が7日以上ない場合に表示
  // 'mention' = コメントで@メンションされた（未読のみ表示。store.tsxの
  // seenMentionIds/markMentionSeen参照）
  kind: 'approval' | 'review' | 'deadline' | 'stale' | 'mention'
  title: string
  detail: string
  taskId: string
  // kind: 'mention' のときだけ設定 — 既読化(markMentionSeen)に使う
  commentId?: string
}
