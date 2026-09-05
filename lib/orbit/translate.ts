'use client'

// タスク名・説明などの自由入力テキストをUIの表示言語に自動翻訳する。
// GAS側の LanguageApp.translate()（無料、追加APIキー不要）を使うため、
// 呼び出し過多を避けるバッチング + 永続キャッシュが要。
//
// 設計:
// - 同じ text+targetLang の組は一度翻訳したら localStorage にキャッシュし、
//   二度と GAS を呼ばない（無料枠のクォータにも配慮）
// - 同じ描画タイミングで複数コンポーネントが要求した翻訳は、短い
//   デバウンス（80ms）で1回のGASリクエストにまとめてバッチ送信する
// - 初回表示は原文のまま返し、翻訳が届いたら該当コンポーネントだけ
//   再レンダリングする（progressive enhancement — 翻訳の遅延がUIをブロック
//   しない）
import { useEffect, useState } from 'react'
import { remoteApi, isRemoteConfigured } from './remote'

const CACHE_KEY = 'orbit-translate-cache'
type Cache = Record<string, string> // `${targetLang}::${text}` -> translated text

let memoryCache: Cache | null = null

function loadCache(): Cache {
  if (memoryCache) return memoryCache
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    memoryCache = raw ? (JSON.parse(raw) as Cache) : {}
  } catch {
    memoryCache = {}
  }
  return memoryCache
}

function saveCache(cache: Cache) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* ignore — cache is best-effort */
  }
}

// 同一タスク内で発生した複数の翻訳要求を1回のGASリクエストにまとめる
let pendingTexts = new Set<string>()
let pendingLang: string | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null
let pendingListeners: (() => void)[] = []

function scheduleFlush(lang: string) {
  pendingLang = lang
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    const texts = Array.from(pendingTexts)
    const lang2 = pendingLang
    const listeners = pendingListeners
    pendingTexts = new Set()
    pendingLang = null
    pendingListeners = []
    if (texts.length === 0 || !lang2) return
    remoteApi
      .translateTexts(texts, lang2)
      .then((results) => {
        const cache = loadCache()
        texts.forEach((text, i) => {
          cache[`${lang2}::${text}`] = results[i] ?? text
        })
        saveCache(cache)
        listeners.forEach((l) => l())
      })
      .catch(() => {
        // best-effort — 呼び出し元はキャッシュ未ヒットのまま原文を表示し続ける
      })
  }, 80)
}

// text をロケール locale 向けに自動翻訳して返す。locale が 'ja'（原文の
// 言語）のときや未リモート構成時は何もせず原文を返す。翻訳が届くまでは
// 原文を返し、届いた時点で再レンダリングされる。
export function useAutoTranslate(text: string, locale: string): string {
  const [, forceRerender] = useState(0)
  const shouldTranslate = isRemoteConfigured && locale !== 'ja' && !!text.trim()
  const cache = loadCache()
  const key = `${locale}::${text}`
  const cached = shouldTranslate ? cache[key] : undefined

  useEffect(() => {
    if (!shouldTranslate || cached !== undefined) return
    pendingTexts.add(text)
    pendingListeners.push(() => forceRerender((n) => n + 1))
    scheduleFlush(locale)
  }, [text, locale, shouldTranslate, cached])

  return shouldTranslate ? (cached ?? text) : text
}
