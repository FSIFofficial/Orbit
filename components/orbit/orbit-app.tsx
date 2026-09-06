'use client'

import { useEffect } from 'react'
import { OrbitProvider, useOrbit } from '@/lib/orbit/store'
import { NavProvider, useNav } from '@/lib/orbit/nav'
import { ThemeProvider } from '@/lib/orbit/theme'
import { I18nProvider, useI18n, SUPPORTED_LOCALES } from '@/lib/orbit/i18n'
import { TaskDrawerProvider, useTaskDrawer } from '@/lib/orbit/task-drawer'
import { ToastProvider, useToast } from './toast'
import { LoginScreen } from './login-screen'
import { OnboardingScreen } from './onboarding-screen'
import { Header } from './header'
import { InputScreen } from './input/input-screen'
import { OutputScreen } from './output/output-screen'
import { PersonDetail } from './people/person-detail'
import { ProjectDetail } from './projects/project-detail'
import { AdminScreen } from './admin/admin-screen'
import { FeedbackScreen } from './feedback-screen'
import { ActivityScreen } from './activity-screen'
import { DailyReportScreen } from './daily-report-screen'
import { SurveyScreen } from './survey-screen'
import { OrgSettingsScreen } from './org-settings-screen'
import { TaskDetailDrawer } from './output/task-detail-drawer'
import { OrbitMark } from './primitives'
import { TriangleAlert } from 'lucide-react'

// shown while a persisted session (currentUserId from localStorage) is
// waiting on the spreadsheet fetch to resolve who that is
function RemoteLoadingScreen() {
  const { t } = useI18n()
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <OrbitMark size={30} />
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="relative flex size-3">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/40" />
          <span className="relative inline-flex size-3 rounded-full bg-primary" />
        </span>
        {t('app.loading')}
      </div>
    </main>
  )
}

// shown when that same fetch has failed outright, instead of silently
// falling back to the login screen (which would look like a sign-out)
function RemoteLoadErrorScreen({ message }: { message: string | null }) {
  const { t } = useI18n()
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <OrbitMark size={30} />
      <div className="flex items-center gap-1.5 text-sm font-medium text-destructive">
        <TriangleAlert className="size-4 shrink-0" />
        {t('app.syncFailed')}
      </div>
      {message && <p className="max-w-sm text-xs text-muted-foreground">{message}</p>}
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary"
      >
        {t('common.reload')}
      </button>
    </main>
  )
}

// lives inside ToastProvider so it can surface store-level events that
// don't have a specific screen to render into (skill auto-certification)
function SkillCertifiedWatcher() {
  const { skillCertifiedEvent, clearSkillCertifiedEvent } = useOrbit()
  const toast = useToast()
  const { t } = useI18n()

  useEffect(() => {
    if (!skillCertifiedEvent) return
    toast(t('app.skillCertifiedToast', { name: skillCertifiedEvent.memberName, skill: skillCertifiedEvent.skill }))
    clearSkillCertifiedEvent()
  }, [skillCertifiedEvent, clearSkillCertifiedEvent, toast, t])

  return null
}

// currentUser.locale（スプレッドシート保存済みの言語設定）が分かった時点で
// I18nの表示言語に反映する。ブラウザのlocalStorage（ログイン前のデフォルト、
// 未ログイン状態でも機能する）より、ログイン後はこちらを優先する。
// 本人が言語を変更した場合は setMemberLocale が両方を更新するので
// ここでの上書きとは競合しない。
function LocaleSyncWatcher() {
  const { currentUser } = useOrbit()
  const { locale, setLocale } = useI18n()

  useEffect(() => {
    const saved = currentUser?.locale
    if (!saved || saved === locale) return
    if (!SUPPORTED_LOCALES.some((l) => l.code === saved)) return
    setLocale(saved as (typeof SUPPORTED_LOCALES)[number]['code'])
  }, [currentUser?.locale, locale, setLocale])

  return null
}

function Router() {
  const { currentUser, currentUserId, needsOnboarding, remoteEnabled, remoteStatus, remoteError, dataReady } =
    useOrbit()
  const { screen } = useNav()
  const { openTaskId, closeTask } = useTaskDrawer()
  const { t } = useI18n()

  if (!currentUser) {
    // currentUserId persists across reloads (localStorage), but resolving
    // it to a real member depends on the spreadsheet fetch. Without this
    // check, the gap between mount and fetch completion would show the
    // login screen even though the person is (or was) logged in — looking
    // like they got signed out, and worse, letting Admin screens briefly
    // compute permissions against no/stale data (see admin-screen.tsx).
    if (remoteEnabled && currentUserId && !dataReady) {
      return <RemoteLoadingScreen />
    }
    if (remoteEnabled && currentUserId && remoteStatus === 'error') {
      return <RemoteLoadErrorScreen message={remoteError} />
    }
    return <LoginScreen />
  }
  if (needsOnboarding) return <OnboardingScreen />

  return (
    <div className="min-h-screen bg-background">
      {remoteEnabled && remoteError && (
        <div className="flex items-center justify-center gap-1.5 bg-warning-muted px-4 py-1.5 text-center text-xs font-medium text-warning">
          <TriangleAlert className="size-3.5 shrink-0" />
          {t('app.syncFailedBanner')}
        </div>
      )}
      <Header />
      <div key={JSON.stringify(screen)} className="animate-in fade-in duration-200">
        {screen.name === 'input' && <InputScreen />}
        {screen.name === 'output' && <OutputScreen />}
        {screen.name === 'person' && <PersonDetail id={screen.id} />}
        {screen.name === 'project' && <ProjectDetail id={screen.id} />}
        {screen.name === 'admin' && <AdminScreen section={screen.section} />}
        {screen.name === 'feedback' && <FeedbackScreen />}
        {screen.name === 'activity' && <ActivityScreen />}
        {screen.name === 'dailyreport' && <DailyReportScreen />}
        {screen.name === 'survey' && <SurveyScreen />}
        {screen.name === 'org-settings' && <OrgSettingsScreen />}
      </div>
      <TaskDetailDrawer taskId={openTaskId} onClose={closeTask} />
    </div>
  )
}

export function OrbitApp() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <OrbitProvider>
          <ToastProvider>
            <SkillCertifiedWatcher />
            <LocaleSyncWatcher />
            <NavProvider>
              <TaskDrawerProvider>
                <Router />
              </TaskDrawerProvider>
            </NavProvider>
          </ToastProvider>
        </OrbitProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}
