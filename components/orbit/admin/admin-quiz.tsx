'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useToast } from '@/components/orbit/toast'
import { Modal } from '@/components/orbit/modal'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, GraduationCap } from 'lucide-react'
import type { QuizDefinition, QuizQuestion, SkillLevelValue } from '@/lib/orbit/types'
import { useI18n, type TranslationKey } from '@/lib/orbit/i18n'

const LEVEL_KEY: Record<SkillLevelValue, TranslationKey> = {
  1: 'admin.quiz.level.1',
  2: 'admin.quiz.level.2',
  3: 'admin.quiz.level.3',
  4: 'admin.quiz.level.4',
  5: 'admin.quiz.level.5',
}

interface QuizEditorProps {
  initial: Partial<QuizDefinition>
  skillOptions: string[]
  onSave: (quiz: QuizDefinition) => void
  onCancel: () => void
}

function QuizEditor({ initial, skillOptions, onSave, onCancel }: QuizEditorProps) {
  const { t } = useI18n()
  const [title, setTitle] = useState(initial.title ?? '')
  const [targetSkill, setTargetSkill] = useState(initial.targetSkill ?? '')
  const [targetLevel, setTargetLevel] = useState<SkillLevelValue>(initial.targetLevel ?? 2)
  const [passRate, setPassRate] = useState(initial.passRate ?? 80)
  const [questions, setQuestions] = useState<QuizQuestion[]>(initial.questions ?? [])

  const addQuestion = () =>
    setQuestions((prev) => [
      ...prev,
      {
        id: `q-${Math.random().toString(36).slice(2, 8)}`,
        text: '',
        choices: ['', ''],
        correctIndex: 0,
      },
    ])

  const removeQuestion = (idx: number) =>
    setQuestions((prev) => prev.filter((_, i) => i !== idx))

  const updateQuestion = (idx: number, patch: Partial<QuizQuestion>) =>
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)))

  const updateChoice = (qIdx: number, cIdx: number, value: string) =>
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIdx
          ? { ...q, choices: q.choices.map((c, ci) => (ci === cIdx ? value : c)) }
          : q,
      ),
    )

  const addChoice = (qIdx: number) =>
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, choices: [...q.choices, ''] } : q)),
    )

  const removeChoice = (qIdx: number, cIdx: number) =>
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q
        const choices = q.choices.filter((_, ci) => ci !== cIdx)
        return {
          ...q,
          choices,
          correctIndex: q.correctIndex >= choices.length ? 0 : q.correctIndex,
        }
      }),
    )

  const canSave = title.trim() && targetSkill && questions.length > 0 &&
    questions.every((q) => q.text.trim() && q.choices.some((c) => c.trim()))

  const handleSave = () => {
    if (!canSave) return
    onSave({
      id: initial.id ?? `quiz-${Math.random().toString(36).slice(2, 9)}`,
      title: title.trim(),
      targetSkill,
      targetLevel,
      passRate,
      questions,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.quiz.editor.titleLabel')}</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('admin.quiz.editor.titlePlaceholder')}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.quiz.editor.targetSkillLabel')}</label>
          <select
            value={targetSkill}
            onChange={(e) => setTargetSkill(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          >
            <option value="">{t('admin.quiz.editor.selectPlaceholder')}</option>
            {skillOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.quiz.editor.targetLevelLabel')}</label>
          <select
            value={targetLevel}
            onChange={(e) => setTargetLevel(Number(e.target.value) as SkillLevelValue)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          >
            {([1, 2, 3, 4, 5] as SkillLevelValue[]).map((lv) => (
              <option key={lv} value={lv}>{t(LEVEL_KEY[lv])}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {t('admin.quiz.editor.passRateLabel', { rate: passRate })}
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={passRate}
            onChange={(e) => setPassRate(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{t('admin.quiz.editor.questionsCount', { count: questions.length })}</span>
          <button
            onClick={addQuestion}
            className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-3" /> {t('admin.quiz.editor.addQuestion')}
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {questions.map((q, qi) => (
            <div key={q.id} className="rounded-lg border border-border bg-secondary/30 p-3">
              <div className="mb-2 flex items-start gap-2">
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium">Q{qi + 1}</span>
                <input
                  value={q.text}
                  onChange={(e) => updateQuestion(qi, { text: e.target.value })}
                  placeholder={t('admin.quiz.editor.questionPlaceholder')}
                  className="h-7 flex-1 rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                />
                <button onClick={() => removeQuestion(qi)} className="shrink-0 text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {q.choices.map((c, ci) => (
                  <div key={ci} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${q.id}`}
                      checked={q.correctIndex === ci}
                      onChange={() => updateQuestion(qi, { correctIndex: ci })}
                      className="shrink-0"
                    />
                    <input
                      value={c}
                      onChange={(e) => updateChoice(qi, ci, e.target.value)}
                      placeholder={t('admin.quiz.editor.choicePlaceholder', { index: ci + 1 })}
                      className="h-6 flex-1 rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                    />
                    {q.choices.length > 2 && (
                      <button onClick={() => removeChoice(qi, ci)} className="shrink-0 text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => addChoice(qi)}
                  className="mt-1 self-start text-xs text-muted-foreground hover:text-foreground"
                >
                  {t('admin.quiz.editor.addChoice')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button onClick={handleSave} disabled={!canSave}>{t('common.save')}</Button>
      </div>
    </div>
  )
}

export function AdminQuiz() {
  const { quizDefinitions, updateQuizDefinitions, skillOptions } = useOrbit()
  const toast = useToast()
  const { t } = useI18n()
  const [editorTarget, setEditorTarget] = useState<Partial<QuizDefinition> | null>(null)

  const openNew = () =>
    setEditorTarget({ title: '', targetSkill: '', targetLevel: 2, passRate: 80, questions: [] })

  const openEdit = (quiz: QuizDefinition) => setEditorTarget(quiz)

  const handleSave = (quiz: QuizDefinition) => {
    const exists = quizDefinitions.some((q) => q.id === quiz.id)
    const next = exists
      ? quizDefinitions.map((q) => (q.id === quiz.id ? quiz : q))
      : [...quizDefinitions, quiz]
    updateQuizDefinitions(next)
    toast(exists ? t('admin.quiz.updatedToast', { title: quiz.title }) : t('admin.quiz.createdToast', { title: quiz.title }))
    setEditorTarget(null)
  }

  const remove = (id: string) => {
    const quiz = quizDefinitions.find((q) => q.id === id)
    if (!quiz) return
    updateQuizDefinitions(quizDefinitions.filter((q) => q.id !== id))
    toast(t('admin.quiz.deletedToast', { title: quiz.title }))
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">{t('admin.quiz.title')}</h2>
          <p className="text-xs text-muted-foreground">
            {t('admin.quiz.subtitle')}
          </p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="mr-1.5 size-4" /> {t('admin.quiz.create')}
        </Button>
      </div>

      {quizDefinitions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-muted-foreground">
          <GraduationCap className="size-8 opacity-40" />
          <p className="text-sm">{t('admin.quiz.empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {quizDefinitions.map((quiz) => (
            <div
              key={quiz.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <GraduationCap className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{quiz.title}</div>
                <div className="text-xs text-muted-foreground">
                  {quiz.targetSkill} → {t(LEVEL_KEY[quiz.targetLevel])} / {t('admin.quiz.meta', { passRate: quiz.passRate, count: quiz.questions.length })}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => openEdit(quiz)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => remove(quiz.id)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editorTarget} onClose={() => setEditorTarget(null)}>
        <div className="mb-4">
          <h3 className="font-semibold">{editorTarget?.id ? t('admin.quiz.editTitle') : t('admin.quiz.create')}</h3>
        </div>
        {editorTarget && (
          <QuizEditor
            initial={editorTarget}
            skillOptions={skillOptions}
            onSave={handleSave}
            onCancel={() => setEditorTarget(null)}
          />
        )}
      </Modal>
    </div>
  )
}
