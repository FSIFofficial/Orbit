'use client'

import { useMemo, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { ArrowLeft, Video, FileText, Link2, BookOpen, GraduationCap, Layers, ChevronRight } from 'lucide-react'
import type { LearningContent, LearningCourse } from '@/lib/orbit/types'
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

function ContentCard({
  content,
  quizTitle,
  onTakeQuiz,
}: {
  content: LearningContent
  quizTitle?: string
  onTakeQuiz?: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        {CONTENT_TYPE_ICON[content.contentType]}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{content.title}</h2>
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
              {t(CONTENT_TYPE_KEY[content.contentType])}
            </span>
            {content.relatedSkill && (
              <span className="rounded-md bg-primary-muted px-1.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
                {content.relatedSkill}
              </span>
            )}
          </div>
          {content.description && (
            <p className="mt-1.5 text-xs text-muted-foreground">{content.description}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={content.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-secondary"
            >
              {t('learningContent.open')}
            </a>
            {quizTitle && onTakeQuiz && (
              <button
                onClick={onTakeQuiz}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-primary hover:bg-secondary"
              >
                <GraduationCap className="size-3.5" />
                {t('learningContent.takeRelatedQuiz', { title: quizTitle })}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// LRN-001/LRN-002: 学習コンテンツのメンバー向け閲覧画面。管理画面
// (admin-learning-content.tsx)で登録された学習コンテンツを一覧表示する。
// LRN-002: コースにまとめられた資料はコース単位でも表示できるようにし、
// どのコースにも属さない単発資料は従来通り一覧表示する。
export function LearningContentScreen() {
  const { learningContents, learningCourses, quizDefinitions, currentUser } = useOrbit()
  const { go } = useNav()
  const { t } = useI18n()
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)

  const contentById = useMemo(() => new Map(learningContents.map((c) => [c.id, c])), [learningContents])
  const contentIdsInCourses = useMemo(
    () => new Set(learningCourses.flatMap((c) => c.contentIds)),
    [learningCourses],
  )
  const standaloneContents = useMemo(
    () => learningContents.filter((c) => !contentIdsInCourses.has(c.id)),
    [learningContents, contentIdsInCourses],
  )

  const selectedCourse: LearningCourse | undefined = learningCourses.find((c) => c.id === selectedCourseId)

  const takeQuiz = () => {
    if (currentUser) go({ name: 'person', id: currentUser.id })
  }

  if (selectedCourse) {
    const quiz = selectedCourse.relatedQuizId ? quizDefinitions.find((q) => q.id === selectedCourse.relatedQuizId) : undefined
    const courseContents = selectedCourse.contentIds
      .map((id) => contentById.get(id))
      .filter((c): c is LearningContent => !!c)
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <button
          onClick={() => setSelectedCourseId(null)}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t('learningContent.course.back')}
        </button>

        <h1 className="text-xl font-semibold tracking-tight">{selectedCourse.title}</h1>
        {selectedCourse.description && (
          <p className="mt-1 text-sm text-muted-foreground">{selectedCourse.description}</p>
        )}
        {quiz && currentUser && (
          <button
            onClick={takeQuiz}
            className="mt-3 inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-primary hover:bg-secondary"
          >
            <GraduationCap className="size-3.5" />
            {t('learningContent.takeRelatedQuiz', { title: quiz.title })}
          </button>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {courseContents.map((content, i) => (
            <div key={content.id} className="flex items-start gap-3">
              <span className="mt-4 flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <ContentCard content={content} />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <button
        onClick={() => go({ name: 'output' })}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('survey.back')}
      </button>

      <h1 className="text-xl font-semibold tracking-tight">{t('learningContent.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('learningContent.desc')}</p>

      {learningCourses.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xs font-semibold text-muted-foreground">{t('learningContent.course.sectionTitle')}</h2>
          <div className="mt-2 flex flex-col gap-2">
            {learningCourses.map((course) => (
              <button
                key={course.id}
                onClick={() => setSelectedCourseId(course.id)}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-secondary/50"
              >
                <Layers className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold">{course.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t('admin.learningCourse.contentsCount', { count: course.contentIds.length })}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}

      {learningCourses.length > 0 && standaloneContents.length > 0 && (
        <h2 className="mb-2 mt-6 text-xs font-semibold text-muted-foreground">{t('learningContent.course.standaloneSectionTitle')}</h2>
      )}

      {standaloneContents.length === 0 ? (
        learningCourses.length === 0 && (
          <div className="mt-8 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-muted-foreground">
            <BookOpen className="size-8 opacity-40" />
            <p className="text-sm">{t('learningContent.empty')}</p>
          </div>
        )
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {standaloneContents.map((content) => {
            const quiz = content.relatedQuizId ? quizDefinitions.find((q) => q.id === content.relatedQuizId) : undefined
            return (
              <ContentCard
                key={content.id}
                content={content}
                quizTitle={quiz?.title}
                onTakeQuiz={quiz && currentUser ? takeQuiz : undefined}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
