'use client'

import { useState } from 'react'
import type { ParsedTask } from '@/lib/orbit/types'
import { DIFFICULTY_LABEL, TASK_IMPORTANCE } from '@/lib/orbit/types'
import { useOrbit } from '@/lib/orbit/store'
import { useI18n, DIFFICULTY_KEY } from '@/lib/orbit/i18n'
import { Card, DifficultyBadge, Tag, Avatar } from '../primitives'
import { cn } from '@/lib/utils'
import { findSimilarTasks, rankCandidates } from '@/lib/orbit/utils'
import { Check, Plus, Sparkles, TriangleAlert, Trash2 } from 'lucide-react'

export function ParsedTaskCard({
  task,
  selected,
  onToggleSelect,
  onChange,
  onToggle,
  onDelete,
}: {
  task: ParsedTask
  selected: boolean
  onToggleSelect: () => void
  onChange: (t: ParsedTask) => void
  onToggle: () => void
  onDelete: () => void
}) {
  const {
    projects,
    members,
    tasks,
    skillOptions,
    categoryOptions,
    addSkillOption,
    addCategoryOption,
  } = useOrbit()
  const { t } = useI18n()
  const [skillDraft, setSkillDraft] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [categoryDraft, setCategoryDraft] = useState('')
  const candidates = rankCandidates(task, members, tasks).slice(0, 3)

  // おすすめカテゴリ: this project's most-used categories first, falling
  // back to 未分類 + the general option pool so there's always something
  const suggestedCategories = (() => {
    const tally = new Map<string, number>()
    tasks
      .filter((t) => t.projectId === task.projectId && t.category)
      .forEach((t) => tally.set(t.category, (tally.get(t.category) ?? 0) + 1))
    const ranked = Array.from(tally.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c)
    const rest = categoryOptions.filter((c) => !ranked.includes(c))
    return Array.from(new Set([...ranked, ...rest]))
      .filter((c) => c !== task.category)
      .slice(0, 4)
  })()
  const assignees = task.assigneeIds
    .map((id) => members.find((m) => m.id === id))
    .filter(Boolean) as typeof members
  const assignableMembers = members.filter((m) => !task.assigneeIds.includes(m.id))

  // item 4: 類似タスク検索の強化 — the same heuristic Admin Approvals uses,
  // now shown here too so a duplicate can be caught before it's ever
  // registered, not just at approval time
  const similar = findSimilarTasks(task, tasks)

  // item 5: 想定時間のおすすめ — average of past actual (or, failing that,
  // estimated) hours for tasks in the same category
  const suggestedHours = (() => {
    const samples = tasks
      .filter((t) => t.category === task.category)
      .map((t) => t.actualHours ?? t.estimatedHours)
      .filter((h): h is number => typeof h === 'number')
    if (samples.length === 0) return null
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length
    return Math.round(avg * 2) / 2
  })()

  const addAssignee = (memberId: string) => {
    if (!task.assigneeIds.includes(memberId)) set('assigneeIds', [...task.assigneeIds, memberId])
  }
  const removeAssignee = (memberId: string) =>
    set('assigneeIds', task.assigneeIds.filter((id) => id !== memberId))

  const set = <K extends keyof ParsedTask>(key: K, value: ParsedTask[K]) =>
    onChange({ ...task, [key]: value })

  const addSkill = () => {
    const v = skillDraft.trim()
    if (v) {
      addSkillOption(v)
      if (!task.skills.includes(v)) set('skills', [...task.skills, v])
    }
    setSkillDraft('')
  }

  const availableSkills = skillOptions.filter((s) => !task.skills.includes(s))

  const commitNewCategory = () => {
    const v = categoryDraft.trim()
    if (v) {
      addCategoryOption(v)
      set('category', v)
    }
    setCategoryDraft('')
    setAddingCategory(false)
  }

  return (
    <Card
      className={cn(
        'overflow-hidden transition-opacity',
        !task.approved && 'opacity-55',
      )}
    >
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="mt-1.5 size-3.5 shrink-0 cursor-pointer accent-primary"
          aria-label={t('input.parsedTask.selectAria')}
        />
        <input
          value={task.name}
          onChange={(e) => set('name', e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:text-muted-foreground focus:underline focus:decoration-border-strong focus:underline-offset-4"
          aria-label={t('input.parsedTask.nameAria')}
        />
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors',
            task.approved
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border-strong bg-card text-transparent hover:border-primary',
          )}
          aria-label={task.approved ? t('input.parsedTask.unapproveAria') : t('input.parsedTask.approveAria')}
          aria-pressed={task.approved}
        >
          <Check className="size-4" strokeWidth={3} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label={t('input.parsedTask.deleteAria')}
          title={t('input.parsedTask.deleteAria')}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {similar.length > 0 && (
        <div className="mx-4 mt-3 rounded-md border border-warning/30 bg-warning-muted px-2.5 py-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-warning">
            <TriangleAlert className="size-3.5 shrink-0" />
            {t('input.parsedTask.similarWarning')}
          </div>
          <ul className="mt-1 flex flex-col gap-1">
            {similar.map(({ task: s }) => (
              <li key={s.id} className="text-xs text-muted-foreground">
                ・{s.name}
                {s.status === 'done' && s.retrospective && (
                  <span className="block pl-3 text-[11px] italic">
                    {s.retrospective.improve || s.retrospective.bad || s.retrospective.good}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3.5 sm:grid-cols-4">
        <Field label={t('taskDrawer.row.project')}>
          <input
            list="project-suggestions"
            value={projects.find((p) => p.id === task.projectId)?.name ?? ''}
            onChange={(e) => {
              const matched = projects.find((p) => p.name === e.target.value)
              if (matched) set('projectId', matched.id)
            }}
            placeholder={t('input.parsedTask.projectPlaceholder')}
            className="w-full rounded-md border border-transparent bg-transparent py-0.5 text-sm outline-none hover:border-border focus:border-border-strong"
          />
          <datalist id="project-suggestions">
            {projects.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </Field>

        <Field label={t('taskDrawer.row.startDate')}>
          <input
            type="date"
            value={task.startDate ?? ''}
            onChange={(e) => set('startDate', e.target.value || null)}
            className="w-full rounded-md border border-transparent bg-transparent py-0.5 text-sm outline-none hover:border-border focus:border-border-strong"
          />
        </Field>

        <Field label={t('taskDrawer.row.deadline')}>
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={task.deadline ?? ''}
              onChange={(e) => set('deadline', e.target.value || null)}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent py-0.5 text-sm outline-none hover:border-border focus:border-border-strong"
            />
            <input
              type="time"
              value={task.dueTime ?? ''}
              onChange={(e) => set('dueTime', e.target.value || null)}
              disabled={!task.deadline}
              title={t('input.parsedTask.timeOptionalTitle')}
              className="w-[92px] shrink-0 rounded-md border border-transparent bg-transparent py-0.5 text-sm outline-none hover:border-border focus:border-border-strong disabled:opacity-40"
            />
          </div>
        </Field>

        <Field label={t('taskDrawer.row.category')}>
          {addingCategory ? (
            <div className="flex items-center gap-1">
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
                placeholder={t('input.parsedTask.newCategoryPlaceholder')}
                className="w-full rounded-md border border-primary bg-card px-1.5 py-0.5 text-sm outline-none"
              />
            </div>
          ) : (
            <select
              value={task.category}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setAddingCategory(true)
                } else {
                  set('category', e.target.value)
                }
              }}
              className="w-full cursor-pointer rounded-md border border-transparent bg-transparent py-0.5 text-sm outline-none hover:border-border focus:border-border-strong"
            >
              {!categoryOptions.includes(task.category) && task.category && (
                <option value={task.category}>{task.category}</option>
              )}
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="__new__">{t('input.parsedTask.newCategoryOption')}</option>
            </select>
          )}
          {!addingCategory && suggestedCategories.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Sparkles className="size-3 shrink-0 text-primary" />
              {suggestedCategories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('category', c)}
                  className="rounded-md border border-primary/25 bg-primary/5 px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-primary/10"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label={t('taskDrawer.row.difficulty')}>
          <select
            value={task.difficulty}
            onChange={(e) => set('difficulty', e.target.value as ParsedTask['difficulty'])}
            className="w-full cursor-pointer rounded-md border border-transparent bg-transparent py-0.5 text-sm outline-none hover:border-border focus:border-border-strong"
          >
            {DIFFICULTY_LABEL.map((d) => (
              <option key={d} value={d}>
                {t(DIFFICULTY_KEY[d])}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('taskDrawer.row.estimatedHours')}>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              step={0.5}
              value={task.estimatedHours ?? ''}
              onChange={(e) =>
                set('estimatedHours', e.target.value ? Number(e.target.value) : undefined)
              }
              placeholder={t('input.parsedTask.estimatedHoursPlaceholder')}
              className="w-16 rounded-md border border-transparent bg-transparent py-0.5 text-sm outline-none hover:border-border focus:border-border-strong"
            />
            {suggestedHours != null && task.estimatedHours == null && (
              <button
                type="button"
                onClick={() => set('estimatedHours', suggestedHours)}
                className="inline-flex items-center gap-0.5 rounded-md border border-primary/25 bg-primary/5 px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-primary/10"
              >
                <Sparkles className="size-3 text-primary" />
                {suggestedHours}h
              </button>
            )}
          </div>
        </Field>

        <Field label={t('taskDrawer.edit.visibilityLabel')}>
          <select
            value={task.visibility ?? 'all'}
            onChange={(e) => set('visibility', e.target.value as ParsedTask['visibility'])}
            className="w-full cursor-pointer rounded-md border border-transparent bg-transparent py-0.5 text-sm outline-none hover:border-border focus:border-border-strong"
          >
            <option value="all">{t('common.everyone')}</option>
            <option value="幹部">{t('taskDrawer.execOnly')}</option>
          </select>
        </Field>

        <Field label={t('taskDrawer.edit.importanceLabel')}>
          <select
            value={task.importance ?? '一般'}
            onChange={(e) => set('importance', e.target.value as ParsedTask['importance'])}
            className="w-full cursor-pointer rounded-md border border-transparent bg-transparent py-0.5 text-sm outline-none hover:border-border focus:border-border-strong"
          >
            {TASK_IMPORTANCE.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('taskDrawer.row.skills')} className="col-span-2 sm:col-span-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {task.skills.map((s) => (
              <Tag
                key={s}
                onRemove={() =>
                  set(
                    'skills',
                    task.skills.filter((x) => x !== s),
                  )
                }
              >
                {s}
              </Tag>
            ))}
            {availableSkills.length > 0 && (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Sparkles className="size-3 shrink-0 text-primary" />
                  {t('input.parsedTask.recommended')}
                </span>
                {availableSkills.slice(0, 6).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set('skills', [...task.skills, s])}
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
                placeholder={t('input.parsedTask.addSkillPlaceholder')}
                className="w-14 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"
                aria-label={t('input.parsedTask.addSkillAria')}
              />
              <button
                type="button"
                onClick={addSkill}
                className="text-muted-foreground hover:text-foreground"
                aria-label={t('input.parsedTask.addSkillAria')}
              >
                <Plus className="size-3" />
              </button>
            </span>
          </div>
        </Field>

        <Field label={t('taskDrawer.row.assignee')} className="col-span-2 sm:col-span-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {assignees.map((m) => (
              <Tag key={m.id} onRemove={() => removeAssignee(m.id)}>
                <Avatar member={m} size={16} />
                {m.displayName || m.name}
              </Tag>
            ))}
            {assignableMembers.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) addAssignee(e.target.value)
                }}
                className="cursor-pointer rounded-md border border-dashed border-border-strong bg-transparent px-1.5 py-0.5 text-[11px] text-muted-foreground outline-none hover:border-border"
                aria-label={t('input.parsedTask.selectAssigneeAria')}
              >
                <option value="">{t('input.parsedTask.selectAssigneeOption')}</option>
                {assignableMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName || m.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {candidates.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Sparkles className="size-3.5 shrink-0 text-primary" />
                {t('input.parsedTask.recommended')}
              </span>
              {candidates.map(({ member, matches }) => (
                <button
                  key={member.id}
                  type="button"
                  title={t('input.parsedTask.matchTitle', { matches: matches.join(t('input.listSeparator')) })}
                  onClick={() => addAssignee(member.id)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/5 px-1.5 py-0.5 text-xs font-medium text-foreground hover:bg-primary/10"
                >
                  <Avatar member={member} size={18} />
                  {member.displayName || member.name}
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {t('input.parsedTask.matchCount', { count: matches.length })}
                  </span>
                  <Plus className="size-3 text-primary" />
                </button>
              ))}
            </div>
          )}
        </Field>
      </div>
    </Card>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  )
}
