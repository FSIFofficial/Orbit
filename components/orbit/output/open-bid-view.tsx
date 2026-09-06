'use client'

import { useOrbit } from '@/lib/orbit/store'
import { useToast } from '../toast'
import { formatDeadline } from '@/lib/orbit/utils'
import { Avatar, DifficultyBadge, ProjectTag, DepartmentTag, Tag } from '@/components/orbit/primitives'
import { TranslatedText } from '@/components/orbit/translated-text'
import { useI18n } from '@/lib/orbit/i18n'
import { Megaphone } from 'lucide-react'
import type { Task } from '@/lib/orbit/types'

// 公募タスク — assigneeIdsが空 かつ assignType==='open_bid' のタスクに
// 誰でも「応募する」で自分を担当者にできる導線。応募ロジックはtask-detail-
// drawer.tsxのonTake（担当する）と同じ: assignTask(id, [currentUserId])
export function OpenBidView({
  tasks,
  onOpenTask,
}: {
  tasks: Task[]
  onOpenTask: (id: string) => void
}) {
  const { getProject, currentUser, assignTask } = useOrbit()
  const toast = useToast()
  const { t } = useI18n()

  const openBidTasks = tasks.filter(
    (task) => task.assigneeIds.length === 0 && (task.assignType ?? 'open_bid') === 'open_bid',
  )

  const apply = (task: Task) => {
    if (!currentUser) return
    assignTask(task.id, [currentUser.id])
    toast(t('openBid.appliedToast', { name: task.name }))
  }

  if (openBidTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-20 text-center">
        <Megaphone className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">{t('openBid.empty')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('openBid.subtitle')}</p>
      <div className="flex flex-col gap-2">
        {openBidTasks.map((task) => {
          const project = getProject(task.projectId)
          return (
            <div
              key={task.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:flex-row sm:items-center sm:justify-between"
            >
              <button
                type="button"
                onClick={() => onOpenTask(task.id)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {project && <ProjectTag name={project.name} />}
                  <DepartmentTag name={task.department} />
                  <DifficultyBadge difficulty={task.difficulty} />
                  {task.deadline && (
                    <span className="text-xs text-muted-foreground">
                      {t('openBid.deadlineLabel', { date: formatDeadline(task.deadline) })}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm font-semibold text-foreground">
                  <TranslatedText text={task.name} />
                </p>
                {task.skills.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {task.skills.map((s) => (
                      <Tag key={s}>{s}</Tag>
                    ))}
                  </div>
                )}
              </button>
              <button
                type="button"
                onClick={() => apply(task)}
                disabled={!currentUser}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 sm:self-start"
              >
                <Avatar member={currentUser} size={18} />
                {t('openBid.apply')}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
