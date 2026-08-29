'use client'

import { useEffect, useRef, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { useTheme } from '@/lib/orbit/theme'
import { useTaskDrawer } from '@/lib/orbit/task-drawer'
import { isAdminRole } from '@/lib/orbit/types'
import { Avatar, OrbitMark } from './primitives'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  AtSign,
  Bell,
  CalendarClock,
  CheckCheck,
  ChevronDown,
  ClipboardCheck,
  Clock,
  LogOut,
  Moon,
  RefreshCw,
  Search,
  Sun,
  User,
  X,
} from 'lucide-react'

export function Header() {
  const {
    currentUser,
    setMode,
    logout,
    notifications,
    remoteEnabled,
    refreshing,
    refreshAll,
    visibleTasks: tasks,
    getProject,
    markMentionSeen,
  } = useOrbit()
  const { screen, go, goBack, canGoBack } = useNav()
  const { theme, toggle } = useTheme()
  const { openTask } = useTaskDrawer()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (!currentUser) return null

  const handleMode = (m: 'input' | 'output') => {
    setMode(m)
    go({ name: m })
  }

  // item 19: 組織ナレッジ横断検索 — searches task names/descriptions/
  // progress notes/comments/deliverables/振り返り for a query, so past
  // decisions and know-how surface even if you don't remember which task
  // they're on. Matches within visibleTasks only (same visibility rules
  // as everywhere else).
  const searchResults = (() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return tasks
      .map((t) => {
        let snippet: string | null = null
        if (t.name.toLowerCase().includes(q)) snippet = t.name
        else if (t.description?.toLowerCase().includes(q)) snippet = t.description
        else if (t.progress?.toLowerCase().includes(q)) snippet = t.progress
        else {
          const comment = t.comments?.find((c) => c.text.toLowerCase().includes(q))
          if (comment) snippet = comment.text
          else {
            const deliverable = t.deliverables?.find((d) => d.label.toLowerCase().includes(q))
            if (deliverable) snippet = deliverable.label
            else if (t.retrospective) {
              const r = t.retrospective
              if (r.good?.toLowerCase().includes(q)) snippet = r.good
              else if (r.bad?.toLowerCase().includes(q)) snippet = r.bad
              else if (r.improve?.toLowerCase().includes(q)) snippet = r.improve
            }
          }
        }
        return snippet ? { task: t, snippet } : null
      })
      .filter((r): r is { task: (typeof tasks)[number]; snippet: string } => r !== null)
      .slice(0, 8)
  })()

  const isInputActive = screen.name === 'input'
  const isOutputActive =
    screen.name === 'output' ||
    screen.name === 'person' ||
    screen.name === 'project'
  const isAdminActive = screen.name === 'admin'
  const isAdmin = isAdminRole(currentUser.role)

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto grid h-14 max-w-[1400px] grid-cols-[auto_1fr_auto] items-center gap-2 px-4 sm:grid-cols-[1fr_auto_1fr] sm:gap-4 sm:px-6">
        {/* left */}
        <div className="flex min-w-0 items-center gap-1">
          {canGoBack && (
            <button
              type="button"
              onClick={goBack}
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="前の画面に戻る"
              title="戻る"
            >
              <ArrowLeft className="size-[18px]" />
            </button>
          )}
          <button
            type="button"
            onClick={() => handleMode('output')}
            className="flex shrink-0 items-center gap-2"
          >
            <OrbitMark size={22} />
            <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">Orbit</span>
          </button>
        </div>

        {/* center: mode switch */}
        <div className="flex min-w-0 items-center justify-center overflow-x-auto rounded-lg border border-border bg-secondary p-0.5 orbit-scroll">
          <ModeButton
            active={isInputActive}
            onClick={() => handleMode('input')}
            sub="仕事を書く"
          >
            INPUT
          </ModeButton>
          <ModeButton
            active={isOutputActive}
            onClick={() => handleMode('output')}
            sub="組織で見る"
          >
            OUTPUT
          </ModeButton>
          {isAdmin && (
            <ModeButton
              active={isAdminActive}
              onClick={() => go({ name: 'admin', section: 'dashboard' })}
              sub="管理する"
            >
              ADMIN
            </ModeButton>
          )}
        </div>

        {/* right */}
        <div className="flex min-w-0 items-center justify-end gap-1">
          <button
            type="button"
            onClick={toggle}
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={theme === 'dark' ? 'ライトモードに切替' : 'ダークモードに切替'}
            title={theme === 'dark' ? 'ライトモード' : 'ダークモード'}
          >
            {theme === 'dark' ? (
              <Sun className="size-[18px]" />
            ) : (
              <Moon className="size-[18px]" />
            )}
          </button>
          <div className="relative" ref={searchRef}>
            <button
              type="button"
              onClick={() => setSearchOpen((o) => !o)}
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="検索"
              aria-expanded={searchOpen}
              title="タスクを検索"
            >
              <Search className="size-[18px]" />
            </button>
            {searchOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-lg animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
                  <Search className="size-3.5 shrink-0 text-muted-foreground" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="タスク名・コメント・成果物・振り返りを検索"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  {query && (
                    <button onClick={() => setQuery('')} aria-label="クリア">
                      <X className="size-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto orbit-scroll">
                  {!query.trim() ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                      キーワードを入力してください
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                      該当するタスクがありません
                    </div>
                  ) : (
                    searchResults.map(({ task: t, snippet }) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setSearchOpen(false)
                          openTask(t.id)
                        }}
                        className="flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-secondary"
                      >
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          {t.name}
                          <span className="text-xs font-normal text-muted-foreground">
                            {getProject(t.projectId)?.name}
                          </span>
                        </span>
                        {snippet !== t.name && (
                          <span className="line-clamp-1 text-xs text-muted-foreground">{snippet}</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((o) => !o)}
              className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="通知"
              aria-expanded={notifOpen}
            >
              <Bell className="size-[18px]" />
              {notifications.length > 0 && (
                <span className="absolute right-1.5 top-1.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-lg animate-in fade-in slide-in-from-top-1">
                <div className="border-b border-border px-3 py-2 text-sm font-semibold">通知</div>
                <div className="max-h-96 overflow-y-auto orbit-scroll">
                  {notifications.length === 0 && (
                    <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                      <CheckCheck className="size-4" />
                      新しい通知はありません
                    </div>
                  )}
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        setNotifOpen(false)
                        if (n.kind === 'mention' && n.commentId) markMentionSeen(n.commentId)
                        if (n.kind === 'approval') {
                          go({ name: 'admin', section: 'approvals' })
                          return
                        }
                        if (n.taskId) openTask(n.taskId)
                      }}
                      className="flex w-full items-start gap-2.5 border-b border-border px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-secondary"
                    >
                      {n.kind === 'deadline' ? (
                        <CalendarClock className="mt-0.5 size-4 shrink-0 text-warning" />
                      ) : n.kind === 'stale' ? (
                        <Clock className="mt-0.5 size-4 shrink-0 text-warning" />
                      ) : n.kind === 'mention' ? (
                        <AtSign className="mt-0.5 size-4 shrink-0 text-primary" />
                      ) : (
                        <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{n.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{n.detail}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {remoteEnabled && (
            <button
              type="button"
              onClick={refreshAll}
              disabled={refreshing}
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
              aria-label="情報を更新"
              title="情報を更新"
            >
              <RefreshCw className={cn('size-[18px]', refreshing && 'animate-spin')} />
            </button>
          )}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition-colors hover:bg-secondary"
              aria-expanded={menuOpen}
            >
              <Avatar member={currentUser} size={28} />
              <span className="hidden text-sm font-medium sm:inline">
                {currentUser.displayName || currentUser.name}
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center gap-2.5 px-2.5 py-2">
                  <Avatar member={currentUser} size={34} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {currentUser.displayName || currentUser.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {currentUser.affiliation}
                    </div>
                  </div>
                </div>
                <div className="my-1 h-px bg-border" />
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false)
                    go({ name: 'person', id: currentUser.id })
                  }}
                >
                  <User className="size-4" />
                  プロフィール
                </MenuItem>
                <div className="my-1 h-px bg-border" />
                <MenuItem onClick={logout}>
                  <LogOut className="size-4" />
                  ログアウト
                </MenuItem>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function ModeButton({
  active,
  onClick,
  children,
  sub,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  sub: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex shrink-0 flex-col items-center rounded-[7px] px-3 py-1 text-center transition-all sm:min-w-[204px] sm:px-4',
        active
          ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(16,24,40,0.08)]'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span className="text-[13px] font-semibold tracking-wide">{children}</span>
      <span
        className={cn(
          'hidden text-[10px] leading-none sm:block',
          active ? 'text-primary' : 'text-muted-foreground/70',
        )}
      >
        {sub}
      </span>
    </button>
  )
}

function MenuItem({
  children,
  onClick,
  highlight,
}: {
  children: React.ReactNode
  onClick?: () => void
  highlight?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-secondary',
        highlight ? 'font-medium text-accent-foreground' : 'text-foreground',
      )}
    >
      {children}
    </button>
  )
}
