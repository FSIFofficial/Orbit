'use client'

import { useState } from 'react'
import type { Difficulty, Task } from '@/lib/orbit/types'
import { DIFFICULTY_LABEL } from '@/lib/orbit/types'
import { useOrbit } from '@/lib/orbit/store'
import { KanbanCard, KANBAN_CARD_FIELDS, type KanbanCardField } from './kanban-card'
import { cn } from '@/lib/utils'

export function DifficultyBoard({
  tasks,
  onOpenTask,
  fields = new Set(KANBAN_CARD_FIELDS),
}: {
  tasks: Task[]
  onOpenTask: (id: string) => void
  fields?: Set<KanbanCardField>
}) {
  const { updateDifficulty } = useOrbit()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overColumn, setOverColumn] = useState<Difficulty | null>(null)

  const handleDrop = (difficulty: Difficulty) => {
    if (draggingId) updateDifficulty(draggingId, difficulty)
    setDraggingId(null)
    setOverColumn(null)
  }

  return (
    <div className="flex gap-3 overflow-x-auto orbit-scroll pb-4">
      {DIFFICULTY_LABEL.map((difficulty) => {
        const columnTasks = tasks.filter((t) => t.difficulty === difficulty)
        return (
          <div
            key={difficulty}
            onDragOver={(e) => {
              e.preventDefault()
              setOverColumn(difficulty)
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setOverColumn(null)
            }}
            onDrop={() => handleDrop(difficulty)}
            className={cn(
              'flex w-[276px] shrink-0 flex-col rounded-xl border transition-colors',
              overColumn === difficulty
                ? 'border-primary/40 bg-primary-muted/40'
                : 'border-border bg-secondary/50',
            )}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="text-sm font-medium">{difficulty}</span>
              <span className="rounded-md bg-card px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                {columnTasks.length}
              </span>
            </div>
            <div className="flex min-h-[120px] flex-col gap-2 px-2 pb-2">
              {columnTasks.map((task) => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  fields={fields}
                  dragging={draggingId === task.id}
                  onDragStart={(e) => {
                    setDraggingId(task.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onClick={() => onOpenTask(task.id)}
                />
              ))}
              {columnTasks.length === 0 && (
                <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                  ここにドロップ
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
