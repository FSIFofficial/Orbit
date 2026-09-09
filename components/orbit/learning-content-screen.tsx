'use client'

import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { ArrowLeft, Video, FileText, Link2, BookOpen, GraduationCap } from 'lucide-react'
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

// LRN-001: 学習コンテンツのメンバー向け閲覧画面。管理画面
// (admin-learning-content.tsx)で登録された学習コンテンツを一覧表示する
export function LearningContentScreen() {
  const { learningContents, quizDefinitions, currentUser } = useOrbit()
  const { go } = useNav()
  const { t } = useI18n()

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

      {learningContents.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-muted-foreground">
          <BookOpen className="size-8 opacity-40" />
          <p className="text-sm">{t('learningContent.empty')}</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {learningContents.map((content) => {
            const quiz = content.relatedQuizId ? quizDefinitions.find((q) => q.id === content.relatedQuizId) : undefined
            return (
              <div key={content.id} className="rounded-xl border border-border bg-card p-4">
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
                      {quiz && currentUser && (
                        <button
                          onClick={() => go({ name: 'person', id: currentUser.id })}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-primary hover:bg-secondary"
                        >
                          <GraduationCap className="size-3.5" />
                          {t('learningContent.takeRelatedQuiz', { title: quiz.title })}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
