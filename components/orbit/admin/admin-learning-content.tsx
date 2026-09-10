'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useToast } from '@/components/orbit/toast'
import { Modal } from '@/components/orbit/modal'
import { AdminAccessNote } from '@/components/orbit/primitives'
import { Button } from '@/components/ui/button'
import { EditableTags } from '@/components/orbit/editable-tags'
import { Plus, Pencil, Trash2, BookOpen, Video, FileText, Link2, Layers, ChevronUp, ChevronDown, X, Users } from 'lucide-react'
import type { LearningContent, LearningCourse, TrainingProgram } from '@/lib/orbit/types'
import { useI18n, type TranslationKey } from '@/lib/orbit/i18n'

const CONTENT_TYPE_KEY: Record<LearningContent['contentType'], TranslationKey> = {
  video: 'admin.learningContent.type.video',
  manual: 'admin.learningContent.type.manual',
  link: 'admin.learningContent.type.link',
  other: 'admin.learningContent.type.other',
}

const CONTENT_TYPE_ICON: Record<LearningContent['contentType'], React.ReactNode> = {
  video: <Video className="size-4 shrink-0 text-muted-foreground" />,
  manual: <FileText className="size-4 shrink-0 text-muted-foreground" />,
  link: <Link2 className="size-4 shrink-0 text-muted-foreground" />,
  other: <BookOpen className="size-4 shrink-0 text-muted-foreground" />,
}

interface ContentEditorProps {
  initial: Partial<LearningContent>
  skillOptions: string[]
  quizDefinitions: { id: string; title: string }[]
  onSave: (content: LearningContent) => void
  onCancel: () => void
}

function ContentEditor({ initial, skillOptions, quizDefinitions, onSave, onCancel }: ContentEditorProps) {
  const { t } = useI18n()
  const [title, setTitle] = useState(initial.title ?? '')
  const [description, setDescription] = useState(initial.description ?? '')
  const [url, setUrl] = useState(initial.url ?? '')
  const [contentType, setContentType] = useState<LearningContent['contentType']>(initial.contentType ?? 'video')
  const [relatedSkill, setRelatedSkill] = useState(initial.relatedSkill ?? '')
  const [relatedQuizId, setRelatedQuizId] = useState(initial.relatedQuizId ?? '')

  const canSave = title.trim() && url.trim()

  const handleSave = () => {
    if (!canSave) return
    onSave({
      id: initial.id ?? `learn-${Math.random().toString(36).slice(2, 9)}`,
      title: title.trim(),
      description: description.trim() || undefined,
      url: url.trim(),
      contentType,
      relatedSkill: relatedSkill || undefined,
      relatedQuizId: relatedQuizId || undefined,
      createdAt: initial.createdAt ?? new Date().toISOString(),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.learningContent.editor.titleLabel')}</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('admin.learningContent.editor.titlePlaceholder')}
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.learningContent.editor.descriptionLabel')}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder={t('feedback.optional')}
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.learningContent.editor.urlLabel')}</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.learningContent.editor.contentTypeLabel')}</label>
          <select
            value={contentType}
            onChange={(e) => setContentType(e.target.value as LearningContent['contentType'])}
            className="h-9 w-full cursor-pointer rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          >
            {(['video', 'manual', 'link', 'other'] as const).map((ct) => (
              <option key={ct} value={ct}>{t(CONTENT_TYPE_KEY[ct])}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.learningContent.editor.relatedSkillLabel')}</label>
          <select
            value={relatedSkill}
            onChange={(e) => setRelatedSkill(e.target.value)}
            className="h-9 w-full cursor-pointer rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          >
            <option value="">{t('common.notSet')}</option>
            {skillOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.learningContent.editor.relatedQuizLabel')}</label>
          <select
            value={relatedQuizId}
            onChange={(e) => setRelatedQuizId(e.target.value)}
            className="h-9 w-full cursor-pointer rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          >
            <option value="">{t('common.notSet')}</option>
            {quizDefinitions.map((q) => (
              <option key={q.id} value={q.id}>{q.title}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button onClick={handleSave} disabled={!canSave}>{t('common.save')}</Button>
      </div>
    </div>
  )
}

interface CourseEditorProps {
  initial: Partial<LearningCourse>
  learningContents: LearningContent[]
  quizDefinitions: { id: string; title: string }[]
  onSave: (course: LearningCourse) => void
  onCancel: () => void
}

// LRN-002: コース = 既存のLearningContentを順序付きでまとめたもの。
// 新しい教材データは持たず、contentIds(参照+順序)だけを保持する。
function CourseEditor({ initial, learningContents, quizDefinitions, onSave, onCancel }: CourseEditorProps) {
  const { t } = useI18n()
  const [title, setTitle] = useState(initial.title ?? '')
  const [description, setDescription] = useState(initial.description ?? '')
  const [contentIds, setContentIds] = useState<string[]>(initial.contentIds ?? [])
  const [relatedQuizId, setRelatedQuizId] = useState(initial.relatedQuizId ?? '')

  const canSave = title.trim() && contentIds.length > 0
  const availableContents = learningContents.filter((c) => !contentIds.includes(c.id))
  const selectedContents = contentIds
    .map((id) => learningContents.find((c) => c.id === id))
    .filter((c): c is LearningContent => !!c)

  const addContent = (id: string) => {
    if (!id || contentIds.includes(id)) return
    setContentIds([...contentIds, id])
  }
  const removeContent = (id: string) => setContentIds(contentIds.filter((c) => c !== id))
  const moveContent = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= contentIds.length) return
    const next = [...contentIds]
    ;[next[index], next[target]] = [next[target], next[index]]
    setContentIds(next)
  }

  const handleSave = () => {
    if (!canSave) return
    onSave({
      id: initial.id ?? `course-${Math.random().toString(36).slice(2, 9)}`,
      title: title.trim(),
      description: description.trim() || undefined,
      contentIds,
      relatedQuizId: relatedQuizId || undefined,
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.learningCourse.editor.titleLabel')}</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('admin.learningCourse.editor.titlePlaceholder')}
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.learningContent.editor.descriptionLabel')}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder={t('feedback.optional')}
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.learningCourse.editor.contentsLabel')}</label>
        {selectedContents.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('admin.learningCourse.editor.noContents')}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {selectedContents.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-xs">
                <span className="w-4 text-center text-muted-foreground">{i + 1}</span>
                <span className="flex-1 truncate font-medium">{c.title}</span>
                <button onClick={() => moveContent(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ChevronUp className="size-3.5" />
                </button>
                <button onClick={() => moveContent(i, 1)} disabled={i === selectedContents.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ChevronDown className="size-3.5" />
                </button>
                <button onClick={() => removeContent(c.id)} className="text-muted-foreground hover:text-destructive">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {availableContents.length > 0 && (
          <select
            value=""
            onChange={(e) => addContent(e.target.value)}
            className="mt-2 h-9 w-full cursor-pointer rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          >
            <option value="">{t('admin.learningCourse.editor.addContentPlaceholder')}</option>
            {availableContents.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.learningContent.editor.relatedQuizLabel')}</label>
        <select
          value={relatedQuizId}
          onChange={(e) => setRelatedQuizId(e.target.value)}
          className="h-9 w-full cursor-pointer rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
        >
          <option value="">{t('common.notSet')}</option>
          {quizDefinitions.map((q) => (
            <option key={q.id} value={q.id}>{q.title}</option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button onClick={handleSave} disabled={!canSave}>{t('common.save')}</Button>
      </div>
    </div>
  )
}

interface ProgramEditorProps {
  initial: Partial<TrainingProgram>
  segmentOptions: string[]
  onSave: (program: TrainingProgram) => void
  onCancel: () => void
}

// LRN-006: 研修プログラム = 対象層(targetSegments)を区分できる研修の定義。
// targetSegmentsが空なら全員対象(career-tab.tsxの絞り込みロジック参照)。
function ProgramEditor({ initial, segmentOptions, onSave, onCancel }: ProgramEditorProps) {
  const { t } = useI18n()
  const [name, setName] = useState(initial.name ?? '')
  const [description, setDescription] = useState(initial.description ?? '')
  const [targetSegments, setTargetSegments] = useState<string[]>(initial.targetSegments ?? [])

  const canSave = name.trim()

  const handleSave = () => {
    if (!canSave) return
    onSave({
      id: initial.id ?? `program-${Math.random().toString(36).slice(2, 9)}`,
      name: name.trim(),
      description: description.trim() || undefined,
      targetSegments,
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.trainingProgram.editor.nameLabel')}</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('admin.trainingProgram.editor.namePlaceholder')}
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.learningContent.editor.descriptionLabel')}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder={t('feedback.optional')}
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('admin.trainingProgram.editor.segmentsLabel')}</label>
        <EditableTags
          tags={targetSegments}
          editable
          onChange={setTargetSegments}
          options={segmentOptions}
          emptyText={t('admin.trainingProgram.editor.segmentsEmpty')}
          placeholder={t('admin.trainingProgram.editor.segmentsPlaceholder')}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button onClick={handleSave} disabled={!canSave}>{t('common.save')}</Button>
      </div>
    </div>
  )
}

export function AdminLearningContent() {
  const {
    learningContents,
    updateLearningContents,
    learningCourses,
    updateLearningCourses,
    trainingPrograms,
    updateTrainingPrograms,
    skillOptions,
    quizDefinitions,
  } = useOrbit()
  const toast = useToast()
  const { t } = useI18n()
  const [tab, setTab] = useState<'contents' | 'courses' | 'programs'>('contents')
  const [editorTarget, setEditorTarget] = useState<Partial<LearningContent> | null>(null)
  const [courseEditorTarget, setCourseEditorTarget] = useState<Partial<LearningCourse> | null>(null)
  const [programEditorTarget, setProgramEditorTarget] = useState<Partial<TrainingProgram> | null>(null)

  const openNew = () => setEditorTarget({ title: '', url: '', contentType: 'video' })
  const openEdit = (content: LearningContent) => setEditorTarget(content)

  const handleSave = (content: LearningContent) => {
    const exists = learningContents.some((c) => c.id === content.id)
    const next = exists
      ? learningContents.map((c) => (c.id === content.id ? content : c))
      : [...learningContents, content]
    updateLearningContents(next)
    toast(exists ? t('admin.learningContent.updatedToast', { title: content.title }) : t('admin.learningContent.createdToast', { title: content.title }))
    setEditorTarget(null)
  }

  const remove = (id: string) => {
    const content = learningContents.find((c) => c.id === id)
    if (!content) return
    updateLearningContents(learningContents.filter((c) => c.id !== id))
    toast(t('admin.learningContent.deletedToast', { title: content.title }))
  }

  const openNewCourse = () => setCourseEditorTarget({ title: '', contentIds: [] })
  const openEditCourse = (course: LearningCourse) => setCourseEditorTarget(course)

  const handleSaveCourse = (course: LearningCourse) => {
    const exists = learningCourses.some((c) => c.id === course.id)
    const next = exists
      ? learningCourses.map((c) => (c.id === course.id ? course : c))
      : [...learningCourses, course]
    updateLearningCourses(next)
    toast(exists ? t('admin.learningCourse.updatedToast', { title: course.title }) : t('admin.learningCourse.createdToast', { title: course.title }))
    setCourseEditorTarget(null)
  }

  const removeCourse = (id: string) => {
    const course = learningCourses.find((c) => c.id === id)
    if (!course) return
    updateLearningCourses(learningCourses.filter((c) => c.id !== id))
    toast(t('admin.learningCourse.deletedToast', { title: course.title }))
  }

  // LRN-006: 既存プログラムで使われたタグをプールとして再利用できるようにする
  // (skillOptions等と同じ「使われたタグが選択肢に溜まっていく」設計)
  const segmentOptions = Array.from(new Set(trainingPrograms.flatMap((p) => p.targetSegments)))

  const openNewProgram = () => setProgramEditorTarget({ name: '', targetSegments: [] })
  const openEditProgram = (program: TrainingProgram) => setProgramEditorTarget(program)

  const handleSaveProgram = (program: TrainingProgram) => {
    const exists = trainingPrograms.some((p) => p.id === program.id)
    const next = exists
      ? trainingPrograms.map((p) => (p.id === program.id ? program : p))
      : [...trainingPrograms, program]
    updateTrainingPrograms(next)
    toast(exists ? t('admin.trainingProgram.updatedToast', { name: program.name }) : t('admin.trainingProgram.createdToast', { name: program.name }))
    setProgramEditorTarget(null)
  }

  const removeProgram = (id: string) => {
    const program = trainingPrograms.find((p) => p.id === id)
    if (!program) return
    updateTrainingPrograms(trainingPrograms.filter((p) => p.id !== id))
    toast(t('admin.trainingProgram.deletedToast', { name: program.name }))
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">{t('admin.learningContent.title')}</h2>
          <p className="text-xs text-muted-foreground">
            {t('admin.learningContent.subtitle')}
          </p>
          <AdminAccessNote level="fullAdmin" className="mt-1" />
        </div>
        <Button
          onClick={tab === 'contents' ? openNew : tab === 'courses' ? openNewCourse : openNewProgram}
          size="sm"
        >
          <Plus className="mr-1.5 size-4" />
          {tab === 'contents' ? t('admin.learningContent.create') : tab === 'courses' ? t('admin.learningCourse.create') : t('admin.trainingProgram.create')}
        </Button>
      </div>

      <div className="mb-4 flex gap-1 rounded-lg border border-border bg-secondary p-0.5" style={{ width: 'fit-content' }}>
        {(['contents', 'courses', 'programs'] as const).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`rounded-md px-3 py-1 text-sm transition-all ${
              tab === tb ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tb === 'contents' ? t('admin.learningContent.tab.contents') : tb === 'courses' ? t('admin.learningContent.tab.courses') : t('admin.learningContent.tab.programs')}
          </button>
        ))}
      </div>

      {tab === 'contents' && (learningContents.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-muted-foreground">
          <BookOpen className="size-8 opacity-40" />
          <p className="text-sm">{t('admin.learningContent.empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {learningContents.map((content) => {
            const quiz = content.relatedQuizId ? quizDefinitions.find((q) => q.id === content.relatedQuizId) : undefined
            return (
              <div
                key={content.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
              >
                {CONTENT_TYPE_ICON[content.contentType]}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{content.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {t(CONTENT_TYPE_KEY[content.contentType])}
                    {content.relatedSkill && ` / ${content.relatedSkill}`}
                    {quiz && ` / ${t('admin.learningContent.linkedQuizLabel', { title: quiz.title })}`}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => openEdit(content)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => remove(content.id)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {tab === 'courses' && (learningCourses.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-muted-foreground">
          <Layers className="size-8 opacity-40" />
          <p className="text-sm">{t('admin.learningCourse.empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {learningCourses.map((course) => {
            const quiz = course.relatedQuizId ? quizDefinitions.find((q) => q.id === course.relatedQuizId) : undefined
            return (
              <div
                key={course.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
              >
                <Layers className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{course.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {t('admin.learningCourse.contentsCount', { count: course.contentIds.length })}
                    {quiz && ` / ${t('admin.learningContent.linkedQuizLabel', { title: quiz.title })}`}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => openEditCourse(course)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => removeCourse(course.id)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {tab === 'programs' && (trainingPrograms.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-muted-foreground">
          <Users className="size-8 opacity-40" />
          <p className="text-sm">{t('admin.trainingProgram.empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {trainingPrograms.map((program) => (
            <div
              key={program.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <Users className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{program.name}</div>
                <div className="text-xs text-muted-foreground">
                  {program.targetSegments.length > 0
                    ? program.targetSegments.join(' / ')
                    : t('admin.trainingProgram.allMembers')}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => openEditProgram(program)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => removeProgram(program.id)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}

      <Modal open={!!editorTarget} onClose={() => setEditorTarget(null)}>
        <div className="mb-4">
          <h3 className="font-semibold">{editorTarget?.id ? t('admin.learningContent.editTitle') : t('admin.learningContent.create')}</h3>
        </div>
        {editorTarget && (
          <ContentEditor
            initial={editorTarget}
            skillOptions={skillOptions}
            quizDefinitions={quizDefinitions}
            onSave={handleSave}
            onCancel={() => setEditorTarget(null)}
          />
        )}
      </Modal>

      <Modal open={!!courseEditorTarget} onClose={() => setCourseEditorTarget(null)}>
        <div className="mb-4">
          <h3 className="font-semibold">{courseEditorTarget?.id ? t('admin.learningCourse.editTitle') : t('admin.learningCourse.create')}</h3>
        </div>
        {courseEditorTarget && (
          <CourseEditor
            initial={courseEditorTarget}
            learningContents={learningContents}
            quizDefinitions={quizDefinitions}
            onSave={handleSaveCourse}
            onCancel={() => setCourseEditorTarget(null)}
          />
        )}
      </Modal>

      <Modal open={!!programEditorTarget} onClose={() => setProgramEditorTarget(null)}>
        <div className="mb-4">
          <h3 className="font-semibold">{programEditorTarget?.id ? t('admin.trainingProgram.editTitle') : t('admin.trainingProgram.create')}</h3>
        </div>
        {programEditorTarget && (
          <ProgramEditor
            initial={programEditorTarget}
            segmentOptions={segmentOptions}
            onSave={handleSaveProgram}
            onCancel={() => setProgramEditorTarget(null)}
          />
        )}
      </Modal>
    </div>
  )
}
