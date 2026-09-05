'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { Avatar, Tag, ProjectTag, DifficultyBadge } from '@/components/orbit/primitives'
import { rankCandidates, matchSkills, formatDeadline } from '@/lib/orbit/utils'
import { useToast } from '@/components/orbit/toast'
import { Button } from '@/components/ui/button'
import { ChevronDown, Sparkles, Info } from 'lucide-react'
import type { Task, Member } from '@/lib/orbit/types'
import { useI18n } from '@/lib/orbit/i18n'

export function AdminAssignments() {
  const { adminTasks: tasks, members, getProject, assignTask } = useOrbit()
  const { t: tr } = useI18n()
  const unassigned = tasks.filter((t) => t.assigneeIds.length === 0 && t.status !== 'done')
  const [selectedId, setSelectedId] = useState<string | null>(unassigned[0]?.id ?? null)

  const selected = tasks.find((t) => t.id === selectedId) ?? null

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Assignments</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {tr('admin.assignments.subtitle')}
      </p>

      {unassigned.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm font-medium">{tr('admin.assignments.empty.title')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{tr('admin.assignments.empty.desc')}</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* Task list */}
          <div className="rounded-lg border border-border bg-card lg:sticky lg:top-[4.5rem] lg:self-start">
            <div className="border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground">
              {tr('admin.assignments.unassignedCount', { count: unassigned.length })}
            </div>
            <ul className="max-h-[calc(100vh-14rem)] divide-y divide-border overflow-y-auto orbit-scroll">
              {unassigned.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full px-4 py-3 text-left transition-colors ${
                      t.id === selectedId ? 'bg-accent' : 'hover:bg-accent/60'
                    }`}
                  >
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <ProjectTag name={getProject(t.projectId)?.name ?? ''} />
                      <span className="text-xs text-muted-foreground">{formatDeadline(t.deadline)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Detail + candidates */}
          {selected && (
            <MatchPanel
              key={selected.id}
              task={selected}
              members={members}
              allTasks={tasks}
              assignTask={assignTask}
              projectName={getProject(selected.projectId)?.name ?? ''}
            />
          )}
        </div>
      )}
    </div>
  )
}

function MatchPanel({
  task,
  members,
  allTasks,
  assignTask,
  projectName,
}: {
  task: Task
  members: Member[]
  allTasks: Task[]
  assignTask: (id: string, memberIds: string[]) => void
  projectName: string
}) {
  const toast = useToast()
  const { t } = useI18n()
  const ranked = rankCandidates(task, members, allTasks)
  const rankedIds = new Set(ranked.map((r) => r.member.id))
  const others = members.filter((m) => !rankedIds.has(m.id))
  const [showOthers, setShowOthers] = useState(false)

  function handleAssign(m: Member) {
    assignTask(task.id, [...task.assigneeIds, m.id])
    toast(t('admin.assignments.assignedToast', { name: m.displayName || m.name }))
  }

  return (
    <div>
      {/* Task header */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">{task.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ProjectTag name={projectName} />
              <span className="text-xs text-muted-foreground">{t('admin.assignments.deadlineLabel', { date: formatDeadline(task.deadline) })}</span>
              <DifficultyBadge difficulty={task.difficulty} />
            </div>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-xs font-medium text-muted-foreground">{t('admin.assignments.requiredSkills')}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {task.skills.map((s) => (
              <Tag key={s}>{s}</Tag>
            ))}
          </div>
        </div>
      </div>

      {/* Recommended candidates */}
      <div className="mt-5 flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">{t('admin.assignments.recommended.title')}</h3>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="size-3.5" />
        {t('admin.assignments.recommended.desc')}
      </p>

      <div className="mt-3 space-y-3">
        {ranked.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
            {t('admin.assignments.noMatches')}
          </div>
        )}
        {ranked.map(({ member, matches }) => (
          <CandidateCard
            key={member.id}
            member={member}
            matches={matches}
            onAssign={() => handleAssign(member)}
            recommended
            weeklyHours={weeklyWorkload(member.id, allTasks)}
          />
        ))}
      </div>

      {/* Other members */}
      {others.length > 0 && (
        <div className="mt-5">
          <button
            onClick={() => setShowOthers((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown className={`size-3.5 transition-transform ${showOthers ? 'rotate-180' : ''}`} />
            {t('admin.assignments.otherMembers', { count: others.length })}
          </button>
          {showOthers && (
            <div className="mt-3 space-y-3">
              {others.map((member) => (
                <CandidateCard
                  key={member.id}
                  member={member}
                  matches={matchSkills(task, member)}
                  onAssign={() => handleAssign(member)}
                  weeklyHours={weeklyWorkload(member.id, allTasks)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// item 6: 工数・キャパシティ表示 — sum of estimatedHours for a member's
// active (non-done) tasks due within the current calendar week (Mon-Sun),
// so an admin can see who's already loaded up before assigning more
function currentWeekRange(): [string, string] {
  const now = new Date()
  const diffToMonday = (now.getDay() + 6) % 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - diffToMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return [fmt(monday), fmt(sunday)]
}

function weeklyWorkload(memberId: string, tasks: Task[]): number {
  const [start, end] = currentWeekRange()
  return tasks
    .filter(
      (t) =>
        t.status !== 'done' &&
        t.assigneeIds.includes(memberId) &&
        t.deadline &&
        t.deadline >= start &&
        t.deadline <= end,
    )
    .reduce((sum, t) => sum + (t.estimatedHours ?? 0), 0)
}

function CandidateCard({
  member,
  matches,
  onAssign,
  recommended,
  weeklyHours,
}: {
  member: Member
  matches: string[]
  onAssign: () => void
  recommended?: boolean
  weeklyHours?: number
}) {
  const { t } = useI18n()
  return (
    <div
      className={`rounded-lg border bg-card p-4 ${
        recommended ? 'border-border' : 'border-border/60'
      }`}
    >
      <div className="flex items-start gap-3">
        <Avatar member={member} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{member.displayName || member.name}</span>
            {member.role === '一般' && (
              <span className="text-xs text-muted-foreground">{member.affiliation}</span>
            )}
            {!!weeklyHours && (
              <span
                className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                title={t('admin.assignments.weeklyHoursTitle')}
              >
                {t('admin.assignments.weeklyHoursLabel', { hours: weeklyHours })}
              </span>
            )}
          </div>

          {/* Matched skills */}
          {matches.length > 0 ? (
            <div className="mt-2">
              <div className="text-[11px] font-medium text-muted-foreground">
                {t('admin.assignments.matchedSkills', { count: matches.length })}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {matches.map((s) => (
                  <Tag
                    key={s}
                    className="border-primary/30 bg-primary/10 text-primary"
                  >
                    {s}
                  </Tag>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-[11px] text-muted-foreground">{t('admin.assignments.noMatchedSkills')}</div>
          )}

          {/* Will */}
          {member.will.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70">{t('admin.assignments.willLabel')}</span>
              {member.will.join(' / ')}
            </div>
          )}

          {/* Fact */}
          {member.facts.length > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70">{t('admin.assignments.factLabel')}</span>
              {member.facts.slice(0, 2).map((f) => t('admin.assignments.factItem', { label: f.label, count: f.count })).join(' / ')}
            </div>
          )}
        </div>
        <Button size="sm" onClick={onAssign} className="shrink-0">
          {t('admin.assignments.assign')}
        </Button>
      </div>
    </div>
  )
}
