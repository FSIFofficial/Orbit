'use client'

import { useState } from 'react'
import { SectionLabel, Avatar } from '@/components/orbit/primitives'
import { EditableTags } from '@/components/orbit/editable-tags'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { X, Plus } from 'lucide-react'
import type {
  CareerHistoryEntry,
  Competency,
  DevelopmentPlanEntry,
  EvaluationRecord,
  Member,
  OneOnOneRecord,
  Qualification,
  SkillLevel,
  SkillLevelValue,
  TrainingRecord,
  TransferRecord,
} from '@/lib/orbit/types'

const LEVELS: SkillLevelValue[] = [1, 2, 3, 4, 5]

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <SectionLabel>{title}</SectionLabel>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      <div className="mt-3">{children}</div>
    </div>
  )
}

function EntryList({
  children,
  emptyText,
}: {
  children: React.ReactNode
  emptyText: string
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children
  const hasItems = Array.isArray(items) ? items.length > 0 : !!items
  if (!hasItems) return <p className="text-sm text-muted-foreground">{emptyText}</p>
  return <ul className="flex flex-col gap-1.5">{children}</ul>
}

function EntryRow({
  children,
  onRemove,
  editable,
}: {
  children: React.ReactNode
  onRemove: () => void
  editable: boolean
}) {
  return (
    <li className="flex items-start justify-between gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">{children}</div>
      {editable && (
        <button
          onClick={onRemove}
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="削除"
        >
          <X className="size-3.5" />
        </button>
      )}
    </li>
  )
}

const fieldClass =
  'h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary'

export function CareerTab({
  member,
  members,
  editable,
  editableAdminOnly,
  skillOptions,
  updateSearchProfile,
  updateCareerHistory,
  updateQualifications,
  updateEvaluationHistory,
  updateTransferHistory,
  updateSkillLevels,
  updateCompetencies,
  updateCareerGoals,
  updateTrainingHistory,
  notifyTrainingRequest,
  notifyTrainingDecision,
  updateDevelopmentPlan,
  updateOneOnOnes,
  currentUserId,
}: {
  member: Member
  members: Member[]
  // isSelf || isAdmin — for fields the member can report about themselves
  editable: boolean
  // isAdmin only — for org-managed records (evaluations, transfers, 1on1s)
  editableAdminOnly: boolean
  skillOptions: string[]
  updateSearchProfile: (
    id: string,
    p: { yearsOfExperience: number | null; hasManagementExperience: boolean; desiredAreas: string[] },
  ) => void
  updateCareerHistory: (id: string, entries: CareerHistoryEntry[]) => void
  updateQualifications: (id: string, entries: Qualification[]) => void
  updateEvaluationHistory: (id: string, entries: EvaluationRecord[]) => void
  updateTransferHistory: (id: string, entries: TransferRecord[]) => void
  updateSkillLevels: (id: string, levels: SkillLevel[]) => void
  updateCompetencies: (id: string, competencies: Competency[]) => void
  updateCareerGoals: (
    id: string,
    g: { careerAspiration: string; desiredFutureRole: string; careerPlan: string },
  ) => void
  updateTrainingHistory: (id: string, entries: TrainingRecord[]) => void
  notifyTrainingRequest: (memberId: string, trainingName: string) => void
  notifyTrainingDecision: (memberId: string, trainingName: string, approved: boolean) => void
  updateDevelopmentPlan: (id: string, entries: DevelopmentPlanEntry[]) => void
  updateOneOnOnes: (id: string, entries: OneOnOneRecord[]) => void
  currentUserId: string | null
}) {
  const rid = () => Math.random().toString(36).slice(2, 9)

  return (
    <div className="mt-5 flex flex-col gap-4">
      <SearchProfileSection member={member} editable={editable} onSave={updateSearchProfile} />
      <CareerGoalsSection member={member} editable={editable} onSave={updateCareerGoals} />
      <SkillLevelsSection
        member={member}
        editable={editable}
        skillOptions={skillOptions}
        onSave={updateSkillLevels}
      />
      <CompetenciesSection member={member} editable={editableAdminOnly} onSave={updateCompetencies} />
      <CareerHistorySection member={member} editable={editable} onSave={updateCareerHistory} rid={rid} />
      <QualificationsSection member={member} editable={editable} onSave={updateQualifications} rid={rid} />
      <TrainingHistorySection
        member={member}
        editable={editable}
        isAdmin={editableAdminOnly}
        onSave={updateTrainingHistory}
        onRequest={notifyTrainingRequest}
        onDecide={notifyTrainingDecision}
        rid={rid}
      />
      <DevelopmentPlanSection
        member={member}
        editable={editable}
        onSave={updateDevelopmentPlan}
        rid={rid}
      />
      <OneOnOnesSection
        member={member}
        members={members}
        editable={editableAdminOnly}
        onSave={updateOneOnOnes}
        rid={rid}
        currentUserId={currentUserId}
      />
      <EvaluationHistorySection
        member={member}
        editable={editableAdminOnly}
        onSave={updateEvaluationHistory}
        rid={rid}
        currentUserId={currentUserId}
      />
      <TransferHistorySection
        member={member}
        editable={editableAdminOnly}
        onSave={updateTransferHistory}
        rid={rid}
      />
    </div>
  )
}

function SearchProfileSection({
  member,
  editable,
  onSave,
}: {
  member: Member
  editable: boolean
  onSave: CareerTabProps['updateSearchProfile']
}) {
  return (
    <Section
      title="人材検索プロフィール"
      description="Admin → Membersの人材検索フィルタで使われます。"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">経験年数</span>
          <input
            type="number"
            min={0}
            disabled={!editable}
            defaultValue={member.yearsOfExperience ?? ''}
            onBlur={(e) =>
              onSave(member.id, {
                yearsOfExperience: e.target.value ? Number(e.target.value) : null,
                hasManagementExperience: !!member.hasManagementExperience,
                desiredAreas: member.desiredAreas ?? [],
              })
            }
            className={cn(fieldClass, 'w-20 disabled:opacity-50')}
          />
        </label>
        <label className="flex items-center gap-1.5 pt-5">
          <input
            type="checkbox"
            disabled={!editable}
            checked={!!member.hasManagementExperience}
            onChange={(e) =>
              onSave(member.id, {
                yearsOfExperience: member.yearsOfExperience ?? null,
                hasManagementExperience: e.target.checked,
                desiredAreas: member.desiredAreas ?? [],
              })
            }
            className="size-3.5 accent-primary disabled:opacity-50"
          />
          <span className="text-xs">管理職経験あり</span>
        </label>
      </div>
      <div className="mt-3">
        <span className="text-xs font-medium text-muted-foreground">成長したい領域</span>
        <div className="mt-1">
          <EditableTags
            tags={member.desiredAreas ?? []}
            editable={editable}
            onChange={(next) =>
              onSave(member.id, {
                yearsOfExperience: member.yearsOfExperience ?? null,
                hasManagementExperience: !!member.hasManagementExperience,
                desiredAreas: next,
              })
            }
            emptyText="未設定"
            placeholder="領域を追加"
          />
        </div>
      </div>
    </Section>
  )
}

function CareerGoalsSection({
  member,
  editable,
  onSave,
}: {
  member: Member
  editable: boolean
  onSave: CareerTabProps['updateCareerGoals']
}) {
  const save = (patch: Partial<{ careerAspiration: string; desiredFutureRole: string; careerPlan: string }>) =>
    onSave(member.id, {
      careerAspiration: member.careerAspiration ?? '',
      desiredFutureRole: member.desiredFutureRole ?? '',
      careerPlan: member.careerPlan ?? '',
      ...patch,
    })
  return (
    <Section title="キャリア目標">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">将来やりたいこと</span>
          <textarea
            disabled={!editable}
            defaultValue={member.careerAspiration ?? ''}
            onBlur={(e) => save({ careerAspiration: e.target.value })}
            rows={2}
            className="resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">目指したい役職・ポジション</span>
          <input
            disabled={!editable}
            defaultValue={member.desiredFutureRole ?? ''}
            onBlur={(e) => save({ desiredFutureRole: e.target.value })}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">キャリアプランのメモ</span>
          <textarea
            disabled={!editable}
            defaultValue={member.careerPlan ?? ''}
            onBlur={(e) => save({ careerPlan: e.target.value })}
            rows={2}
            className="resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-50"
          />
        </label>
      </div>
    </Section>
  )
}

function SkillLevelsSection({
  member,
  editable,
  skillOptions,
  onSave,
}: {
  member: Member
  editable: boolean
  skillOptions: string[]
  onSave: CareerTabProps['updateSkillLevels']
}) {
  const levels = member.skillLevels ?? []
  const [skill, setSkill] = useState('')
  // Lv.1を初期値に — 「やり始めたばかり」であって「何もできない」わけでは
  // ないので、まずは登録してみるハードルを下げる
  const [level, setLevel] = useState<SkillLevelValue>(1)
  const available = skillOptions.filter((s) => !levels.some((l) => l.skill === s))

  const add = () => {
    if (!skill) return
    onSave(member.id, [...levels, { skill, level }])
    setSkill('')
    setLevel(1)
  }

  return (
    <Section
      title="スキルレベル"
      description="各スキルの習熟度（1〜5）です。Lv.1は「何もできない」ではなく「やり始めたばかり」の意味です。タスクを完了するとLv.1で自動登録され、団体外の経験なども自分で追加できます。要求分野の認定は、ここに登録されたスキルの保有率で判定されます。"
    >
      <EntryList emptyText="まだ記録されていません">
        {levels.map((l) => (
          <EntryRow
            key={l.skill}
            editable={editable}
            onRemove={() => onSave(member.id, levels.filter((x) => x.skill !== l.skill))}
          >
            <span className="font-medium">{l.skill}</span>
            <span className="ml-2 text-xs text-muted-foreground">Lv.{l.level}</span>
          </EntryRow>
        ))}
      </EntryList>
      {editable && available.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <select value={skill} onChange={(e) => setSkill(e.target.value)} className={cn(fieldClass, 'cursor-pointer')}>
            <option value="">スキルを選択</option>
            {available.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={level}
            onChange={(e) => setLevel(Number(e.target.value) as SkillLevelValue)}
            className={cn(fieldClass, 'cursor-pointer')}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                Lv.{l}
              </option>
            ))}
          </select>
          <button
            onClick={add}
            disabled={!skill}
            className="flex size-8 items-center justify-center rounded-md border border-dashed border-border-strong text-muted-foreground hover:bg-secondary disabled:opacity-40"
            aria-label="追加"
          >
            <Plus className="size-4" />
          </button>
        </div>
      )}
    </Section>
  )
}

function CompetenciesSection({
  member,
  editable,
  onSave,
}: {
  member: Member
  editable: boolean
  onSave: CareerTabProps['updateCompetencies']
}) {
  const items = member.competencies ?? []
  const [name, setName] = useState('')
  const [level, setLevel] = useState<SkillLevelValue>(3)

  const add = () => {
    const n = name.trim()
    if (!n) return
    onSave(member.id, [...items, { name: n, level }])
    setName('')
    setLevel(3)
  }

  return (
    <Section title="コンピテンシー" description="役職に関連する評価項目です（管理者が設定）。">
      <EntryList emptyText="まだ記録されていません">
        {items.map((c, i) => (
          <EntryRow
            key={`${c.name}-${i}`}
            editable={editable}
            onRemove={() => onSave(member.id, items.filter((_, idx) => idx !== i))}
          >
            <span className="font-medium">{c.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">Lv.{c.level}</span>
          </EntryRow>
        ))}
      </EntryList>
      {editable && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="項目名"
            className={cn(fieldClass, 'flex-1')}
          />
          <select
            value={level}
            onChange={(e) => setLevel(Number(e.target.value) as SkillLevelValue)}
            className={cn(fieldClass, 'cursor-pointer')}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                Lv.{l}
              </option>
            ))}
          </select>
          <button
            onClick={add}
            disabled={!name.trim()}
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border-strong text-muted-foreground hover:bg-secondary disabled:opacity-40"
            aria-label="追加"
          >
            <Plus className="size-4" />
          </button>
        </div>
      )}
    </Section>
  )
}

function CareerHistorySection({
  member,
  editable,
  onSave,
  rid,
}: {
  member: Member
  editable: boolean
  onSave: CareerTabProps['updateCareerHistory']
  rid: () => string
}) {
  const items = member.careerHistory ?? []
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [affiliation, setAffiliation] = useState('')
  const [role, setRole] = useState('')

  const add = () => {
    if (!startDate || !affiliation.trim() || !role.trim()) return
    onSave(member.id, [
      ...items,
      { id: rid(), startDate, endDate: endDate || undefined, affiliation: affiliation.trim(), role: role.trim() },
    ])
    setStartDate('')
    setEndDate('')
    setAffiliation('')
    setRole('')
  }

  return (
    <Section title="経歴">
      <EntryList emptyText="まだ記録されていません">
        {items.map((c) => (
          <EntryRow key={c.id} editable={editable} onRemove={() => onSave(member.id, items.filter((x) => x.id !== c.id))}>
            <div className="font-medium">
              {c.affiliation}　<span className="text-muted-foreground">{c.role}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {c.startDate}〜{c.endDate ?? '現在'}
            </div>
          </EntryRow>
        ))}
      </EntryList>
      {editable && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={fieldClass} />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="現在まで" className={fieldClass} />
          <input value={affiliation} onChange={(e) => setAffiliation(e.target.value)} placeholder="所属" className={fieldClass} />
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="役割" className={fieldClass} />
          <button
            onClick={add}
            disabled={!startDate || !affiliation.trim() || !role.trim()}
            className="flex h-8 items-center justify-center gap-1 rounded-md border border-dashed border-border-strong text-xs text-muted-foreground hover:bg-secondary disabled:opacity-40"
          >
            <Plus className="size-3.5" />
            追加
          </button>
        </div>
      )}
    </Section>
  )
}

function QualificationsSection({
  member,
  editable,
  onSave,
  rid,
}: {
  member: Member
  editable: boolean
  onSave: CareerTabProps['updateQualifications']
  rid: () => string
}) {
  const items = member.qualifications ?? []
  const [name, setName] = useState('')
  const [acquiredDate, setAcquiredDate] = useState('')
  const [issuer, setIssuer] = useState('')

  const add = () => {
    const n = name.trim()
    if (!n) return
    onSave(member.id, [
      ...items,
      { id: rid(), name: n, acquiredDate: acquiredDate || undefined, issuer: issuer.trim() || undefined },
    ])
    setName('')
    setAcquiredDate('')
    setIssuer('')
  }

  return (
    <Section title="資格">
      <EntryList emptyText="まだ記録されていません">
        {items.map((q) => (
          <EntryRow key={q.id} editable={editable} onRemove={() => onSave(member.id, items.filter((x) => x.id !== q.id))}>
            <span className="font-medium">{q.name}</span>
            {(q.acquiredDate || q.issuer) && (
              <span className="ml-2 text-xs text-muted-foreground">
                {[q.acquiredDate, q.issuer].filter(Boolean).join(' / ')}
              </span>
            )}
          </EntryRow>
        ))}
      </EntryList>
      {editable && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="資格名" className={fieldClass} />
          <input type="date" value={acquiredDate} onChange={(e) => setAcquiredDate(e.target.value)} className={fieldClass} />
          <input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="発行元（任意）" className={fieldClass} />
          <button
            onClick={add}
            disabled={!name.trim()}
            className="flex h-8 items-center justify-center gap-1 rounded-md border border-dashed border-border-strong text-xs text-muted-foreground hover:bg-secondary disabled:opacity-40"
          >
            <Plus className="size-3.5" />
            追加
          </button>
        </div>
      )}
    </Section>
  )
}

const TRAINING_STATUS_BADGE: Record<
  NonNullable<TrainingRecord['status']>,
  { label: string; className: string }
> = {
  pending: { label: '承認待ち', className: 'bg-amber-50 text-amber-700' },
  approved: { label: '承認済み', className: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: '却下', className: 'bg-rose-50 text-rose-700' },
}

function TrainingHistorySection({
  member,
  editable,
  isAdmin,
  onSave,
  onRequest,
  onDecide,
  rid,
}: {
  member: Member
  editable: boolean
  isAdmin: boolean
  onSave: CareerTabProps['updateTrainingHistory']
  onRequest: CareerTabProps['notifyTrainingRequest']
  onDecide: CareerTabProps['notifyTrainingDecision']
  rid: () => string
}) {
  const items = member.trainingHistory ?? []
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [provider, setProvider] = useState('')

  // 管理者が直接記録する場合は即時「承認済み」、本人が申請する場合は
  // 「承認待ち」で作成され、管理者に通知が飛ぶ（研修申請の承認フロー）
  const add = () => {
    const n = name.trim()
    if (!n || !date) return
    const status: TrainingRecord['status'] = isAdmin ? 'approved' : 'pending'
    onSave(member.id, [
      ...items,
      { id: rid(), name: n, date, provider: provider.trim() || undefined, status },
    ])
    if (!isAdmin) onRequest(member.id, n)
    setName('')
    setDate('')
    setProvider('')
  }

  const decide = (t: TrainingRecord, approved: boolean) => {
    onSave(
      member.id,
      items.map((x) => (x.id === t.id ? { ...x, status: approved ? 'approved' : 'rejected' } : x)),
    )
    onDecide(member.id, t.name, approved)
  }

  return (
    <Section title="研修履歴" description={!isAdmin ? '申請すると管理者の承認後に確定します' : undefined}>
      <EntryList emptyText="まだ記録されていません">
        {items.map((t) => {
          const status = t.status ?? 'approved'
          const badge = TRAINING_STATUS_BADGE[status]
          return (
            <EntryRow key={t.id} editable={editable} onRemove={() => onSave(member.id, items.filter((x) => x.id !== t.id))}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{t.name}</span>
                <span className="text-xs text-muted-foreground">
                  {t.date}
                  {t.provider && ` / ${t.provider}`}
                </span>
                {status !== 'approved' && (
                  <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold', badge.className)}>
                    {badge.label}
                  </span>
                )}
                {isAdmin && status === 'pending' && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => decide(t, true)}
                      className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      承認
                    </button>
                    <button
                      onClick={() => decide(t, false)}
                      className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      却下
                    </button>
                  </div>
                )}
              </div>
            </EntryRow>
          )
        })}
      </EntryList>
      {editable && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="研修名" className={fieldClass} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
          <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="実施元（任意）" className={fieldClass} />
          <button
            onClick={add}
            disabled={!name.trim() || !date}
            className="flex h-8 items-center justify-center gap-1 rounded-md border border-dashed border-border-strong text-xs text-muted-foreground hover:bg-secondary disabled:opacity-40"
          >
            <Plus className="size-3.5" />
            {isAdmin ? '追加' : '申請'}
          </button>
        </div>
      )}
    </Section>
  )
}

const PLAN_STATUS_LABEL: Record<DevelopmentPlanEntry['status'], string> = {
  not_started: '未着手',
  in_progress: '進行中',
  done: '完了',
}

function DevelopmentPlanSection({
  member,
  editable,
  onSave,
  rid,
}: {
  member: Member
  editable: boolean
  onSave: CareerTabProps['updateDevelopmentPlan']
  rid: () => string
}) {
  const items = member.developmentPlan ?? []
  const [goal, setGoal] = useState('')
  const [targetDate, setTargetDate] = useState('')

  const add = () => {
    const g = goal.trim()
    if (!g) return
    onSave(member.id, [
      ...items,
      { id: rid(), goal: g, targetDate: targetDate || undefined, status: 'not_started' },
    ])
    setGoal('')
    setTargetDate('')
  }

  const cycleStatus = (entry: DevelopmentPlanEntry) => {
    const order: DevelopmentPlanEntry['status'][] = ['not_started', 'in_progress', 'done']
    const next = order[(order.indexOf(entry.status) + 1) % order.length]
    onSave(member.id, items.map((x) => (x.id === entry.id ? { ...x, status: next } : x)))
  }

  return (
    <Section title="育成計画">
      <EntryList emptyText="まだ記録されていません">
        {items.map((p) => (
          <EntryRow key={p.id} editable={editable} onRemove={() => onSave(member.id, items.filter((x) => x.id !== p.id))}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{p.goal}</span>
              {p.targetDate && <span className="text-xs text-muted-foreground">〜{p.targetDate}</span>}
              <button
                onClick={() => editable && cycleStatus(p)}
                disabled={!editable}
                className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-secondary/70 disabled:opacity-60"
              >
                {PLAN_STATUS_LABEL[p.status]}
              </button>
            </div>
          </EntryRow>
        ))}
      </EntryList>
      {editable && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="目標"
            className={cn(fieldClass, 'flex-1')}
          />
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={fieldClass} />
          <button
            onClick={add}
            disabled={!goal.trim()}
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border-strong text-muted-foreground hover:bg-secondary disabled:opacity-40"
            aria-label="追加"
          >
            <Plus className="size-4" />
          </button>
        </div>
      )}
    </Section>
  )
}

function OneOnOnesSection({
  member,
  members,
  editable,
  onSave,
  rid,
  currentUserId,
}: {
  member: Member
  members: Member[]
  editable: boolean
  onSave: CareerTabProps['updateOneOnOnes']
  rid: () => string
  currentUserId: string | null
}) {
  const items = member.oneOnOnes ?? []
  const [date, setDate] = useState('')
  const [withId, setWithId] = useState(currentUserId ?? '')
  const [notes, setNotes] = useState('')

  const add = () => {
    if (!date || !withId || !notes.trim()) return
    onSave(member.id, [...items, { id: rid(), date, withId, notes: notes.trim() }])
    setDate('')
    setNotes('')
  }

  return (
    <Section title="1on1記録">
      <EntryList emptyText="まだ記録されていません">
        {items
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((o) => {
            const withM = members.find((m) => m.id === o.withId)
            return (
              <EntryRow key={o.id} editable={editable} onRemove={() => onSave(member.id, items.filter((x) => x.id !== o.id))}>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {o.date}
                  {withM && (
                    <span className="flex items-center gap-1">
                      <Avatar member={withM} size={16} />
                      {withM.displayName || withM.name}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap">{o.notes}</p>
              </EntryRow>
            )
          })}
      </EntryList>
      {editable && (
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
            <select value={withId} onChange={(e) => setWithId(e.target.value)} className={cn(fieldClass, 'cursor-pointer flex-1')}>
              <option value="">相手を選択</option>
              {members
                .filter((m) => m.id !== member.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName || m.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="メモ"
              rows={2}
              className="flex-1 resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
            />
            <Button size="sm" className="h-8 shrink-0" disabled={!date || !withId || !notes.trim()} onClick={add}>
              追加
            </Button>
          </div>
        </div>
      )}
    </Section>
  )
}

function EvaluationHistorySection({
  member,
  editable,
  onSave,
  rid,
  currentUserId,
}: {
  member: Member
  editable: boolean
  onSave: CareerTabProps['updateEvaluationHistory']
  rid: () => string
  currentUserId: string | null
}) {
  const items = member.evaluationHistory ?? []
  const [date, setDate] = useState('')
  const [rating, setRating] = useState('')
  const [comment, setComment] = useState('')

  const add = () => {
    if (!date || !rating.trim() || !currentUserId) return
    onSave(member.id, [
      ...items,
      { id: rid(), date, evaluatorId: currentUserId, rating: rating.trim(), comment: comment.trim() || undefined },
    ])
    setDate('')
    setRating('')
    setComment('')
  }

  return (
    <Section title="評価履歴" description="管理者のみ編集できます。">
      <EntryList emptyText="まだ記録されていません">
        {items
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((e) => (
            <EntryRow key={e.id} editable={editable} onRemove={() => onSave(member.id, items.filter((x) => x.id !== e.id))}>
              <span className="font-medium">{e.rating}</span>
              <span className="ml-2 text-xs text-muted-foreground">{e.date}</span>
              {e.comment && <p className="mt-0.5 text-xs text-muted-foreground">{e.comment}</p>}
            </EntryRow>
          ))}
      </EntryList>
      {editable && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
          <input value={rating} onChange={(e) => setRating(e.target.value)} placeholder="評価" className={fieldClass} />
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="コメント（任意）" className={cn(fieldClass, 'sm:col-span-1')} />
          <button
            onClick={add}
            disabled={!date || !rating.trim()}
            className="flex h-8 items-center justify-center gap-1 rounded-md border border-dashed border-border-strong text-xs text-muted-foreground hover:bg-secondary disabled:opacity-40"
          >
            <Plus className="size-3.5" />
            追加
          </button>
        </div>
      )}
    </Section>
  )
}

function TransferHistorySection({
  member,
  editable,
  onSave,
  rid,
}: {
  member: Member
  editable: boolean
  onSave: CareerTabProps['updateTransferHistory']
  rid: () => string
}) {
  const items = member.transferHistory ?? []
  const [date, setDate] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')

  const add = () => {
    if (!date || !from.trim() || !to.trim()) return
    onSave(member.id, [
      ...items,
      { id: rid(), date, fromAffiliation: from.trim(), toAffiliation: to.trim(), reason: reason.trim() || undefined },
    ])
    setDate('')
    setFrom('')
    setTo('')
    setReason('')
  }

  return (
    <Section title="異動履歴" description="管理者のみ編集できます。">
      <EntryList emptyText="まだ記録されていません">
        {items
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((t) => (
            <EntryRow key={t.id} editable={editable} onRemove={() => onSave(member.id, items.filter((x) => x.id !== t.id))}>
              <span className="font-medium">
                {t.fromAffiliation} → {t.toAffiliation}
              </span>
              <span className="ml-2 text-xs text-muted-foreground">{t.date}</span>
              {t.reason && <p className="mt-0.5 text-xs text-muted-foreground">{t.reason}</p>}
            </EntryRow>
          ))}
      </EntryList>
      {editable && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
          <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="異動元" className={fieldClass} />
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="異動先" className={fieldClass} />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="理由（任意）" className={fieldClass} />
          <button
            onClick={add}
            disabled={!date || !from.trim() || !to.trim()}
            className="flex h-8 items-center justify-center gap-1 rounded-md border border-dashed border-border-strong text-xs text-muted-foreground hover:bg-secondary disabled:opacity-40"
          >
            <Plus className="size-3.5" />
            追加
          </button>
        </div>
      )}
    </Section>
  )
}

type CareerTabProps = Parameters<typeof CareerTab>[0]
