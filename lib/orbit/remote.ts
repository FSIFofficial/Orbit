// Wires the app to the real "database": three Google Sheets tabs
// (Members / Projects / Tasks) published as CSV for reads, and a Google
// Apps Script Web App for writes. See gas/README.md for the sheet schema
// and deployment steps. All of this is optional — when the env vars below
// aren't set (e.g. local dev), the app falls back to the local seed data
// exactly as before.
import type {
  AdminSection,
  CareerHistoryEntry,
  Competency,
  Department,
  DevelopmentPlanEntry,
  Difficulty,
  EvaluationRecord,
  Member,
  OneOnOneRecord,
  ParsedTask,
  Priority,
  Project,
  ProjectTemplateTask,
  ProgressEntry,
  Qualification,
  QuizDefinition,
  RadarAxis,
  RecurringTaskRule,
  Role,
  SkillLevel,
  SkillLevelThresholds,
  Task,
  TaskComment,
  TaskDeliverable,
  TaskForm,
  TaskHistoryEntry,
  TaskImportance,
  TaskRetrospective,
  TaskSchedule,
  TaskSetTemplate,
  TaskStatus,
  TrainingRecord,
  TransferRecord,
  NotifyFrequency,
  NotifyKind,
  PermissionOverride,
  SkillPoints,
} from './types'
import { STATUS_LABEL, isAdminRole } from './types'
import { getGasAuthToken, refreshGasAuthToken } from './google-sheet-sync'

// NEXT_PUBLIC_ vars are inlined at build time by Next.js. They must be
// referenced by their literal full name (not a dynamic key) to be inlined.
const MEMBERS_CSV_URL = process.env.NEXT_PUBLIC_MEMBERS_CSV
const PROJECTS_CSV_URL = process.env.NEXT_PUBLIC_PROJECTS_CSV
const TASKS_CSV_URL = process.env.NEXT_PUBLIC_TASKS_CSV
const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL
// optional — only gates profile-picture uploads (see gas/README.md); the
// folder id isn't sensitive on its own (uploaded files get their own
// per-file sharing, the folder itself needn't be publicly listable), so
// it's fine to inline like the other NEXT_PUBLIC_ config.
const DRIVE_FOLDER_ID = process.env.NEXT_PUBLIC_DRIVE_FOLDER_ID
// optional — a 4th published-CSV sheet ("Settings", key/value rows) that
// syncs the skill/category/role-level option pools and project-type
// templates across everyone's browser, instead of each browser keeping
// its own localStorage-only copy (see gas/README.md).
const SETTINGS_CSV_URL = process.env.NEXT_PUBLIC_SETTINGS_CSV

export const isRemoteConfigured = !!(
  MEMBERS_CSV_URL &&
  PROJECTS_CSV_URL &&
  TASKS_CSV_URL &&
  GAS_URL
)

export const isDriveConfigured = isRemoteConfigured && !!DRIVE_FOLDER_ID
export const isSettingsConfigured = isRemoteConfigured && !!SETTINGS_CSV_URL

// ---- CSV parsing ------------------------------------------------------

// Small state-machine CSV parser (handles quoted fields, embedded commas /
// newlines, and doubled "" quote escaping) — Google Sheets' published CSV
// output needs this; a naive split(',') breaks on any quoted field.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c === '\r') {
      // skip; \r\n handled by the following \n
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

// Parses CSV text into an array of header-keyed row objects.
function parseCsvAsRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []
  const headers = rows[0].map((h) => h.trim())
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {}
    headers.forEach((h, i) => {
      rec[h] = (r[i] ?? '').trim()
    })
    return rec
  })
}

async function fetchCsvRecords(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`CSV fetch failed (${res.status}): ${url}`)
  const text = await res.text()
  return parseCsvAsRecords(text)
}

function splitTags(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// ---- domain mapping -----------------------------------------------------
// Sheet columns follow the alpha design doc's Members/Projects/Tasks
// schema. A handful of extra columns beyond the doc (department, category,
// skills, difficulty, priority, completed_date, last_activity,
// progress_note, original_input_id) carry the richer fields this UI grew
// during the mock phase — see gas/README.md for the full column list.

export const AVATAR_PALETTE = ['#6366f1', '#db2777', '#059669', '#d97706', '#0ea5e9', '#8b5cf6', '#e11d48', '#0891b2']

export function colorForId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

export function initialsForName(name: string): string {
  const cleaned = name.replace(/^（例）/, '').trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return cleaned.slice(0, 2).toUpperCase()
}

// Admins can define custom permission levels above the fixed 一般 baseline
// (see store.tsx's roleLevels), so any non-blank sheet value is trusted
// as-is — only a blank cell falls back to the baseline.
function roleFromSheet(role: string): Role {
  return role && role.trim() ? role.trim() : '一般'
}

function mapMemberRow(r: Record<string, string>, projectsById: Map<string, Project>): Member {
  const projectIds = splitTags(r.project_ids)
  const will = splitTags(r.will_tags)
  const judgment = splitTags(r.judgment_tags)
  const role = roleFromSheet(r.role)
  const affiliation =
    projectIds.length > 0
      ? projectIds.map((pid) => projectsById.get(pid)?.name ?? pid).join(' / ')
      : isAdminRole(role)
        ? '運営'
        : ''
  return {
    id: r.id,
    name: r.name,
    affiliation,
    role,
    avatarColor: r.avatar_color || colorForId(r.id),
    initials: r.avatar_initials || initialsForName(r.name),
    avatarUrl: r.avatar_url || undefined,
    projectIds: projectIds.length > 0 ? projectIds : undefined,
    // Fact (past-performance) matching is explicitly out of scope for the
    // alpha (cold start, no history yet) — always empty.
    facts: [],
    will,
    judgment,
    // Talent matching (design doc §7) scores on will+judgment tags; skills
    // is derived from the same two so the existing matching UI keeps working.
    skills: [...will, ...judgment],
    email: r.email || undefined,
    notify: /^(true|1|yes)$/i.test((r.notify_new_task || '').trim()),
    notifySettings: parseJsonObject<Partial<Record<NotifyKind, NotifyFrequency>>>(r.notify_settings),
    displayName: r.display_name || undefined,
    unavailableDates: splitTags(r.unavailable_dates),
    reportsToId: r.reports_to_id || undefined,
    mentorId: r.mentor_id || undefined,
    joinedAt: r.joined_at || undefined,
    // ---- タレントマネジメント (人材DB／スキル管理／人材検索／育成・キャリア) ----
    yearsOfExperience: r.years_of_experience ? Number(r.years_of_experience) : undefined,
    hasManagementExperience: /^(true|1|yes)$/i.test((r.has_management_experience || '').trim()),
    desiredAreas: splitTags(r.desired_areas),
    careerHistory: parseJsonArray<CareerHistoryEntry>(r.career_history_json),
    qualifications: parseJsonArray<Qualification>(r.qualifications_json),
    evaluationHistory: parseJsonArray<EvaluationRecord>(r.evaluation_history_json),
    transferHistory: parseJsonArray<TransferRecord>(r.transfer_history_json),
    skillLevels: parseJsonArray<SkillLevel>(r.skill_levels_json),
    competencies: parseJsonArray<Competency>(r.competencies_json),
    careerAspiration: r.career_aspiration || undefined,
    desiredFutureRole: r.desired_future_role || undefined,
    careerPlan: r.career_plan || undefined,
    trainingHistory: parseJsonArray<TrainingRecord>(r.training_history_json),
    developmentPlan: parseJsonArray<DevelopmentPlanEntry>(r.development_plan_json),
    oneOnOnes: parseJsonArray<OneOnOneRecord>(r.one_on_ones_json),
    // ---- 組織階層・権限・スキルポイント ----------------------------------------
    departmentPath: r.department_path || undefined,
    permissionOverrides: parseJsonArray<PermissionOverride>(r.permission_overrides_json),
    skillPoints: parseJsonObject<SkillPoints>(r.skill_points_json),
    inactive: r.inactive === 'TRUE' ? true : undefined,
    absentDates: splitTags(r.absent_dates),
    lastLogin: r.last_login || undefined,
    timezone: r.timezone || undefined,
  }
}

function mapProjectRow(r: Record<string, string>): Project {
  const memberIds = splitTags(r.member_ids)
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    type: r.type || undefined,
    memberIds: memberIds.length > 0 ? memberIds : undefined,
    ownerId: r.owner_id || undefined,
    parentId: r.parent_id || undefined,
    archived: r.archived === 'TRUE',
  }
}

const STATUS_FROM_LABEL: Record<string, TaskStatus> = Object.fromEntries(
  (Object.entries(STATUS_LABEL) as [TaskStatus, string][]).map(([k, v]) => [v, k]),
)

function statusFromSheet(status: string): TaskStatus {
  // any unrecognized value (blank cell, typo) falls back to 進行中
  return STATUS_FROM_LABEL[status] ?? 'progress'
}

function mapTaskRow(r: Record<string, string>): Task {
  return {
    id: r.id,
    name: r.title,
    description: r.description ?? '',
    projectId: r.project_id,
    department: (r.department || '未分類') as Department,
    assigneeIds: splitTags(r.assignee_id),
    startDate: r.start_date || null,
    deadline: r.due_date || null,
    dueTime: r.due_time || null,
    category: r.category || '',
    skills: splitTags(r.skills),
    difficulty: (r.difficulty || '新人歓迎') as Difficulty,
    priority: (r.priority || '中') as Priority,
    status: statusFromSheet(r.status),
    completedDate: r.completed_date || null,
    lastActivity: r.last_activity || r.created_at || undefined,
    originalInputId: r.original_input_id || undefined,
    createdById: r.creator_id || undefined,
    createdAt: r.created_at || undefined,
    progress: r.progress_note || undefined,
    progressHistory: parseJsonArray<ProgressEntry>(r.progress_history_json) ?? [],
    pendingApproval: r.approval_status === '承認待ち',
    dependsOnIds: splitTags(r.depends_on_ids),
    visibility: r.visibility === '幹部' ? '幹部' : 'all',
    reviewerId: r.reviewer_id || undefined,
    reviewerIds: r.reviewer_ids ? splitTags(r.reviewer_ids) : (r.reviewer_id ? [r.reviewer_id] : undefined),
    blocker: r.blocker_note ? { note: r.blocker_note, since: r.blocker_since || '' } : undefined,
    deliverables: parseJsonArray<TaskDeliverable>(r.deliverables_json),
    history: parseJsonArray<TaskHistoryEntry>(r.history_json),
    comments: parseJsonArray<TaskComment>(r.comments_json),
    estimatedHours: r.estimated_hours ? Number(r.estimated_hours) : undefined,
    actualHours: r.actual_hours ? Number(r.actual_hours) : undefined,
    retrospective: parseJsonObject<TaskRetrospective>(r.retrospective_json),
    importance: (r.importance || undefined) as Task['importance'],
    schedule: parseJsonObject<TaskSchedule>(r.schedule_json),
    form: parseJsonObject<TaskForm>(r.form_json),
    awardedPoints: parseJsonObject<SkillPoints>(r.awarded_points_json),
    requiredApprovals: r.required_approvals
      ? r.required_approvals === 'all' ? 'all' : Number(r.required_approvals)
      : undefined,
  }
}

// Parses an optional JSON-array cell (deliverables_json/history_json) —
// missing/malformed content just comes back empty rather than throwing.
function parseJsonArray<T>(raw: string | undefined): T[] | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : undefined
  } catch {
    return undefined
  }
}

// Same as parseJsonArray but for a single JSON object cell (retrospective_json)
function parseJsonObject<T>(raw: string | undefined): T | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as T)
      : undefined
  } catch {
    return undefined
  }
}

export interface RemoteData {
  members: Member[]
  projects: Project[]
  tasks: Task[]
}

export async function fetchRemoteData(): Promise<RemoteData> {
  if (!MEMBERS_CSV_URL || !PROJECTS_CSV_URL || !TASKS_CSV_URL) {
    throw new Error('Remote CSV URLs are not configured')
  }
  const [memberRows, projectRows, taskRows] = await Promise.all([
    fetchCsvRecords(MEMBERS_CSV_URL),
    fetchCsvRecords(PROJECTS_CSV_URL),
    fetchCsvRecords(TASKS_CSV_URL),
  ])
  const projects = projectRows.map(mapProjectRow)
  const projectsById = new Map(projects.map((p) => [p.id, p]))
  const members = memberRows.map((r) => {
    const m = mapMemberRow(r, projectsById)
    // Apply locally-cached avatar URL when the published CSV is still stale
    // (Google Sheets can lag several minutes after a GAS write). Once the CSV
    // catches up and returns the URL itself, the cached value is redundant but
    // harmless, and the CSV value wins (overrides the local one) once it's set.
    if (!m.avatarUrl) {
      try {
        const cached = localStorage.getItem(`orbit-avatar-url-${m.id}`)
        if (cached) m.avatarUrl = cached
      } catch {}
    }
    return m
  })
  const tasks = taskRows.map(mapTaskRow)
  return { members, projects, tasks }
}

export interface RemoteSettings {
  skillOptions: string[]
  categoryOptions: string[]
  roleLevels: string[]
  projectTemplates: Record<string, ProjectTemplateTask[]>
  rolePermissions: Record<string, AdminSection[]>
  taskSetTemplates: TaskSetTemplate[]
  recurringRules: RecurringTaskRule[]
  // item 17: ポジション要件 — jobType (role level string) -> required skills
  jobRequirements: Record<string, string[]>
  // 要求分野: field name pool + field -> constituent skills + acquisition threshold
  skillFieldOptions: string[]
  skillFieldSkills: Record<string, string[]>
  skillFieldThreshold: number | null
  // 団体メール — 個々のメンバーの通知設定に関わらず常に通知先へ含める
  // 共有配信先アドレス（幹部/事業責任者=full adminがAdmin > Tagsで追加）
  orgNotificationEmails: string[]
  // プロジェクトの表示順（プロジェクトIDの配列）— Admin > Projectsのドラッグ
  // 並び替えで設定。載っていないIDは末尾に元の順序のまま追加される
  projectOrder: string[]
  // 制限付きロール — Tags画面で「制限あり」に設定されたロール名のリスト。
  // リストにないロールは全管理者権限を持つ
  restrictedRoles: string[]
  // スキルポイントのレベルアップ閾値 — { "デフォルト": 100, "デザイン": 150 }
  skillLevelThresholds: SkillLevelThresholds
  // 検定定義リスト — Settings キー "quiz_definitions"
  quizDefinitions: QuizDefinition[]
  // レーダーチャート軸定義 — Settings キー "radar_axes"
  radarAxes: RadarAxis[]
  // 経費カテゴリ — Settings キー "expense_categories"
  expenseCategories: import('./types').ExpenseCategory[]
  // カスタムフォーム定義 — Settings キー "custom_form_defs"
  customFormDefs: import('./types').CustomFormDef[]
  // 団体名・ロゴ — Settings キー "org_name" / "org_logo_url"
  orgName: string
  orgLogoUrl: string
  // 1on1ワークシート質問項目 — Settings キー "one_on_one_questions"
  oneOnOneQuestions: string[]
  // 初ログイン時付与タスク — Settings キー "initial_tasks_json"
  initialTasks: { name: string; description: string }[]
}

// Reads the optional "Settings" sheet (key,value rows) — see
// gas/README.md. Any missing/unparseable key just comes back empty, so
// callers merge with their own defaults.
export async function fetchSettings(): Promise<RemoteSettings> {
  if (!SETTINGS_CSV_URL) throw new Error('Settings CSV URL is not configured')
  const rows = await fetchCsvRecords(SETTINGS_CSV_URL)
  const byKey = new Map(rows.map((r) => [r.key, r.value ?? '']))
  let projectTemplates: Record<string, ProjectTemplateTask[]> = {}
  try {
    const raw = byKey.get('project_templates')
    if (raw) projectTemplates = JSON.parse(raw)
  } catch {
    // malformed JSON in the sheet — fall back to empty rather than throwing
  }
  let rolePermissions: Record<string, AdminSection[]> = {}
  try {
    const raw = byKey.get('role_permissions')
    if (raw) rolePermissions = JSON.parse(raw)
  } catch {
    // malformed JSON in the sheet — fall back to empty rather than throwing
  }
  let taskSetTemplates: TaskSetTemplate[] = []
  try {
    const raw = byKey.get('task_set_templates')
    if (raw) taskSetTemplates = JSON.parse(raw)
  } catch {
    // malformed JSON in the sheet — fall back to empty rather than throwing
  }
  let recurringRules: RecurringTaskRule[] = []
  try {
    const raw = byKey.get('recurring_rules')
    if (raw) recurringRules = JSON.parse(raw)
  } catch {
    // malformed JSON in the sheet — fall back to empty rather than throwing
  }
  let jobRequirements: Record<string, string[]> = {}
  try {
    const raw = byKey.get('job_requirements')
    if (raw) jobRequirements = JSON.parse(raw)
  } catch {
    // malformed JSON in the sheet — fall back to empty rather than throwing
  }
  let skillFieldSkills: Record<string, string[]> = {}
  try {
    const raw = byKey.get('skill_field_skills')
    if (raw) skillFieldSkills = JSON.parse(raw)
  } catch {
    // malformed JSON in the sheet — fall back to empty rather than throwing
  }
  const thresholdRaw = byKey.get('skill_field_threshold')
  const skillFieldThreshold = thresholdRaw ? Number(thresholdRaw) : null
  return {
    skillOptions: splitTags(byKey.get('skill_options')),
    categoryOptions: splitTags(byKey.get('category_options')),
    roleLevels: splitTags(byKey.get('role_levels')),
    projectTemplates,
    rolePermissions,
    taskSetTemplates,
    recurringRules,
    jobRequirements,
    skillFieldOptions: splitTags(byKey.get('skill_field_options')),
    skillFieldSkills,
    skillFieldThreshold: Number.isFinite(skillFieldThreshold) ? skillFieldThreshold : null,
    orgNotificationEmails: splitTags(byKey.get('org_notification_emails')),
    orgName: byKey.get('org_name') ?? '',
    orgLogoUrl: byKey.get('org_logo_url') ?? '',
    projectOrder: splitTags(byKey.get('project_order')),
    restrictedRoles: splitTags(byKey.get('restricted_roles')),
    skillLevelThresholds: (() => {
      try { const r = byKey.get('skill_level_thresholds'); return r ? JSON.parse(r) : {} } catch { return {} }
    })(),
    quizDefinitions: (() => {
      try { const r = byKey.get('quiz_definitions'); return r ? JSON.parse(r) : [] } catch { return [] }
    })(),
    radarAxes: (() => {
      try { const r = byKey.get('radar_axes'); return r ? JSON.parse(r) : [] } catch { return [] }
    })(),
    expenseCategories: (() => {
      try { const r = byKey.get('expense_categories'); return r ? JSON.parse(r) : [] } catch { return [] }
    })(),
    customFormDefs: (() => {
      try { const r = byKey.get('custom_form_defs'); return r ? JSON.parse(r) : [] } catch { return [] }
    })(),
    oneOnOneQuestions: (() => {
      try { const r = byKey.get('one_on_one_questions'); return r ? JSON.parse(r) : [] } catch { return [] }
    })(),
    initialTasks: (() => {
      try { const r = byKey.get('initial_tasks_json'); return r ? JSON.parse(r) : [] } catch { return [] }
    })(),
  }
}

// ---- writes (Google Apps Script Web App) ---------------------------------

export interface CreateTaskPayload {
  tempId: string
  title: string
  description?: string
  projectId: string
  department: string
  category: string
  skills: string[]
  difficulty: Difficulty
  priority: Priority
  startDate?: string | null
  deadline: string | null
  dueTime?: string | null
  assigneeIds?: string[]
  creatorId?: string
  originalInputId?: string
  pendingApproval?: boolean
  visibility?: 'all' | '幹部'
  estimatedHours?: number
  importance?: string
}

async function postToGas<T = unknown>(action: string, payload: Record<string, unknown>): Promise<T> {
  if (!GAS_URL) throw new Error('GAS Web App URL is not configured')

  const doFetch = async (authToken: string | null) => {
    const res = await fetch(GAS_URL!, {
      method: 'POST',
      // text/plain avoids a CORS preflight (Apps Script doesn't handle
      // OPTIONS); the body is still JSON, parsed server-side with JSON.parse.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, authToken, ...payload }),
    })
    // GAS always returns JSON from doPost. A non-JSON response (HTML) means
    // the request was redirected to a login page (auth config issue) or the
    // script itself failed to load (syntax error, undeployed version, etc.).
    const text = await res.text()
    try {
      return JSON.parse(text) as { ok: boolean; result?: T; error?: string; authError?: boolean }
    } catch {
      throw new Error(
        'GASスクリプトからJSONが返りませんでした。' +
        'GASのデプロイ設定（「全員」アクセス）またはスクリプトのコピーを確認してください。',
      )
    }
  }

  let json = await doFetch(getGasAuthToken())

  // Auth error (expired token): silently refresh and retry once.
  // GIS prompt:'' avoids showing a popup if the user's Google session is active.
  if (!json.ok && json.authError) {
    try {
      const newToken = await refreshGasAuthToken()
      json = await doFetch(newToken)
    } catch {
      // Silent refresh failed (Google session also expired) — surface original error
      throw new Error(json.error || `GAS action "${action}" failed`)
    }
  }

  if (!json.ok) throw new Error(json.error || `GAS action "${action}" failed`)
  return json.result as T
}

export const remoteApi = {
  createTasks: (tasks: CreateTaskPayload[]) =>
    postToGas<{ tempId: string; id: string }[]>('createTasks', { tasks }),
  updateTaskStatus: (taskId: string, status: TaskStatus) =>
    postToGas('updateTaskStatus', { taskId, status: STATUS_LABEL[status] }),
  assignTask: (taskId: string, assigneeIds: string[]) =>
    postToGas('assignTask', { taskId, assigneeIds }),
  updatePriority: (taskId: string, priority: Priority) =>
    postToGas('updatePriority', { taskId, priority }),
  updateDifficulty: (taskId: string, difficulty: Difficulty) =>
    postToGas('updateDifficulty', { taskId, difficulty }),
  updateTaskDetails: (
    taskId: string,
    details: {
      name: string
      description: string
      projectId: string
      department: Department
      category: string
      skills: string[]
      difficulty: Difficulty
      priority: Priority
      visibility: 'all' | '幹部'
      importance: TaskImportance
    },
  ) =>
    postToGas('updateTaskDetails', {
      taskId,
      name: details.name,
      description: details.description,
      projectId: details.projectId,
      department: details.department,
      category: details.category,
      skills: details.skills,
      difficulty: details.difficulty,
      priority: details.priority,
      visibility: details.visibility,
      importance: details.importance,
    }),
  updateProgress: (taskId: string, text: string, progressHistory: ProgressEntry[]) =>
    postToGas('updateProgress', { taskId, text, progressHistory }),
  updateWill: (memberId: string, will: string[]) => postToGas('updateWill', { memberId, will }),
  updateJudgment: (memberId: string, judgment: string[]) =>
    postToGas('updateJudgment', { memberId, judgment }),
  approveTask: (taskId: string) => postToGas('approveTask', { taskId }),
  removeTask: (taskId: string) => postToGas('removeTask', { taskId }),
  notifyTaskRejected: (taskId: string, creatorId: string | undefined, taskName: string, reason: string | undefined) =>
    postToGas('notifyTaskRejected', { taskId, creatorId, taskName, reason }),
  createProject: (name: string, description: string, type?: string, parentId?: string) =>
    postToGas<{ id: string }>('createProject', { name, description, type, parentId }),
  removeProject: (projectId: string) => postToGas('removeProject', { projectId }),
  removeMember: (memberId: string) => postToGas('removeMember', { memberId }),
  updateNotify: (memberId: string, notify: boolean) =>
    postToGas('updateNotify', { memberId, notify }),
  updateNotifySettings: (memberId: string, settings: Partial<Record<NotifyKind, NotifyFrequency>>) =>
    postToGas('updateNotifySettings', { memberId, settings }),
  updateRole: (memberId: string, role: Role) => postToGas('updateRole', { memberId, role }),
  updateReportsTo: (memberId: string, reportsToId: string | null) =>
    postToGas('updateReportsTo', { memberId, reportsToId }),
  updateMentor: (memberId: string, mentorId: string | null) =>
    postToGas('updateMentor', { memberId, mentorId }),
  updateDisplayName: (memberId: string, displayName: string) =>
    postToGas('updateDisplayName', { memberId, displayName }),
  updateJoinedAt: (memberId: string, joinedAt: string | null) =>
    postToGas('updateJoinedAt', { memberId, joinedAt }),
  updateUnavailableDates: (memberId: string, dates: string[]) =>
    postToGas('updateUnavailableDates', { memberId, dates }),
  updateTimezone: (memberId: string, timezone: string) =>
    postToGas('updateTimezone', { memberId, timezone }),
  updateSchedule: (taskId: string, startDate: string | null, deadline: string | null) =>
    postToGas('updateSchedule', { taskId, startDate, deadline }),
  updateDependsOn: (taskId: string, dependsOnIds: string[]) =>
    postToGas('updateDependsOn', { taskId, dependsOnIds }),
  updateVisibility: (taskId: string, visibility: 'all' | '幹部') =>
    postToGas('updateVisibility', { taskId, visibility }),
  updateAvatar: (memberId: string, avatarColor: string, initials: string) =>
    postToGas('updateAvatar', { memberId, avatarColor, initials }),
  uploadAvatarImage: (memberId: string, dataUrl: string, filename: string) =>
    postToGas<{ url: string }>('uploadAvatar', {
      memberId,
      dataUrl,
      filename,
      folderId: DRIVE_FOLDER_ID,
    }),
  uploadOrgLogo: (dataUrl: string, filename: string) =>
    postToGas<{ url: string }>('uploadOrgLogo', {
      dataUrl,
      filename,
      folderId: DRIVE_FOLDER_ID,
    }),
  addMember: (name: string, email: string, affiliation: string, role: Role) =>
    postToGas<{ id: string }>('addMember', { name, email, affiliation, role }),
  updateEmail: (memberId: string, email: string) => postToGas('updateEmail', { memberId, email }),
  updateSetting: (key: string, value: string) => postToGas('updateSetting', { key, value }),
  // Discord Webhook 連携 — deliberately NOT part of updateSetting/Settings
  // シート同期: that sheet is published as a public CSV like the other
  // three, so a webhook URL (a bearer-token-like secret) would leak to
  // anyone who fetches it. This writes to Apps Script's private
  // PropertiesService instead (see gas/README.md §4.7), which has no
  // public read path — write-only from the client's perspective.
  updateDiscordWebhookUrl: (url: string) => postToGas('updateDiscordWebhookUrl', { url }),
  updateSlackWebhookUrl: (url: string) => postToGas('updateSlackWebhookUrl', { url }),
  updateMemberInactive: (memberId: string, inactive: boolean) =>
    postToGas('updateMemberInactive', { memberId, inactive }),
  updateMemberDepartmentPath: (memberId: string, departmentPath: string) =>
    postToGas('updateMemberDepartmentPath', { memberId, departmentPath }),
  updateMemberProjects: (memberId: string, projectIds: string[]) =>
    postToGas('updateMemberProjects', { memberId, projectIds }),
  updateReviewer: (taskId: string, reviewerId: string | null) =>
    postToGas('updateReviewer', { taskId, reviewerId }),
  updateReviewers: (taskId: string, reviewerIds: string[], requiredApprovals?: number | 'all') =>
    postToGas('updateReviewers', { taskId, reviewerIds, requiredApprovals }),
  setBlocker: (taskId: string, note: string | null, since: string | null) =>
    postToGas('setBlocker', { taskId, note, since }),
  updateDeliverables: (taskId: string, deliverables: TaskDeliverable[]) =>
    postToGas('updateDeliverables', { taskId, deliverables }),
  updateHistory: (taskId: string, history: TaskHistoryEntry[]) =>
    postToGas('updateHistory', { taskId, history }),
  updateProjectMembers: (projectId: string, memberIds: string[]) =>
    postToGas('updateProjectMembers', { projectId, memberIds }),
  updateProjectOwner: (projectId: string, ownerId: string | null) =>
    postToGas('updateProjectOwner', { projectId, ownerId }),
  updateProjectParent: (projectId: string, parentId: string | null) =>
    postToGas('updateProjectParent', { projectId, parentId }),
  updateProjectDetails: (projectId: string, description: string, type: string | undefined) =>
    postToGas('updateProjectDetails', { projectId, description, type }),
  updateProjectArchived: (projectId: string, archived: boolean) =>
    postToGas('updateProjectArchived', { projectId, archived }),
  updateComments: (taskId: string, comments: TaskComment[]) =>
    postToGas('updateComments', { taskId, comments }),
  notifyMention: (taskId: string, commentText: string, memberIds: string[]) =>
    postToGas('notifyMention', { taskId, commentText, memberIds }),
  updateEstimatedHours: (taskId: string, hours: number | null) =>
    postToGas('updateEstimatedHours', { taskId, hours }),
  updateActualHours: (taskId: string, hours: number | null) =>
    postToGas('updateActualHours', { taskId, hours }),
  updateRetrospective: (taskId: string, retrospective: TaskRetrospective | null) =>
    postToGas('updateRetrospective', { taskId, retrospective }),
  updateTaskSchedule: (taskId: string, schedule: TaskSchedule | null) =>
    postToGas('updateTaskSchedule', { taskId, schedule }),
  notifyScheduleResult: (taskId: string) => postToGas('notifyScheduleResult', { taskId }),
  updateTaskForm: (taskId: string, form: TaskForm | null) =>
    postToGas('updateTaskForm', { taskId, form }),
  notifyFormResult: (taskId: string) => postToGas('notifyFormResult', { taskId }),
  // ---- タレントマネジメント ----
  updateSearchProfile: (
    memberId: string,
    profile: { yearsOfExperience: number | null; hasManagementExperience: boolean; desiredAreas: string[] },
  ) => postToGas('updateSearchProfile', { memberId, ...profile }),
  updateCareerHistory: (memberId: string, entries: CareerHistoryEntry[]) =>
    postToGas('updateCareerHistory', { memberId, entries }),
  updateQualifications: (memberId: string, entries: Qualification[]) =>
    postToGas('updateQualifications', { memberId, entries }),
  updateEvaluationHistory: (memberId: string, entries: EvaluationRecord[]) =>
    postToGas('updateEvaluationHistory', { memberId, entries }),
  updateTransferHistory: (memberId: string, entries: TransferRecord[]) =>
    postToGas('updateTransferHistory', { memberId, entries }),
  updateSkillLevels: (memberId: string, levels: SkillLevel[]) =>
    postToGas('updateSkillLevels', { memberId, levels }),
  updateCompetencies: (memberId: string, competencies: Competency[]) =>
    postToGas('updateCompetencies', { memberId, competencies }),
  updateCareerGoals: (
    memberId: string,
    goals: { careerAspiration: string; desiredFutureRole: string; careerPlan: string },
  ) => postToGas('updateCareerGoals', { memberId, ...goals }),
  updateTrainingHistory: (memberId: string, entries: TrainingRecord[]) =>
    postToGas('updateTrainingHistory', { memberId, entries }),
  notifyTrainingRequest: (memberId: string, trainingName: string) =>
    postToGas('notifyTrainingRequest', { memberId, trainingName }),
  notifyTrainingDecision: (memberId: string, trainingName: string, approved: boolean) =>
    postToGas('notifyTrainingDecision', { memberId, trainingName, approved }),
  updateDevelopmentPlan: (memberId: string, entries: DevelopmentPlanEntry[]) =>
    postToGas('updateDevelopmentPlan', { memberId, entries }),
  updateOneOnOnes: (memberId: string, entries: OneOnOneRecord[]) =>
    postToGas('updateOneOnOnes', { memberId, entries }),
  updatePermissionOverrides: (memberId: string, overrides: PermissionOverride[]) =>
    postToGas('updatePermissionOverrides', { memberId, overrides }),
  // ---- スキルポイント付与 ----
  awardSkillPoints: (taskId: string, memberId: string, points: SkillPoints) =>
    postToGas<{ newLevels: SkillLevel[]; newPoints: SkillPoints }>('awardSkillPoints', { taskId, memberId, points }),
  // ---- 検定 ----
  updateQuizDefinitions: (quizzes: QuizDefinition[]) =>
    postToGas('updateSetting', { key: 'quiz_definitions', value: JSON.stringify(quizzes) }),
  submitQuizResult: (quizId: string, memberId: string, answers: number[]) =>
    postToGas<{ passed: boolean; score: number; newLevel?: number }>('submitQuizResult', { quizId, memberId, answers }),
  // ---- レーダーチャート軸 ----
  updateRadarAxes: (axes: RadarAxis[]) =>
    postToGas('updateSetting', { key: 'radar_axes', value: JSON.stringify(axes) }),
  // ---- 経費申請 ----
  submitExpenseApplication: (application: import('./types').ExpenseApplication) =>
    postToGas('submitExpenseApplication', { application }),
  approveExpenseStep: (applicationId: string, stepId: string, actorId: string, comment?: string) =>
    postToGas('approveExpenseStep', { applicationId, stepId, actorId, comment }),
  rejectExpense: (applicationId: string, reason: string) =>
    postToGas('rejectExpense', { applicationId, reason }),
  withdrawExpense: (applicationId: string) =>
    postToGas('withdrawExpense', { applicationId }),
  // ---- カスタムフォーム ----
  submitCustomForm: (submission: import('./types').CustomFormSubmission) =>
    postToGas('submitCustomForm', { submission }),
  approveFormStep: (submissionId: string, stepId: string, actorId: string, comment?: string) =>
    postToGas('approveFormStep', { submissionId, stepId, actorId, comment }),
  rejectFormSubmission: (submissionId: string, reason: string) =>
    postToGas('rejectFormSubmission', { submissionId, reason }),
  bulkUpdateSkills: (updates: { memberId: string; skill: string; level: number }[]) =>
    postToGas('bulkUpdateSkills', { updates }),
  updateAbsentDates: (memberId: string, dates: string[]) =>
    postToGas('updateAbsentDates', { memberId, dates }),
  updateLastLogin: (memberId: string) =>
    postToGas('updateLastLogin', { memberId }),
}

// re-exported for the parser fallback in input-screen.tsx, which needs to
// turn ParsedTask rows into CreateTaskPayload rows.
export function toCreatePayload(tempId: string, p: ParsedTask, creatorId?: string, originalInputId?: string): CreateTaskPayload {
  return {
    tempId,
    title: p.name,
    projectId: p.projectId,
    department: p.department,
    category: p.category,
    skills: p.skills,
    difficulty: p.difficulty,
    priority: p.priority,
    startDate: p.startDate,
    deadline: p.deadline,
    dueTime: p.dueTime,
    assigneeIds: p.assigneeIds,
    creatorId,
    originalInputId,
    pendingApproval: true,
    visibility: p.visibility ?? 'all',
    estimatedHours: p.estimatedHours,
    importance: p.importance,
  }
}
