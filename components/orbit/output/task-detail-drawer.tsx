'use client'

import { useEffect, useState } from 'react'
import { getCalendarToken, requestCalendarToken, isGoogleOAuthConfigured } from '@/lib/orbit/google-sheet-sync'
import { createCalendarEvent } from '@/lib/orbit/google-calendar'
import { Drawer, Modal } from '../modal'
import { Button } from '@/components/ui/button'
import { useOrbit } from '@/lib/orbit/store'
import { useToast } from '../toast'
import {
  Avatar,
  DifficultyBadge,
  StatusDot,
  Tag,
  DepartmentTag,
} from '../primitives'
import {
  DEPARTMENTS,
  DIFFICULTY_LABEL,
  TASK_IMPORTANCE,
  isAdminRole,
  type Department,
  type Difficulty,
  type FormAnswerValue,
  type FormFieldDef,
  type FormFieldType,
  type Member,
  type Priority,
  type Project,
  type ScheduleResponseValue,
  type SkillPoints,
  type Task,
  type TaskHistoryEntry,
  type TaskImportance,
  type TaskRetrospective,
  type TaskStatus,
} from '@/lib/orbit/types'
import { formatDeadlineFull, formatDateTime, googleCalendarUrl, isOverdue, getDepartmentTopsBySegment } from '@/lib/orbit/utils'
import { allowedStatusOptions, canChangeTaskStatus } from '@/lib/orbit/permissions'
import { useI18n, STATUS_KEY, type TranslationKey } from '@/lib/orbit/i18n'
import { TranslatedText } from '@/components/orbit/translated-text'
import { formatDateTimeInTz, DEFAULT_TIMEZONE } from '@/lib/orbit/timezone'
import { cn } from '@/lib/utils'
import {
  Ban,
  CalendarPlus,
  Check,
  ChevronDown,
  FileText,
  GitBranch,
  History as HistoryIcon,
  Link2,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Timer,
  Trash2,
  TriangleAlert,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react'

const HISTORY_FIELD_KEY: Record<TaskHistoryEntry['field'], TranslationKey> = {
  assignee: 'taskDrawer.row.assignee',
  deadline: 'taskDrawer.row.deadline',
  startDate: 'taskDrawer.row.startDate',
  priority: 'taskDrawer.edit.priorityLabel',
  status: 'taskDrawer.row.status',
  reviewer: 'taskDrawer.row.reviewer',
  title: 'taskDrawer.edit.nameLabel',
  description: 'taskDrawer.edit.descriptionLabel',
  project: 'taskDrawer.row.project',
  department: 'taskDrawer.row.department',
  category: 'taskDrawer.row.category',
  skills: 'taskDrawer.row.skills',
  difficulty: 'taskDrawer.row.difficulty',
  visibility: 'taskDrawer.edit.visibilityLabel',
  importance: 'taskDrawer.edit.importanceLabel',
}

function historyValueLabel(
  field: TaskHistoryEntry['field'],
  raw: string,
  members: Member[],
  projects: Project[],
  t: (key: TranslationKey) => string,
): string {
  if (!raw) return t('common.notSet')
  if (field === 'assignee') {
    return raw
      .split(',')
      .filter(Boolean)
      .map((id) => {
        const m = members.find((mm) => mm.id === id)
        return m ? m.displayName || m.name : id
      })
      .join('、')
  }
  if (field === 'reviewer') {
    const m = members.find((mm) => mm.id === raw)
    return m ? m.displayName || m.name : raw
  }
  if (field === 'project') {
    return projects.find((p) => p.id === raw)?.name ?? raw
  }
  if (field === 'visibility') {
    return raw === '幹部' ? t('taskDrawer.execOnly') : t('common.everyone')
  }
  return raw
}

export function TaskDetailDrawer({
  taskId,
  onClose,
}: {
  taskId: string | null
  onClose: () => void
}) {
  const {
    tasks,
    projects,
    currentUser,
    getMember,
    getProject,
    getInput,
    updateTaskStatus,
    updateProgress,
    assignTask,
    updateSchedule,
    updateDependsOn,
    updateReviewer,
    updateReviewers,
    updateTaskDetails,
    setBlocker,
    addDeliverable,
    removeDeliverable,
    addComment,
    removeComment,
    updateEstimatedHours,
    updateActualHours,
    updateRetrospective,
    setTaskSchedule,
    respondToSchedule,
    setTaskForm,
    respondToForm,
    removeTask,
    skillOptions,
    categoryOptions,
    addSkillOption,
    addCategoryOption,
    members,
    awardSkillPoints,
  } = useOrbit()
  const toast = useToast()
  const [confirmTake, setConfirmTake] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [inputOpen, setInputOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [dependsOpen, setDependsOpen] = useState(false)
  const [dependsQuery, setDependsQuery] = useState('')
  const [reviewerOpen, setReviewerOpen] = useState(false)
  const [blockerOpen, setBlockerOpen] = useState(false)
  const [handoffOpen, setHandoffOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [awardOpen, setAwardOpen] = useState(false)

  const { t: tr, locale } = useI18n()
  const task = tasks.find((t) => t.id === taskId) ?? null
  const open = !!taskId
  const sourceInput = getInput(task?.originalInputId)
  const assignees = (task?.assigneeIds ?? [])
    .map((id) => getMember(id))
    .filter(Boolean) as Member[]
  const dependsOnTasks = (task?.dependsOnIds ?? [])
    .map((id) => tasks.find((t) => t.id === id))
    .filter(Boolean) as Task[]
  const isAdmin = !!currentUser && isAdminRole(currentUser.role)
  const reviewer = getMember(task?.reviewerId ?? null) ?? null
  const reviewers = (task?.reviewerIds ?? (task?.reviewerId ? [task.reviewerId] : [])).map((id) => getMember(id)).filter(Boolean) as ReturnType<typeof getMember>[]

  return (
    <>
      <Drawer open={open} onClose={onClose} labelledBy="task-drawer-title">
        {task && (
          <DrawerBody
            task={task}
            currentUserId={currentUser?.id ?? null}
            isAdmin={isAdmin}
            assignees={assignees}
            dependsOnTasks={dependsOnTasks}
            creator={getMember(task.createdById ?? null) ?? null}
            reviewer={reviewer}
            reviewers={reviewers}
            members={members}
            projects={projects}
            projectName={getProject(task.projectId)?.name ?? ''}
            hasSourceInput={!!sourceInput}
            onClose={onClose}
            onStatus={(s) => updateTaskStatus(task.id, s)}
            onTake={() => setConfirmTake(true)}
            onOpenAssign={() => setAssignOpen(true)}
            onOpenInput={() => setInputOpen(true)}
            onOpenSchedule={() => setScheduleOpen(true)}
            onOpenEdit={() => setEditOpen(true)}
            onOpenDelete={() => setConfirmDelete(true)}
            onOpenDepends={() => setDependsOpen(true)}
            onOpenReviewer={() => setReviewerOpen(true)}
            onOpenBlocker={() => setBlockerOpen(true)}
            onClearBlocker={() => {
              setBlocker(task.id, null)
              toast(tr('taskDrawer.blocker.cleared'))
            }}
            onOpenHandoff={() => setHandoffOpen(true)}
            onOpenAward={() => setAwardOpen(true)}
            onAddDeliverable={(label, url) => addDeliverable(task.id, label, url)}
            onRemoveDeliverable={(id) => removeDeliverable(task.id, id)}
            onAddComment={(text) => addComment(task.id, text)}
            onRemoveComment={(commentId) => removeComment(task.id, commentId)}
            onProgress={(text) => {
              updateProgress(task.id, text)
              toast(tr('taskDrawer.progressUpdated'))
            }}
            onUpdateEstimatedHours={(hours) => updateEstimatedHours(task.id, hours)}
            onUpdateActualHours={(hours) => updateActualHours(task.id, hours)}
            onSaveRetrospective={(r) => {
              updateRetrospective(task.id, r)
              toast(tr('taskDrawer.retrospectiveSaved'))
            }}
            onSetSchedule={(candidates, invitedIds) =>
              setTaskSchedule(task.id, candidates, invitedIds)
            }
            onRespondSchedule={(responses) => {
              if (currentUser) respondToSchedule(task.id, currentUser.id, responses)
            }}
            onSetForm={(fields, invitedIds) => setTaskForm(task.id, fields, invitedIds)}
            onRespondForm={(responses) => {
              if (currentUser) respondToForm(task.id, currentUser.id, responses)
            }}
          />
        )}
      </Drawer>

      {/* Original input text */}
      <Modal open={inputOpen} onClose={() => setInputOpen(false)} labelledBy="source-input-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="source-input-title" className="text-base font-semibold">
            {tr('taskDrawer.sourceInput.title')}
          </h2>
          <button onClick={() => setInputOpen(false)} aria-label={tr('common.close')}>
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        {sourceInput ? (
          <>
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-secondary/50 p-3 text-sm leading-relaxed">
              {sourceInput.text}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {formatDateTimeInTz(sourceInput.createdAt, currentUser?.timezone ?? DEFAULT_TIMEZONE, locale)} ・ {tr('taskDrawer.sourceInput.generatedCount', { count: sourceInput.generatedTaskIds.length })}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{tr('taskDrawer.sourceInput.notFound')}</p>
        )}
      </Modal>

      {/* Take task confirm */}
      <Modal open={confirmTake} onClose={() => setConfirmTake(false)}>
        <h2 className="text-base font-semibold">{tr('taskDrawer.confirmTake.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {tr('taskDrawer.confirmTake.body', { name: task?.name ?? '' })}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" className="h-9" onClick={() => setConfirmTake(false)}>
            {tr('common.cancel')}
          </Button>
          <Button
            className="h-9"
            onClick={() => {
              if (task && currentUser && !task.assigneeIds.includes(currentUser.id)) {
                assignTask(task.id, [...task.assigneeIds, currentUser.id])
                toast(tr('taskDrawer.confirmTake.done'))
              }
              setConfirmTake(false)
            }}
          >
            {tr('taskDrawer.confirmTake.confirm')}
          </Button>
        </div>
      </Modal>

      {/* Delete task (admin only) */}
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <h2 className="text-base font-semibold">{tr('taskDrawer.confirmDelete.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {tr('taskDrawer.confirmDelete.body', { name: task?.name ?? '' })}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" className="h-9" onClick={() => setConfirmDelete(false)}>
            {tr('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            className="h-9"
            onClick={() => {
              if (task) {
                removeTask(task.id)
                toast(tr('taskDrawer.confirmDelete.done'))
              }
              setConfirmDelete(false)
              onClose()
            }}
          >
            {tr('taskDrawer.confirmDelete.confirm')}
          </Button>
        </div>
      </Modal>

      {/* Admin assign (multi-select) */}
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{tr('taskDrawer.assign.title')}</h2>
          <button onClick={() => setAssignOpen(false)} aria-label={tr('common.close')}>
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">{tr('taskDrawer.assign.hint')}</p>
        {(() => {
          const deptTops = task?.department
            ? getDepartmentTopsBySegment(task.department, members)
            : []
          const topIds = new Set(deptTops.map((m) => m.id))
          return (
            <div className="flex max-h-80 flex-col gap-1 overflow-auto orbit-scroll">
              <button
                onClick={() => {
                  if (task) assignTask(task.id, [])
                  toast(tr('taskDrawer.assign.unassignedToast'))
                }}
                className="flex items-center gap-2.5 rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
              >
                <Avatar member={null} size={28} />
                {tr('taskDrawer.assign.unassignAll')}
              </button>
              {deptTops.length > 0 && (
                <>
                  <div className="px-1 pt-1 text-xs font-medium text-muted-foreground">{tr('taskDrawer.deptTopsRecommended')}</div>
                  {deptTops.map((m) => {
                    const checked = !!task?.assigneeIds.includes(m.id)
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          if (!task) return
                          const next = checked
                            ? task.assigneeIds.filter((id) => id !== m.id)
                            : [...task.assigneeIds, m.id]
                          assignTask(task.id, next)
                        }}
                        className={cn(
                          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary',
                          checked && 'bg-primary-muted',
                        )}
                      >
                        <Avatar member={m} size={28} />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{m.displayName || m.name}</div>
                          <div className="text-xs text-muted-foreground">{m.affiliation}</div>
                        </div>
                        {checked && <Check className="size-4 shrink-0 text-primary" strokeWidth={3} />}
                      </button>
                    )
                  })}
                  <div className="px-1 pt-1 text-xs font-medium text-muted-foreground">{tr('taskDrawer.allMembers')}</div>
                </>
              )}
              {members
                .filter((m) => !topIds.has(m.id) && !m.inactive)
                .map((m) => {
                  const activeCount = tasks.filter((t) => t.assigneeIds.includes(m.id) && t.status !== 'done').length
                  return { m, activeCount }
                })
                .sort((a, b) => a.activeCount - b.activeCount)
                .map(({ m, activeCount }) => {
                  const checked = !!task?.assigneeIds.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        if (!task) return
                        const next = checked
                          ? task.assigneeIds.filter((id) => id !== m.id)
                          : [...task.assigneeIds, m.id]
                        assignTask(task.id, next)
                      }}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary',
                        checked && 'bg-primary-muted',
                      )}
                    >
                      <Avatar member={m} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{m.displayName || m.name}</div>
                        <div className="text-xs text-muted-foreground">{m.affiliation}</div>
                      </div>
                      <span className={cn(
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                        activeCount === 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : activeCount <= 2 ? 'bg-secondary text-muted-foreground' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
                      )}>
                        {tr('taskDrawer.assign.activeCount', { count: activeCount })}
                      </span>
                      {checked && <Check className="size-4 shrink-0 text-primary" strokeWidth={3} />}
                    </button>
                  )
                })}
            </div>
          )
        })()}
      </Modal>

      {/* Task handoff (item 13: タスク引き継ぎ) */}
      <HandoffModal
        open={handoffOpen}
        onClose={() => setHandoffOpen(false)}
        task={task}
        members={members}
        onHandoff={(fromId, toId, note) => {
          if (!task) return
          const next = task.assigneeIds.filter((id) => id !== fromId)
          if (!next.includes(toId)) next.push(toId)
          assignTask(task.id, next)
          const fromM = members.find((m) => m.id === fromId)
          const toM = members.find((m) => m.id === toId)
          const summary = [
            tr('taskDrawer.handoff.summaryLine', {
              from: fromM?.displayName || fromM?.name || tr('taskDrawer.handoff.defaultFrom'),
              to: toM?.displayName || toM?.name || tr('taskDrawer.handoff.defaultTo'),
            }),
            task.progress ? tr('taskDrawer.handoff.recentProgress', { progress: task.progress }) : null,
            (task.deliverables?.length ?? 0) > 0
              ? tr('taskDrawer.handoff.deliverablesCount', { count: task.deliverables!.length })
              : null,
            (task.dependsOnIds?.length ?? 0) > 0
              ? tr('taskDrawer.handoff.dependsCount', { count: task.dependsOnIds!.length })
              : null,
            note.trim() ? tr('taskDrawer.handoff.noteLine', { note: note.trim() }) : null,
          ]
            .filter(Boolean)
            .join('\n')
          addComment(task.id, summary)
          toast(tr('taskDrawer.handoff.done'))
          setHandoffOpen(false)
        }}
      />

      {/* Schedule (start date / deadline) edit */}
      <ScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        task={task}
        onSave={(startDate, deadline) => {
          if (!task) return
          updateSchedule(task.id, startDate, deadline)
          toast(tr('taskDrawer.schedule.savedToast'))
          setScheduleOpen(false)
        }}
      />

      {/* Admin edit (title/description/project/department/category/skills/
          difficulty/priority/visibility/importance) */}
      <EditTaskModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        task={task}
        projects={projects}
        skillOptions={skillOptions}
        categoryOptions={categoryOptions}
        onAddSkillOption={addSkillOption}
        onAddCategoryOption={addCategoryOption}
        onSave={(details) => {
          if (!task) return
          updateTaskDetails(task.id, details)
          toast(tr('taskDrawer.edit.savedToast'))
          setEditOpen(false)
        }}
      />

      {/* Dependency (prerequisite tasks) edit */}
      <Modal
        open={dependsOpen}
        onClose={() => {
          setDependsOpen(false)
          setDependsQuery('')
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{tr('taskDrawer.depends.title')}</h2>
          <button
            onClick={() => {
              setDependsOpen(false)
              setDependsQuery('')
            }}
            aria-label={tr('common.close')}
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          {tr('taskDrawer.depends.hint')}
        </p>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={dependsQuery}
            onChange={(e) => setDependsQuery(e.target.value)}
            placeholder={tr('taskDrawer.depends.searchPlaceholder')}
            autoFocus
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="flex max-h-80 flex-col gap-1 overflow-auto orbit-scroll">
          {(() => {
            const filtered = tasks
              .filter((t) => t.id !== task?.id)
              .filter((t) => t.name.toLowerCase().includes(dependsQuery.trim().toLowerCase()))
            if (filtered.length === 0) {
              return <p className="px-3 py-2 text-sm text-muted-foreground">{tr('taskDrawer.depends.noResults')}</p>
            }
            return filtered.map((t) => {
              const checked = !!task?.dependsOnIds?.includes(t.id)
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    if (!task) return
                    const cur = task.dependsOnIds ?? []
                    const next = checked ? cur.filter((id) => id !== t.id) : [...cur, t.id]
                    updateDependsOn(task.id, next)
                  }}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary',
                    checked && 'bg-primary-muted',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{tr(STATUS_KEY[t.status])}</div>
                  </div>
                  {checked && <Check className="size-4 shrink-0 text-primary" strokeWidth={3} />}
                </button>
              )
            })
          })()}
        </div>
      </Modal>

      {/* Reviewer (確認者) select */}
      <Modal open={reviewerOpen} onClose={() => setReviewerOpen(false)}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{tr('taskDrawer.reviewer.title')}</h2>
          <button onClick={() => setReviewerOpen(false)} aria-label={tr('common.close')}>
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          {tr('taskDrawer.reviewer.hint')}
        </p>
        {(() => {
          const currentIds = task?.reviewerIds ?? (task?.reviewerId ? [task.reviewerId] : [])
          const deptTops = task?.department
            ? getDepartmentTopsBySegment(task.department, members)
            : []
          const topIds = new Set(deptTops.map((m) => m.id))
          return (
            <div className="flex max-h-80 flex-col gap-1 overflow-auto orbit-scroll">
              {deptTops.length > 0 && (
                <>
                  <div className="px-1 pb-0.5 pt-1 text-xs font-medium text-muted-foreground">{tr('taskDrawer.deptTopsRecommended')}</div>
                  {deptTops.map((m) => {
                    const checked = currentIds.includes(m.id)
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          if (!task) return
                          const next = checked ? currentIds.filter((id) => id !== m.id) : [...currentIds, m.id]
                          updateReviewers(task.id, next, task.requiredApprovals)
                        }}
                        className={cn(
                          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary',
                          checked && 'bg-primary-muted',
                        )}
                      >
                        <Avatar member={m} size={28} />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{m.displayName || m.name}</div>
                          <div className="text-xs text-muted-foreground">{m.affiliation}</div>
                        </div>
                        {checked && <Check className="size-4 shrink-0 text-primary" strokeWidth={3} />}
                      </button>
                    )
                  })}
                  <div className="px-1 pt-1 text-xs font-medium text-muted-foreground">{tr('taskDrawer.allMembers')}</div>
                </>
              )}
              {members.filter((m) => !topIds.has(m.id)).map((m) => {
                const checked = currentIds.includes(m.id)
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      if (!task) return
                      const next = checked ? currentIds.filter((id) => id !== m.id) : [...currentIds, m.id]
                      updateReviewers(task.id, next, task.requiredApprovals)
                    }}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary',
                      checked && 'bg-primary-muted',
                    )}
                  >
                    <Avatar member={m} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{m.displayName || m.name}</div>
                      <div className="text-xs text-muted-foreground">{m.affiliation}</div>
                    </div>
                    {checked && <Check className="size-4 shrink-0 text-primary" strokeWidth={3} />}
                  </button>
                )
              })}
            </div>
          )
        })()}
        {/* 必要承認数の設定 */}
        {(() => {
          const currentIds = task?.reviewerIds ?? (task?.reviewerId ? [task.reviewerId] : [])
          if (currentIds.length < 2) return null
          const req = task?.requiredApprovals
          return (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2">
              <span className="text-xs text-muted-foreground shrink-0">{tr('taskDrawer.reviewer.requiredApprovalsLabel')}</span>
              <select
                value={req === 'all' ? 'all' : (req ?? 1)}
                onChange={(e) => {
                  if (!task) return
                  const val = e.target.value === 'all' ? 'all' : Number(e.target.value) as number
                  updateReviewers(task.id, currentIds, val)
                }}
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
              >
                {currentIds.map((_, i) => (
                  <option key={i + 1} value={i + 1}>{tr('taskDrawer.reviewer.approvalCount', { count: i + 1 })}</option>
                ))}
                <option value="all">{tr('common.everyone')}</option>
              </select>
            </div>
          )
        })()}
        <button
          onClick={() => {
            if (task) updateReviewers(task.id, [], undefined)
            setReviewerOpen(false)
          }}
          className="mt-2 w-full rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
        >
          {tr('taskDrawer.reviewer.clearAll')}
        </button>
      </Modal>

      {/* Blocker note */}
      <BlockerModal
        open={blockerOpen}
        onClose={() => setBlockerOpen(false)}
        task={task}
        onSave={(note) => {
          if (!task) return
          setBlocker(task.id, note)
          toast(note ? tr('taskDrawer.blocker.registered') : tr('taskDrawer.blocker.cleared'))
          setBlockerOpen(false)
        }}
      />

      {/* Skill award modal (admin, done tasks) */}
      {task && isAdmin && task.status === 'done' && (
        <SkillAwardModal
          open={awardOpen}
          onClose={() => setAwardOpen(false)}
          task={task}
          assignees={assignees}
          allTasks={tasks}
          onAward={(memberId, points) => {
            awardSkillPoints(task.id, memberId, points)
            toast(tr('taskDrawer.award.done'))
            setAwardOpen(false)
          }}
        />
      )}
    </>
  )
}

function BlockerModal({
  open,
  onClose,
  task,
  onSave,
}: {
  open: boolean
  onClose: () => void
  task: Task | null
  onSave: (note: string | null) => void
}) {
  const { t } = useI18n()
  const [note, setNote] = useState('')
  const [lastTaskId, setLastTaskId] = useState<string | null>(null)
  if (task && task.id !== lastTaskId && open) {
    setLastTaskId(task.id)
    setNote(task.blocker?.note ?? '')
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-base font-semibold">{t('taskDrawer.blocker.title')}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('taskDrawer.blocker.hint')}
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder={t('taskDrawer.blocker.placeholder')}
        className="mt-3 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
      />
      <div className="mt-5 flex justify-end gap-2">
        {task?.blocker && (
          <Button variant="ghost" className="h-9 mr-auto text-destructive" onClick={() => onSave(null)}>
            {t('taskDrawer.blocker.release')}
          </Button>
        )}
        <Button variant="ghost" className="h-9" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button className="h-9" disabled={!note.trim()} onClick={() => onSave(note)}>
          {t('common.save')}
        </Button>
      </div>
    </Modal>
  )
}

// スキルポイント付与モーダル
function SkillAwardModal({
  open,
  onClose,
  task,
  assignees,
  allTasks,
  onAward,
}: {
  open: boolean
  onClose: () => void
  task: Task
  assignees: Member[]
  allTasks: Task[]
  onAward: (memberId: string, points: SkillPoints) => void
}) {
  const { t } = useI18n()
  const [memberId, setMemberId] = useState(assignees[0]?.id ?? '')
  const [pointsMap, setPointsMap] = useState<Record<string, number>>(() =>
    Object.fromEntries(task.skills.map((s) => [s, 10])),
  )

  // Compute average awarded points for each skill from similar-category done tasks
  const avgPoints = Object.fromEntries(
    task.skills.map((skill) => {
      const similar = allTasks.filter(
        (t) =>
          t.id !== task.id &&
          t.status === 'done' &&
          t.category === task.category &&
          t.awardedPoints?.[skill] != null,
      )
      if (similar.length === 0) return [skill, null]
      const avg = similar.reduce((sum, t) => sum + (t.awardedPoints![skill] ?? 0), 0) / similar.length
      return [skill, Math.round(avg)]
    }),
  )

  const setPoint = (skill: string, value: number) =>
    setPointsMap((prev) => ({ ...prev, [skill]: Math.max(0, value) }))

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="mb-3 text-base font-semibold">{t('taskDrawer.award.title')}</h2>
      {assignees.length > 1 && (
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('taskDrawer.award.targetMember')}</label>
          <select
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          >
            {assignees.map((m) => (
              <option key={m.id} value={m.id}>{m.displayName ?? m.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {task.skills.map((skill) => (
          <div key={skill} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-sm">{skill}</span>
            {avgPoints[skill] != null && (
              <button
                onClick={() => setPoint(skill, avgPoints[skill]!)}
                className="shrink-0 text-xs text-muted-foreground hover:text-primary"
              >
                {t('taskDrawer.award.referenceValue', { points: avgPoints[skill] })}
              </button>
            )}
            <input
              type="number"
              min={0}
              max={9999}
              value={pointsMap[skill] ?? 0}
              onChange={(e) => setPoint(skill, Number(e.target.value))}
              className="h-8 w-20 rounded-md border border-border bg-background px-2 text-right text-sm outline-none focus:border-primary"
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          disabled={!memberId}
          onClick={() => {
            if (!memberId) return
            const points: SkillPoints = {}
            task.skills.forEach((s) => { if ((pointsMap[s] ?? 0) > 0) points[s] = pointsMap[s] })
            onAward(memberId, points)
          }}
        >
          {t('taskDrawer.award.confirm')}
        </Button>
      </div>
    </Modal>
  )
}

// item 13: タスク引き継ぎ — pick who's handing off and who's taking over,
// swaps the assignee list, and posts an auto-summarized comment (progress/
// deliverables/prerequisite-task counts + an optional note) so the new
// assignee has the full picture without hunting through the task
function HandoffModal({
  open,
  onClose,
  task,
  members,
  onHandoff,
}: {
  open: boolean
  onClose: () => void
  task: Task | null
  members: Member[]
  onHandoff: (fromId: string, toId: string, note: string) => void
}) {
  const { t } = useI18n()
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [note, setNote] = useState('')

  const assignees = (task?.assigneeIds ?? [])
    .map((id) => members.find((m) => m.id === id))
    .filter(Boolean) as Member[]
  const candidates = members.filter((m) => m.id !== fromId && !task?.assigneeIds.includes(m.id))

  const reset = () => {
    setFromId('')
    setToId('')
    setNote('')
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
    >
      <h2 className="text-base font-semibold">{t('taskDrawer.handoff.title')}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('taskDrawer.handoff.hint')}
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{t('taskDrawer.handoff.from')}</span>
          <select
            value={fromId}
            onChange={(e) => {
              setFromId(e.target.value)
              if (e.target.value === toId) setToId('')
            }}
            className="h-9 cursor-pointer rounded-lg border border-border bg-card px-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="">{t('common.selectPlaceholder')}</option>
            {assignees.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName || m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{t('taskDrawer.handoff.to')}</span>
          <select
            value={toId}
            onChange={(e) => setToId(e.target.value)}
            disabled={!fromId}
            className="h-9 cursor-pointer rounded-lg border border-border bg-card px-2.5 text-sm outline-none focus:border-primary disabled:opacity-50"
          >
            <option value="">{t('common.selectPlaceholder')}</option>
            {candidates.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName || m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{t('taskDrawer.handoff.noteLabel')}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={t('taskDrawer.handoff.notePlaceholder')}
            className="resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button
          variant="ghost"
          className="h-9"
          onClick={() => {
            reset()
            onClose()
          }}
        >
          {t('common.cancel')}
        </Button>
        <Button
          className="h-9"
          disabled={!fromId || !toId}
          onClick={() => {
            onHandoff(fromId, toId, note)
            reset()
          }}
        >
          {t('taskDrawer.handoff')}
        </Button>
      </div>
    </Modal>
  )
}

function ScheduleModal({
  open,
  onClose,
  task,
  onSave,
}: {
  open: boolean
  onClose: () => void
  task: Task | null
  onSave: (startDate: string | null, deadline: string | null) => void
}) {
  const { t } = useI18n()
  const [start, setStart] = useState('')
  const [deadline, setDeadline] = useState('')

  // sync drafts whenever the modal opens for a (possibly different) task
  const [lastTaskId, setLastTaskId] = useState<string | null>(null)
  if (task && task.id !== lastTaskId && open) {
    setLastTaskId(task.id)
    setStart(task.startDate ?? '')
    setDeadline(task.deadline ?? '')
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-base font-semibold">{t('taskDrawer.schedule.title')}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t('taskDrawer.schedule.hint')}</p>
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{t('taskDrawer.row.startDate')}</span>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{t('taskDrawer.row.deadline')}</span>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
          />
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" className="h-9" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button className="h-9" onClick={() => onSave(start || null, deadline || null)}>
          {t('common.save')}
        </Button>
      </div>
    </Modal>
  )
}

const PRIORITY_OPTIONS: Priority[] = ['高', '中', '低']

// 管理者向けの一括編集モーダル — INPUT画面の承認前カード（parsed-task-card.tsx）
// と同じ項目を、承認後のタスクに対しても編集できるようにする
function EditTaskModal({
  open,
  onClose,
  task,
  projects,
  skillOptions,
  categoryOptions,
  onAddSkillOption,
  onAddCategoryOption,
  onSave,
}: {
  open: boolean
  onClose: () => void
  task: Task | null
  projects: Project[]
  skillOptions: string[]
  categoryOptions: string[]
  onAddSkillOption: (skill: string) => void
  onAddCategoryOption: (category: string) => void
  onSave: (details: {
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
  }) => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [department, setDepartment] = useState<Department>(DEPARTMENTS[0])
  const [category, setCategory] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [categoryDraft, setCategoryDraft] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [skillDraft, setSkillDraft] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>(DIFFICULTY_LABEL[0])
  const [priority, setPriority] = useState<Priority>('中')
  const [visibility, setVisibility] = useState<'all' | '幹部'>('all')
  const [importance, setImportance] = useState<TaskImportance>('一般')

  // sync drafts whenever the modal opens for a (possibly different) task
  const [lastTaskId, setLastTaskId] = useState<string | null>(null)
  if (task && task.id !== lastTaskId && open) {
    setLastTaskId(task.id)
    setName(task.name)
    setDescription(task.description ?? '')
    setProjectId(task.projectId)
    setDepartment(task.department)
    setCategory(task.category)
    setSkills(task.skills)
    setDifficulty(task.difficulty)
    setPriority(task.priority)
    setVisibility(task.visibility ?? 'all')
    setImportance(task.importance ?? '一般')
  }

  const addSkill = () => {
    const v = skillDraft.trim()
    if (v) {
      onAddSkillOption(v)
      if (!skills.includes(v)) setSkills([...skills, v])
    }
    setSkillDraft('')
  }
  const availableSkills = skillOptions.filter((s) => !skills.includes(s))

  const commitNewCategory = () => {
    const v = categoryDraft.trim()
    if (v) {
      onAddCategoryOption(v)
      setCategory(v)
    }
    setCategoryDraft('')
    setAddingCategory(false)
  }

  const fieldClass =
    'h-9 w-full cursor-pointer rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary'

  return (
    <Modal open={open} onClose={onClose} labelledBy="edit-task-title">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="edit-task-title" className="text-base font-semibold">
          {t('taskDrawer.edit.title')}
        </h2>
        <button onClick={onClose} aria-label={t('common.close')}>
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-auto orbit-scroll pr-1">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{t('taskDrawer.edit.nameLabel')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{t('taskDrawer.edit.descriptionLabel')}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t('taskDrawer.row.project')}</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={fieldClass}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t('taskDrawer.row.department')}</span>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value as Department)}
              className={fieldClass}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t('taskDrawer.row.category')}</span>
            {addingCategory ? (
              <input
                autoFocus
                value={categoryDraft}
                onChange={(e) => setCategoryDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitNewCategory()
                  }
                  if (e.key === 'Escape') {
                    setCategoryDraft('')
                    setAddingCategory(false)
                  }
                }}
                onBlur={commitNewCategory}
                placeholder={t('taskDrawer.edit.newCategoryPlaceholder')}
                className="h-9 rounded-lg border border-primary bg-card px-3 text-sm outline-none"
              />
            ) : (
              <select
                value={category}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setAddingCategory(true)
                  } else {
                    setCategory(e.target.value)
                  }
                }}
                className={fieldClass}
              >
                {!categoryOptions.includes(category) && category && (
                  <option value={category}>{category}</option>
                )}
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__new__">{t('taskDrawer.edit.addCategoryOption')}</option>
              </select>
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t('taskDrawer.row.difficulty')}</span>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className={fieldClass}
            >
              {DIFFICULTY_LABEL.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t('taskDrawer.edit.priorityLabel')}</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className={fieldClass}
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t('taskDrawer.edit.visibilityLabel')}</span>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'all' | '幹部')}
              className={fieldClass}
            >
              <option value="all">{t('common.everyone')}</option>
              <option value="幹部">{t('taskDrawer.execOnly')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t('taskDrawer.edit.importanceLabel')}</span>
            <select
              value={importance}
              onChange={(e) => setImportance(e.target.value as TaskImportance)}
              className={fieldClass}
            >
              {TASK_IMPORTANCE.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{t('taskDrawer.row.skills')}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {skills.map((s) => (
              <Tag key={s} onRemove={() => setSkills(skills.filter((x) => x !== s))}>
                {s}
              </Tag>
            ))}
            {availableSkills.length > 0 && (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {availableSkills.slice(0, 6).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSkills([...skills, s])}
                    className="inline-flex items-center gap-0.5 rounded-md border border-primary/25 bg-primary/5 px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-primary/10"
                  >
                    <Plus className="size-3 text-primary" />
                    {s}
                  </button>
                ))}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border-strong px-1.5 py-0.5">
              <input
                value={skillDraft}
                onChange={(e) => setSkillDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addSkill()
                  }
                }}
                placeholder={t('common.add')}
                className="w-14 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"
                aria-label={t('taskDrawer.edit.addSkillAria')}
              />
              <button
                type="button"
                onClick={addSkill}
                className="text-muted-foreground hover:text-foreground"
                aria-label={t('taskDrawer.edit.addSkillAria')}
              >
                <Plus className="size-3" />
              </button>
            </span>
          </div>
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" className="h-9" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          className="h-9"
          disabled={!name.trim() || !projectId}
          onClick={() => {
            onSave({
              name: name.trim(),
              description: description.trim(),
              projectId,
              department,
              category: category.trim() || '未分類',
              skills,
              difficulty,
              priority,
              visibility,
              importance,
            })
          }}
        >
          {t('common.save')}
        </Button>
      </div>
    </Modal>
  )
}

function DrawerBody({
  task,
  currentUserId,
  isAdmin,
  assignees,
  dependsOnTasks,
  creator,
  reviewer,
  reviewers,
  members,
  projects,
  projectName,
  hasSourceInput,
  onClose,
  onStatus,
  onTake,
  onOpenAssign,
  onOpenInput,
  onOpenSchedule,
  onOpenDepends,
  onOpenReviewer,
  onOpenBlocker,
  onClearBlocker,
  onOpenHandoff,
  onOpenEdit,
  onOpenDelete,
  onOpenAward,
  onAddDeliverable,
  onRemoveDeliverable,
  onAddComment,
  onRemoveComment,
  onProgress,
  onUpdateEstimatedHours,
  onUpdateActualHours,
  onSaveRetrospective,
  onSetSchedule,
  onRespondSchedule,
  onSetForm,
  onRespondForm,
}: {
  task: Task
  currentUserId: string | null
  isAdmin: boolean
  assignees: Member[]
  dependsOnTasks: Task[]
  creator: Member | null
  reviewer: Member | null
  reviewers: (Member | undefined)[]
  members: Member[]
  projects: Project[]
  projectName: string
  hasSourceInput: boolean
  onClose: () => void
  onStatus: (s: TaskStatus) => void
  onTake: () => void
  onOpenAssign: () => void
  onOpenInput: () => void
  onOpenSchedule: () => void
  onOpenDepends: () => void
  onOpenReviewer: () => void
  onOpenBlocker: () => void
  onClearBlocker: () => void
  onOpenHandoff: () => void
  onOpenEdit: () => void
  onOpenDelete: () => void
  onOpenAward: () => void
  onAddDeliverable: (label: string, url: string) => void
  onRemoveDeliverable: (id: string) => void
  onAddComment: (text: string) => void
  onRemoveComment: (commentId: string) => void
  onProgress: (text: string) => void
  onUpdateEstimatedHours: (hours: number | null) => void
  onUpdateActualHours: (hours: number | null) => void
  onSaveRetrospective: (retrospective: TaskRetrospective | null) => void
  onSetSchedule: (candidates: { id: string; label: string }[], invitedIds: string[]) => void
  onRespondSchedule: (responses: Record<string, ScheduleResponseValue>) => void
  onSetForm: (fields: FormFieldDef[], invitedIds: string[]) => void
  onRespondForm: (responses: Record<string, FormAnswerValue>) => void
}) {
  const { t } = useI18n()
  const currentUserTz = members.find((m) => m.id === currentUserId)?.timezone ?? DEFAULT_TIMEZONE
  const overdue = isOverdue(task, currentUserTz)
  const calendarUrl = googleCalendarUrl(task, {
    projectName,
    department: task.department,
    category: task.category,
  })
  const isAssignee = !!currentUserId && task.assigneeIds.includes(currentUserId)
  const canChangeStatus = canChangeTaskStatus(isAdmin, isAssignee)
  // 前提タスクが残っていると「完了」にはできない
  const incompleteDeps = dependsOnTasks.filter((d) => d.status !== 'done')
  const canUpdateProgress = isAdmin || isAssignee
  const canManageBlocker = isAdmin || isAssignee
  const canManageDeliverables = isAdmin || isAssignee
  const [progressDraft, setProgressDraft] = useState('')
  const [deliverableLabel, setDeliverableLabel] = useState('')
  const [deliverableUrl, setDeliverableUrl] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)

  // 確認者が設定されている場合、「完了」への変更は確認者本人のみ可（item 17）。
  // 確認者なし or 自分が確認者の場合は従来通りadminが変更可。
  const reviewerIds = task.reviewerIds ?? (task.reviewerId ? [task.reviewerId] : [])
  const isReviewer = !!currentUserId && reviewerIds.includes(currentUserId)
  const statusOptions = allowedStatusOptions(isAdmin, isReviewer)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t('taskDrawer.title')}
        </span>
        <button
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label={t('taskDrawer.close')}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto orbit-scroll px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 id="task-drawer-title" className="text-lg font-semibold tracking-tight text-balance">
            <TranslatedText text={task.name} />
          </h2>
          {task.pendingApproval && (
            <span className="shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              {t('taskDrawer.pendingApproval')}
            </span>
          )}
          {task.visibility === '幹部' && (
            <span className="shrink-0 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
              {t('taskDrawer.execOnly')}
            </span>
          )}
          {(task.importance === '重要' || task.importance === '対外公開') && (
            <span className="shrink-0 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
              {task.importance}
            </span>
          )}
          {isAdmin && (
            <button
              onClick={onOpenEdit}
              className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label={t('taskDrawer.editAria')}
              title={t('taskDrawer.editAria')}
            >
              <Pencil className="size-3.5" />
              {t('taskDrawer.edit')}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={onOpenDelete}
              className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label={t('taskDrawer.deleteAria')}
              title={t('taskDrawer.deleteAria')}
            >
              <Trash2 className="size-3.5" />
              {t('taskDrawer.delete')}
            </button>
          )}
        </div>
        {task.description && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {task.description}
          </p>
        )}

        {task.blocker && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <Ban className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-medium text-destructive">{t('taskDrawer.blocked')}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{task.blocker.note}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{task.blocker.since}〜</p>
              </div>
            </div>
            {canManageBlocker && (
              <button
                onClick={onClearBlocker}
                className="shrink-0 whitespace-nowrap text-xs font-medium text-primary hover:underline"
              >
                {t('taskDrawer.blockedRelease')}
              </button>
            )}
          </div>
        )}

        <dl className="mt-5 space-y-0.5">
          <Row label={t('taskDrawer.row.project')}>
            <span className="inline-flex items-center gap-1.5 text-sm">
              <span className="size-1.5 rounded-full bg-primary/60" />
              {projectName}
            </span>
          </Row>
          <Row label={t('taskDrawer.row.department')}>
            <span className="text-sm"><DepartmentTag name={task.department} /></span>
          </Row>
          <Row label={t('taskDrawer.row.assignee')}>
            {assignees.length > 0 ? (
              <div className="flex flex-col items-end gap-1">
                {assignees.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-2 text-sm">
                    <Avatar member={a} size={22} />
                    {a.displayName || a.name}
                  </span>
                ))}
                {isAdmin && (
                  <button
                    onClick={onOpenHandoff}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {t('taskDrawer.handoff')}
                  </button>
                )}
              </div>
            ) : (
              <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                {t('output.list.unassigned')}
              </span>
            )}
          </Row>
          <Row label={t('taskDrawer.row.reviewer')}>
            <span className="inline-flex flex-wrap items-center gap-1.5 text-sm">
              {reviewers.length > 0 ? (
                reviewers.map((m) => m && (
                  <span key={m.id} className="inline-flex items-center gap-1.5">
                    <Avatar member={m} size={22} />
                    {m.displayName || m.name}
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground">{t('common.notSet')}</span>
              )}
              {isAdmin && (
                <button
                  onClick={onOpenReviewer}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t('taskDrawer.reviewerEdit')}
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </span>
          </Row>
          <Row label={t('taskDrawer.row.startDate')}>
            <span className="inline-flex items-center gap-1.5 text-sm">
              {formatDeadlineFull(task.startDate ?? null)}
              {isAdmin && (
                <button
                  onClick={onOpenSchedule}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t('taskDrawer.scheduleEdit')}
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </span>
          </Row>
          <Row label={t('taskDrawer.row.deadline')}>
            <span className={cn('inline-flex items-center gap-1.5 text-sm', overdue && 'text-destructive')}>
              {overdue && <TriangleAlert className="size-3.5" />}
              {formatDeadlineFull(task.deadline)}
              {task.dueTime && <span className="tabular-nums">　{task.dueTime}</span>}
              {isAdmin && (
                <button
                  onClick={onOpenSchedule}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t('taskDrawer.scheduleEdit')}
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </span>
          </Row>
          <Row label={t('taskDrawer.row.dependsOn')}>
            <div className="flex flex-col items-end gap-1">
              {dependsOnTasks.length > 0 ? (
                dependsOnTasks.map((d) => (
                  <span key={d.id} className="inline-flex items-center gap-1.5 text-sm">
                    <GitBranch className="size-3.5 text-muted-foreground" />
                    {d.name}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">{t('common.none')}</span>
              )}
              {isAdmin && (
                <button
                  onClick={onOpenDepends}
                  className="text-xs text-primary hover:underline"
                >
                  {t('common.edit')}
                </button>
              )}
            </div>
          </Row>
          <Row label={t('taskDrawer.row.status')}>
            <span className="inline-flex items-center gap-1.5 text-sm">
              <StatusDot status={task.status} />
              {t(STATUS_KEY[task.status])}
            </span>
          </Row>
          <Row label={t('taskDrawer.row.category')}>
            <span className="text-sm">{task.category}</span>
          </Row>
          <Row label={t('taskDrawer.row.difficulty')}>
            <DifficultyBadge difficulty={task.difficulty} />
          </Row>
          <Row label={t('taskDrawer.row.skills')}>
            <div className="flex flex-wrap gap-1.5">
              {task.skills.map((s) => (
                <Tag key={s}>{s}</Tag>
              ))}
            </div>
          </Row>
          <Row label={t('taskDrawer.row.estimatedHours')}>
            <HoursField
              value={task.estimatedHours}
              editable={isAdmin}
              onSave={onUpdateEstimatedHours}
              placeholder={t('common.notSet')}
            />
          </Row>
          <Row label={t('taskDrawer.row.actualHours')}>
            <HoursField
              value={task.actualHours}
              editable={isAdmin || isAssignee}
              onSave={onUpdateActualHours}
              placeholder={t('common.notSet')}
            />
          </Row>
          {(isAdmin || isAssignee) && currentUserId && (
            <Row label={t('taskDrawer.row.timer')}>
              <TimerWidget
                taskId={task.id}
                userId={currentUserId}
                actualHours={task.actualHours}
                onAddHours={(hours) => onUpdateActualHours((task.actualHours ?? 0) + hours)}
              />
            </Row>
          )}
          <Row label={t('taskDrawer.row.creator')}>
            {creator ? (
              <span className="inline-flex items-center gap-2 text-sm">
                <Avatar member={creator} size={22} />
                {creator.displayName || creator.name}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">{t('taskDrawer.unknown')}</span>
            )}
          </Row>
        </dl>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {hasSourceInput && (
            <button
              onClick={onOpenInput}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <FileText className="size-3.5" />
              {t('taskDrawer.viewSourceInput')}
            </button>
          )}
          {calendarUrl && (
            <a
              href={calendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <CalendarPlus className="size-3.5" />
              {t('taskDrawer.addToMyGCal')}
            </a>
          )}
          {canManageBlocker && !task.blocker && (
            <button
              onClick={onOpenBlocker}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive"
            >
              <Ban className="size-3.5" />
              {t('taskDrawer.blocker.title')}
            </button>
          )}
        </div>

        {/* Status changer */}
        {canChangeStatus && (
          <div className="mt-6">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('taskDrawer.changeStatusHeader')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {statusOptions.map((s) => {
                const blocked = s === 'done' && incompleteDeps.length > 0
                return (
                  <button
                    key={s}
                    onClick={() => !blocked && onStatus(s)}
                    disabled={blocked}
                    title={
                      blocked
                        ? t('taskDrawer.dependsIncompleteTitle', { names: incompleteDeps.map((d) => d.name).join('、') })
                        : undefined
                    }
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                      blocked && 'cursor-not-allowed opacity-40',
                      task.status === s
                        ? 'border-primary bg-primary-muted text-accent-foreground'
                        : 'border-border bg-card text-foreground hover:bg-secondary',
                    )}
                  >
                    <StatusDot status={s} />
                    {t(STATUS_KEY[s])}
                  </button>
                )
              })}
            </div>
            {incompleteDeps.length > 0 && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-warning">
                <TriangleAlert className="size-3" />
                {t('taskDrawer.dependsIncompleteWarning', { names: incompleteDeps.map((d) => d.name).join('、') })}
              </p>
            )}
            {reviewerIds.length > 0 && !isReviewer && isAdmin && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <UserCheck className="size-3" />
                {t('taskDrawer.reviewerOnlyDoneNotice')}
              </p>
            )}
            {!isAdmin && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {t('taskDrawer.pendingReviewNotice')}
              </p>
            )}
          </div>
        )}

        {/* Progress */}
        <div className="mt-6">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('taskDrawer.progressHeader')}
          </div>
          {canUpdateProgress && (
            <div className="mb-3 flex items-start gap-2">
              <textarea
                value={progressDraft}
                onChange={(e) => setProgressDraft(e.target.value)}
                rows={2}
                placeholder={t('taskDrawer.progressPlaceholder')}
                className="min-h-[52px] flex-1 resize-none rounded-lg border border-border bg-card px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
              />
              <Button
                className="h-9 shrink-0"
                disabled={!progressDraft.trim()}
                onClick={() => {
                  onProgress(progressDraft)
                  setProgressDraft('')
                }}
              >
                {t('taskDrawer.recordButton')}
              </Button>
            </div>
          )}
          {task.progressHistory.length > 0 ? (
            <ul className="space-y-2.5">
              {task.progressHistory.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
                  <p className="text-sm leading-relaxed">{entry.text}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatDateTime(entry.at)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('taskDrawer.progressEmpty')}</p>
          )}
        </div>

        {/* Deliverables */}
        <div className="mt-6">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('taskDrawer.deliverablesHeader')}
          </div>
          {(task.deliverables?.length ?? 0) > 0 ? (
            <ul className="mb-3 flex flex-col gap-1.5">
              {task.deliverables!.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2"
                >
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-w-0 items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <Link2 className="size-3.5 shrink-0" />
                    <span className="truncate">{d.label}</span>
                  </a>
                  {canManageDeliverables && (
                    <button
                      onClick={() => onRemoveDeliverable(d.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={t('common.delete')}
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-muted-foreground">{t('taskDrawer.deliverablesEmpty')}</p>
          )}
          {canManageDeliverables && (
            <div className="flex flex-col gap-1.5 sm:flex-row">
              <input
                value={deliverableLabel}
                onChange={(e) => setDeliverableLabel(e.target.value)}
                placeholder={t('taskDrawer.deliverableNamePlaceholder')}
                className="h-9 flex-1 rounded-lg border border-border bg-card px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
              />
              <input
                value={deliverableUrl}
                onChange={(e) => setDeliverableUrl(e.target.value)}
                placeholder="URL"
                className="h-9 flex-1 rounded-lg border border-border bg-card px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
              />
              <Button
                variant="outline"
                className="h-9 shrink-0"
                disabled={!deliverableLabel.trim() || !deliverableUrl.trim()}
                onClick={() => {
                  onAddDeliverable(deliverableLabel, deliverableUrl)
                  setDeliverableLabel('')
                  setDeliverableUrl('')
                }}
              >
                <Plus className="size-4" />
                {t('common.add')}
              </Button>
            </div>
          )}
        </div>

        <ScheduleSection
          task={task}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          members={members}
          onSetSchedule={onSetSchedule}
          onRespondSchedule={onRespondSchedule}
        />

        <FormSection
          task={task}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          members={members}
          onSetForm={onSetForm}
          onRespondForm={onRespondForm}
        />

        {/* Comments */}
        <div className="mt-6">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('taskDrawer.commentsHeader')}
          </div>
          {(task.comments?.length ?? 0) > 0 ? (
            <ul className="mb-3 flex flex-col gap-2.5">
              {task.comments!.map((c) => {
                const author = members.find((m) => m.id === c.byId)
                const canDelete = isAdmin || c.byId === currentUserId
                return (
                  <li key={c.id} className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {author && <Avatar member={author} size={18} />}
                        <span className="text-xs font-medium">
                          {author?.displayName || author?.name || t('taskDrawer.unknown')}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{formatDateTime(c.at)}</span>
                      </div>
                      {canDelete && (
                        <button
                          onClick={() => onRemoveComment(c.id)}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={t('common.delete')}
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{c.text}</p>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-muted-foreground">{t('taskDrawer.commentsEmpty')}</p>
          )}
          <div className="flex items-start gap-2">
            <div className="relative flex-1">
              <textarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                rows={2}
                placeholder={t('taskDrawer.commentPlaceholder')}
                className="min-h-[52px] w-full resize-none rounded-lg border border-border bg-card px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
              />
              {(() => {
                const match = /@([^\s@]*)$/.exec(commentDraft)
                if (!match) return null
                const q = match[1]
                const candidates = members
                  .filter((m) => {
                    const label = m.displayName || m.name
                    return q.length === 0 || label.toLowerCase().includes(q.toLowerCase())
                  })
                  .slice(0, 5)
                if (candidates.length === 0) return null
                return (
                  <ul className="absolute bottom-full left-0 z-10 mb-1 w-48 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                    {candidates.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => {
                            const label = m.displayName || m.name
                            setCommentDraft(commentDraft.slice(0, match.index) + `@${label} `)
                          }}
                          className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-sm hover:bg-secondary"
                        >
                          <Avatar member={m} size={16} />
                          {m.displayName || m.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              })()}
            </div>
            <Button
              className="h-9 shrink-0"
              disabled={!commentDraft.trim()}
              onClick={() => {
                onAddComment(commentDraft)
                setCommentDraft('')
              }}
            >
              {t('taskDrawer.sendButton')}
            </Button>
          </div>
        </div>

        {/* Retrospective (item 3: 完了時の振り返り記録) — only meaningful
            once the task is done; the entered text also gets surfaced on
            future similar tasks via findSimilarTasks (see admin-approvals.tsx
            / parsed-task-card.tsx) so lessons carry over */}
        {task.status === 'done' && (
          <RetrospectiveSection
            retrospective={task.retrospective ?? null}
            editable={isAdmin || isAssignee}
            onSave={onSaveRetrospective}
          />
        )}

        {/* Skill award button (admin, done tasks with skills) */}
        {isAdmin && task.status === 'done' && task.skills.length > 0 && task.assigneeIds.length > 0 && (
          <div className="mt-4">
            <button
              onClick={onOpenAward}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Plus className="size-3.5" />
              {t('taskDrawer.award.title')}
              {task.awardedPoints && Object.keys(task.awardedPoints).length > 0 && (
                <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                  {t('taskDrawer.award.alreadyAwarded')}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Change history */}
        {isAdmin && (task.history?.length ?? 0) > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setHistoryOpen((o) => !o)}
              className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              <span className="inline-flex items-center gap-1.5">
                <HistoryIcon className="size-3.5" />
                {t('taskDrawer.historyHeader')}
              </span>
              <ChevronDown className={cn('size-3.5 transition-transform', historyOpen && 'rotate-180')} />
            </button>
            {historyOpen && (
              <ul className="mt-2 flex flex-col gap-2">
                {task.history!.map((h) => (
                  <li key={h.id} className="text-xs">
                    <p className="text-muted-foreground">{formatDateTime(h.at)}</p>
                    <p className="mt-0.5">
                      {t('taskDrawer.historyChangeLine', {
                        who:
                          members.find((m) => m.id === h.byId)?.displayName ||
                          members.find((m) => m.id === h.byId)?.name ||
                          t('taskDrawer.unknown'),
                        field: t(HISTORY_FIELD_KEY[h.field]),
                        from: historyValueLabel(h.field, h.from, members, projects, t),
                        to: historyValueLabel(h.field, h.to, members, projects, t),
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t border-border px-5 py-3.5">
        {isAdmin ? (
          <Button variant="outline" className="h-9 w-full" onClick={onOpenAssign}>
            <UserPlus className="size-4" />
            {t('taskDrawer.assign.title')}
          </Button>
        ) : !isAssignee ? (
          <Button className="h-9 w-full" onClick={onTake}>
            <UserPlus className="size-4" />
            {t('taskDrawer.takeButton')}
          </Button>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            {t('taskDrawer.assigneeFooterNote')}
          </p>
        )}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2.5 last:border-0">
      <dt className="shrink-0 pt-0.5 text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

interface TimerState {
  runningSince: number | null // epoch ms、null なら停止中
  accumulatedMs: number
}

function timerStorageKey(taskId: string, userId: string): string {
  return `orbit-timer-${taskId}-${userId}`
}

function loadTimerState(taskId: string, userId: string): TimerState {
  if (typeof window === 'undefined') return { runningSince: null, accumulatedMs: 0 }
  try {
    const raw = window.localStorage.getItem(timerStorageKey(taskId, userId))
    return raw ? JSON.parse(raw) : { runningSince: null, accumulatedMs: 0 }
  } catch {
    return { runningSince: null, accumulatedMs: 0 }
  }
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

// タスクに取り組んだ時間を計測するストップウォッチ。開始/経過時間はタスク×
// 本人ごとにブラウザのlocalStorageへ保存されるので、ドロワーを閉じたり
// リロードしても計測は止まらない
function TimerWidget({
  taskId,
  userId,
  onAddHours,
}: {
  taskId: string
  userId: string
  actualHours: number | undefined
  onAddHours: (hours: number) => void
}) {
  const { t } = useI18n()
  const [state, setState] = useState<TimerState>(() => loadTimerState(taskId, userId))
  const [, forceTick] = useState(0)

  useEffect(() => {
    setState(loadTimerState(taskId, userId))
  }, [taskId, userId])

  useEffect(() => {
    if (!state.runningSince) return
    const id = window.setInterval(() => forceTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [state.runningSince])

  const elapsedMs = state.accumulatedMs + (state.runningSince ? Date.now() - state.runningSince : 0)

  const update = (next: TimerState) => {
    setState(next)
    try {
      window.localStorage.setItem(timerStorageKey(taskId, userId), JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  const toggle = () => {
    if (state.runningSince) {
      update({ runningSince: null, accumulatedMs: elapsedMs })
    } else {
      update({ runningSince: Date.now(), accumulatedMs: state.accumulatedMs })
    }
  }

  const reset = () => update({ runningSince: null, accumulatedMs: 0 })

  const addToActual = () => {
    if (elapsedMs <= 0) return
    const hours = Math.round((elapsedMs / 3600000) * 100) / 100
    onAddHours(hours)
    reset()
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1 font-mono text-sm tabular-nums">
        <Timer className="size-3.5 text-muted-foreground" />
        {formatElapsed(elapsedMs)}
      </span>
      <button
        type="button"
        onClick={toggle}
        className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label={state.runningSince ? t('taskDrawer.timer.pause') : t('taskDrawer.timer.start')}
      >
        {state.runningSince ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </button>
      {elapsedMs > 0 && (
        <>
          <button
            type="button"
            onClick={addToActual}
            className="text-xs font-medium text-primary hover:underline"
          >
            {t('taskDrawer.timer.addToActual')}
          </button>
          <button
            type="button"
            onClick={reset}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={t('taskDrawer.timer.reset')}
          >
            <RotateCcw className="size-3.5" />
          </button>
        </>
      )}
    </div>
  )
}

const SCHEDULE_RESPONSE_OPTIONS: ScheduleResponseValue[] = ['○', '△', '×']
const SCHEDULE_RESPONSE_COLOR: Record<ScheduleResponseValue, string> = {
  '○': 'bg-emerald-50 text-emerald-700',
  '△': 'bg-amber-50 text-amber-700',
  '×': 'bg-rose-50 text-rose-700',
}

// Googleカレンダーへの追加ボタン — 日程調整完了後に表示する
function AddToGCalButton({ task }: { task: Task }) {
  const toast = useToast()
  const { t } = useI18n()
  const [added, setAdded] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!isGoogleOAuthConfigured() || added) return null

  const add = async () => {
    setLoading(true)
    try {
      let token = getCalendarToken()
      if (!token) token = await requestCalendarToken()
      const title = task.name
      const desc = task.description ?? ''
      if (task.deadline) {
        const iso = task.dueTime
          ? `${task.deadline}T${task.dueTime}:00+09:00`
          : undefined
        const endIso = task.dueTime
          ? `${task.deadline}T${String(parseInt(task.dueTime.slice(0, 2)) + 1).padStart(2, '0')}${task.dueTime.slice(2)}:00+09:00`
          : undefined
        await createCalendarEvent(token, {
          summary: `[Orbit] ${title}`,
          description: desc,
          ...(iso ? { startDateTime: iso, endDateTime: endIso ?? iso } : { startDate: task.deadline }),
        })
      } else {
        await createCalendarEvent(token, { summary: `[Orbit] ${title}`, description: desc, startDate: new Date().toISOString().slice(0, 10) })
      }
      setAdded(true)
      toast(t('taskDrawer.gcal.added'))
    } catch (e) {
      toast(t('taskDrawer.gcal.failed', { error: String(e) }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={add}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-50"
    >
      <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      {loading ? t('taskDrawer.gcal.adding') : t('taskDrawer.gcal.addButton')}
    </button>
  )
}

// 日程調整ツール — 候補日時＋招待メンバーを作成者/管理者が設定し、招待者は
// 候補ごとに〇×△で回答する。全員が回答し終えるとタスクは自動的に完了になる
// （store.tsx の respondToSchedule）
function ScheduleSection({
  task,
  currentUserId,
  isAdmin,
  members,
  onSetSchedule,
  onRespondSchedule,
}: {
  task: Task
  currentUserId: string | null
  isAdmin: boolean
  members: Member[]
  onSetSchedule: (candidates: { id: string; label: string }[], invitedIds: string[]) => void
  onRespondSchedule: (responses: Record<string, ScheduleResponseValue>) => void
}) {
  const { t } = useI18n()
  const schedule = task.schedule
  const canConfigure = isAdmin || task.createdById === currentUserId
  const [configOpen, setConfigOpen] = useState(false)
  const [candidateDraft, setCandidateDraft] = useState<{ id: string; label: string }[]>([])
  const [inviteDraft, setInviteDraft] = useState<string[]>([])
  const [dateTimeInput, setDateTimeInput] = useState('')
  const [responseDraft, setResponseDraft] = useState<Record<string, ScheduleResponseValue>>({})

  useEffect(() => {
    setResponseDraft((currentUserId && schedule?.responses[currentUserId]) || {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, currentUserId])

  if (!schedule && !canConfigure) return null

  const openConfig = () => {
    setCandidateDraft(schedule?.candidates ?? [])
    setInviteDraft(schedule?.invitedIds ?? [])
    setConfigOpen(true)
  }

  const addCandidate = () => {
    if (!dateTimeInput) return
    const d = new Date(dateTimeInput)
    const weekdays = t('taskDrawer.schedule.weekdayShort').split(',')
    const label = `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]}) ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    setCandidateDraft((prev) => [
      ...prev,
      { id: `sc-${Math.random().toString(36).slice(2, 9)}`, label },
    ])
    setDateTimeInput('')
  }

  const saveConfig = () => {
    if (candidateDraft.length === 0 || inviteDraft.length === 0) return
    onSetSchedule(candidateDraft, inviteDraft)
    setConfigOpen(false)
  }

  const isInvited = !!currentUserId && !!schedule?.invitedIds.includes(currentUserId)
  const canRespond = isInvited && task.status !== 'done'
  const canSubmitResponse =
    !!schedule && schedule.candidates.every((c) => !!responseDraft[c.id])

  // GCal空き確認 — カレンダートークンがあれば候補に対してFreeBusyを取得する
  const [freeBusy, setFreeBusy] = useState<Record<string, boolean>>({}) // candidateId -> busy
  const checkFreeBusy = async () => {
    if (!schedule || !isInvited) return
    const token = getCalendarToken()
    if (!token) return
    const { fetchFreeBusy } = await import('@/lib/orbit/google-calendar')
    for (const c of schedule.candidates) {
      try {
        // labelからISO日時を復元するのが難しいため、labelに日時が含まれる場合のみ
        // 例: "9/5(金) 14:00" → 現在年の9月5日14:00を試みる
        const m = c.label.match(/(\d+)\/(\d+)[^0-9]*(\d{2}):(\d{2})/)
        if (!m) continue
        const now = new Date()
        const dt = new Date(now.getFullYear(), parseInt(m[1]) - 1, parseInt(m[2]), parseInt(m[3]), parseInt(m[4]))
        const dtEnd = new Date(dt.getTime() + 60 * 60 * 1000)
        const busy = await fetchFreeBusy(token, dt.toISOString(), dtEnd.toISOString())
        setFreeBusy((prev) => ({ ...prev, [c.id]: busy.length > 0 }))
      } catch { /* ignore */ }
    }
  }

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('taskDrawer.schedule.sectionHeader')}
        </div>
        {canConfigure && (
          <button
            onClick={openConfig}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Pencil className="size-3" />
            {schedule ? t('common.edit') : t('taskDrawer.setupButton')}
          </button>
        )}
      </div>

      {!schedule && !configOpen && (
        <p className="text-sm text-muted-foreground">{t('taskDrawer.notConfiguredYet')}</p>
      )}

      {schedule && !configOpen && (
        <div className="flex flex-col gap-3">
          {canRespond && (
            <div className="rounded-lg border border-border bg-secondary/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{t('taskDrawer.schedule.respondHint')}</p>
                {isGoogleOAuthConfigured() && getCalendarToken() && (
                  <button onClick={checkFreeBusy} className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400">
                    <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                    {t('taskDrawer.schedule.checkFreeBusy')}
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {schedule.candidates.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm">
                      {c.label}
                      {freeBusy[c.id] !== undefined && (
                        <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-medium', freeBusy[c.id] ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400')}>
                          {freeBusy[c.id] ? t('taskDrawer.schedule.busy') : t('taskDrawer.schedule.free')}
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      {SCHEDULE_RESPONSE_OPTIONS.map((v) => (
                        <button
                          key={v}
                          onClick={() => setResponseDraft((prev) => ({ ...prev, [c.id]: v }))}
                          className={cn(
                            'flex size-7 items-center justify-center rounded-md text-sm font-semibold',
                            responseDraft[c.id] === v
                              ? SCHEDULE_RESPONSE_COLOR[v]
                              : 'bg-secondary text-muted-foreground hover:bg-secondary/70',
                          )}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <Button
                className="mt-3 h-8 w-full"
                disabled={!canSubmitResponse}
                onClick={() => onRespondSchedule(responseDraft)}
              >
                {t('taskDrawer.submitResponse')}
              </Button>
            </div>
          )}

          <div className="overflow-x-auto orbit-scroll">
            <table className="w-full min-w-[320px] border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border-b border-border px-1.5 py-1 text-left font-medium text-muted-foreground">
                    {t('taskDrawer.schedule.candidateColumn')}
                  </th>
                  {schedule.invitedIds.map((mid) => {
                    const m = members.find((mm) => mm.id === mid)
                    return (
                      <th
                        key={mid}
                        className="border-b border-border px-1.5 py-1 text-center font-medium text-muted-foreground"
                      >
                        {m?.displayName || m?.name || t('taskDrawer.unknown')}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {schedule.candidates.map((c) => (
                  <tr key={c.id}>
                    <td className="border-b border-border/60 px-1.5 py-1">{c.label}</td>
                    {schedule.invitedIds.map((mid) => {
                      const resp = schedule.responses[mid]?.[c.id]
                      return (
                        <td key={mid} className="border-b border-border/60 px-1.5 py-1 text-center">
                          {resp ? (
                            <span
                              className={cn(
                                'inline-flex size-5 items-center justify-center rounded font-semibold',
                                SCHEDULE_RESPONSE_COLOR[resp],
                              )}
                            >
                              {resp}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{t('taskDrawer.noResponse')}</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {task.status === 'done' && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-emerald-700">{t('taskDrawer.allRespondedDone')}</p>
              <AddToGCalButton task={task} />
            </div>
          )}
        </div>
      )}

      {configOpen && (
        <div className="rounded-lg border border-border bg-secondary/40 p-3">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('taskDrawer.schedule.candidatesLabel')}</p>
          <ul className="mb-2 flex flex-col gap-1">
            {candidateDraft.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                {c.label}
                <button
                  onClick={() => setCandidateDraft((prev) => prev.filter((x) => x.id !== c.id))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={t('common.delete')}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mb-3 flex items-center gap-1.5">
            <input
              type="datetime-local"
              value={dateTimeInput}
              onChange={(e) => setDateTimeInput(e.target.value)}
              className="h-8 flex-1 rounded-md border border-border bg-card px-2 text-xs outline-none focus:border-primary"
            />
            <button
              onClick={addCandidate}
              disabled={!dateTimeInput}
              className="flex h-8 items-center justify-center gap-1 rounded-md border border-dashed border-border-strong px-2 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-40"
            >
              <Plus className="size-3.5" />
              {t('common.add')}
            </button>
          </div>

          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('taskDrawer.schedule.inviteMembersLabel')}</p>
          <div className="mb-3 flex max-h-40 flex-col gap-1 overflow-y-auto orbit-scroll">
            {members.map((m) => {
              const checked = inviteDraft.includes(m.id)
              return (
                <button
                  key={m.id}
                  onClick={() =>
                    setInviteDraft((prev) =>
                      checked ? prev.filter((id) => id !== m.id) : [...prev, m.id],
                    )
                  }
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-secondary',
                    checked && 'bg-primary-muted',
                  )}
                >
                  <Avatar member={m} size={20} />
                  {m.displayName || m.name}
                  {checked && <Check className="ml-auto size-3.5 text-primary" />}
                </button>
              )
            })}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-8" onClick={() => setConfigOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              className="h-8"
              disabled={candidateDraft.length === 0 || inviteDraft.length === 0}
              onClick={saveConfig}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

const FORM_FIELD_TYPE_KEY: Record<FormFieldType, TranslationKey> = {
  text: 'taskDrawer.form.fieldType.text',
  textarea: 'taskDrawer.form.fieldType.textarea',
  select: 'taskDrawer.form.fieldType.select',
  checkbox: 'taskDrawer.form.fieldType.checkbox',
  image: 'taskDrawer.form.fieldType.image',
}

function formAnswerText(v: FormAnswerValue | undefined): string {
  if (v == null) return ''
  return Array.isArray(v) ? v.join('、') : v
}

// 汎用フォームツール — 質問項目＋招待メンバーを作成者/管理者が設定し、招待者は
// 項目ごとに回答する。全員が回答し終えるとタスクは自動的に完了になる
// （store.tsx の respondToForm）
function FormSection({
  task,
  currentUserId,
  isAdmin,
  members,
  onSetForm,
  onRespondForm,
}: {
  task: Task
  currentUserId: string | null
  isAdmin: boolean
  members: Member[]
  onSetForm: (fields: FormFieldDef[], invitedIds: string[]) => void
  onRespondForm: (responses: Record<string, FormAnswerValue>) => void
}) {
  const { t: tr } = useI18n()
  const form = task.form
  const canConfigure = isAdmin || task.createdById === currentUserId
  const [configOpen, setConfigOpen] = useState(false)
  const [fieldDraft, setFieldDraft] = useState<FormFieldDef[]>([])
  const [inviteDraft, setInviteDraft] = useState<string[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [newType, setNewType] = useState<FormFieldType>('text')
  const [newOptions, setNewOptions] = useState('')
  const [newRequired, setNewRequired] = useState(true)
  const [responseDraft, setResponseDraft] = useState<Record<string, FormAnswerValue>>({})

  useEffect(() => {
    setResponseDraft((currentUserId && form?.responses[currentUserId]) || {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, currentUserId])

  if (!form && !canConfigure) return null

  const openConfig = () => {
    setFieldDraft(form?.fields ?? [])
    setInviteDraft(form?.invitedIds ?? [])
    setConfigOpen(true)
  }

  const addField = () => {
    if (!newLabel.trim()) return
    const options =
      newType === 'select' || newType === 'checkbox'
        ? newOptions
            .split(/[、,,\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined
    if ((newType === 'select' || newType === 'checkbox') && (!options || options.length === 0)) return
    setFieldDraft((prev) => [
      ...prev,
      {
        id: `ff-${Math.random().toString(36).slice(2, 9)}`,
        label: newLabel.trim(),
        type: newType,
        options,
        required: newRequired,
      },
    ])
    setNewLabel('')
    setNewOptions('')
    setNewRequired(true)
  }

  const saveConfig = () => {
    if (fieldDraft.length === 0 || inviteDraft.length === 0) return
    onSetForm(fieldDraft, inviteDraft)
    setConfigOpen(false)
  }

  const isInvited = !!currentUserId && !!form?.invitedIds.includes(currentUserId)
  const canRespond = isInvited && task.status !== 'done'
  const canSubmitResponse =
    !!form && form.fields.every((f) => !f.required || !!formAnswerText(responseDraft[f.id]))

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {tr('taskDrawer.form.sectionHeader')}
        </div>
        {canConfigure && (
          <button
            onClick={openConfig}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Pencil className="size-3" />
            {form ? tr('common.edit') : tr('taskDrawer.setupButton')}
          </button>
        )}
      </div>

      {!form && !configOpen && <p className="text-sm text-muted-foreground">{tr('taskDrawer.notConfiguredYet')}</p>}

      {form && !configOpen && (
        <div className="flex flex-col gap-3">
          {canRespond && (
            <div className="rounded-lg border border-border bg-secondary/40 p-3">
              <div className="flex flex-col gap-3">
                {form.fields.map((f) => (
                  <div key={f.id}>
                    <p className="mb-1 text-sm">
                      {f.label}
                      {f.required && <span className="ml-0.5 text-destructive">*</span>}
                    </p>
                    {f.type === 'text' && (
                      <input
                        value={(responseDraft[f.id] as string) ?? ''}
                        onChange={(e) =>
                          setResponseDraft((prev) => ({ ...prev, [f.id]: e.target.value }))
                        }
                        className="h-8 w-full rounded-md border border-border bg-card px-2 text-sm outline-none focus:border-primary"
                      />
                    )}
                    {f.type === 'textarea' && (
                      <textarea
                        value={(responseDraft[f.id] as string) ?? ''}
                        onChange={(e) =>
                          setResponseDraft((prev) => ({ ...prev, [f.id]: e.target.value }))
                        }
                        rows={3}
                        className="w-full resize-none rounded-md border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary"
                      />
                    )}
                    {f.type === 'select' && (
                      <select
                        value={(responseDraft[f.id] as string) ?? ''}
                        onChange={(e) =>
                          setResponseDraft((prev) => ({ ...prev, [f.id]: e.target.value }))
                        }
                        className="h-8 w-full rounded-md border border-border bg-card px-2 text-sm outline-none focus:border-primary"
                      >
                        <option value="">{tr('common.selectPlaceholder')}</option>
                        {(f.options ?? []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    )}
                    {f.type === 'checkbox' && (
                      <div className="flex flex-wrap gap-1.5">
                        {(f.options ?? []).map((o) => {
                          const current = (responseDraft[f.id] as string[]) ?? []
                          const checked = current.includes(o)
                          return (
                            <button
                              key={o}
                              type="button"
                              onClick={() =>
                                setResponseDraft((prev) => ({
                                  ...prev,
                                  [f.id]: checked
                                    ? current.filter((v) => v !== o)
                                    : [...current, o],
                                }))
                              }
                              className={cn(
                                'rounded-full border px-2.5 py-1 text-xs',
                                checked
                                  ? 'border-primary bg-primary-muted text-primary'
                                  : 'border-border text-muted-foreground hover:bg-secondary',
                              )}
                            >
                              {o}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {f.type === 'image' && (
                      <div className="flex flex-col gap-1.5">
                        <input
                          type="file"
                          accept="image/*"
                          className="text-sm"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const reader = new FileReader()
                            reader.onload = (ev) => {
                              const dataUrl = ev.target?.result as string
                              setResponseDraft((prev) => ({ ...prev, [f.id]: dataUrl }))
                            }
                            reader.readAsDataURL(file)
                          }}
                        />
                        {responseDraft[f.id] && (
                          <img
                            src={responseDraft[f.id] as string}
                            alt={tr('taskDrawer.form.previewAlt')}
                            className="max-h-40 rounded-md object-contain"
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <Button
                className="mt-3 h-8 w-full"
                disabled={!canSubmitResponse}
                onClick={() => onRespondForm(responseDraft)}
              >
                {tr('taskDrawer.submitResponse')}
              </Button>
            </div>
          )}

          <div className="overflow-x-auto orbit-scroll">
            <table className="w-full min-w-[320px] border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border-b border-border px-1.5 py-1 text-left font-medium text-muted-foreground">
                    {tr('taskDrawer.form.questionColumn')}
                  </th>
                  {form.invitedIds.map((mid) => {
                    const m = members.find((mm) => mm.id === mid)
                    return (
                      <th
                        key={mid}
                        className="border-b border-border px-1.5 py-1 text-left font-medium text-muted-foreground"
                      >
                        {m?.displayName || m?.name || tr('taskDrawer.unknown')}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {form.fields.map((f) => (
                  <tr key={f.id}>
                    <td className="border-b border-border/60 px-1.5 py-1">{f.label}</td>
                    {form.invitedIds.map((mid) => {
                      const answer = form.responses[mid]?.[f.id]
                      return (
                        <td key={mid} className="border-b border-border/60 px-1.5 py-1">
                          {answer != null && formAnswerText(answer) ? (
                            f.type === 'image' ? (
                              <img src={answer as string} alt={tr('taskDrawer.form.answerImageAlt')} className="max-h-20 rounded object-contain" />
                            ) : (
                              formAnswerText(answer)
                            )
                          ) : (
                            <span className="text-muted-foreground">{tr('taskDrawer.noResponse')}</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {task.status === 'done' && (
            <p className="text-xs font-medium text-emerald-700">{tr('taskDrawer.allRespondedDone')}</p>
          )}
        </div>
      )}

      {configOpen && (
        <div className="rounded-lg border border-border bg-secondary/40 p-3">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{tr('taskDrawer.form.questionsLabel')}</p>
          <ul className="mb-2 flex flex-col gap-1">
            {fieldDraft.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {f.label}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    （{tr(FORM_FIELD_TYPE_KEY[f.type])}
                    {f.required ? tr('taskDrawer.form.requiredSuffix') : ''}）
                  </span>
                </span>
                <button
                  onClick={() => setFieldDraft((prev) => prev.filter((x) => x.id !== f.id))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={tr('common.delete')}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mb-3 flex flex-col gap-1.5 rounded-md border border-dashed border-border-strong p-2">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={tr('taskDrawer.form.questionPlaceholder')}
              className="h-8 rounded-md border border-border bg-card px-2 text-xs outline-none focus:border-primary"
            />
            <div className="flex items-center gap-1.5">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as FormFieldType)}
                className="h-8 flex-1 rounded-md border border-border bg-card px-2 text-xs outline-none focus:border-primary"
              >
                {(Object.keys(FORM_FIELD_TYPE_KEY) as FormFieldType[]).map((t) => (
                  <option key={t} value={t}>
                    {tr(FORM_FIELD_TYPE_KEY[t])}
                  </option>
                ))}
              </select>
              <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={newRequired}
                  onChange={(e) => setNewRequired(e.target.checked)}
                  className="size-3.5 cursor-pointer accent-primary"
                />
                {tr('taskDrawer.form.requiredLabel')}
              </label>
            </div>
            {(newType === 'select' || newType === 'checkbox') && (
              <input
                value={newOptions}
                onChange={(e) => setNewOptions(e.target.value)}
                placeholder={tr('taskDrawer.form.optionsPlaceholder')}
                className="h-8 rounded-md border border-border bg-card px-2 text-xs outline-none focus:border-primary"
              />
            )}
            <button
              onClick={addField}
              disabled={!newLabel.trim()}
              className="flex h-8 items-center justify-center gap-1 rounded-md border border-border-strong px-2 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-40"
            >
              <Plus className="size-3.5" />
              {tr('taskDrawer.form.addQuestion')}
            </button>
          </div>

          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{tr('taskDrawer.form.inviteMembersLabel')}</p>
          <div className="mb-3 flex max-h-40 flex-col gap-1 overflow-y-auto orbit-scroll">
            {members.map((m) => {
              const checked = inviteDraft.includes(m.id)
              return (
                <button
                  key={m.id}
                  onClick={() =>
                    setInviteDraft((prev) =>
                      checked ? prev.filter((id) => id !== m.id) : [...prev, m.id],
                    )
                  }
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-secondary',
                    checked && 'bg-primary-muted',
                  )}
                >
                  <Avatar member={m} size={20} />
                  {m.displayName || m.name}
                  {checked && <Check className="ml-auto size-3.5 text-primary" />}
                </button>
              )
            })}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-8" onClick={() => setConfigOpen(false)}>
              {tr('common.cancel')}
            </Button>
            <Button
              className="h-8"
              disabled={fieldDraft.length === 0 || inviteDraft.length === 0}
              onClick={saveConfig}
            >
              {tr('common.save')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// inline-editable number-of-hours field (想定時間/実績時間) — click the
// value to edit, Enter/blur saves, empty clears
function HoursField({
  value,
  editable,
  onSave,
  placeholder,
}: {
  value: number | undefined
  editable: boolean
  onSave: (hours: number | null) => void
  placeholder: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = () => {
    const trimmed = draft.trim()
    const n = trimmed ? Number(trimmed) : null
    onSave(n !== null && !Number.isNaN(n) && n >= 0 ? n : null)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        type="number"
        min={0}
        step={0.5}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="h-7 w-20 rounded-md border border-primary bg-card px-2 text-right text-sm outline-none"
      />
    )
  }

  return (
    <button
      type="button"
      disabled={!editable}
      onClick={() => {
        setDraft(value != null ? String(value) : '')
        setEditing(true)
      }}
      className={cn(
        'text-sm',
        editable ? 'text-foreground hover:underline' : 'cursor-default text-muted-foreground',
      )}
    >
      {value != null ? `${value}h` : placeholder}
    </button>
  )
}

function RetrospectiveSection({
  retrospective,
  editable,
  onSave,
}: {
  retrospective: TaskRetrospective | null
  editable: boolean
  onSave: (r: TaskRetrospective | null) => void
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [good, setGood] = useState(retrospective?.good ?? '')
  const [bad, setBad] = useState(retrospective?.bad ?? '')
  const [improve, setImprove] = useState(retrospective?.improve ?? '')

  const startEdit = () => {
    setGood(retrospective?.good ?? '')
    setBad(retrospective?.bad ?? '')
    setImprove(retrospective?.improve ?? '')
    setEditing(true)
  }

  const save = () => {
    const trimmed = { good: good.trim(), bad: bad.trim(), improve: improve.trim() }
    onSave(trimmed.good || trimmed.bad || trimmed.improve ? trimmed : null)
    setEditing(false)
  }

  return (
    <div className="mt-6">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t('taskDrawer.retrospective.sectionHeader')}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t('taskDrawer.retrospective.goodLabel')}</span>
            <textarea
              value={good}
              onChange={(e) => setGood(e.target.value)}
              rows={2}
              className="resize-none rounded-lg border border-border bg-card px-2.5 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t('taskDrawer.retrospective.badLabel')}</span>
            <textarea
              value={bad}
              onChange={(e) => setBad(e.target.value)}
              rows={2}
              className="resize-none rounded-lg border border-border bg-card px-2.5 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t('taskDrawer.retrospective.improveLabel')}</span>
            <textarea
              value={improve}
              onChange={(e) => setImprove(e.target.value)}
              rows={2}
              className="resize-none rounded-lg border border-border bg-card px-2.5 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-8" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
            <Button className="h-8" onClick={save}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      ) : retrospective ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-sm">
          {retrospective.good && (
            <p>
              <span className="font-medium text-muted-foreground">{t('taskDrawer.retrospective.goodLabel')}：</span>
              {retrospective.good}
            </p>
          )}
          {retrospective.bad && (
            <p>
              <span className="font-medium text-muted-foreground">{t('taskDrawer.retrospective.badLabel')}：</span>
              {retrospective.bad}
            </p>
          )}
          {retrospective.improve && (
            <p>
              <span className="font-medium text-muted-foreground">{t('taskDrawer.retrospective.improveLabel')}：</span>
              {retrospective.improve}
            </p>
          )}
          {editable && (
            <button
              onClick={startEdit}
              className="self-start text-xs font-medium text-primary hover:underline"
            >
              {t('common.edit')}
            </button>
          )}
        </div>
      ) : editable ? (
        <button
          onClick={startEdit}
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          {t('taskDrawer.retrospective.recordPrompt')}
        </button>
      ) : (
        <p className="text-sm text-muted-foreground">{t('taskDrawer.retrospective.empty')}</p>
      )}
    </div>
  )
}
