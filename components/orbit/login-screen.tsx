'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useOrbit } from '@/lib/orbit/store'
import { OrbitMark } from './primitives'
import { TriangleAlert } from 'lucide-react'
import {
  isGoogleOAuthConfigured,
  requestGoogleLoginToken,
  fetchGoogleUserInfo,
  setGasAuthToken,
} from '@/lib/orbit/google-sheet-sync'

export function LoginScreen() {
  const { login, members } = useOrbit()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const handleGoogle = async () => {
    setError(false)
    setLoginError(null)

    if (!isGoogleOAuthConfigured()) {
      setLoginError('Google OAuthが設定されていません。管理者にお問い合わせください。')
      return
    }

    setLoading(true)
    try {
      const token = await requestGoogleLoginToken()
      // Cache the token so every subsequent GAS write can include it
      // for server-side authentication without re-prompting the user.
      setGasAuthToken(token)
      const userInfo = await fetchGoogleUserInfo(token)
      const email = userInfo.email.toLowerCase()
      const matched = members.find((m) =>
        (m.email ?? '')
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .includes(email),
      )
      if (matched) {
        login(matched.id)
      } else {
        setLoginError(`${userInfo.email} はOrbitに登録されていません。`)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* subtle orbital accent */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <svg
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-border"
          width="760"
          height="760"
          viewBox="0 0 760 760"
          fill="none"
        >
          <ellipse cx="380" cy="380" rx="220" ry="120" stroke="currentColor" strokeWidth="1" transform="rotate(-24 380 380)" />
          <ellipse cx="380" cy="380" rx="330" ry="180" stroke="currentColor" strokeWidth="1" transform="rotate(-24 380 380)" opacity="0.6" />
        </svg>
      </div>

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center text-center">
        <div className="flex items-center gap-2">
          <OrbitMark size={30} />
          <span className="text-2xl font-semibold tracking-tight">Orbit</span>
        </div>
        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground text-balance">
          タスクを打ち上げ、組織を軌道に乗せる。
        </p>

        <div className="mt-9 w-full rounded-2xl border border-border bg-card p-6 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
          <Button
            size="lg"
            variant="outline"
            className="h-11 w-full border-border-strong text-[15px]"
            onClick={handleGoogle}
            disabled={loading}
          >
            <GoogleGlyph />
            {loading ? 'ログイン中…' : 'Googleでログイン'}
          </Button>

          {error && (
            <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-destructive">
              <TriangleAlert className="size-3.5" />
              ログインできませんでした。もう一度お試しください。
            </div>
          )}

          {loginError && (
            <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-destructive">
              <TriangleAlert className="size-3.5 shrink-0" />
              {loginError}
            </div>
          )}

          <p className="mt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Powered by Google
          </p>
        </div>
      </div>
    </main>
  )
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}
