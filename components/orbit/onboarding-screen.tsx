'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { Button } from '@/components/ui/button'
import { OrbitMark } from './primitives'
import { Plus, X } from 'lucide-react'
import { useI18n } from '@/lib/orbit/i18n'

export function OnboardingScreen() {
  const { currentUser, completeOnboarding, skipOnboarding } = useOrbit()
  const { t: tr } = useI18n()
  const [will, setWill] = useState<string[]>([])
  const [draft, setDraft] = useState('')

  const addTag = () => {
    const v = draft.trim()
    if (v && !will.includes(v)) setWill((prev) => [...prev, v])
    setDraft('')
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
        <div className="flex items-center gap-2">
          <OrbitMark size={26} />
          <span className="text-lg font-semibold tracking-tight">
            {tr('onboarding.welcome', { name: currentUser?.name ?? '' })}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {tr('onboarding.desc')}
        </p>

        <div className="mt-5">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">{tr('onboarding.willLabel')}</div>
          <div className="flex flex-wrap gap-1.5">
            {will.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary-muted px-1.5 py-0.5 text-xs font-medium text-accent-foreground"
              >
                {t}
                <button
                  onClick={() => setWill((prev) => prev.filter((x) => x !== t))}
                  className="opacity-60 hover:opacity-100"
                  aria-label={tr('onboarding.removeAria', { tag: t })}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag()
                }
              }}
              placeholder={tr('onboarding.addPlaceholder')}
              className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            <Button
              variant="outline"
              className="h-9 shrink-0 px-3"
              disabled={!draft.trim()}
              onClick={addTag}
            >
              <Plus className="size-4" />
              {tr('common.add')}
            </Button>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <button
            onClick={skipOnboarding}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {tr('onboarding.skip')}
          </button>
          <Button
            className="h-9 px-4"
            disabled={will.length === 0}
            onClick={() => completeOnboarding(will)}
          >
            {tr('onboarding.start')}
          </Button>
        </div>
      </div>
    </main>
  )
}
