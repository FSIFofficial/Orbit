'use client'

import { createContext, useContext, useState, useCallback } from 'react'

import type { AdminSection, Department } from './types'

export type OutputTarget = 'all' | 'people' | 'projects'
export type OutputView = 'workflow' | 'list' | 'calendar' | 'difficulty'

export type Screen =
  | { name: 'input' }
  | {
      name: 'output'
      target?: OutputTarget
      view?: OutputView
      department?: Department
    }
  | { name: 'person'; id: string }
  | { name: 'project'; id: string }
  | {
      name: 'admin'
      section: AdminSection
    }
  | { name: 'feedback' }
  // item 6: 個人コメント・進捗報告横断一覧
  | { name: 'activity' }
  // item 23: 日報・週報
  | { name: 'dailyreport' }
  // item 22: メンバー体験定点測定アンケート
  | { name: 'survey' }

interface NavValue {
  screen: Screen
  go: (s: Screen) => void
  goBack: () => void
  canGoBack: boolean
}

const NavContext = createContext<NavValue | null>(null)

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [screen, setScreen] = useState<Screen>({ name: 'output' })
  const [history, setHistory] = useState<Screen[]>([])
  const go = useCallback((s: Screen) => {
    setScreen((prev) => {
      setHistory((h) => [...h, prev])
      return s
    })
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
  }, [])
  const goBack = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      setScreen(prev)
      if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
      return h.slice(0, -1)
    })
  }, [])
  return (
    <NavContext.Provider value={{ screen, go, goBack, canGoBack: history.length > 0 }}>
      {children}
    </NavContext.Provider>
  )
}

export function useNav() {
  const ctx = useContext(NavContext)
  if (!ctx) throw new Error('useNav must be used within NavProvider')
  return ctx
}
