'use client'

import { useMemo, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { useToast } from './toast'
import { Avatar } from './primitives'
import { Modal } from './modal'
import { Button } from '@/components/ui/button'
import { isAdminRole, type Member, type SkillLevel, type SkillLevelValue, type Task } from '@/lib/orbit/types'
import { ArrowLeft, Pencil, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/orbit/i18n'

function levelOf(member: Member, skill: string): SkillLevelValue | undefined {
  return member.skillLevels?.find((s) => s.skill === skill)?.level
}

// item 11: そのメンバーが担当中で未完了のタスクのうち、このスキルについて
// task.requiredSkillLevelsが現在のレベルを上回っているものの最大値を返す。
// 該当するタスクが無ければundefined（ハイライト対象外）。
function requiredLevelGap(member: Member, skill: string, tasks: Task[]): SkillLevelValue | undefined {
  const current = levelOf(member, skill) ?? 0
  let max: SkillLevelValue | undefined
  for (const t of tasks) {
    if (t.status === 'done' || !t.assigneeIds.includes(member.id)) continue
    const required = t.requiredSkillLevels?.[skill]
    if (required && required > current && (max === undefined || required > max)) {
      max = required
    }
  }
  return max
}

function setMemberSkillLevel(existing: SkillLevel[], skill: string, level: SkillLevelValue | null): SkillLevel[] {
  const next = existing.filter((s) => s.skill !== skill)
  if (level !== null) next.push({ skill, level, acquiredAt: new Date().toISOString() })
  return next
}

export function SkillGridScreen() {
  const { members, skillOptions, currentUser, visibleTasks, updateSkillLevels, bulkUpdateSkills } = useOrbit()
  const { go } = useNav()
  const toast = useToast()
  const { t } = useI18n()

  // isLeader相当 — 一般以外の全ロール。人材DB(admin-member-db.tsx)等と
  // 同じ判定基準（isAdminRole = role !== BASE_ROLE）を使う
  const isLeader = !!currentUser && isAdminRole(currentUser.role)

  const [editMode, setEditMode] = useState(false)
  const [approving, setApproving] = useState<{ member: Member; skill: string; level: SkillLevelValue } | null>(null)

  // 一般ロール: 自分の行のみ。それ以外の全ロール: 全メンバー分の行
  const rows = useMemo(() => {
    if (!currentUser) return []
    if (!isLeader) return members.filter((m) => m.id === currentUser.id)
    return members.filter((m) => !m.inactive)
  }, [members, currentUser, isLeader])

  const canEditRow = (member: Member) => (isLeader ? true : member.id === currentUser?.id)

  const commitLevel = (member: Member, skill: string, level: SkillLevelValue | null) => {
    if (isLeader) {
      if (level === null) {
        // bulkUpdateSkillsはレベル解除に対応していないため、本人分の配列を
        // 組み立ててupdateSkillLevelsで送る（既存パターンの範囲内）
        updateSkillLevels(member.id, setMemberSkillLevel(member.skillLevels ?? [], skill, null))
      } else {
        bulkUpdateSkills([{ memberId: member.id, skill, level }])
      }
    } else {
      updateSkillLevels(member.id, setMemberSkillLevel(member.skillLevels ?? [], skill, level))
    }
  }

  const confirmApproval = () => {
    if (!approving) return
    updateSkillLevels(
      approving.member.id,
      setMemberSkillLevel(approving.member.skillLevels ?? [], approving.skill, approving.level),
    )
    toast(
      t('skillGrid.approvedToast', {
        name: approving.member.displayName || approving.member.name,
        skill: approving.skill,
        level: approving.level,
      }),
    )
    setApproving(null)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <button
        onClick={() => go({ name: 'output' })}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('survey.back')}
      </button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('skillGrid.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('skillGrid.desc')}</p>
        </div>
        <Button variant={editMode ? 'default' : 'outline'} size="sm" onClick={() => setEditMode((v) => !v)}>
          <Pencil className="size-3.5" />
          {editMode ? t('skillGrid.editModeOn') : t('skillGrid.editModeOff')}
        </Button>
      </div>

      <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="inline-block size-2.5 rounded-full bg-amber-400" />
        {t('skillGrid.highlightLegend')}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="sticky left-0 z-10 min-w-[180px] bg-muted/40 px-3 py-2.5 text-left font-medium">
                {t('skillGrid.colMember')}
              </th>
              {skillOptions.map((skill) => (
                <th key={skill} className="min-w-[90px] px-2 py-2.5 text-center font-medium whitespace-nowrap">
                  {skill}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((member) => (
              <tr key={member.id}>
                <td className="sticky left-0 z-10 bg-card px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar member={member} size={26} />
                    <span className="truncate font-medium">{member.displayName || member.name}</span>
                  </div>
                </td>
                {skillOptions.map((skill) => {
                  const current = levelOf(member, skill)
                  const gap = requiredLevelGap(member, skill, visibleTasks)
                  const editableCell = editMode && canEditRow(member)
                  return (
                    <td key={skill} className="px-2 py-2 text-center">
                      {gap !== undefined ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (!isLeader) return
                            setApproving({ member, skill, level: gap })
                          }}
                          title={
                            isLeader
                              ? t('skillGrid.highlightTooltipAdmin', { level: gap })
                              : t('skillGrid.highlightTooltipSelf', { level: gap })
                          }
                          className={cn(
                            'inline-flex size-8 items-center justify-center rounded-md bg-amber-100 text-sm font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
                            isLeader ? 'cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-900/60' : 'cursor-default',
                          )}
                        >
                          {current ?? '—'}
                        </button>
                      ) : editableCell ? (
                        <select
                          value={current ?? ''}
                          onChange={(e) => {
                            const v = e.target.value
                            commitLevel(member, skill, v ? (Number(v) as SkillLevelValue) : null)
                          }}
                          className="h-8 w-14 cursor-pointer rounded-md border border-border bg-background text-center text-xs outline-none focus:border-primary"
                        >
                          <option value="">—</option>
                          {([1, 2, 3, 4, 5] as SkillLevelValue[]).map((lv) => (
                            <option key={lv} value={lv}>{lv}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-muted-foreground">{current ?? '—'}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={skillOptions.length + 1} className="py-8 text-center text-sm text-muted-foreground">
                  {t('skillGrid.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!approving} onClose={() => setApproving(null)}>
        <div className="flex items-center gap-2">
          <TriangleAlert className="size-4 shrink-0 text-amber-500" />
          <h2 className="text-base font-semibold">{t('skillGrid.approveModal.title')}</h2>
        </div>
        {approving && (
          <p className="mt-2 text-sm text-muted-foreground">
            {t('skillGrid.approveModal.desc', {
              name: approving.member.displayName || approving.member.name,
              skill: approving.skill,
              level: approving.level,
            })}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" className="h-9" onClick={() => setApproving(null)}>
            {t('common.cancel')}
          </Button>
          <Button className="h-9" onClick={confirmApproval}>
            {t('skillGrid.approveModal.confirm')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
