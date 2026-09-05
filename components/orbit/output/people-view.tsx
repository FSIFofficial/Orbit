'use client'

import { useOrbit } from '@/lib/orbit/store'
import { Avatar } from '@/components/orbit/primitives'
import { useNav } from '@/lib/orbit/nav'
import { BASE_ROLE } from '@/lib/orbit/types'
import { useI18n } from '@/lib/orbit/i18n'

export function PeopleView() {
  const { members, visibleTasks: tasks } = useOrbit()
  const { go } = useNav()
  const { t } = useI18n()

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {members.map((m) => {
        const mine = tasks.filter((t) => t.assigneeIds.includes(m.id))
        const inProgress = mine.filter((t) => t.status === 'progress').length
        const waiting = mine.filter((t) => t.status === 'review').length
        const done = mine.filter((t) => t.status === 'done').length
        return (
          <button
            key={m.id}
            onClick={() => go({ name: 'person', id: m.id })}
            className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:border-border-strong hover:shadow-[0_2px_8px_rgba(16,24,40,0.06)]"
          >
            <div className="flex items-center gap-3">
              <Avatar member={m} size={44} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {m.displayName || m.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.role !== BASE_ROLE ? m.role : m.affiliation}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 border-t border-border pt-3 text-center">
              <Stat label={t('peopleView.assignedStat')} value={mine.length} />
              <Stat label={t('status.progress')} value={inProgress} />
              <Stat label={t('admin.leadership.kpi.reviewing')} value={waiting} accent={waiting > 0} />
              <Stat label={t('status.done')} value={done} />
            </div>
          </button>
        )
      })}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <p className={`text-lg font-semibold tabular-nums ${accent ? 'text-warning' : 'text-foreground'}`}>
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}
