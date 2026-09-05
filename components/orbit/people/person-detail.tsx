'use client'

import { useRef, useState, useEffect } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { useToast } from '@/components/orbit/toast'
import { Avatar, StatusBadge, DifficultyBadge, SectionLabel } from '@/components/orbit/primitives'
import { CalendarView } from '@/components/orbit/output/calendar-view'
import { TaskDetailDrawer } from '@/components/orbit/output/task-detail-drawer'
import { EditableTags } from '@/components/orbit/editable-tags'
import { CareerTab } from '@/components/orbit/people/career-tab'
import { Modal } from '@/components/orbit/modal'
import { Button } from '@/components/ui/button'
import { formatDeadlineFull, formatTenure, memberSkillFieldProgress } from '@/lib/orbit/utils'
import { isAdminRole, BASE_ROLE, DIFFICULTY_LABEL, type NotifyKind, type NotifyFrequency, type Member } from '@/lib/orbit/types'
import { AVATAR_PALETTE } from '@/lib/orbit/remote'
import { useI18n, SUPPORTED_LOCALES, type TranslationKey } from '@/lib/orbit/i18n'
import { TIMEZONE_OPTIONS, DEFAULT_TIMEZONE } from '@/lib/orbit/timezone'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  Target,
  Sparkles,
  Activity,
  X,
  Pencil,
  Check,
  CalendarOff,
  Bell,
  Mail,
  ImageUp,
  Loader2,
  Trash2,
  FolderKanban,
  Link2,
  RefreshCw,
  Download,
} from 'lucide-react'
import {
  isGoogleOAuthConfigured,
  requestSheetsToken,
  extractSpreadsheetId,
  verifySheetAccess,
  syncTasksToSheet,
  loadPersonalSheetId,
  savePersonalSheetId,
  type SyncRow,
} from '@/lib/orbit/google-sheet-sync'

type Tab = 'overview' | 'tasks' | 'growth' | 'career' | 'calendar'
type TaskView = 'list' | 'board' | 'calendar'

// Downscales/crops an uploaded image to a square JPEG data URL so avatar
// uploads stay small and consistent, regardless of the source photo's size.
const AVATAR_UPLOAD_SIZE = 256
function resizeImageToDataUrl(file: File, t: (key: TranslationKey) => string, size = AVATAR_UPLOAD_SIZE): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas unsupported'))
      // cover-fit crop to a square
      const scale = Math.max(size / img.width, size / img.height)
      const w = img.width * scale
      const h = img.height * scale
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => reject(new Error(t('person.avatar.loadError')))
    img.src = URL.createObjectURL(file)
  })
}

export function PersonDetail({ id }: { id: string }) {
  const {
    getMember,
    visibleTasks: tasks,
    members,
    projects,
    currentUser,
    updateWill,
    updateJudgment,
    getProject,
    getProjectMembers,
    updateDisplayName,
    updateJoinedAt,
    setMemberTimezone,
    setMemberLocale,
    toggleUnavailableDate,
    updateAvatar,
    uploadAvatarImage,
    driveEnabled,
    updateEmail,
    updateNotify,
    updateNotifySettings,
    updateMentor,
    jobRequirements,
    skillOptions,
    addSkillOption,
    skillFieldSkills,
    skillFieldThreshold,
    updateSearchProfile,
    updateCareerHistory,
    updateQualifications,
    updateEvaluationHistory,
    updateTransferHistory,
    updateSkillLevels,
    updateCompetencies,
    updateCareerGoals,
    updateTrainingHistory,
    notifyTrainingRequest,
    notifyTrainingDecision,
    updateDevelopmentPlan,
    updateOneOnOnes,
    updateMemberDepartmentPath,
    radarAxes,
    quizDefinitions,
    submitQuizResult,
    oneOnOneQuestions,
    notifications,
  } = useOrbit()
  const { go } = useNav()
  const toast = useToast()
  const { t, locale, setLocale } = useI18n()
  const [tab, setTab] = useState<Tab>('overview')
  const [taskView, setTaskView] = useState<TaskView>('list')
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [editingJoinedAt, setEditingJoinedAt] = useState(false)
  const [editingDeptPath, setEditingDeptPath] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [initialsDraft, setInitialsDraft] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [personalSheetId, setPersonalSheetId] = useState('')
  const [sheetInput, setSheetInput] = useState('')
  const [sheetTitle, setSheetTitle] = useState<string | null>(null)
  const [sheetStatus, setSheetStatus] = useState<'idle' | 'verifying' | 'syncing'>('idle')
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [sheetSyncedAt, setSheetSyncedAt] = useState<Date | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const member = getMember(id)

  if (!member) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-muted-foreground">{t('person.notFound')}</p>
      </div>
    )
  }

  const handleAvatarFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast(t('person.avatar.selectImage'))
      return
    }
    setUploadingAvatar(true)
    try {
      const dataUrl = await resizeImageToDataUrl(file, t)
      await uploadAvatarImage(member.id, dataUrl, `avatar-${member.id}.jpg`)
      toast(t('person.avatar.updated'))
      setAvatarOpen(false)
    } catch (err) {
      toast(err instanceof Error ? err.message : t('person.avatar.uploadFailed'))
    } finally {
      setUploadingAvatar(false)
    }
  }

  const emails = (member.email ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
  const addEmail = () => {
    const v = newEmail.trim()
    if (!v || emails.includes(v)) {
      setNewEmail('')
      return
    }
    updateEmail(member.id, [...emails, v].join(','))
    setNewEmail('')
  }
  const removeEmail = (email: string) => {
    updateEmail(member.id, emails.filter((e) => e !== email).join(','))
  }

  useEffect(() => {
    const saved = loadPersonalSheetId(member.id)
    setPersonalSheetId(saved)
    setSheetInput(saved)
  }, [member.id])

  const handleSheetConnect = async () => {
    const id = extractSpreadsheetId(sheetInput.trim())
    if (!id) {
      setSheetError(t('person.sheet.invalidUrl'))
      return
    }
    setSheetStatus('verifying')
    setSheetError(null)
    try {
      const token = await requestSheetsToken()
      const result = await verifySheetAccess(id, token)
      if (!result.ok) {
        setSheetError(result.error ?? t('person.sheet.accessFailed'))
        setSheetStatus('idle')
        return
      }
      savePersonalSheetId(member.id, id)
      setPersonalSheetId(id)
      setSheetTitle(result.title ?? null)
      setSheetStatus('idle')
      toast(t('person.sheet.connected'))
    } catch (e) {
      setSheetError(e instanceof Error ? e.message : t('person.sheet.authFailed'))
      setSheetStatus('idle')
    }
  }

  const handleSheetSync = async () => {
    setSheetStatus('syncing')
    setSheetError(null)
    try {
      const token = await requestSheetsToken(true)
      const rows: SyncRow[] = mine.map((t) => ({
        taskName: t.name,
        project: getProject(t.projectId)?.name ?? '',
        department: member.affiliation,
        assignees: t.assigneeIds.map((aid) => members.find((m) => m.id === aid)?.name ?? aid).join(', '),
        status: t.status,
        priority: t.priority,
        difficulty: t.difficulty,
        category: t.category,
        skills: t.skills.join(', '),
        startDate: t.startDate ?? '',
        deadline: t.deadline ?? '',
        completedDate: t.completedDate ?? '',
        progress: String(t.progress ?? ''),
        description: t.description ?? '',
      }))
      await syncTasksToSheet(personalSheetId, token, rows)
      setSheetSyncedAt(new Date())
      toast(t('person.sheet.synced'))
    } catch (e) {
      setSheetError(e instanceof Error ? e.message : t('person.sheet.syncFailed'))
    } finally {
      setSheetStatus('idle')
    }
  }

  const handleSheetDisconnect = () => {
    savePersonalSheetId(member.id, '')
    setPersonalSheetId('')
    setSheetInput('')
    setSheetTitle(null)
    setSheetError(null)
    setSheetSyncedAt(null)
  }

  const mine = tasks.filter((t) => t.assigneeIds.includes(member.id))
  const active = mine.filter((t) => t.status !== 'done').length
  const completed = mine.filter((t) => t.status === 'done')
  const history = mine
    .slice()
    .sort((a, b) => (b.completedDate ?? '').localeCompare(a.completedDate ?? ''))
  const categoryTally = new Map<string, number>()
  completed.forEach((t) => {
    if (!t.category) return
    categoryTally.set(t.category, (categoryTally.get(t.category) ?? 0) + 1)
  })
  const topCategories = Array.from(categoryTally.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3)

  // 人材育成: skills required by open work that the member doesn't have
  // yet, what that skill would unlock, and who already has it
  const openTasks = tasks.filter((t) => t.status !== 'done')
  const skillDemand = new Map<string, typeof tasks>()
  openTasks.forEach((t) => {
    t.skills.forEach((s) => {
      if (!skillDemand.has(s)) skillDemand.set(s, [])
      skillDemand.get(s)!.push(t)
    })
  })
  const missingSkills = Array.from(skillDemand.entries())
    .filter(([s]) => !member.skills.includes(s))
    .sort((a, b) => b[1].length - a[1].length)
  const mentorsFor = (skill: string) =>
    members.filter((m) => m.id !== member.id && m.skills.includes(skill))

  // item 16: スキル獲得経路 — order missing skills easiest-first (average
  // difficulty of the tasks that demand them), as a suggested learning order
  const skillRoadmap = missingSkills
    .map(([skill, unlocked]) => ({
      skill,
      unlocked,
      avgDifficulty:
        unlocked.reduce((sum, t) => sum + DIFFICULTY_LABEL.indexOf(t.difficulty), 0) /
        unlocked.length,
    }))
    .sort((a, b) => a.avgDifficulty - b.avgDifficulty)

  // item 15: バディ推薦 — other members whose skills cover this member's
  // current gaps, so the pair together can take on more open work than
  // either alone
  const buddyCandidates = members
    .filter((m) => m.id !== member.id)
    .map((m) => ({
      member: m,
      covers: missingSkills.filter(([skill]) => m.skills.includes(skill)).map(([skill]) => skill),
    }))
    .filter((c) => c.covers.length > 0)
    .sort((a, b) => b.covers.length - a.covers.length)
    .slice(0, 3)

  // item 14: メンター/サポート担当
  const mentor = member.mentorId ? members.find((m) => m.id === member.mentorId) : undefined

  // item 17: ポジション要件 — this member's role's required skills vs what
  // they already have
  const positionRequirements = jobRequirements[member.role] ?? []
  const positionHas = positionRequirements.filter((s) => member.skills.includes(s))
  const positionMissing = positionRequirements.filter((s) => !member.skills.includes(s))

  // 要求分野 — never assigned directly; derived from how much of each
  // field's constituent 要求スキル this member already holds. Uses the
  // graded スキルレベル registry (Lv.1〜5、経歴・キャリアタブ) rather than
  // Will/Judgmentから作られるmember.skills — スキルレベルはタスク完了時に
  // Lv.1で自動登録されるほか、団体外の経験なども本人が自己申告で追加できる
  const skillFieldProgress = memberSkillFieldProgress(
    (member.skillLevels ?? []).map((sl) => sl.skill),
    skillFieldSkills,
    skillFieldThreshold,
  )

  // 所属プロジェクト: owner, explicitly-assigned member, or assigned to one
  // of the project's tasks — same "who's on this project" definition the
  // admin/workspace project views use (see getProjectMembers)
  const memberProjects = projects.filter(
    (p) => p.ownerId === member.id || getProjectMembers(p.id).some((m) => m.id === member.id),
  )

  const isSelf = currentUser?.id === member.id
  const isAdmin = !!currentUser && isAdminRole(currentUser.role)
  const displayName = member.displayName || member.name

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <button
        onClick={() => go({ name: 'output' })}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('person.backToWorkspace')}
      </button>

      {/* Header */}
      <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
        <div className="relative shrink-0">
          <Avatar member={member} size={56} />
          {isSelf && (
            <button
              onClick={() => {
                setInitialsDraft(member.initials)
                setAvatarOpen(true)
              }}
              className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground"
              aria-label={t('person.avatar.changeIcon')}
            >
              <Pencil className="size-2.5" />
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  if (e.key === 'Enter') {
                    updateDisplayName(member.id, nameDraft.trim())
                    setEditingName(false)
                  }
                  if (e.key === 'Escape') setEditingName(false)
                }}
                placeholder={member.name}
                className="h-8 w-48 rounded-md border border-primary bg-card px-2 text-lg font-semibold outline-none"
              />
              <button
                onClick={() => {
                  updateDisplayName(member.id, nameDraft.trim())
                  setEditingName(false)
                }}
                className="rounded-md p-1 text-primary hover:bg-secondary"
                aria-label={t('common.save')}
              >
                <Check className="size-4" />
              </button>
            </div>
          ) : (
            <h1 className="flex items-center gap-1.5 text-xl font-semibold tracking-tight">
              {displayName}
              {member.displayName && (
                <span className="text-xs font-normal text-muted-foreground">({member.name})</span>
              )}
              {isSelf && (
                <button
                  onClick={() => {
                    setNameDraft(member.displayName ?? member.name)
                    setEditingName(true)
                  }}
                  className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label={t('person.avatar.editName')}
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </h1>
          )}
          <p className="mt-0.5 text-sm text-muted-foreground">
            {member.role !== BASE_ROLE ? member.role : member.affiliation}
          </p>
          {editingDeptPath && isAdmin ? (
            <input
              autoFocus
              defaultValue={member.departmentPath ?? ''}
              onBlur={(e) => {
                updateMemberDepartmentPath(member.id, e.target.value.trim())
                setEditingDeptPath(false)
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
                if (e.key === 'Enter') { updateMemberDepartmentPath(member.id, e.currentTarget.value.trim()); setEditingDeptPath(false) }
                if (e.key === 'Escape') setEditingDeptPath(false)
              }}
              placeholder={t('person.deptPath.placeholder')}
              className="mt-0.5 h-6 w-64 rounded-md border border-primary bg-card px-1.5 text-xs outline-none"
            />
          ) : (
            <div className="mt-0.5 flex items-center gap-1">
              <p className="text-xs text-muted-foreground">
                {member.departmentPath
                  ? member.departmentPath.split('>').map((s) => s.trim()).join(' ＞ ')
                  : isAdmin ? <span className="italic">{t('person.deptPath.unset')}</span> : null}
              </p>
              {isAdmin && (
                <button
                  onClick={() => setEditingDeptPath(true)}
                  className="rounded-md p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label={t('person.avatar.editDeptPath')}
                >
                  <Pencil className="size-3" />
                </button>
              )}
            </div>
          )}
          <div className="mt-1 flex items-center gap-1.5">
            {editingJoinedAt ? (
              <input
                autoFocus
                type="month"
                defaultValue={member.joinedAt ? member.joinedAt.slice(0, 7) : ''}
                onBlur={(e) => {
                  updateJoinedAt(member.id, e.target.value || null)
                  setEditingJoinedAt(false)
                }}
                className="h-6 rounded-md border border-primary bg-card px-1.5 text-xs outline-none"
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                {member.joinedAt
                  ? t('person.tenure.label', { tenure: formatTenure(member.joinedAt), month: member.joinedAt.slice(0, 7) })
                  : t('person.tenure.unset')}
              </p>
            )}
            {(isSelf || isAdmin) && !editingJoinedAt && (
              <button
                onClick={() => setEditingJoinedAt(true)}
                className="rounded-md p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label={t('person.avatar.editJoinedAt')}
              >
                <Pencil className="size-3" />
              </button>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">{active}</p>
          <p className="text-xs text-muted-foreground">{t('person.activeTasks')}</p>
        </div>
      </div>

      {/* Account settings — self only, edits the person's own sheet row */}
      {isSelf && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <SectionLabel>{t('person.account.title')}</SectionLabel>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('person.account.emailDesc')}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Mail className="size-4 shrink-0 text-muted-foreground" />
            {emails.map((e) => (
              <span
                key={e}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 text-xs font-medium"
              >
                {e}
                <button
                  onClick={() => removeEmail(e)}
                  className="opacity-60 hover:opacity-100"
                  aria-label={t('person.account.removeEmail', { email: e })}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              value={newEmail}
              onChange={(ev) => setNewEmail(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.nativeEvent.isComposing || ev.keyCode === 229) return
                if (ev.key === 'Enter') {
                  ev.preventDefault()
                  addEmail()
                }
              }}
              onBlur={() => {
                if (newEmail.trim()) addEmail()
              }}
              placeholder={t('person.account.emailPlaceholder')}
              type="email"
              className="h-7 w-48 rounded-md border border-dashed border-border-strong bg-background px-2 text-xs outline-none focus:border-primary"
            />
          </div>
          <NotifySettingsTable
            member={member}
            onUpdate={(settings) => updateNotifySettings(member.id, settings)}
          />
        </div>
      )}

      {/* 言語 / タイムゾーン — self only。全画面の表示に影響するため、
          特定のタブの中ではなくプロフィール上部（タブの外）に置く */}
      {isSelf && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <SectionLabel>{t('settings.language')} / {t('settings.timezone')}</SectionLabel>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              value={locale}
              onChange={(e) => {
                const next = e.target.value as (typeof SUPPORTED_LOCALES)[number]['code']
                setLocale(next)
                setMemberLocale(member.id, next)
              }}
              className="h-9 cursor-pointer rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
            >
              {SUPPORTED_LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <select
              value={member.timezone ?? DEFAULT_TIMEZONE}
              onChange={(e) => setMemberTimezone(member.id, e.target.value)}
              className="h-9 cursor-pointer rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Personal Google Sheets sync — self only */}
      {isSelf && isGoogleOAuthConfigured() && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Link2 className="size-4 text-muted-foreground" />
            <SectionLabel>{t('person.sheet.title')}</SectionLabel>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('person.sheet.description')}
          </p>

          {personalSheetId ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/5 px-2 py-1 text-xs font-medium text-accent-foreground">
                <Check className="size-3.5 text-primary" strokeWidth={3} />
                {sheetTitle ?? personalSheetId}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                disabled={sheetStatus !== 'idle'}
                onClick={handleSheetSync}
              >
                {sheetStatus === 'syncing' ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                {sheetStatus === 'syncing' ? t('person.sheet.syncing') : t('person.sheet.syncNow')}
              </Button>
              <button
                type="button"
                onClick={handleSheetDisconnect}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
              >
                <X className="size-3.5" />
                {t('person.sheet.disconnect')}
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={sheetInput}
                onChange={(e) => setSheetInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  if (e.key === 'Enter') { e.preventDefault(); handleSheetConnect() }
                }}
                placeholder={t('person.sheet.placeholder')}
                className="h-8 min-w-0 flex-1 rounded-md border border-dashed border-border-strong bg-background px-2 text-xs outline-none focus:border-primary"
              />
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={sheetStatus !== 'idle' || !sheetInput.trim()}
                onClick={handleSheetConnect}
              >
                {sheetStatus === 'verifying' ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Link2 className="size-3.5" />
                )}
                {sheetStatus === 'verifying' ? t('person.sheet.verifying') : t('person.sheet.connect')}
              </Button>
            </div>
          )}

          {sheetError && (
            <p className="mt-2 text-xs text-destructive">{sheetError}</p>
          )}
          {sheetSyncedAt && !sheetError && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('person.sheet.lastSynced', { time: sheetSyncedAt.toLocaleTimeString('ja-JP') })}
            </p>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="mt-5 flex items-center gap-1 border-b border-border">
        {(
          [
            ['overview', t('person.tab.overview')],
            ['tasks', t('person.tab.tasks')],
            ...(isSelf || isAdmin ? [['growth', t('person.tab.growth')]] : []),
            ...(isSelf || isAdmin ? [['career', t('person.tab.career')]] : []),
            ['calendar', t('person.tab.calendar')],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'growth' && (
        <div className="mt-5 flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <SectionLabel>{t('person.growth.missingSkills.title')}</SectionLabel>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('person.growth.missingSkills.desc')}
            </p>
            {missingSkills.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {t('person.growth.missingSkills.empty')}
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {missingSkills.slice(0, 6).map(([skill, unlocked]) => {
                  const mentors = mentorsFor(skill)
                  return (
                    <li key={skill} className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-md bg-primary-muted px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                          {skill}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t('person.growth.missingSkills.demandCount', { count: unlocked.length })}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t('person.growth.missingSkills.unlocksLabel')}
                        {unlocked
                          .slice(0, 3)
                          .map((task) => task.name)
                          .join('、')}
                        {unlocked.length > 3 && t('person.growth.missingSkills.andMore', { count: unlocked.length - 3 })}
                      </p>
                      {mentors.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">
                            {t('person.growth.missingSkills.mentorsLabel')}
                          </span>
                          {mentors.slice(0, 5).map((m) => (
                            <button
                              key={m.id}
                              onClick={() => go({ name: 'person', id: m.id })}
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-xs hover:bg-secondary"
                            >
                              <Avatar member={m} size={16} />
                              {m.displayName || m.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* メンター/サポート担当 (item 14) */}
          <div className="rounded-xl border border-border bg-card p-4">
            <SectionLabel>{t('person.growth.mentor.title')}</SectionLabel>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('person.growth.mentor.desc')}
            </p>
            <div className="mt-3 flex items-center gap-2">
              {mentor ? (
                <button
                  onClick={() => go({ name: 'person', id: mentor.id })}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm hover:bg-secondary"
                >
                  <Avatar member={mentor} size={24} />
                  {mentor.displayName || mentor.name}
                </button>
              ) : (
                <span className="text-sm text-muted-foreground">{t('common.notSet')}</span>
              )}
              {isAdmin && (
                <select
                  value={member.mentorId ?? ''}
                  onChange={(e) => updateMentor(member.id, e.target.value || null)}
                  className="h-8 cursor-pointer rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                >
                  <option value="">{t('person.growth.mentor.unsetOption')}</option>
                  {members
                    .filter((m) => m.id !== member.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName || m.name}
                      </option>
                    ))}
                </select>
              )}
            </div>
          </div>

          {/* バディ候補 (item 15) */}
          {buddyCandidates.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <SectionLabel>{t('person.growth.buddy.title')}</SectionLabel>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('person.growth.buddy.desc')}
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {buddyCandidates.map(({ member: m, covers }) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-secondary/30 p-2.5"
                  >
                    <button
                      onClick={() => go({ name: 'person', id: m.id })}
                      className="flex items-center gap-2 text-sm hover:underline"
                    >
                      <Avatar member={m} size={22} />
                      {m.displayName || m.name}
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {t('person.growth.buddy.covers', { skills: covers.join('、') })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 要求分野 — derived from the 要求スキル held, not assigned directly */}
          {skillFieldProgress.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <SectionLabel>{t('person.growth.fields.title')}</SectionLabel>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('person.growth.fields.desc', { percent: Math.round(skillFieldThreshold * 100) })}
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {skillFieldProgress.map(({ field, held, total, acquired }) => (
                  <li
                    key={field}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2"
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {acquired && <Check className="size-3.5 text-primary" strokeWidth={3} />}
                      {field}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium',
                        acquired
                          ? 'bg-primary-muted text-accent-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {held.length}/{total.length}
                      {acquired ? t('person.growth.fields.acquired') : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ポジション要件 (item 17) */}
          {positionRequirements.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <SectionLabel>{t('person.growth.position.title', { role: member.role })}</SectionLabel>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('person.growth.position.desc')}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {positionHas.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/5 px-1.5 py-0.5 text-xs font-medium"
                  >
                    <Check className="size-3 text-primary" strokeWidth={3} />
                    {s}
                  </span>
                ))}
                {positionMissing.map((s) => (
                  <span
                    key={s}
                    className="rounded-md border border-dashed border-border-strong px-1.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {s}
                  </span>
                ))}
              </div>
              {positionMissing.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('person.growth.position.missingNote', { count: positionMissing.length })}
                </p>
              )}
            </div>
          )}

          {/* 学習ロードマップ (item 16) */}
          {skillRoadmap.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <SectionLabel>{t('person.growth.roadmap.title')}</SectionLabel>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('person.growth.roadmap.desc')}
              </p>
              <ol className="mt-3 flex flex-col gap-2">
                {skillRoadmap.map(({ skill, unlocked }, i) => (
                  <li key={skill} className="flex items-center gap-2.5 text-sm">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="font-medium">{skill}</span>
                    <span className="text-xs text-muted-foreground">
                      {t('person.growth.roadmap.estimate', { difficulty: DIFFICULTY_LABEL[Math.round(unlocked.reduce((s, task) => s + DIFFICULTY_LABEL.indexOf(task.difficulty), 0) / unlocked.length)] })}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: タスク — ボード/リスト/カレンダーの3表示切り替え
          ※ここのカレンダーはタスク期限表示。Tab 5 CalendarはGCal連携（別物）。 */}
      {tab === 'tasks' && (
        <div className="mt-5 flex flex-col gap-4">
          {/* サブビュー切り替え */}
          <div className="flex items-center gap-1.5">
            {(['list', 'board', 'calendar'] as TaskView[]).map((v) => (
              <button
                key={v}
                onClick={() => setTaskView(v)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  taskView === v
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
                )}
              >
                {v === 'list' ? t('person.tasks.view.list') : v === 'board' ? t('person.tasks.view.board') : t('person.tasks.view.calendar')}
              </button>
            ))}
          </div>

          {/* リスト表示 */}
          {taskView === 'list' && (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">{t('person.tasks.table.task')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('person.tasks.table.project')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('person.tasks.table.difficulty')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('person.tasks.table.status')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('person.tasks.table.deadline')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('person.tasks.table.depends')}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((task) => (
                    <tr
                      key={task.id}
                      onClick={() => setOpenTaskId(task.id)}
                      className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-secondary/50"
                    >
                      <td className="px-4 py-3 font-medium text-foreground">{task.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{getProject(task.projectId)?.name}</td>
                      <td className="px-4 py-3">
                        <DifficultyBadge difficulty={task.difficulty} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={task.status} />
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {task.deadline ? formatDeadlineFull(task.deadline) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {(task.dependsOnIds ?? []).length > 0
                          ? t('person.tasks.table.dependsCount', { count: (task.dependsOnIds ?? []).length })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        {t('person.tasks.empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ボード表示 — ワークフロー（未着手→進行中→確認待ち→完了）のKanban */}
          {taskView === 'board' && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(['todo', 'in_progress', 'in_review', 'done'] as const).map((status) => {
                const label: Record<string, string> = {
                  todo: t('person.tasks.board.todo'),
                  in_progress: t('person.tasks.board.inProgress'),
                  in_review: t('person.tasks.board.inReview'),
                  done: t('person.tasks.board.done'),
                }
                const col = mine.filter((task) => task.status === status)
                return (
                  <div key={status} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-border bg-secondary/50 px-3 py-2">
                      <span className="text-xs font-semibold text-muted-foreground">{label[status]}</span>
                      <span className="text-xs text-muted-foreground">{col.length}</span>
                    </div>
                    <div className="flex flex-col gap-1.5 rounded-b-lg border border-t-0 border-border bg-card p-2 min-h-[80px]">
                      {col.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => setOpenTaskId(task.id)}
                          className="w-full rounded-md border border-border/60 bg-secondary/30 p-2 text-left text-xs hover:bg-secondary/70"
                        >
                          <p className="font-medium text-foreground line-clamp-2">{task.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <DifficultyBadge difficulty={task.difficulty} />
                            {task.deadline && (
                              <span className="text-muted-foreground">{task.deadline}</span>
                            )}
                          </div>
                          {(task.dependsOnIds ?? []).length > 0 && (
                            <p className="mt-0.5 text-muted-foreground">
                              {t('person.tasks.board.depends', { count: (task.dependsOnIds ?? []).length })}
                            </p>
                          )}
                        </button>
                      ))}
                      {col.length === 0 && (
                        <p className="px-1 py-2 text-xs text-muted-foreground">{t('common.none')}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* カレンダー表示 — タスク期限をカレンダーに表示
              ※ Tab 5 "Calendar" タブのGCalカレンダーとは別物（こちらはタスク期限のみ） */}
          {taskView === 'calendar' && (
            <CalendarView tasks={mine} onOpenTask={setOpenTaskId} />
          )}
        </div>
      )}

      {tab === 'career' && (
        <CareerTab
          member={member}
          members={members}
          editable={isSelf || isAdmin}
          editableAdminOnly={isAdmin}
          skillOptions={skillOptions}
          updateSearchProfile={updateSearchProfile}
          updateCareerHistory={updateCareerHistory}
          updateQualifications={updateQualifications}
          updateEvaluationHistory={updateEvaluationHistory}
          updateTransferHistory={updateTransferHistory}
          updateSkillLevels={updateSkillLevels}
          updateCompetencies={updateCompetencies}
          updateCareerGoals={updateCareerGoals}
          updateTrainingHistory={updateTrainingHistory}
          notifyTrainingRequest={notifyTrainingRequest}
          notifyTrainingDecision={notifyTrainingDecision}
          updateDevelopmentPlan={updateDevelopmentPlan}
          updateOneOnOnes={updateOneOnOnes}
          currentUserId={currentUser?.id ?? null}
          oneOnOneQuestions={oneOnOneQuestions}
          radarAxes={radarAxes}
          quizDefinitions={quizDefinitions}
          submitQuizResult={submitQuizResult}
        />
      )}

      {/* Tab 5: Calendar — Googleカレンダー連携統合表示
          ※ Tab 2「タスク」タブ内のカレンダービュー（タスク期限表示）とは別物。
            こちらはGCal連携でイベントをOrbitのカレンダーに重ねて表示する。 */}
      {tab === 'calendar' && (
        <div className="mt-5 flex flex-col gap-4">
          {isSelf && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <CalendarOff className="size-4 text-muted-foreground" />
                <SectionLabel>{t('person.calendar.unavailable.title')}</SectionLabel>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('person.calendar.unavailable.desc')}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {(member.unavailableDates ?? [])
                  .slice()
                  .sort()
                  .map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 text-xs font-medium"
                    >
                      {d}
                      <button
                        onClick={() => toggleUnavailableDate(member.id, d)}
                        className="opacity-60 hover:opacity-100"
                        aria-label={t('person.calendar.unavailable.remove', { date: d })}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                <input
                  type="date"
                  onChange={(e) => {
                    if (e.target.value) toggleUnavailableDate(member.id, e.target.value)
                    e.target.value = ''
                  }}
                  className="h-7 rounded-md border border-dashed border-border-strong bg-card px-2 text-xs outline-none focus:border-primary"
                />
              </div>
            </div>
          )}
          <CalendarView tasks={mine} onOpenTask={setOpenTaskId} />
        </div>
      )}

      {tab === 'overview' && (
        <>
      {/* ダッシュボードサマリー */}
      {isSelf && (() => {
        // notifications は store でdismissed済みを除外済み — そのまま未読として扱う
        const approvalNotifs = notifications.filter((n) => n.kind === 'approval')
        const pendingApprovTasks = tasks.filter((t) => t.pendingApproval && t.createdById === member.id)
        return (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-2xl font-semibold tabular-nums">{active}</p>
              <p className="text-xs text-muted-foreground">{t('person.activeTasks')}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-2xl font-semibold tabular-nums">{pendingApprovTasks.length}</p>
              <p className="text-xs text-muted-foreground">{t('person.overview.pendingApproval')}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-2xl font-semibold tabular-nums">{notifications.length}</p>
              <p className="text-xs text-muted-foreground">{t('person.overview.unreadNotifications')}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-2xl font-semibold tabular-nums">{approvalNotifs.length}</p>
              <p className="text-xs text-muted-foreground">{t('person.overview.pendingApprovalNotifications')}</p>
            </div>
          </div>
        )
      })()}

      {/* Talent sections */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <TalentCard
          icon={<Target className="size-4 text-primary" />}
          title="Will"
          subtitle={t('person.overview.will.subtitle')}
        >
          <EditableTags
            tags={member.will}
            editable={isSelf}
            onChange={(next) => updateWill(member.id, next)}
            emptyText={t('person.overview.talent.empty')}
            placeholder={t('person.overview.will.placeholder')}
            options={skillOptions}
            onNewOption={addSkillOption}
          />
        </TalentCard>

        <TalentCard
          icon={<Sparkles className="size-4 text-primary" />}
          title="Judgment"
          subtitle={t('person.overview.judgment.subtitle')}
        >
          <EditableTags
            tags={member.judgment}
            editable={isAdmin}
            onChange={(next) => updateJudgment(member.id, next)}
            emptyText={t('person.overview.talent.empty')}
            placeholder={t('person.overview.judgment.placeholder')}
            variant="judgment"
            options={skillOptions}
            onNewOption={addSkillOption}
          />
        </TalentCard>

        <TalentCard
          icon={<Activity className="size-4 text-primary" />}
          title="Fact"
          subtitle={t('person.overview.fact.subtitle')}
        >
          {member.facts.length ? (
            <ul className="flex flex-col gap-2">
              {member.facts.map((f) => (
                <li key={f.label} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{f.label}</span>
                  <span className="text-muted-foreground">{t('person.overview.count', { count: f.count })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('person.overview.noAchievements')}</p>
          )}
        </TalentCard>
      </div>

      {/* Projects */}
      <div className="mt-6">
        <div className="flex items-center gap-2">
          <FolderKanban className="size-4 text-primary" />
          <SectionLabel>{t('person.overview.projects.title')}</SectionLabel>
        </div>
        {memberProjects.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('person.overview.projects.empty')}</p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {memberProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => go({ name: 'project', id: p.id })}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-secondary/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  {p.type && <p className="truncate text-xs text-muted-foreground">{p.type}</p>}
                </div>
                {p.ownerId === member.id && (
                  <span className="shrink-0 rounded-md bg-primary-muted px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                    {t('person.overview.projects.owner')}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Achievements */}
      <div className="mt-6">
        <SectionLabel>{t('person.overview.achievements.title')}</SectionLabel>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-2xl font-semibold tabular-nums">{completed.length}</p>
            <p className="text-xs text-muted-foreground">{t('person.overview.achievements.completedTasks')}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-2xl font-semibold tabular-nums">{member.judgment.length}</p>
            <p className="text-xs text-muted-foreground">{t('person.overview.achievements.certifiedSkills')}</p>
          </div>
          <div className="col-span-2 rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">{t('person.overview.achievements.topCategory')}</p>
            {topCategories.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {topCategories.map(([cat, count]) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1 rounded-md bg-primary-muted px-1.5 py-0.5 text-xs font-medium text-accent-foreground"
                  >
                    {cat}
                    <span className="text-[10px] opacity-70">{t('person.overview.count', { count })}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{t('person.overview.noAchievements')}</p>
            )}
          </div>
        </div>
      </div>

      {/* タスク詳細はタブ2「タスク」で確認できます */}
      <div className="mt-4 rounded-xl border border-dashed border-border bg-card/50 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {t('person.overview.taskLinkPrefix')}
          <button
            onClick={() => setTab('tasks')}
            className="mx-1 font-medium text-primary hover:underline"
          >
            {t('person.overview.taskLinkButton')}
          </button>
          {t('person.overview.taskLinkSuffix')}
        </p>
      </div>
        </>
      )}

      <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />

      <Modal open={avatarOpen} onClose={() => setAvatarOpen(false)}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t('person.avatar.changeIcon')}</h2>
          <button onClick={() => setAvatarOpen(false)} aria-label={t('common.close')}>
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <Avatar
            member={{ ...member, initials: (initialsDraft || member.initials).toUpperCase() }}
            size={48}
          />
          <input
            value={initialsDraft}
            onChange={(e) => setInitialsDraft(e.target.value.slice(0, 2))}
            maxLength={2}
            placeholder={member.initials}
            className="h-9 w-20 rounded-md border border-border bg-card px-2 text-center text-sm uppercase outline-none focus:border-primary"
            aria-label={t('person.avatar.initialsLabel')}
          />
        </div>

        <div className="mt-4 rounded-lg border border-dashed border-border-strong bg-secondary/30 p-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleAvatarFile(file)
              e.target.value = ''
            }}
          />
          {driveEnabled ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-50"
              >
                {uploadingAvatar ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImageUp className="size-4" />
                )}
                {uploadingAvatar ? t('person.avatar.uploading') : t('person.avatar.uploadImage')}
              </button>
              {member.avatarUrl && (
                <button
                  type="button"
                  onClick={() => updateAvatar(member.id, member.avatarColor, initialsDraft || member.initials)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  {t('person.avatar.deleteImage')}
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t('person.avatar.driveDisabled')}
            </p>
          )}
        </div>

        <p className="mb-1.5 mt-4 text-xs font-medium text-muted-foreground">{t('person.avatar.colorLabel')}</p>
        <div className="flex flex-wrap gap-2">
          {AVATAR_PALETTE.map((color) => (
            <button
              key={color}
              onClick={() => {
                updateAvatar(member.id, color, initialsDraft || member.initials)
                setAvatarOpen(false)
              }}
              className={cn(
                'size-8 rounded-full ring-2 ring-offset-2 ring-offset-card transition-transform hover:scale-110',
                member.avatarColor === color ? 'ring-primary' : 'ring-transparent',
              )}
              style={{ backgroundColor: color }}
              aria-label={t('person.avatar.selectColor', { color })}
            />
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" className="h-9" onClick={() => setAvatarOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            className="h-9"
            onClick={() => {
              updateAvatar(member.id, member.avatarColor, initialsDraft || member.initials)
              setAvatarOpen(false)
            }}
          >
            {t('common.save')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

const NOTIFY_KINDS: { kind: NotifyKind; labelKey: TranslationKey }[] = [
  { kind: 'new_task', labelKey: 'person.settings.notify.newTask' },
  { kind: 'review', labelKey: 'person.settings.notify.review' },
  { kind: 'mention', labelKey: 'person.settings.notify.mention' },
  { kind: 'rejected', labelKey: 'person.settings.notify.rejected' },
  { kind: 'deadline', labelKey: 'person.settings.notify.deadline' },
]

const NOTIFY_FREQS: { value: NotifyFrequency; labelKey: TranslationKey }[] = [
  { value: 'immediate', labelKey: 'person.settings.freq.immediate' },
  { value: '3h', labelKey: 'person.settings.freq.3h' },
  { value: '6h', labelKey: 'person.settings.freq.6h' },
  { value: '1d', labelKey: 'person.settings.freq.1d' },
  { value: 'none', labelKey: 'common.none' },
]

function NotifySettingsTable({
  member,
  onUpdate,
}: {
  member: Member
  onUpdate: (settings: Partial<Record<NotifyKind, NotifyFrequency>>) => void
}) {
  const { t } = useI18n()
  const settings = member.notifySettings ?? {}

  const toggle = (kind: NotifyKind, freq: NotifyFrequency) => {
    const current = settings[kind] ?? 'none'
    onUpdate({ ...settings, [kind]: current === freq ? 'none' : freq })
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[420px] text-xs">
        <thead>
          <tr>
            <th className="pb-1.5 pr-3 text-left font-medium text-muted-foreground">{t('person.settings.notify.kindHeader')}</th>
            {NOTIFY_FREQS.map((f) => (
              <th key={f.value} className="pb-1.5 px-1 text-center font-medium text-muted-foreground whitespace-nowrap">
                {t(f.labelKey)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {NOTIFY_KINDS.map(({ kind, labelKey }) => {
            const current = settings[kind] ?? 'none'
            return (
              <tr key={kind} className="border-t border-border/50">
                <td className="py-1.5 pr-3 text-left font-medium">{t(labelKey)}</td>
                {NOTIFY_FREQS.map((f) => (
                  <td key={f.value} className="py-1.5 px-1 text-center">
                    <button
                      type="button"
                      onClick={() => toggle(kind, f.value)}
                      className={cn(
                        'h-6 min-w-[36px] rounded px-1.5 text-[11px] font-medium transition-colors',
                        current === f.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground hover:bg-secondary/80',
                      )}
                    >
                      {t(f.labelKey)}
                    </button>
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TalentCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary-muted">
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold leading-none">{title}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}
