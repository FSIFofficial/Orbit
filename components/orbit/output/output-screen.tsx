'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { KanbanBoard } from './kanban-board'
import { CalendarView } from './calendar-view'
import { ListView } from './list-view'
import { PeopleView } from './people-view'
import { ProjectView } from './project-view'
import { DifficultyBoard } from './difficulty-board'
import { DependencyView } from './dependency-view'
import { GanttView } from './gantt-view'
import { TaskDetailDrawer } from './task-detail-drawer'
import { KANBAN_CARD_FIELDS, KANBAN_CARD_FIELD_KEY, type KanbanCardField } from './kanban-card'
import { cn } from '@/lib/utils'
import {
  ArrowUpDown,
  Check,
  Columns3,
  LayoutList,
  CalendarDays,
  FolderKanban,
  GaugeCircle,
  GitBranch,
  GripVertical,
  Inbox,
  Archive,
  SlidersHorizontal,
  User,
  X,
  Receipt,
  FileText,
  BarChart2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExpenseApplicationModal } from '@/components/orbit/expense-application-modal'
import { CustomFormModal } from '@/components/orbit/custom-form-modal'
import { useI18n, type TranslationKey } from '@/lib/orbit/i18n'

type Target = 'mine' | 'all' | 'people' | 'projects' | 'archive'
type View = 'workflow' | 'list' | 'calendar' | 'difficulty' | 'dependency' | 'gantt'

const DEFAULT_TARGET_ORDER: Target[] = ['mine', 'all', 'people', 'projects', 'archive']
const TARGET_KEY: Record<Target, TranslationKey> = {
  mine: 'output.target.mine',
  all: 'output.target.all',
  people: 'output.target.people',
  projects: 'output.target.projects',
  archive: 'output.target.archive',
}

// 対象タブの並び順もブラウザごとの個人的な好みなので localStorage に保存する。
// 一番左（先頭）が既定表示になる
function targetOrderKey(userId: string | null | undefined): string {
  return `orbit-target-order-${userId ?? 'anon'}`
}
function loadTargetOrder(userId: string | null | undefined): Target[] {
  if (typeof window === 'undefined') return DEFAULT_TARGET_ORDER
  try {
    const raw = window.localStorage.getItem(targetOrderKey(userId))
    if (!raw) return DEFAULT_TARGET_ORDER
    const parsed = JSON.parse(raw) as string[]
    const valid = parsed.filter((t): t is Target => DEFAULT_TARGET_ORDER.includes(t as Target))
    // 将来的に対象が増えた場合に備え、保存済みの並びに無いものは末尾に補完する
    const missing = DEFAULT_TARGET_ORDER.filter((t) => !valid.includes(t))
    return valid.length > 0 ? [...valid, ...missing] : DEFAULT_TARGET_ORDER
  } catch {
    return DEFAULT_TARGET_ORDER
  }
}

// カードの表示項目はブラウザごとの個人的な好み（組織のデータではない）なので
// localStorageに保存する。デモ環境で同じブラウザから複数ユーザーを切り替える
// ことがあるため、ユーザーIDでスコープしておく
function cardFieldsKey(userId: string | null | undefined): string {
  return `orbit-card-fields-${userId ?? 'anon'}`
}
function loadCardFields(userId: string | null | undefined): Set<KanbanCardField> {
  if (typeof window === 'undefined') return new Set(KANBAN_CARD_FIELDS)
  try {
    const raw = window.localStorage.getItem(cardFieldsKey(userId))
    if (!raw) return new Set(KANBAN_CARD_FIELDS)
    const parsed = JSON.parse(raw) as string[]
    return new Set(parsed.filter((f): f is KanbanCardField => KANBAN_CARD_FIELDS.includes(f as KanbanCardField)))
  } catch {
    return new Set(KANBAN_CARD_FIELDS)
  }
}

// 依存関係ツリーはプロジェクトが混在すると見づらくなるので、プロジェクト単位で
// 表示/非表示を切り替えられるようにしている。これもブラウザごとの個人設定
function hiddenProjectsKey(userId: string | null | undefined): string {
  return `orbit-dependency-hidden-projects-${userId ?? 'anon'}`
}
function loadHiddenProjects(userId: string | null | undefined): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(hiddenProjectsKey(userId))
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

export function OutputScreen() {
  const { visibleTasks, archivedTasks, projects, currentUser, pendingTasks, expenseCategories, customFormDefs } = useOrbit()
  const { go } = useNav()
  const { t: tr } = useI18n()
  const [targetOrder, setTargetOrder] = useState<Target[]>(() => loadTargetOrder(currentUser?.id))
  const [target, setTarget] = useState<Target>(() => loadTargetOrder(currentUser?.id)[0])
  const [view, setView] = useState<View>('workflow')
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [projectFilter, setProjectFilter] = useState('')
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [cardFields, setCardFields] = useState<Set<KanbanCardField>>(() =>
    loadCardFields(currentUser?.id),
  )
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const fieldsRef = useRef<HTMLDivElement>(null)
  const [orderOpen, setOrderOpen] = useState(false)
  const orderRef = useRef<HTMLDivElement>(null)
  const [draggingTarget, setDraggingTarget] = useState<Target | null>(null)
  const [hiddenProjectIds, setHiddenProjectIds] = useState<Set<string>>(() =>
    loadHiddenProjects(currentUser?.id),
  )
  const [projectVisibilityOpen, setProjectVisibilityOpen] = useState(false)
  const projectVisibilityRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (fieldsRef.current && !fieldsRef.current.contains(e.target as Node)) {
        setFieldsOpen(false)
      }
      if (orderRef.current && !orderRef.current.contains(e.target as Node)) {
        setOrderOpen(false)
      }
      if (
        projectVisibilityRef.current &&
        !projectVisibilityRef.current.contains(e.target as Node)
      ) {
        setProjectVisibilityOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const toggleCardField = (field: KanbanCardField) => {
    setCardFields((prev) => {
      const next = new Set(prev)
      if (next.has(field)) next.delete(field)
      else next.add(field)
      try {
        window.localStorage.setItem(cardFieldsKey(currentUser?.id), JSON.stringify([...next]))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const toggleProjectVisibility = (projectId: string) => {
    setHiddenProjectIds((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      try {
        window.localStorage.setItem(hiddenProjectsKey(currentUser?.id), JSON.stringify([...next]))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  // dragged を dropOn の位置に差し込む形で並び替える（一番左が既定表示になる）
  const reorderTarget = (dragged: Target, dropOn: Target) => {
    if (dragged === dropOn) return
    setTargetOrder((prev) => {
      const next = prev.filter((t) => t !== dragged)
      next.splice(next.indexOf(dropOn), 0, dragged)
      try {
        window.localStorage.setItem(targetOrderKey(currentUser?.id), JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  // 自分が担当者に含まれるタスクだけを抜き出したもの。「自分」対象の土台になる
  // 自分だけがアサインされている承認待ちタスクは、まだ組織全体には出さず
  // 本人の「自分」タブにだけ先出しする（承認されれば visibleTasks に載り、
  // ここでの二重表示は起きない）
  const myTasks = useMemo(() => {
    if (!currentUser) return []
    const approved = visibleTasks.filter((t) => t.assigneeIds.includes(currentUser.id))
    const mySelfAssignedPending = pendingTasks.filter((t) => t.assigneeIds.includes(currentUser.id))
    return [...approved, ...mySelfAssignedPending]
  }, [visibleTasks, pendingTasks, currentUser])

  // choosing a 表示 (view) jumps to whichever of 自分/一覧 was last active,
  // since the workflow/list/calendar/difficulty/dependency views only apply
  // to those two targets
  const selectView = (v: View) => {
    setView(v)
    setTarget((t) =>
      t === 'all' || t === 'mine' ? t : targetOrder.find((x) => x === 'mine' || x === 'all') ?? 'mine',
    )
  }

  // project-unit / schedule-unit filtering, applied to the 自分/一覧 targets' views
  const filteredTasks = useMemo(() => {
    const base = target === 'mine' ? myTasks : visibleTasks
    return base.filter((t) => {
      if (projectFilter && t.projectId !== projectFilter) return false
      if (fromDate || toDate) {
        const ref = t.deadline ?? t.startDate
        if (!ref) return false
        if (fromDate && ref < fromDate) return false
        if (toDate && ref > toDate) return false
      }
      return true
    })
  }, [target, myTasks, visibleTasks, projectFilter, fromDate, toDate])

  // 依存関係ツリー専用の追加絞り込み（プロジェクト単位の表示/非表示）
  const dependencyTasks = useMemo(
    () => filteredTasks.filter((t) => !hiddenProjectIds.has(t.projectId)),
    [filteredTasks, hiddenProjectIds],
  )

  const hasActiveFilter = !!(projectFilter || fromDate || toDate)

  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{tr('output.title')}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {target === 'mine'
                ? tr('output.subtitle.mine')
                : tr('output.subtitle.all')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {expenseCategories.length > 0 && (
              <button
                onClick={() => setExpenseModalOpen(true)}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Receipt className="size-3.5" />
                {tr('output.expenseApply')}
              </button>
            )}
            {customFormDefs.length > 0 && (
              <button
                onClick={() => setFormModalOpen(true)}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <FileText className="size-3.5" />
                {tr('output.formApply')}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Segment label={tr('output.target.label')}>
            {targetOrder.map((tg) => (
              <Seg key={tg} active={target === tg} onClick={() => setTarget(tg)}>
                {tg === 'mine' && <User className="size-3.5" />}
                {tg === 'archive' && <Archive className="size-3.5" />}
                {tr(TARGET_KEY[tg])}
                {tg === 'mine' && myTasks.length > 0 && (
                  <span className="rounded-full bg-secondary px-1.5 text-[10px] tabular-nums">
                    {myTasks.length}
                  </span>
                )}
                {tg === 'archive' && archivedTasks.length > 0 && (
                  <span className="rounded-full bg-secondary px-1.5 text-[10px] tabular-nums">
                    {archivedTasks.length}
                  </span>
                )}
              </Seg>
            ))}
          </Segment>

          <div className="relative" ref={orderRef}>
            <button
              type="button"
              onClick={() => setOrderOpen((o) => !o)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              aria-expanded={orderOpen}
              title={tr('output.reorder.title')}
            >
              <ArrowUpDown className="size-3.5" />
              {tr('output.reorder')}
            </button>
            {orderOpen && (
              <div className="absolute left-0 top-full z-10 mt-1.5 w-48 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg animate-in fade-in slide-in-from-top-1">
                <p className="px-2.5 py-1.5 text-[11px] text-muted-foreground">
                  {tr('output.reorder.hint')}
                </p>
                {targetOrder.map((tg) => (
                  <div
                    key={tg}
                    draggable
                    onDragStart={() => setDraggingTarget(tg)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggingTarget) reorderTarget(draggingTarget, tg)
                      setDraggingTarget(null)
                    }}
                    onDragEnd={() => setDraggingTarget(null)}
                    className={cn(
                      'flex cursor-grab items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary',
                      draggingTarget === tg && 'opacity-40',
                    )}
                  >
                    <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
                    {tr(TARGET_KEY[tg])}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Segment label={tr('output.view.label')}>
            <Seg
              active={(target === 'all' || target === 'mine') && view === 'workflow'}
              onClick={() => selectView('workflow')}
            >
              <Columns3 className="size-3.5" />
              {tr('output.view.workflow')}
            </Seg>
            <Seg
              active={(target === 'all' || target === 'mine') && view === 'list'}
              onClick={() => selectView('list')}
            >
              <LayoutList className="size-3.5" />
              {tr('output.view.list')}
            </Seg>
            <Seg
              active={(target === 'all' || target === 'mine') && view === 'calendar'}
              onClick={() => selectView('calendar')}
            >
              <CalendarDays className="size-3.5" />
              {tr('output.view.calendar')}
            </Seg>
            <Seg
              active={(target === 'all' || target === 'mine') && view === 'difficulty'}
              onClick={() => selectView('difficulty')}
            >
              <GaugeCircle className="size-3.5" />
              {tr('output.view.difficulty')}
            </Seg>
            <Seg
              active={(target === 'all' || target === 'mine') && view === 'dependency'}
              onClick={() => selectView('dependency')}
            >
              <GitBranch className="size-3.5" />
              {tr('output.view.dependency')}
            </Seg>
            <Seg
              active={(target === 'all' || target === 'mine') && view === 'gantt'}
              onClick={() => selectView('gantt')}
            >
              <BarChart2 className="size-3.5" />
              {tr('output.view.gantt')}
            </Seg>
          </Segment>

          {(target === 'all' || target === 'mine') &&
            (view === 'workflow' || view === 'difficulty' || view === 'dependency') && (
            <div className="relative" ref={fieldsRef}>
              <button
                type="button"
                onClick={() => setFieldsOpen((o) => !o)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
                aria-expanded={fieldsOpen}
              >
                <SlidersHorizontal className="size-3.5" />
                {tr('output.fields.button')}
              </button>
              {fieldsOpen && (
                <div className="absolute left-0 top-full z-10 mt-1.5 w-44 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg animate-in fade-in slide-in-from-top-1">
                  <p className="px-2.5 py-1.5 text-[11px] text-muted-foreground">
                    {tr('output.fields.hint')}
                  </p>
                  {KANBAN_CARD_FIELDS.map((f) => {
                    const checked = cardFields.has(f)
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => toggleCardField(f)}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
                      >
                        <span
                          className={cn(
                            'flex size-4 shrink-0 items-center justify-center rounded border',
                            checked
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border-strong text-transparent',
                          )}
                        >
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                        {tr(KANBAN_CARD_FIELD_KEY[f])}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {(target === 'all' || target === 'mine') && view === 'dependency' && (
            <div className="relative" ref={projectVisibilityRef}>
              <button
                type="button"
                onClick={() => setProjectVisibilityOpen((o) => !o)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
                aria-expanded={projectVisibilityOpen}
              >
                <FolderKanban className="size-3.5" />
                {tr('output.projectVisibility.button')}
                {hiddenProjectIds.size > 0 && (
                  <span className="rounded-full bg-secondary px-1.5 text-[10px] tabular-nums">
                    {projects.length - hiddenProjectIds.size}/{projects.length}
                  </span>
                )}
              </button>
              {projectVisibilityOpen && (
                <div className="absolute left-0 top-full z-10 mt-1.5 w-52 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg animate-in fade-in slide-in-from-top-1">
                  <p className="px-2.5 py-1.5 text-[11px] text-muted-foreground">
                    {tr('output.projectVisibility.hint')}
                  </p>
                  <div className="max-h-72 overflow-y-auto orbit-scroll">
                    {projects.map((p) => {
                      const checked = !hiddenProjectIds.has(p.id)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleProjectVisibility(p.id)}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
                        >
                          <span
                            className={cn(
                              'flex size-4 shrink-0 items-center justify-center rounded border',
                              checked
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border-strong text-transparent',
                            )}
                          >
                            <Check className="size-3" strokeWidth={3} />
                          </span>
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        </button>
                      )
                    })}
                    {projects.length === 0 && (
                      <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
                        {tr('output.projectVisibility.empty')}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {(target === 'all' || target === 'mine') && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="h-8 cursor-pointer rounded-lg border border-border bg-card px-2 text-xs outline-none focus:border-primary"
              >
                <option value="">{tr('output.filter.allProjects')}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                title={tr('output.filter.fromTitle')}
                className="h-8 rounded-lg border border-border bg-card px-2 text-xs outline-none focus:border-primary"
              />
              <span className="text-xs text-muted-foreground">{tr('output.filter.tilde')}</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                title={tr('output.filter.toTitle')}
                className="h-8 rounded-lg border border-border bg-card px-2 text-xs outline-none focus:border-primary"
              />
              {hasActiveFilter && (
                <button
                  onClick={() => {
                    setProjectFilter('')
                    setFromDate('')
                    setToDate('')
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                  {tr('output.filter.clear')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {target === 'archive' ? (
        archivedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-20 text-center">
            <Archive className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">{tr('output.archive.empty.title')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {tr('output.archive.empty.desc')}
            </p>
          </div>
        ) : (
          <ListView tasks={archivedTasks} onOpenTask={setOpenTaskId} />
        )
      ) : visibleTasks.length === 0 ? (
        <EmptyState onInput={() => go({ name: 'input' })} />
      ) : target === 'mine' && myTasks.length === 0 ? (
        <MineEmptyState onShowAll={() => setTarget('all')} />
      ) : (
        <>
          {target === 'people' && <PeopleView />}
          {target === 'projects' && <ProjectView />}
          {(target === 'all' || target === 'mine') && view === 'workflow' && (
            <KanbanBoard tasks={filteredTasks} onOpenTask={setOpenTaskId} fields={cardFields} />
          )}
          {(target === 'all' || target === 'mine') && view === 'list' && (
            <ListView tasks={filteredTasks} onOpenTask={setOpenTaskId} />
          )}
          {(target === 'all' || target === 'mine') && view === 'calendar' && (
            <CalendarView tasks={filteredTasks} onOpenTask={setOpenTaskId} />
          )}
          {(target === 'all' || target === 'mine') && view === 'difficulty' && (
            <DifficultyBoard tasks={filteredTasks} onOpenTask={setOpenTaskId} fields={cardFields} />
          )}
          {(target === 'all' || target === 'mine') && view === 'dependency' && (
            <DependencyView tasks={dependencyTasks} onOpenTask={setOpenTaskId} fields={cardFields} />
          )}
          {(target === 'all' || target === 'mine') && view === 'gantt' && (
            <GanttView tasks={filteredTasks} onOpenTask={setOpenTaskId} />
          )}
        </>
      )}

      <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
      {expenseModalOpen && <ExpenseApplicationModal onClose={() => setExpenseModalOpen(false)} />}
      {formModalOpen && <CustomFormModal onClose={() => setFormModalOpen(false)} />}
    </div>
  )
}

function Segment({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-secondary/60 p-0.5">
        {children}
      </div>
    </div>
  )
}

function Seg({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors',
        active
          ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(16,24,40,0.06)]'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function EmptyState({ onInput }: { onInput: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-20 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-secondary">
        <Inbox className="size-6 text-muted-foreground" />
      </div>
      <h2 className="text-base font-semibold">{t('output.empty.title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('output.empty.desc')}</p>
      <Button className="mt-5 h-9" onClick={onInput}>
        {t('output.empty.cta')}
      </Button>
    </div>
  )
}

function MineEmptyState({ onShowAll }: { onShowAll: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-20 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-secondary">
        <User className="size-6 text-muted-foreground" />
      </div>
      <h2 className="text-base font-semibold">{t('output.mineEmpty.title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('output.mineEmpty.desc')}
      </p>
      <Button variant="ghost" className="mt-5 h-9" onClick={onShowAll}>
        {t('output.mineEmpty.cta')}
      </Button>
    </div>
  )
}
