'use client'

// A single, app-root-level task detail drawer that any screen can open
// without navigating away first (e.g. Admin's "対応が必要" panels, the
// header's notification dropdown) — separate from the per-screen drawers
// OUTPUT/person/project pages already render locally for in-context use.
import { createContext, useContext, useState } from 'react'

interface TaskDrawerContextValue {
  openTaskId: string | null
  openTask: (id: string) => void
  closeTask: () => void
}

const TaskDrawerContext = createContext<TaskDrawerContextValue | null>(null)

export function TaskDrawerProvider({ children }: { children: React.ReactNode }) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  return (
    <TaskDrawerContext.Provider
      value={{
        openTaskId,
        openTask: (id: string) => setOpenTaskId(id),
        closeTask: () => setOpenTaskId(null),
      }}
    >
      {children}
    </TaskDrawerContext.Provider>
  )
}

export function useTaskDrawer() {
  const ctx = useContext(TaskDrawerContext)
  if (!ctx) throw new Error('useTaskDrawer must be used within TaskDrawerProvider')
  return ctx
}
