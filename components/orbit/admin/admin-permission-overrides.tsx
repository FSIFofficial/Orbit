'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useToast } from '@/components/orbit/toast'
import { Modal } from '@/components/orbit/modal'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/orbit/primitives'
import { Trash2, Plus, ShieldCheck } from 'lucide-react'
import type { Member, PermissionOverride } from '@/lib/orbit/types'
import { DEPARTMENTS } from '@/lib/orbit/types'
import { useI18n, type TranslationKey } from '@/lib/orbit/i18n'

const ACCESS_LABEL_KEY: Record<string, TranslationKey> = {
  view: 'admin.permissionOverrides.access.view',
  edit: 'common.edit',
  approve: 'admin.permissionOverrides.access.approve',
}

const TARGET_TYPE_LABEL_KEY: Record<string, TranslationKey> = {
  task: 'admin.permissionOverrides.targetType.task',
  project: 'admin.permissionOverrides.targetType.project',
  department: 'admin.permissionOverrides.targetType.department',
  recruiting: 'admin.permissionOverrides.targetType.recruiting',
}

interface OverrideEditorProps {
  member: Member
  onClose: () => void
}

function OverrideEditor({ member, onClose }: OverrideEditorProps) {
  const { updatePermissionOverrides, visibleTasks: tasks, projects } = useOrbit()
  const toast = useToast()
  const { t: tr } = useI18n()

  const [overrides, setOverrides] = useState<PermissionOverride[]>(
    member.permissionOverrides ?? [],
  )
  const [targetType, setTargetType] = useState<PermissionOverride['targetType']>('task')
  const [targetId, setTargetId] = useState('')
  const [access, setAccess] = useState<PermissionOverride['access']>('edit')

  const remove = (i: number) => setOverrides((prev) => prev.filter((_, idx) => idx !== i))

  const add = () => {
    // recruiting はtargetIdでの絞り込みを行わない（'all'固定運用）ため、選択不要
    if (targetType !== 'recruiting' && !targetId.trim()) return
    const entry: PermissionOverride = {
      targetType,
      targetId: targetType === 'recruiting' ? 'all' : targetId.trim(),
      access,
    }
    // Avoid exact duplicate
    const already = overrides.some(
      (o) => o.targetType === entry.targetType && o.targetId === entry.targetId && o.access === entry.access,
    )
    if (!already) setOverrides((prev) => [...prev, entry])
    setTargetId('')
  }

  const save = () => {
    updatePermissionOverrides(member.id, overrides)
    toast(tr('admin.permissionOverrides.updatedToast', { name: member.displayName || member.name }))
    onClose()
  }

  const targetOptions =
    targetType === 'task'
      ? tasks.map((t) => ({ id: t.id, label: t.name }))
      : targetType === 'project'
        ? projects.map((p) => ({ id: p.id, label: p.name }))
        : targetType === 'department'
          ? DEPARTMENTS.map((d) => ({ id: d, label: d }))
          : []

  const labelFor = (ov: PermissionOverride) => {
    if (ov.targetType === 'task') return tasks.find((t) => t.id === ov.targetId)?.name ?? ov.targetId
    if (ov.targetType === 'project') return projects.find((p) => p.id === ov.targetId)?.name ?? ov.targetId
    if (ov.targetType === 'recruiting') return tr('admin.permissionOverrides.targetType.recruiting')
    return ov.targetId
  }

  return (
    <>
      {/* Current overrides */}
      <div className="mb-4">
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">{tr('admin.permissionOverrides.currentListLabel')}</div>
        {overrides.length === 0 ? (
          <p className="text-xs text-muted-foreground">{tr('admin.permissionOverrides.emptyList')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {overrides.map((ov, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs"
              >
                <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
                  {tr(TARGET_TYPE_LABEL_KEY[ov.targetType])}
                </span>
                <span className="min-w-0 flex-1 truncate">{labelFor(ov)}</span>
                <span className="shrink-0 text-muted-foreground">{tr(ACCESS_LABEL_KEY[ov.access])}</span>
                <button
                  onClick={() => remove(i)}
                  className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add new override */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">{tr('admin.permissionOverrides.addLabel')}</div>
        <div className="flex flex-wrap gap-2">
          <select
            value={targetType}
            onChange={(e) => {
              setTargetType(e.target.value as PermissionOverride['targetType'])
              setTargetId('')
            }}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          >
            {Object.entries(TARGET_TYPE_LABEL_KEY).map(([k, key]) => (
              <option key={k} value={k}>{tr(key)}</option>
            ))}
          </select>

          {targetType !== 'recruiting' && (
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
            >
              <option value="">{tr('admin.permissionOverrides.selectPlaceholder')}</option>
              {targetOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          )}

          <select
            value={access}
            onChange={(e) => setAccess(e.target.value as PermissionOverride['access'])}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          >
            {Object.entries(ACCESS_LABEL_KEY).map(([k, key]) => (
              <option key={k} value={k}>{tr(key)}</option>
            ))}
          </select>

          <button
            onClick={add}
            disabled={targetType !== 'recruiting' && !targetId}
            className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            <Plus className="size-3.5" />
            {tr('common.add')}
          </button>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>{tr('common.cancel')}</Button>
        <Button onClick={save}>{tr('common.save')}</Button>
      </div>
    </>
  )
}

interface Props {
  member: Member
}

export function PermissionOverridesButton({ member }: Props) {
  const [open, setOpen] = useState(false)
  const { t } = useI18n()

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={t('admin.permissionOverrides.buttonTitle')}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <ShieldCheck className="size-3.5" />
        {(member.permissionOverrides?.length ?? 0) > 0
          ? t('admin.permissionOverrides.countLabel', { count: member.permissionOverrides!.length })
          : t('admin.permissionOverrides.noneLabel')}
      </button>

      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="mb-4 flex items-center gap-3">
          <Avatar member={member} size={32} />
          <div>
            <div className="font-semibold">{member.displayName || member.name}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="size-3" />
              {t('admin.permissionOverrides.modalHeading')}
            </div>
          </div>
        </div>
        <OverrideEditor member={member} onClose={() => setOpen(false)} />
      </Modal>
    </>
  )
}
