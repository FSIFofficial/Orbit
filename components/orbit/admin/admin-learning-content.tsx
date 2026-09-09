'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useToast } from '@/components/orbit/toast'
import { Modal } from '@/components/orbit/modal'
import { AdminAccessNote } from '@/components/orbit/primitives'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, BookOpen, Video, FileText, Link2 } from 'lucide-react'
import type { LearningContent } from '@/lib/orbit/types'
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

export function AdminLearningContent() {
  const { learningContents, updateLearningContents, skillOptions, quizDefinitions } = useOrbit()
  const toast = useToast()
  const { t } = useI18n()
  const [editorTarget, setEditorTarget] = useState<Partial<LearningContent> | null>(null)

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
        <Button onClick={openNew} size="sm">
          <Plus className="mr-1.5 size-4" /> {t('admin.learningContent.create')}
        </Button>
      </div>

      {learningContents.length === 0 ? (
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
      )}

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
    </div>
  )
}
