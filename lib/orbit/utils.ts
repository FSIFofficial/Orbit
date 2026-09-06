import type { Member, Task } from './types'
import { todayStrInTz, DEFAULT_TIMEZONE } from './timezone'

export function parseDepartmentPath(path: string): string[] {
  return path.split('>').map((s) => s.trim()).filter(Boolean)
}

export function formatDepartmentPath(path: string): string {
  return parseDepartmentPath(path).join(' ＞ ')
}

export function getDepartmentTops(departmentPath: string, members: Member[]): Member[] {
  return members.filter((m) => {
    if (m.departmentPath !== departmentPath) return false
    if (!m.reportsToId) return true
    const manager = members.find((x) => x.id === m.reportsToId)
    return !manager || manager.departmentPath !== departmentPath
  })
}

/** Finds dept tops for members whose departmentPath contains `segment` as any component. */
export function getDepartmentTopsBySegment(segment: string, members: Member[]): Member[] {
  const matched = members.filter(
    (m) => m.departmentPath && parseDepartmentPath(m.departmentPath).includes(segment),
  )
  const paths = Array.from(new Set(matched.map((m) => m.departmentPath as string)))
  return paths.flatMap((p) => getDepartmentTops(p, members)).filter(
    (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i,
  )
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function formatDeadline(d: string | null): string {
  if (!d) return '未設定'
  const [y, m, day] = d.split('-')
  return `${Number(m)}/${Number(day)}`
}

export function formatDeadlineFull(d: string | null): string {
  if (!d) return '未設定'
  const [y, m, day] = d.split('-')
  return `${y}/${m}/${day}`
}

// tz省略時はJST（DEFAULT_TIMEZONE）基準。currentUser.timezoneが分かる
// 呼び出し元（画面コンポーネント）はそちらを渡すことで、ユーザーごとの
// タイムゾームで「今日」を判定できる（例: JSTで既に翌日でもPTではまだ
// 当日、という食い違いを避ける）。
export function isOverdue(task: Task, tz: string = DEFAULT_TIMEZONE): boolean {
  if (!task.deadline) return false
  if (task.status === 'done') return false
  return task.deadline < todayStrInTz(tz)
}

export type DeadlineLevel = 'overdue' | 'today' | 'soon' | 'near' | 'none'

// Classify how close a task's deadline is, for color-coded warnings.
export function deadlineLevel(task: Task, tz: string = DEFAULT_TIMEZONE): {
  level: DeadlineLevel
  label: string
  days: number | null
} {
  if (!task.deadline || task.status === 'done')
    return { level: 'none', label: '', days: null }
  const today = new Date(todayStrInTz(tz)).getTime()
  const due = new Date(task.deadline).getTime()
  const days = Math.round((due - today) / (1000 * 60 * 60 * 24))
  if (days < 0) return { level: 'overdue', label: '期限超過', days }
  if (days === 0) return { level: 'today', label: '本日期限', days }
  if (days <= 1) return { level: 'soon', label: '期限まで1日', days }
  if (days <= 3) return { level: 'near', label: `期限まで${days}日`, days }
  return { level: 'none', label: '', days }
}

// YYYY-MM と YYYY-MM-DD の両形式を安全にパースする（YYYY-MM は UTCの1日として扱う）
function parseJoinedAt(joinedAt: string): Date {
  const normalized = joinedAt.length === 7 ? joinedAt + '-01' : joinedAt
  return new Date(normalized)
}

// 所属歴 — 「経験年数」（自己申告の概数）とは別に、joinedAt からの正確な
// 期間を「○年○ヶ月」で表示する。YYYY-MM / YYYY-MM-DD どちらも対応。
export function formatTenure(joinedAt: string): string {
  const start = parseJoinedAt(joinedAt)
  const now = new Date()
  let years = now.getFullYear() - start.getFullYear()
  let months = now.getMonth() - start.getMonth()
  if (now.getDate() < start.getDate()) months -= 1
  if (months < 0) {
    years -= 1
    months += 12
  }
  if (years <= 0 && months <= 0) return '1ヶ月未満'
  return years > 0 ? `${years}年${months}ヶ月` : `${months}ヶ月`
}

// 所属歴を年数（小数）で返す — 人材検索フィルタ（Admin > Members）で
// 「経験年数」（自己申告の概数）の代わりに所属日ベースで絞り込むために使う
export function tenureYears(joinedAt: string): number {
  const start = parseJoinedAt(joinedAt).getTime()
  const now = Date.now()
  if (Number.isNaN(start)) return 0
  return Math.max(0, (now - start) / (365.25 * 24 * 60 * 60 * 1000))
}

export function formatDateTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const m = d.getMonth() + 1
  const day = d.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${m}/${day} ${hh}:${mm}`
}

export function daysSince(d?: string): number | null {
  if (!d) return null
  const then = new Date(d).getTime()
  const now = new Date(todayStr()).getTime()
  return Math.round((now - then) / (1000 * 60 * 60 * 24))
}

// 前提タスク — a task listing others in dependsOnIds can't be marked 完了
// until all of them are. Returns the still-open prerequisites (empty = OK
// to complete); a dangling id (deleted task) is treated as satisfied since
// there's nothing left to block on.
export function incompletePrerequisites(task: Task, allTasks: Task[]): Task[] {
  if (!task.dependsOnIds?.length) return []
  const byId = new Map(allTasks.map((t) => [t.id, t]))
  return task.dependsOnIds
    .map((id) => byId.get(id))
    .filter((t): t is Task => !!t && t.status !== 'done')
}

// コメント本文から @表示名 / @氏名 のメンションを抽出し、該当するメンバーID
// を返す（重複なし）。表示名優先で、どちらの表記でもマッチする
export function parseMentions(text: string, members: Member[]): string[] {
  const ids = new Set<string>()
  for (const m of members) {
    const names = [m.displayName, m.name].filter((n): n is string => !!n)
    if (names.some((name) => text.includes(`@${name}`))) ids.add(m.id)
  }
  return [...ids]
}

// Simple explainable skill matching — count of overlapping skills. Accepts
// any task-shaped object with a skills list, so this also works for a
// ParsedTask (pre-creation, in the INPUT screen) as well as a saved Task.
export function matchSkills(task: { skills: string[] }, member: Member): string[] {
  return task.skills.filter((s) => member.skills.includes(s))
}

export interface SkillFieldProgress {
  field: string
  held: string[]
  total: string[]
  ratio: number
  acquired: boolean
}

// 要求分野 — a field (デザイン/営業/AI活用...) is never assigned to a member
// directly; it's derived from how much of the field's constituent 要求スキル
// the member already holds. A field with no skills configured yet can't be
// acquired (ratio would be a meaningless 0/0).
export function memberSkillFieldProgress(
  memberSkills: string[],
  skillFieldSkills: Record<string, string[]>,
  threshold: number,
): SkillFieldProgress[] {
  return Object.entries(skillFieldSkills).map(([field, total]) => {
    const held = total.filter((s) => memberSkills.includes(s))
    const ratio = total.length > 0 ? held.length / total.length : 0
    return { field, held, total, ratio, acquired: total.length > 0 && ratio >= threshold }
  })
}

export function memberAcquiredFields(
  memberSkills: string[],
  skillFieldSkills: Record<string, string[]>,
  threshold: number,
): string[] {
  return memberSkillFieldProgress(memberSkills, skillFieldSkills, threshold)
    .filter((p) => p.acquired)
    .map((p) => p.field)
}

// crude tokenizer for Japanese/English mixed task names — splits on
// whitespace and common punctuation, drops very short tokens
function tokenize(name: string): Set<string> {
  return new Set(
    name
      .split(/[\s、。・,.\-()（）「」/]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2),
  )
}

// Finds existing tasks that look like they might duplicate a newly-parsed
// one — same category and enough name-token overlap. Used at approval time
// to flag "this might already be covered" before an admin approves.
export function findSimilarTasks(
  candidate: { id?: string; name: string; category: string; projectId: string },
  existing: Task[],
  minScore = 0.4,
): { task: Task; score: number }[] {
  const candTokens = tokenize(candidate.name)
  if (candTokens.size === 0) return []
  return existing
    .filter((t) => t.id !== candidate.id)
    .map((t) => {
      const tTokens = tokenize(t.name)
      const overlap = [...candTokens].filter((w) => tTokens.has(w)).length
      const union = new Set([...candTokens, ...tTokens]).size
      let score = union > 0 ? overlap / union : 0
      if (t.category && t.category === candidate.category) score += 0.15
      if (t.projectId === candidate.projectId) score += 0.1
      return { task: t, score }
    })
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

// 手一杯なメンバーまでどんどん薦めると偏りが起きるため、現在の未完了タスク数
// がこれ以上のメンバーはおすすめ候補から除外する（完全に選べなくなるわけでは
// なく、「その他のメンバーから選ぶ」には引き続き表示される）。数字は仮
const MAX_ACTIVE_TASKS_FOR_SUGGESTION = 5

export function rankCandidates(
  task: { skills: string[]; assigneeIds?: string[] },
  members: Member[],
  allTasks?: Task[],
): { member: Member; matches: string[] }[] {
  return members
    .filter((m) => !task.assigneeIds?.includes(m.id))
    .filter((m) => {
      if (!allTasks) return true
      const active = allTasks.filter(
        (t) => t.assigneeIds.includes(m.id) && t.status !== 'done',
      ).length
      return active < MAX_ACTIVE_TASKS_FOR_SUGGESTION
    })
    .map((m) => ({ member: m, matches: matchSkills(task, m) }))
    .filter((c) => c.matches.length > 0)
    .sort((a, b) => b.matches.length - a.matches.length)
}

// 暫定値、要調整: estimatedHoursが未設定のタスクは1日相当として扱う
const DEFAULT_TASK_DURATION_HOURS = 8

// クリティカルパス（簡易実装）— dependsOnIds で結ばれたタスクの中から、
// 所要時間（estimatedHours、未設定なら1日=8時間相当）の合計が最大になる
// 経路を求める。フルスペックのCPM/PERT（余裕時間や複数の並行パス考慮）
// ではなく、「最も遅延の影響が大きい一本の依存チェーン」を可視化する
// ためのシンプルな最長経路探索。戻り値はその経路上のタスクIDの集合。
export function computeCriticalPath(tasks: Task[]): Set<string> {
  if (tasks.length === 0) return new Set()

  const byId = new Map(tasks.map((t) => [t.id, t]))
  const duration = (t: Task) =>
    t.estimatedHours && t.estimatedHours > 0 ? t.estimatedHours : DEFAULT_TASK_DURATION_HOURS

  // タスクを終点とする最長経路の長さと、その経路上で直前にあたる依存タスクID
  const longest = new Map<string, number>()
  const bestPrev = new Map<string, string | null>()
  const visiting = new Set<string>() // 循環依存があった場合の無限再帰ガード

  const resolve = (t: Task): number => {
    const cached = longest.get(t.id)
    if (cached !== undefined) return cached
    if (visiting.has(t.id)) return duration(t)
    visiting.add(t.id)
    const deps = (t.dependsOnIds ?? []).filter((id) => byId.has(id) && id !== t.id)
    let best = 0
    let bestDep: string | null = null
    for (const depId of deps) {
      const depLongest = resolve(byId.get(depId)!)
      if (depLongest > best) {
        best = depLongest
        bestDep = depId
      }
    }
    visiting.delete(t.id)
    const total = best + duration(t)
    longest.set(t.id, total)
    bestPrev.set(t.id, bestDep)
    return total
  }

  tasks.forEach(resolve)

  // 全体で最も長い経路の終点を探し、そこから前提タスクを遡って経路を復元する
  let endId: string | null = null
  let max = -Infinity
  for (const t of tasks) {
    const v = longest.get(t.id) ?? 0
    if (v > max) {
      max = v
      endId = t.id
    }
  }
  if (!endId) return new Set()

  const path = new Set<string>()
  let cur: string | null = endId
  while (cur) {
    path.add(cur)
    cur = bestPrev.get(cur) ?? null
  }
  return path
}

// 暫定値、要調整: actualHours/estimatedHoursどちらも未設定なタスクの
// デフォルト所要時間（完了タスクの実績集計・現アサイン量の見積もり両方で使う）
const DEFAULT_TASK_HOURS_FALLBACK = 2

// 直近windowDays日間に完了したタスクの実績時間（actualHours、なければ
// estimatedHours、それも無ければデフォルト値）を合計し、週あたり平均に
// 換算する。完了タスクが1件もなければ0（呼び出し側でデータ不足として扱う）
export function memberWeeklyThroughput(
  memberId: string,
  allTasks: Task[],
  now: Date = new Date(),
  windowDays = 90,
): number {
  const cutoff = new Date(now.getTime() - windowDays * 86400000)
  const completed = allTasks.filter((t) => {
    if (t.status !== 'done' || !t.assigneeIds.includes(memberId) || !t.completedDate) return false
    const d = new Date(t.completedDate)
    return !Number.isNaN(d.getTime()) && d >= cutoff
  })
  if (completed.length === 0) return 0
  const totalHours = completed.reduce(
    (sum, t) => sum + (t.actualHours ?? t.estimatedHours ?? DEFAULT_TASK_HOURS_FALLBACK),
    0,
  )
  return totalHours / (windowDays / 7)
}

export type WorkloadCapacity = 'available' | 'normal' | 'full'

// 暫定値、要調整: 「現在の未完了タスクの想定時間合計」÷「週あたり実績平均」
// の比率で余力を3段階に分類する閾値
const CAPACITY_AVAILABLE_RATIO = 0.6
const CAPACITY_FULL_RATIO = 1.2

// 稼働余力の簡易指標（item 4）。過去の実績平均がまだ無いメンバー（新人等）は
// 現在の未完了タスク数のみで暫定的に判定する。
export function memberWorkloadCapacity(
  memberId: string,
  allTasks: Task[],
  now: Date = new Date(),
): WorkloadCapacity {
  const currentLoadHours = allTasks
    .filter((t) => t.assigneeIds.includes(memberId) && t.status !== 'done')
    .reduce((sum, t) => sum + (t.estimatedHours ?? DEFAULT_TASK_HOURS_FALLBACK), 0)

  const weeklyAvg = memberWeeklyThroughput(memberId, allTasks, now)
  if (weeklyAvg === 0) {
    // 実績データが無い場合は現在のタスク数（時間換算）だけで暫定判定
    if (currentLoadHours === 0) return 'available'
    return currentLoadHours <= DEFAULT_TASK_HOURS_FALLBACK * 3 ? 'normal' : 'full'
  }

  const ratio = currentLoadHours / weeklyAvg
  if (ratio < CAPACITY_AVAILABLE_RATIO) return 'available'
  if (ratio < CAPACITY_FULL_RATIO) return 'normal'
  return 'full'
}

// Builds a Google Calendar "quick add" URL pre-filled with a task's title,
// date/time, and details, for a personal "add to my calendar" button
// (task-detail-drawer.tsx) — anyone can click it to drop the task into
// their own Google Calendar. This is separate from gas/Code.gs's
// admin-side sync, which creates the event server-side and invites
// assignees; this one needs no backend at all. Returns null when the task
// has no deadline (nothing to add).
export function googleCalendarUrl(
  task: {
    name: string
    startDate?: string | null
    deadline: string | null
    dueTime?: string | null
    description?: string
  },
  extra: { projectName?: string; department?: string; category?: string } = {},
): string | null {
  if (!task.deadline) return null

  const compact = (d: string) => d.replace(/-/g, '')
  const addDays = (d: string, days: number) => {
    const dt = new Date(`${d}T00:00:00Z`)
    dt.setUTCDate(dt.getUTCDate() + days)
    return dt.toISOString().slice(0, 10)
  }
  const pad2 = (n: number) => String(n).padStart(2, '0')

  let dates: string
  if (task.dueTime) {
    // 1-hour timed event, matching gas/Code.gs's sync convention
    const [h, m] = task.dueTime.split(':').map(Number)
    const endTotal = h * 60 + m + 60
    const endDate = endTotal >= 1440 ? addDays(task.deadline, 1) : task.deadline
    const endMinutes = endTotal % 1440
    const start = `${compact(task.deadline)}T${pad2(h)}${pad2(m)}00`
    const end = `${compact(endDate)}T${pad2(Math.floor(endMinutes / 60))}${pad2(endMinutes % 60)}00`
    dates = `${start}/${end}`
  } else {
    const start =
      task.startDate && task.startDate < task.deadline ? task.startDate : task.deadline
    // Google's all-day range end is exclusive, so add one day
    dates = `${compact(start)}/${compact(addDays(task.deadline, 1))}`
  }

  const details = [
    extra.projectName && `プロジェクト: ${extra.projectName}`,
    extra.department && `部門: ${extra.department}`,
    extra.category && `カテゴリ: ${extra.category}`,
    task.description,
    'Orbitから追加',
  ]
    .filter(Boolean)
    .join('\n')

  const params = new URLSearchParams({ action: 'TEMPLATE', text: task.name, dates, details })
  if (task.dueTime) params.set('ctz', 'Asia/Tokyo')

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
