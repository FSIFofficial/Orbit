'use client'

import { useOrbit } from '@/lib/orbit/store'
import { Avatar } from '@/components/orbit/primitives'
import { useNav } from '@/lib/orbit/nav'
import { exportProjectTasksToExcel } from '@/lib/orbit/export-excel'
import { FileSpreadsheet } from 'lucide-react'

export function ProjectView() {
  const { activeProjects, visibleTasks: tasks, members, getProjectMembers } = useOrbit()
  const { go } = useNav()

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {activeProjects.map((p) => {
        const pt = tasks.filter((t) => t.projectId === p.id)
        const done = pt.filter((t) => t.status === 'done').length
        const waiting = pt.filter((t) => t.status === 'review').length
        const completion = pt.length ? Math.round((done / pt.length) * 100) : 0
        const pm = getProjectMembers(p.id)
        return (
          <div
            key={p.id}
            className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:border-border-strong hover:shadow-[0_2px_8px_rgba(16,24,40,0.06)]"
          >
            <button
              onClick={() => go({ name: 'project', id: p.id })}
              className="flex flex-col gap-4 text-left"
            >
              <div className="flex items-center gap-2.5">
                <span className="size-2.5 rounded-full bg-primary/60" />
                <p className="text-sm font-semibold text-foreground">{p.name}</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>メンバー {pm.length}</span>
                <span>タスク {pt.length}</span>
                <span className={waiting > 0 ? 'text-warning' : ''}>確認待ち {waiting}</span>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">進捗</span>
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
                Excel出力
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
