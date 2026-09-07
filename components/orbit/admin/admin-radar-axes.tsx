'use client'

import { useMemo, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useToast } from '@/components/orbit/toast'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Radar, Users } from 'lucide-react'
import type { RadarAxis } from '@/lib/orbit/types'
import { computeTeamRadarValues } from '@/lib/orbit/utils'
import { SkillRadarChart } from '@/components/orbit/skill-radar-chart'
import { AdminAccessNote, Avatar } from '@/components/orbit/primitives'
import { useI18n } from '@/lib/orbit/i18n'

export function AdminRadarAxes() {
  const { radarAxes, updateRadarAxes, skillOptions, members, currentUser, projects, getProjectMembers } = useOrbit()
  const toast = useToast()
  const { t } = useI18n()
  const [axes, setAxes] = useState<RadarAxis[]>(radarAxes)
  const [newSkill, setNewSkill] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [dirty, setDirty] = useState(false)

  // チームレーダーチャート（item 8）— 集計対象メンバーの選択
  const activeMembers = useMemo(() => members.filter((m) => !m.inactive), [members])
  const [teamProjectId, setTeamProjectId] = useState('')
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(
    () => new Set(activeMembers.map((m) => m.id)),
  )

  const applyProjectFilter = (projectId: string) => {
    setTeamProjectId(projectId)
    if (!projectId) {
      setSelectedMemberIds(new Set(activeMembers.map((m) => m.id)))
      return
    }
    const projectMemberIds = new Set(getProjectMembers(projectId).map((m) => m.id))
    setSelectedMemberIds(new Set(activeMembers.filter((m) => projectMemberIds.has(m.id)).map((m) => m.id)))
  }

  const toggleMember = (memberId: string) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
  }

  const teamMembers = useMemo(
    () => activeMembers.filter((m) => selectedMemberIds.has(m.id)),
    [activeMembers, selectedMemberIds],
  )
  const teamRadarValues = useMemo(
    () => computeTeamRadarValues(axes, teamMembers),
    [axes, teamMembers],
  )

  const syncFromStore = () => {
    setAxes(radarAxes)
    setDirty(false)
  }

  const addAxis = () => {
    if (!newSkill) return
    const entry: RadarAxis = { skill: newSkill, label: newLabel.trim() || undefined }
    const next = [...axes, entry]
    setAxes(next)
    setNewSkill('')
    setNewLabel('')
    setDirty(true)
  }

  const removeAxis = (i: number) => {
    setAxes((prev) => prev.filter((_, idx) => idx !== i))
    setDirty(true)
  }

  const save = () => {
    updateRadarAxes(axes)
    toast(t('admin.radarAxes.savedToast'))
    setDirty(false)
  }

  const previewMember = currentUser ?? members[0]

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold">{t('admin.radarAxes.title')}</h2>
        <p className="text-xs text-muted-foreground">
          {t('admin.radarAxes.subtitle')}
        </p>
        <AdminAccessNote level="fullAdmin" className="mt-1" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Axes editor */}
        <div>
          <div className="mb-3 flex flex-col gap-2">
            {axes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('admin.radarAxes.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {axes.map((ax, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
                  >
                    <span className="flex-1 font-medium">{ax.skill}</span>
                    {ax.label && (
                      <span className="text-xs text-muted-foreground">{t('admin.radarAxes.displayNameLabel', { label: ax.label })}</span>
                    )}
                    <button
                      onClick={() => removeAxis(i)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t('admin.radarAxes.addAxis')}</p>
            <div className="flex flex-wrap gap-2">
              <select
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
              >
                <option value="">{t('admin.radarAxes.selectSkillPlaceholder')}</option>
                {skillOptions
                  .filter((s) => !axes.some((ax) => ax.skill === s))
                  .map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
              </select>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={t('admin.radarAxes.displayNamePlaceholder')}
                className="h-8 w-32 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
              />
              <button
                onClick={addAxis}
                disabled={!newSkill}
                className="flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                <Plus className="size-3.5" /> {t('common.add')}
              </button>
            </div>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            {dirty && (
              <Button variant="outline" size="sm" onClick={syncFromStore}>
                {t('admin.radarAxes.reset')}
              </Button>
            )}
            <Button size="sm" onClick={save} disabled={!dirty}>
              {t('common.save')}
            </Button>
          </div>
        </div>

        {/* Preview */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">{t('admin.radarAxes.preview')}</p>
          {axes.length >= 3 ? (
            <SkillRadarChart
              axes={axes}
              skillLevels={previewMember?.skillLevels ?? []}
              size={200}
            />
          ) : (
            <div className="flex h-[200px] w-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
              <Radar className="size-8 opacity-40" />
              <p className="mt-2 text-xs">{t('admin.radarAxes.needThreeAxes')}</p>
            </div>
          )}
          {previewMember && (
            <p className="text-xs text-muted-foreground">
              {t('admin.radarAxes.previewLabel', { name: previewMember.displayName ?? previewMember.name })}
            </p>
          )}
        </div>
      </div>

      {/* チームレーダーチャート（item 8） */}
      <div className="mt-10">
        <div className="mb-3 flex items-center gap-1.5">
          <Users className="size-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">{t('admin.radarAxes.team.title')}</h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{t('admin.radarAxes.team.desc')}</p>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t('admin.radarAxes.team.projectFilterLabel')}
            </label>
            <select
              value={teamProjectId}
              onChange={(e) => applyProjectFilter(e.target.value)}
              className="h-8 w-full cursor-pointer rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
            >
              <option value="">{t('admin.radarAxes.team.wholeOrgOption')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-border">
              {activeMembers.map((m) => (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-2 border-b border-border/50 px-2.5 py-1.5 text-xs last:border-0 hover:bg-secondary/50"
                >
                  <input
                    type="checkbox"
                    checked={selectedMemberIds.has(m.id)}
                    onChange={() => toggleMember(m.id)}
                    className="size-3.5 accent-primary"
                  />
                  <Avatar member={m} size={20} />
                  <span className="truncate">{m.displayName || m.name}</span>
                </label>
              ))}
              {activeMembers.length === 0 && (
                <p className="px-2.5 py-3 text-xs text-muted-foreground">{t('admin.radarAxes.team.noMembers')}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t('admin.radarAxes.team.countLabel', { count: teamMembers.length })}
            </p>
            {teamMembers.length === 0 ? (
              <div className="flex h-[200px] w-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
                <Users className="size-8 opacity-40" />
                <p className="mt-2 px-2 text-center text-xs">{t('admin.radarAxes.team.empty')}</p>
              </div>
            ) : axes.length >= 3 ? (
              <SkillRadarChart
                axes={axes}
                skillLevels={teamRadarValues.map((v) => ({ skill: v.skill, level: v.value }))}
                size={200}
              />
            ) : (
              <div className="flex h-[200px] w-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
                <Radar className="size-8 opacity-40" />
                <p className="mt-2 text-xs">{t('admin.radarAxes.needThreeAxes')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
