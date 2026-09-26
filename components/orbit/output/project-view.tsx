'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { Avatar } from '@/components/orbit/primitives'
import { useNav } from '@/lib/orbit/nav'
import { exportProjectTasksToExcel } from '@/lib/orbit/export-excel'
import { ChevronDown, ChevronRight, FileSpreadsheet } from 'lucide-react'
import { Project } from '@/lib/orbit/types'
import { useI18n, type TranslationKey } from '@/lib/orbit/i18n'

// item: プロジェクト表示のカードに出す項目を選べるようにした（Kanbanカードの
// 表示項目トグルと同じ考え方）。プロジェクト名と進捗率バーの下の統計行は
// 常時表示、それ以外はここでON/OFFできる
export type ProjectCardField = 'stats' | 'progress' | 'members'
export const PROJECT_CARD_FIELDS: ProjectCardField[] = ['stats', 'progress', 'members']
export const PROJECT_CARD_FIELD_KEY: Record<ProjectCardField, TranslationKey> = {
  stats: 'project.card.field.stats',
  progress: 'project.card.field.progress',
  members: 'project.card.field.members',
}

function ProjectCard({
  p,
  tasks,
  activeProjects,
  members,
  getProjectMembers,
  go,
  depth,
  childProjects,
  fields,
  children,
}: {
  p: Project
  tasks: ReturnType<typeof useOrbit>['visibleTasks']
  activeProjects: Project[]
  members: ReturnType<typeof useOrbit>['members']
  getProjectMembers: ReturnType<typeof useOrbit>['getProjectMembers']
  go: ReturnType<typeof useNav>['go']
  depth: number
  childProjects: Project[]
  fields: Set<ProjectCardField>
  children?: React.ReactNode
}) {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(false)
  const hasChildren = childProjects.length > 0
  const pt = tasks.filter((t) => t.projectId === p.id)
  const done = pt.filter((t) => t.status === 'done').length
  const waiting = pt.filter((t) => t.status === 'review').length
  const completion = pt.length ? Math.round((done / pt.length) * 100) : 0
  const pm = getProjectMembers(p.id)
  const showStats = fields.has('stats')
  const showProgress = fields.has('progress')
  const showMembers = fields.has('members')

  return (
    <div className={depth > 0 ? 'ml-4 border-l-2 border-border/50 pl-4' : ''}>
      {/* item: カード1枚の高さを従来の6〜7割程度に圧縮(縦gap・パディングを
          詰め、統計行と進捗バーを1行にまとめた) */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:border-border-strong hover:shadow-[0_2px_8px_rgba(16,24,40,0.06)]">
        <button onClick={() => go({ name: 'project', id: p.id })} className="flex flex-1 flex-col gap-2 text-left">
          <div className="flex items-center justify-between gap-2.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className={`size-2 shrink-0 rounded-full ${depth > 0 ? 'bg-muted-foreground/50' : 'bg-primary/60'}`} />
              <span className="truncate text-sm font-semibold text-foreground">{p.name}</span>
            </span>
            {showMembers && (
              <span className="flex shrink-0 -space-x-1.5">
                {pm.slice(0, 4).map((m) => (
                  <span key={m.id} className="rounded-full ring-2 ring-card">
                    <Avatar member={m} size={18} />
                  </span>
                ))}
              </span>
            )}
          </div>
          {showStats && (
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>{t('project.card.membersCount', { count: pm.length })}</span>
              <span>{t('project.card.tasksCount', { count: pt.length })}</span>
              <span className={waiting > 0 ? 'text-warning' : ''}>{t('project.card.waitingCount', { count: waiting })}</span>
            </div>
          )}
          {showProgress && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${completion}%` }} />
              </div>
              <span className="shrink-0 text-[11px] font-medium tabular-nums text-foreground">{completion}%</span>
            </div>
          )}
        </button>
        {/* 子プロジェクトの表示・非表示はここ(カード下部)にまとめる —
            折りたたんでも件数と項目名だけは分かるようにする */}
        {collapsed && hasChildren && (
          <div className="flex flex-wrap gap-1.5">
            {childProjects.map((c) => (
              <span
                key={c.id}
                className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {c.name}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-1.5">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              {collapsed
                ? t('project.card.showChildren', { count: childProjects.length })
                : t('project.card.hideChildren', { count: childProjects.length })}
            </button>
          ) : (
            <span />
          )}
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
  fields,
}: {
  projects: Project[]
  allProjects: Project[]
  tasks: ReturnType<typeof useOrbit>['visibleTasks']
  activeProjects: Project[]
  members: ReturnType<typeof useOrbit>['members']
  getProjectMembers: ReturnType<typeof useOrbit>['getProjectMembers']
  go: ReturnType<typeof useNav>['go']
  depth: number
  fields: Set<ProjectCardField>
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
            childProjects={children}
            fields={fields}
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
                fields={fields}
              />
            )}
          </ProjectCard>
        )
      })}
    </>
  )
}

export function ProjectView({
  fields = new Set(PROJECT_CARD_FIELDS),
}: {
  fields?: Set<ProjectCardField>
}) {
  const { activeProjects, visibleTasks: tasks, members, getProjectMembers } = useOrbit()
  const { go } = useNav()

  const topLevel = activeProjects.filter((p) => !p.parentId)

  // item: プロジェクト一覧が長くなっても、この領域だけが独立してスクロール
  // するようにする(プロジェクト追加ボタンなどページ上部の操作は常に見える
  // 位置に残る)
  return (
    <div className="max-h-[70vh] overflow-y-auto orbit-scroll pr-1">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ProjectTree
          projects={topLevel}
          allProjects={activeProjects}
          tasks={tasks}
          activeProjects={activeProjects}
          members={members}
          getProjectMembers={getProjectMembers}
          go={go}
          depth={0}
          fields={fields}
        />
      </div>
    </div>
  )
}
