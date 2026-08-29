'use client'

// 依存関係 (dependency tree) view — separate from the existing ワークフロー
// kanban board. Renders tasks as nodes connected by branches to the
// prerequisite tasks set on Task.dependsOnIds ("このタスクを開始するために
// このワークが必要"). Layout is a simple leveled DAG: a task's level is
// 1 + max(level of its prerequisites among the visible task set); tasks
// with no (visible) prerequisites sit at level 0.
//
// Cards also support connecting two tasks by drag & drop, or by a
// long-press-then-drag gesture (touch-friendly): press and hold, or start
// dragging past a small threshold, and a live line follows the pointer
// until it's released over another card — the pressed card becomes a
// prerequisite of the one dropped on. A quick tap (no hold, no drag) still
// opens the task drawer as before.
import { useCallback, useMemo, useRef, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useToast } from '@/components/orbit/toast'
import type { Task } from '@/lib/orbit/types'
import { STATUS_COLOR, STATUS_LABEL } from '@/lib/orbit/types'
import { Avatar, DifficultyBadge } from '../primitives'
import { formatDeadline, deadlineLevel } from '@/lib/orbit/utils'
import { KANBAN_CARD_FIELDS, type KanbanCardField } from './kanban-card'
import { cn } from '@/lib/utils'
import { GitBranch, GripVertical, TriangleAlert } from 'lucide-react'

const CARD_W = 220
// カードの高さは表示項目の数に応じて可変（名前+ステータス行は常時表示、
// プロジェクト/担当者・期限/カテゴリ・難易度は選んだ項目に応じて行が増える）
const BASE_CARD_H = 40
const ROW_H = 20
function cardHeightFor(fields: Set<KanbanCardField>): number {
  let extraRows = 0
  if (fields.has('project')) extraRows++
  if (fields.has('assignee') || fields.has('deadline')) extraRows++
  if (fields.has('category') || fields.has('difficulty')) extraRows++
  return BASE_CARD_H + extraRows * ROW_H
}
const COL_GAP = 72
const ROW_GAP = 16
const LONG_PRESS_MS = 450
const DRAG_THRESHOLD = 6

interface PressState {
  taskId: string
  startX: number
  startY: number
  lastX: number
  lastY: number
  dragging: boolean
  timer: number | null
}

export function DependencyView({
  tasks,
  onOpenTask,
  fields = new Set(KANBAN_CARD_FIELDS),
}: {
  tasks: Task[]
  onOpenTask: (id: string) => void
  fields?: Set<KanbanCardField>
}) {
  const { updateDependsOn, getMember, getProject } = useOrbit()
  const toast = useToast()
  const cardH = cardHeightFor(fields)
  const showProject = fields.has('project')
  const showAssignee = fields.has('assignee')
  const showDeadline = fields.has('deadline')
  const showCategory = fields.has('category')
  const showDifficulty = fields.has('difficulty')
  const showMetaRow = showAssignee || showDeadline
  const showBottomRow = showCategory || showDifficulty
  const canvasRef = useRef<HTMLDivElement>(null)
  const pressRef = useRef<PressState | null>(null)
  const [drag, setDrag] = useState<{ fromId: string; x: number; y: number } | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  const taskIds = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks])
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])

  const levels = useMemo(() => {
    const levelOf = new Map<string, number>()
    const visiting = new Set<string>()
    const resolve = (t: Task): number => {
      if (levelOf.has(t.id)) return levelOf.get(t.id)!
      const deps = (t.dependsOnIds ?? []).filter((id) => taskIds.has(id) && id !== t.id)
      if (deps.length === 0 || visiting.has(t.id)) {
        levelOf.set(t.id, 0)
        return 0
      }
      visiting.add(t.id)
      const maxDepLevel = Math.max(
        ...deps.map((id) => {
          const depTask = tasks.find((x) => x.id === id)
          return depTask ? resolve(depTask) : 0
        }),
      )
      visiting.delete(t.id)
      const lvl = maxDepLevel + 1
      levelOf.set(t.id, lvl)
      return lvl
    }
    tasks.forEach(resolve)
    return levelOf
  }, [tasks, taskIds])

  const { columns, positions, maxRows } = useMemo(() => {
    const cols = new Map<number, Task[]>()
    tasks.forEach((t) => {
      const lvl = levels.get(t.id) ?? 0
      if (!cols.has(lvl)) cols.set(lvl, [])
      cols.get(lvl)!.push(t)
    })
    const pos = new Map<string, { x: number; y: number }>()
    let rows = 0
    Array.from(cols.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([lvl, list]) => {
        rows = Math.max(rows, list.length)
        list.forEach((t, i) => {
          pos.set(t.id, {
            x: lvl * (CARD_W + COL_GAP),
            y: i * (cardH + ROW_GAP),
          })
        })
      })
    return { columns: cols, positions: pos, maxRows: rows }
  }, [tasks, levels, cardH])

  const maxLevel = columns.size > 0 ? Math.max(...columns.keys()) : 0
  const svgWidth = (maxLevel + 1) * (CARD_W + COL_GAP)
  const svgHeight = Math.max(maxRows, 1) * (cardH + ROW_GAP)

  const edges = useMemo(() => {
    const out: { from: string; to: string }[] = []
    tasks.forEach((t) => {
      ;(t.dependsOnIds ?? []).forEach((depId) => {
        if (taskIds.has(depId) && depId !== t.id) out.push({ from: depId, to: t.id })
      })
    })
    return out
  }, [tasks, taskIds])

  const hasAnyDependency = edges.length > 0

  // does `fromId` already (directly or transitively) depend on `targetId`?
  // used to refuse a connection that would close a cycle.
  const dependsOnTransitively = useCallback(
    (fromId: string, targetId: string, seen: Set<string> = new Set()): boolean => {
      if (seen.has(fromId)) return false
      seen.add(fromId)
      const t = tasksById.get(fromId)
      if (!t) return false
      const deps = t.dependsOnIds ?? []
      if (deps.includes(targetId)) return true
      return deps.some((d) => dependsOnTransitively(d, targetId, seen))
    },
    [tasksById],
  )

  const dropTargetAt = (clientX: number, clientY: number): string | undefined => {
    const el = document.elementFromPoint(clientX, clientY)
    const card = el instanceof Element ? el.closest<HTMLElement>('[data-task-id]') : null
    return card?.dataset.taskId
  }

  const startDrag = (taskId: string, clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    setDrag({ fromId: taskId, x: clientX - rect.left, y: clientY - rect.top })
  }

  const updateDragPos = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    setDrag((d) => (d ? { ...d, x: clientX - rect.left, y: clientY - rect.top } : d))
    setDropTargetId(dropTargetAt(clientX, clientY) ?? null)
  }

  const finishDrag = (taskId: string, clientX: number, clientY: number) => {
    const targetId = dropTargetAt(clientX, clientY)
    setDrag(null)
    setDropTargetId(null)
    if (!targetId || targetId === taskId) return
    const source = tasksById.get(taskId)
    const target = tasksById.get(targetId)
    if (!source || !target) return
    const existing = target.dependsOnIds ?? []
    if (existing.includes(taskId)) {
      toast(`「${source.name}」は既に「${target.name}」の前提タスクです`)
      return
    }
    if (dependsOnTransitively(taskId, targetId)) {
      toast('循環する依存関係になるため設定できません')
      return
    }
    updateDependsOn(targetId, [...existing, taskId])
    toast(`「${source.name}」を「${target.name}」の前提タスクに設定しました`)
  }

  const clearPress = () => {
    const ps = pressRef.current
    if (ps?.timer) window.clearTimeout(ps.timer)
    pressRef.current = null
  }

  const handlePointerDown = (e: React.PointerEvent, taskId: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore — pointer capture is a nice-to-have */
    }
    const { clientX, clientY } = e
    clearPress()
    const timer = window.setTimeout(() => {
      const ps = pressRef.current
      if (ps && ps.taskId === taskId && !ps.dragging) {
        ps.dragging = true
        startDrag(taskId, ps.lastX, ps.lastY)
      }
    }, LONG_PRESS_MS)
    pressRef.current = { taskId, startX: clientX, startY: clientY, lastX: clientX, lastY: clientY, dragging: false, timer }
  }

  const handlePointerMove = (e: React.PointerEvent, taskId: string) => {
    const ps = pressRef.current
    if (!ps || ps.taskId !== taskId) return
    ps.lastX = e.clientX
    ps.lastY = e.clientY
    if (!ps.dragging) {
      const dist = Math.hypot(e.clientX - ps.startX, e.clientY - ps.startY)
      if (dist > DRAG_THRESHOLD) {
        ps.dragging = true
        if (ps.timer) window.clearTimeout(ps.timer)
        startDrag(taskId, e.clientX, e.clientY)
      }
      return
    }
    updateDragPos(e.clientX, e.clientY)
  }

  const handlePointerUp = (e: React.PointerEvent, taskId: string) => {
    const ps = pressRef.current
    if (!ps || ps.taskId !== taskId) return
    if (ps.timer) window.clearTimeout(ps.timer)
    const wasDragging = ps.dragging
    pressRef.current = null
    if (wasDragging) {
      finishDrag(taskId, e.clientX, e.clientY)
    } else {
      onOpenTask(taskId)
    }
  }

  const handlePointerCancel = (taskId: string) => {
    const ps = pressRef.current
    if (!ps || ps.taskId !== taskId) return
    clearPress()
    setDrag(null)
    setDropTargetId(null)
  }

  if (tasks.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        表示できるタスクがありません
      </div>
    )
  }

  const dragFromPos = drag ? positions.get(drag.fromId) : undefined

  return (
    <div className="flex flex-col gap-3">
      {!hasAnyDependency && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <GitBranch className="size-3.5 shrink-0" />
          まだ前提タスクが設定されていません。カードをドラッグ、または長押ししてから別のカードにつなげると前提タスクとして設定できます。
        </div>
      )}
      <div className="relative overflow-auto orbit-scroll rounded-xl border border-border bg-secondary/30 p-6">
        <div
          ref={canvasRef}
          className="relative"
          style={{ width: svgWidth, height: svgHeight, minWidth: '100%' }}
        >
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={svgWidth}
            height={svgHeight}
          >
            {edges.map(({ from, to }, i) => {
              const a = positions.get(from)
              const b = positions.get(to)
              if (!a || !b) return null
              const x1 = a.x + CARD_W
              const y1 = a.y + cardH / 2
              const x2 = b.x
              const y2 = b.y + cardH / 2
              const midX = (x1 + x2) / 2
              return (
                <path
                  key={`${from}-${to}-${i}`}
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="var(--border-strong)"
                  strokeWidth={1.5}
                  markerEnd="url(#dep-arrow)"
                />
              )
            })}
            <defs>
              <marker
                id="dep-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L8,4 L0,8 z" fill="var(--border-strong)" />
              </marker>
            </defs>
          </svg>

          {drag && dragFromPos && (
            <svg
              className="pointer-events-none absolute left-0 top-0 overflow-visible"
              width={svgWidth}
              height={svgHeight}
            >
              <line
                x1={dragFromPos.x + CARD_W / 2}
                y1={dragFromPos.y + cardH / 2}
                x2={drag.x}
                y2={drag.y}
                stroke="var(--primary)"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
              <circle cx={drag.x} cy={drag.y} r={4} fill="var(--primary)" />
            </svg>
          )}

          {tasks.map((t) => {
            const p = positions.get(t.id)
            if (!p) return null
            const isDragSource = drag?.fromId === t.id
            const isDropTarget = !!drag && dropTargetId === t.id && t.id !== drag.fromId
            const project = getProject(t.projectId)
            const assignees = t.assigneeIds.map((id) => getMember(id)).filter(Boolean) as Array<
              NonNullable<ReturnType<typeof getMember>>
            >
            const deadline = deadlineLevel(t)
            const urgent = deadline.level === 'overdue' || deadline.level === 'today'
            return (
              <div
                key={t.id}
                data-task-id={t.id}
                role="button"
                tabIndex={0}
                onPointerDown={(e) => handlePointerDown(e, t.id)}
                onPointerMove={(e) => handlePointerMove(e, t.id)}
                onPointerUp={(e) => handlePointerUp(e, t.id)}
                onPointerCancel={() => handlePointerCancel(t.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenTask(t.id)
                  }
                }}
                className={`absolute flex cursor-grab select-none flex-col justify-center gap-1 rounded-lg border bg-card px-3 py-2 text-left shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-colors ${
                  isDropTarget
                    ? 'border-primary ring-2 ring-primary'
                    : 'border-border hover:border-border-strong'
                } ${isDragSource ? 'opacity-50' : ''}`}
                style={{ left: p.x, top: p.y, width: CARD_W, height: cardH, touchAction: 'none' }}
              >
                <GripVertical className="pointer-events-none absolute right-1 top-1 size-3 text-muted-foreground/40" />
                <div className="flex items-center justify-between gap-1.5">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: STATUS_COLOR[t.status] }}
                    />
                    <span className="truncate text-sm font-medium">{t.name}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {STATUS_LABEL[t.status]}
                  </span>
                </div>
                {showProject && (
                  <div className="truncate text-[11px] text-muted-foreground">{project?.name}</div>
                )}
                {showMetaRow && (
                  <div className="flex items-center justify-between gap-2">
                    {showAssignee ? (
                      assignees.length > 0 ? (
                        <div className="flex min-w-0 items-center gap-1">
                          <div className="flex shrink-0 -space-x-1.5">
                            {assignees.slice(0, 3).map((m) => (
                              <span key={m.id} className="rounded-full ring-2 ring-card">
                                <Avatar member={m} size={16} />
                              </span>
                            ))}
                          </div>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {assignees.map((m) => m.displayName || m.name).join('、')}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">未アサイン</span>
                      )
                    ) : (
                      <span />
                    )}
                    {showDeadline && (
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1 text-[11px]',
                          urgent ? 'font-medium text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {urgent && <TriangleAlert className="size-3" />}
                        {formatDeadline(t.deadline)}
                      </span>
                    )}
                  </div>
                )}
                {showBottomRow && (
                  <div className="flex items-center justify-between gap-2">
                    {showCategory && (
                      <span className="truncate text-[11px] text-muted-foreground">{t.category}</span>
                    )}
                    {showDifficulty && <DifficultyBadge difficulty={t.difficulty} />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
