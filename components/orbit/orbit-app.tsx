'use client'

import { useEffect } from 'react'
import { OrbitProvider, useOrbit } from '@/lib/orbit/store'
import { NavProvider, useNav } from '@/lib/orbit/nav'
import { ThemeProvider } from '@/lib/orbit/theme'
import { I18nProvider } from '@/lib/orbit/i18n'
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
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <OrbitMark size={30} />
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="relative flex size-3">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/40" />
          <span className="relative inline-flex size-3 rounded-full bg-primary" />
        </span>
        データを読み込んでいます…
      </div>
    </main>
  )
}

// shown when that same fetch has failed outright, instead of silently
// falling back to the login screen (which would look like a sign-out)
function RemoteLoadErrorScreen({ message }: { message: string | null }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <OrbitMark size={30} />
      <div className="flex items-center gap-1.5 text-sm font-medium text-destructive">
        <TriangleAlert className="size-4 shrink-0" />
        スプレッドシートとの同期に失敗しました
      </div>
      {message && <p className="max-w-sm text-xs text-muted-foreground">{message}</p>}
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary"
      >
        再読み込み
      </button>
    </main>
  )
}

// lives inside ToastProvider so it can surface store-level events that
// don't have a specific screen to render into (skill auto-certification)
function SkillCertifiedWatcher() {
  const { skillCertifiedEvent, clearSkillCertifiedEvent } = useOrbit()
  const toast = useToast()

  useEffect(() => {
    if (!skillCertifiedEvent) return
    toast(`${skillCertifiedEvent.memberName} さんのスキルに「${skillCertifiedEvent.skill}」が認定されました`)
    clearSkillCertifiedEvent()
  }, [skillCertifiedEvent, clearSkillCertifiedEvent, toast])

  return null
}

function Router() {
  const { currentUser, currentUserId, needsOnboarding, remoteEnabled, remoteStatus, remoteError, dataReady } =
    useOrbit()
  const { screen } = useNav()
  const { openTaskId, closeTask } = useTaskDrawer()

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
          スプレッドシートとの同期に失敗しました。表示中のデータが最新でない可能性があります。
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
