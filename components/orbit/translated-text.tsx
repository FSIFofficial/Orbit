'use client'

import { useI18n } from '@/lib/orbit/i18n'
import { useAutoTranslate } from '@/lib/orbit/translate'

// タスク名・プロジェクト名など自由入力テキストを表示言語に自動翻訳する
// ラッパー。map() ループの中で直接 useAutoTranslate（フック）を呼べない
// ため、1行1コンポーネントに分けて使う。
// 例: <TranslatedText text={task.name} /> の代わりに {task.name} と書いていた箇所を置き換える。
export function TranslatedText({ text, as: As = 'span' }: { text: string; as?: 'span' | 'td' }) {
  const { locale } = useI18n()
  const translated = useAutoTranslate(text, locale)
  return <As>{translated}</As>
}
