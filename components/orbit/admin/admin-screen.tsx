'use client'

import { useEffect } from 'react'
import { useNav } from '@/lib/orbit/nav'
import { AdminDashboard } from './admin-dashboard'
import { AdminAssignments } from './admin-assignments'
import { AdminApprovals } from './admin-approvals'
import { AdminProjects } from './admin-projects'
import { AdminMembers } from './admin-members'
import { AdminAnalytics } from './admin-analytics'
import { AdminTags } from './admin-tags'
import { AdminOrgTree } from './admin-org-tree'
import { AdminQuiz } from './admin-quiz'
import { AdminRadarAxes } from './admin-radar-axes'
import { useOrbit } from '@/lib/orbit/store'
import { OrbitMark } from '../primitives'
import type { AdminSection } from '@/lib/orbit/types'
import { LayoutDashboard, UserPlus, FileClock, FolderPlus, Users, BarChart3, Tags, Network, GraduationCap, Radar } from 'lucide-react'

type Section = AdminSection

const NAV: { key: Section; label: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="size-4" /> },
  { key: 'approvals', label: 'Approvals', icon: <FileClock className="size-4" /> },
  { key: 'assignments', label: 'Assignments', icon: <UserPlus className="size-4" /> },
  { key: 'projects', label: 'Projects', icon: <FolderPlus className="size-4" /> },
  { key: 'members', label: 'Members', icon: <Users className="size-4" /> },
  { key: 'analytics', label: 'Analytics', icon: <BarChart3 className="size-4" /> },
  { key: 'tags', label: 'Tags', icon: <Tags className="size-4" /> },
  { key: 'org', label: 'Org Tree', icon: <Network className="size-4" /> },
  { key: 'quiz', label: '検定', icon: <GraduationCap className="size-4" /> },
  { key: 'radar', label: 'レーダー', icon: <Radar className="size-4" /> },
]

export function AdminScreen({ section }: { section: Section }) {
  const { go } = useNav()
  const { pendingTasks, visibleAdminSections, dataReady } = useOrbit()
  const nav = NAV.filter((n) => visibleAdminSections.includes(n.key))
  const allowed = visibleAdminSections.includes(section)

  // a scoped admin landing on a section they can't see (stale link, direct
  // nav) bounces to the dashboard instead of rendering it — but only once
  // dataReady, so this doesn't fire off of a still-empty/default
  // visibleAdminSections while the spreadsheet fetch is in flight
  useEffect(() => {
    if (dataReady && !allowed) {
      go({ name: 'admin', section: 'dashboard' })
    }
  }, [dataReady, allowed, go])

  if (!dataReady) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-3">
        <OrbitMark size={28} />
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/40" />
            <span className="relative inline-flex size-3 rounded-full bg-primary" />
          </span>
          データを読み込んでいます…
        </div>
      </div>
    )
  }

  if (!allowed) return null

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-border bg-card md:block">
        <div className="px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            ADMIN
          </div>
        </div>
        <nav className="space-y-0.5 px-2">
          {nav.map((n) => (
            <button
              key={n.key}
              onClick={() => go({ name: 'admin', section: n.key })}
              className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                n.key === section
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
              }`}
            >
              {n.icon}
              {n.label}
              {n.key === 'approvals' && pendingTasks.length > 0 && (
                <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {pendingTasks.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile tabs */}
      <div className="w-full">
        <div className="flex gap-1 overflow-x-auto border-b border-border bg-card px-4 py-2 md:hidden">
          {nav.map((n) => (
            <button
              key={n.key}
              onClick={() => go({ name: 'admin', section: n.key })}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors ${
                n.key === section
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground'
              }`}
            >
              {n.icon}
              {n.label}
              {n.key === 'approvals' && pendingTasks.length > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {pendingTasks.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="bg-background">
          {section === 'dashboard' && <AdminDashboard />}
          {section === 'approvals' && <AdminApprovals />}
          {section === 'assignments' && <AdminAssignments />}
          {section === 'projects' && <AdminProjects />}
          {section === 'members' && <AdminMembers />}
          {section === 'analytics' && <AdminAnalytics />}
          {section === 'tags' && <AdminTags />}
          {section === 'org' && <AdminOrgTree />}
          {section === 'quiz' && <div className="p-6"><AdminQuiz /></div>}
          {section === 'radar' && <div className="p-6"><AdminRadarAxes /></div>}
        </div>
      </div>
    </div>
  )
}
