'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { ja } from './ja'
import { en } from './en'
import type { TaskStatus } from '../types'

// 新しい言語を追加するときは: 1) この配列に追記 2) 対応する辞書ファイル
// （xx.ts）を作り `satisfies Record<keyof typeof ja, string>` で型チェック
// 3) 下の DICTS に登録する。これ以外の変更は不要 — UI側は t() だけを使う。
export type Locale = 'ja' | 'en'

export const SUPPORTED_LOCALES: { code: Locale; label: string }[] = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
]

export const DEFAULT_LOCALE: Locale = 'ja'

export type TranslationKey = keyof typeof ja

const DICTS: Record<Locale, Record<TranslationKey, string>> = { ja, en }

const LOCALE_STORAGE_KEY = 'orbit-locale'

// TaskStatus（内部enum、GAS/シートにもこのまま保存される）から翻訳キーへの
// マッピング。types.ts の STATUS_LABEL（日本語固定）と役割が重複するが、
// STATUS_LABEL はExcel出力など「常に日本語で残したい」箇所向けに残し、
// UI表示は段階的にこちら（t(STATUS_KEY[s])）へ移行する。
export const STATUS_KEY: Record<TaskStatus, TranslationKey> = {
  todo: 'status.todo',
  progress: 'status.progress',
  support: 'status.support',
  review: 'status.review',
  fix: 'status.fix',
  done: 'status.done',
}

function isLocale(v: string | null): v is Locale {
  return v === 'ja' || v === 'en'
}

interface I18nValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)

  // hydrate from localStorage once (browser-only setting; server login
  // profiles keep their own timezone separately, see lib/orbit/timezone.ts)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY)
      if (isLocale(saved)) setLocaleState(saved)
    } catch {
      /* ignore */
    }
  }, [])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, l)
    } catch {
      /* ignore */
    }
  }, [])

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      let str = DICTS[locale][key] ?? DICTS[DEFAULT_LOCALE][key] ?? key
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
        }
      }
      return str
    },
    [locale],
  )

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
