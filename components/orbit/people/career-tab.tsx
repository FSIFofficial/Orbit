'use client'

import { useState } from 'react'
import { SectionLabel, Avatar } from '@/components/orbit/primitives'
import { EditableTags } from '@/components/orbit/editable-tags'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/orbit/modal'
import { SkillRadarChart } from '@/components/orbit/skill-radar-chart'
import { cn } from '@/lib/utils'
import { X, Plus, GraduationCap, CheckCircle2 } from 'lucide-react'
import type {
  CareerHistoryEntry,
  Competency,
  DevelopmentPlanEntry,
  EvaluationRecord,
  Member,
  OneOnOneRecord,
  Qualification,
  QuizDefinition,
  RadarAxis,
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
  oneOnOneQuestions,
  radarAxes,
  quizDefinitions,
  submitQuizResult,
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
  // item 20: 1on1ワークシート質問項目（admin-tagsで設定可能）
  oneOnOneQuestions?: string[]
  radarAxes?: RadarAxis[]
  quizDefinitions?: QuizDefinition[]
  submitQuizResult?: (quizId: string, memberId: string, answers: number[]) => Promise<{ passed: boolean; score: number }>
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
      <SkillTimelineSection member={member} />
      <SkillGrowthChart member={member} />
      {radarAxes && radarAxes.length >= 3 && (
        <Section title="スキルレーダーチャート" description="設定された軸ごとのスキルレベルを可視化します。">
          <div className="flex justify-center pt-2">
            <SkillRadarChart axes={radarAxes} skillLevels={member.skillLevels ?? []} size={220} />
          </div>
        </Section>
      )}
      {quizDefinitions && quizDefinitions.length > 0 && submitQuizResult && (
        <QuizSection
          member={member}
          quizDefinitions={quizDefinitions}
          submitQuizResult={submitQuizResult}
          editable={editable}
        />
      )}
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
        questions={oneOnOneQuestions}
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
    onSave(member.id, [...levels, { skill, level, acquiredAt: new Date().toISOString() }])
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

function QuizSection({
  member,
  quizDefinitions,
  submitQuizResult,
  editable,
}: {
  member: Member
  quizDefinitions: QuizDefinition[]
  submitQuizResult: (quizId: string, memberId: string, answers: number[]) => Promise<{ passed: boolean; score: number }>
  editable: boolean
}) {
  const [activeQuiz, setActiveQuiz] = useState<QuizDefinition | null>(null)
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<{ passed: boolean; score: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const currentLevel = (quiz: QuizDefinition) =>
    member.skillLevels?.find((sl) => sl.skill === quiz.targetSkill)?.level ?? 0

  const openQuiz = (quiz: QuizDefinition) => {
    setActiveQuiz(quiz)
    setAnswers(new Array(quiz.questions.length).fill(-1))
    setResult(null)
  }

  const handleSubmit = async () => {
    if (!activeQuiz) return
    setSubmitting(true)
    try {
      const r = await submitQuizResult(activeQuiz.id, member.id, answers)
      setResult(r)
    } finally {
      setSubmitting(false)
    }
  }

  const allAnswered = answers.length > 0 && answers.every((a) => a >= 0)

  return (
    <>
      <Section title="検定" description="合格するとスキルレベルが自動的に引き上がります。">
        {!editable ? (
          <p className="text-xs text-muted-foreground">本人のみ受験できます。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {quizDefinitions.map((quiz) => {
              const lv = currentLevel(quiz)
              const alreadyPassed = lv >= quiz.targetLevel
              return (
                <li key={quiz.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                  <GraduationCap className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm">{quiz.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {quiz.targetSkill} → Lv.{quiz.targetLevel} / {quiz.questions.length}問 / 合格 {quiz.passRate}%
                      {lv > 0 && <span className="ml-2">現在 Lv.{lv}</span>}
                    </div>
                  </div>
                  {alreadyPassed ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-600">
                      <CheckCircle2 className="size-3.5" /> 達成済み
                    </span>
                  ) : (
                    <button
                      onClick={() => openQuiz(quiz)}
                      className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      受験する
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Modal open={!!activeQuiz && !result} onClose={() => setActiveQuiz(null)}>
        {activeQuiz && (
          <>
            <h3 className="mb-3 font-semibold">{activeQuiz.title}</h3>
            <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto orbit-scroll pr-1">
              {activeQuiz.questions.map((q, qi) => (
                <div key={q.id}>
                  <p className="mb-2 text-sm font-medium">Q{qi + 1}. {q.text}</p>
                  <div className="flex flex-col gap-1">
                    {q.choices.map((c, ci) => (
                      <label key={ci} className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1 hover:bg-secondary text-sm">
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          checked={answers[qi] === ci}
                          onChange={() => setAnswers((prev) => prev.map((a, i) => i === qi ? ci : a))}
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setActiveQuiz(null)}>キャンセル</Button>
              <Button disabled={!allAnswered || submitting} onClick={handleSubmit}>
                {submitting ? '採点中…' : '提出する'}
              </Button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!result} onClose={() => { setResult(null); setActiveQuiz(null) }}>
        {result && activeQuiz && (
          <div className="flex flex-col items-center gap-3 py-4">
            {result.passed ? (
              <CheckCircle2 className="size-12 text-emerald-500" />
            ) : (
              <GraduationCap className="size-12 text-muted-foreground" />
            )}
            <h3 className="text-lg font-semibold">
              {result.passed ? '合格！' : '不合格'}
            </h3>
            <p className="text-sm text-muted-foreground">スコア: {result.score}% (合格ライン: {activeQuiz.passRate}%)</p>
            {result.passed && (
              <p className="text-sm font-medium text-emerald-600">
                {activeQuiz.targetSkill} が Lv.{activeQuiz.targetLevel} に引き上げられました。
              </p>
            )}
            <Button onClick={() => { setResult(null); setActiveQuiz(null) }} className="mt-2">
              閉じる
            </Button>
          </div>
        )}
      </Modal>
    </>
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
  questions,
}: {
  member: Member
  members: Member[]
  editable: boolean
  onSave: CareerTabProps['updateOneOnOnes']
  rid: () => string
  currentUserId: string | null
  questions?: string[]
}) {
  const items = member.oneOnOnes ?? []
  const [date, setDate] = useState('')
  const [withId, setWithId] = useState(currentUserId ?? '')
  // item 20: 質問項目ごとの回答を個別管理し、結合してnotesに保存
  const effectiveQuestions = questions && questions.length > 0 ? questions : null
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({})
  const [notes, setNotes] = useState('')

  const buildNotes = () => {
    if (effectiveQuestions) {
      return effectiveQuestions
        .map((q, i) => `【${q}】\n${questionAnswers[i] ?? ''}`)
        .join('\n\n')
    }
    return notes
  }

  const canAdd = date && withId && (
    effectiveQuestions
      ? effectiveQuestions.some((_, i) => (questionAnswers[i] ?? '').trim())
      : notes.trim()
  )

  const add = () => {
    if (!canAdd) return
    onSave(member.id, [...items, { id: rid(), date, withId, notes: buildNotes().trim() }])
    setDate('')
    setQuestionAnswers({})
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
                <p className="mt-0.5 whitespace-pre-wrap text-xs">{o.notes}</p>
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
          {effectiveQuestions ? (
            <div className="flex flex-col gap-2">
              {effectiveQuestions.map((q, i) => (
                <div key={i}>
                  <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">{q}</p>
                  <textarea
                    value={questionAnswers[i] ?? ''}
                    onChange={(e) => setQuestionAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                    rows={2}
                    className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
                  />
                </div>
              ))}
              <Button size="sm" className="h-8 self-end" disabled={!canAdd} onClick={add}>
                追加
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="メモ"
                rows={2}
                className="flex-1 resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
              />
              <Button size="sm" className="h-8 shrink-0" disabled={!canAdd} onClick={add}>
                追加
              </Button>
            </div>
          )}
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

const LEVEL_COLORS = ['', '#94a3b8', '#60a5fa', '#34d399', '#f59e0b', '#f43f5e'] // index 1-5

function SkillTimelineSection({ member }: { member: Member }) {
  const levels = (member.skillLevels ?? []).filter((l) => l.acquiredAt)
  if (levels.length === 0) return null
  const sorted = [...levels].sort((a, b) => (a.acquiredAt ?? '').localeCompare(b.acquiredAt ?? ''))
  const firstDate = new Date(sorted[0].acquiredAt!).getTime()
  const lastDate = Math.max(Date.now(), new Date(sorted[sorted.length - 1].acquiredAt!).getTime())
  const range = lastDate - firstDate || 1
  const fmt = (iso: string) => iso.slice(0, 10)

  return (
    <Section title="スキル取得タイムライン" description="acquiredAt が記録されているスキルを時系列で表示します。新規追加分から記録されます。">
      <div className="relative mt-2 pl-2">
        <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
        {sorted.map((l) => {
          const pct = Math.round(((new Date(l.acquiredAt!).getTime() - firstDate) / range) * 100)
          return (
            <div key={l.skill} className="relative mb-3 flex items-start gap-2 pl-5">
              <div
                className="absolute left-[5px] top-1.5 size-2 rounded-full border-2 border-background"
                style={{ backgroundColor: LEVEL_COLORS[l.level] }}
              />
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium">{l.skill}</span>
                <span className="text-xs" style={{ color: LEVEL_COLORS[l.level] }}>Lv.{l.level}</span>
                <span className="text-xs text-muted-foreground">{fmt(l.acquiredAt!)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// SVGベースの累積スキル習得数折れ線グラフ。acquiredAt が1件もなければ非表示。
function SkillGrowthChart({ member }: { member: Member }) {
  const levels = (member.skillLevels ?? []).filter((l) => l.acquiredAt)
  if (levels.length === 0) return null

  const sorted = [...levels].sort((a, b) => (a.acquiredAt ?? '').localeCompare(b.acquiredAt ?? ''))

  // 累積取得数の時系列ポイントを生成（同日複数取得はまとめて加算）
  const points: { date: string; count: number }[] = []
  let cumulative = 0
  for (const l of sorted) {
    cumulative++
    const dateStr = (l.acquiredAt ?? '').slice(0, 10)
    if (points.length > 0 && points[points.length - 1].date === dateStr) {
      points[points.length - 1].count = cumulative
    } else {
      points.push({ date: dateStr, count: cumulative })
    }
  }

  const W = 480
  const H = 120
  const PAD = { top: 10, right: 16, bottom: 28, left: 32 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const minTs = new Date(points[0].date).getTime()
  const maxTs = new Date(points[points.length - 1].date).getTime()
  const tsRange = maxTs - minTs || 1
  const maxCount = points[points.length - 1].count

  const toX = (ts: number) => PAD.left + ((ts - minTs) / tsRange) * chartW
  const toY = (c: number) => PAD.top + chartH - (c / maxCount) * chartH

  const polyline = points
    .map((p) => `${toX(new Date(p.date).getTime())},${toY(p.count)}`)
    .join(' ')

  // X軸ラベル: 最大5点
  const step = Math.max(1, Math.floor(points.length / 4))
  const xLabels = points.filter((_, i) => i === 0 || i === points.length - 1 || i % step === 0)

  return (
    <Section title="スキル習得推移" description="累積取得スキル数の折れ線グラフです。">
      <div className="mt-2 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-lg" style={{ minWidth: 240 }}>
          {/* Y軸グリッド */}
          {[0, 0.25, 0.5, 0.75, 1].map((r) => {
            const y = PAD.top + chartH * (1 - r)
            const v = Math.round(maxCount * r)
            return (
              <g key={r}>
                <line x1={PAD.left} x2={PAD.left + chartW} y1={y} y2={y} stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} />
                <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.45}>{v}</text>
              </g>
            )
          })}
          {/* 折れ線 */}
          <polyline points={polyline} fill="none" stroke="#60a5fa" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {/* ドット */}
          {points.map((p) => (
            <circle
              key={p.date}
              cx={toX(new Date(p.date).getTime())}
              cy={toY(p.count)}
              r={3}
              fill="#60a5fa"
            />
          ))}
          {/* X軸ラベル */}
          {xLabels.map((p) => (
            <text
              key={p.date}
              x={toX(new Date(p.date).getTime())}
              y={H - 6}
              textAnchor="middle"
              fontSize={8}
              fill="currentColor"
              fillOpacity={0.5}
            >
              {p.date.slice(0, 7)}
            </text>
          ))}
        </svg>
      </div>
    </Section>
  )
}
