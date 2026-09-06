'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { Avatar } from '@/components/orbit/primitives'
import { useNav } from '@/lib/orbit/nav'
import { exportProjectTasksToExcel } from '@/lib/orbit/export-excel'
import { ChevronDown, ChevronRight, FileSpreadsheet } from 'lucide-react'
import { Project } from '@/lib/orbit/types'
import { useI18n } from '@/lib/orbit/i18n'

function ProjectCard({
  p,
  tasks,
  activeProjects,
  members,
  getProjectMembers,
  go,
  depth,
  hasChildren,
  children,
}: {
  p: Project
  tasks: ReturnType<typeof useOrbit>['visibleTasks']
  activeProjects: Project[]
  members: ReturnType<typeof useOrbit>['members']
  getProjectMembers: ReturnType<typeof useOrbit>['getProjectMembers']
  go: ReturnType<typeof useNav>['go']
  depth: number
  hasChildren: boolean
  children?: React.ReactNode
}) {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(false)
  const pt = tasks.filter((t) => t.projectId === p.id)
  const done = pt.filter((t) => t.status === 'done').length
  const waiting = pt.filter((t) => t.status === 'review').length
  const completion = pt.length ? Math.round((done / pt.length) * 100) : 0
  const pm = getProjectMembers(p.id)

  return (
    <div className={depth > 0 ? 'ml-4 border-l-2 border-border/50 pl-4' : ''}>
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:border-border-strong hover:shadow-[0_2px_8px_rgba(16,24,40,0.06)]">
        <div className="flex items-start gap-2">
          {hasChildren && (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={collapsed ? t('project.card.expand') : t('project.card.collapse')}
            >
              {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
          )}
          {!hasChildren && <span className="mt-0.5 size-4 shrink-0" />}
        <button onClick={() => go({ name: 'project', id: p.id })} className="flex flex-1 flex-col gap-4 text-left">
          <div className="flex items-center gap-2.5">
            <span className={`size-2.5 rounded-full ${depth > 0 ? 'bg-muted-foreground/50' : 'bg-primary/60'}`} />
            <p className="text-sm font-semibold text-foreground">{p.name}</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{t('project.card.membersCount', { count: pm.length })}</span>
            <span>{t('project.card.tasksCount', { count: pt.length })}</span>
            <span className={waiting > 0 ? 'text-warning' : ''}>{t('project.card.waitingCount', { count: waiting })}</span>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t('project.card.progress')}</span>
              <span className="font-medium tabular-nums text-foreground">{completion}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${completion}%` }} />
            </div>
          </div>
          <div className="flex -space-x-1.5">
            {pm.slice(0, 5).map((m) => (
              <span key={m.id} className="rounded-full ring-2 ring-card">
                <Avatar member={m} size={24} />
              </span>
            ))}
          </div>
        </button>
        </div>
        <div className="flex justify-end border-t border-border/50 pt-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              exportProjectTasksToExcel(p, tasks, activeProjects, members)
            }}
            disabled={pt.length === 0}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <FileSpreadsheet className="size-3.5" />
            {t('output.list.exportExcel')}
          </button>
        </div>
      </div>
      {!collapsed && children && <div className="mt-3 flex flex-col gap-3">{children}</div>}
    </div>
  )
}

function ProjectTree({
  projects,
  allProjects,
  tasks,
  activeProjects,
  members,
  getProjectMembers,
  go,
  depth,
}: {
  projects: Project[]
  allProjects: Project[]
  tasks: ReturnType<typeof useOrbit>['visibleTasks']
  activeProjects: Project[]
  members: ReturnType<typeof useOrbit>['members']
  getProjectMembers: ReturnType<typeof useOrbit>['getProjectMembers']
  go: ReturnType<typeof useNav>['go']
  depth: number
}) {
  return (
    <>
      {projects.map((p) => {
        const children = allProjects.filter((c) => c.parentId === p.id)
        return (
          <ProjectCard
            key={p.id}
            p={p}
            tasks={tasks}
            activeProjects={activeProjects}
            members={members}
            getProjectMembers={getProjectMembers}
            go={go}
            depth={depth}
            hasChildren={children.length > 0}
          >
            {children.length > 0 && (
              <ProjectTree
                projects={children}
                allProjects={allProjects}
                tasks={tasks}
                activeProjects={activeProjects}
                members={members}
                getProjectMembers={getProjectMembers}
                go={go}
                depth={depth + 1}
              />
            )}
          </ProjectCard>
        )
      })}
    </>
  )
}

export function ProjectView() {
  const { activeProjects, visibleTasks: tasks, members, getProjectMembers } = useOrbit()
  const { go } = useNav()

  const topLevel = activeProjects.filter((p) => !p.parentId)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <ProjectTree
        projects={topLevel}
        allProjects={activeProjects}
        tasks={tasks}
        activeProjects={activeProjects}
        members={members}
        getProjectMembers={getProjectMembers}
        go={go}
        depth={0}
      />
    </div>
  )
}
