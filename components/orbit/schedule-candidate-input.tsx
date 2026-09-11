'use client'

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useI18n } from '@/lib/orbit/i18n'
import type { ScheduleCandidate } from '@/lib/orbit/types'

function buildLabel(date: string, startTime: string, endTime: string, weekdayChars: string[]): string {
  if (!date) return ''
  const dt = new Date(`${date}T00:00:00`)
  if (Number.isNaN(dt.getTime())) return ''
  const datePart = `${dt.getMonth() + 1}/${dt.getDate()}(${weekdayChars[dt.getDay()]})`
  const timePart = startTime && endTime ? ` ${startTime}〜${endTime}` : startTime ? ` ${startTime}〜` : ''
  return `${datePart}${timePart}`
}

// 「調整さん」的な日付+開始/終了時刻の個別入力から日程調整の候補
// (ScheduleCandidate)を組み立てる共通UI。input-screen.tsx(ScheduleQuickAdd)
// とtask-detail-drawer.tsx(ScheduleSection)の両方から使う。自動生成した
// labelは自由記述として手動で上書きできる(完全に置き換えない)。
export function ScheduleCandidateInput({ onAdd }: { onAdd: (candidate: ScheduleCandidate) => void }) {
  const { t } = useI18n()
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [label, setLabel] = useState('')
  const [labelEdited, setLabelEdited] = useState(false)

  const weekdayChars = t('input.schedule.weekdayChars').split(',')

  // 日付/時刻が変わるたびラベルを自動更新する。ただしユーザーがラベルを
  // 手で編集した後は自動生成で上書きしない(手動編集を尊重する)
  useEffect(() => {
    if (labelEdited) return
    setLabel(buildLabel(date, startTime, endTime, weekdayChars))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, startTime, endTime])

  const invalidTimeRange = !!startTime && !!endTime && startTime >= endTime
  const canAdd = !!label.trim() && !invalidTimeRange

  const add = () => {
    if (!canAdd) return
    onAdd({
      id: `sc-${Math.random().toString(36).slice(2, 9)}`,
      label: label.trim(),
      date: date || undefined,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
    })
    setDate('')
    setStartTime('')
    setEndTime('')
    setLabel('')
    setLabelEdited(false)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="h-8 w-[5.5rem] rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        <span className="text-xs text-muted-foreground">〜</span>
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="h-8 w-[5.5rem] rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <input
          value={label}
          onChange={(e) => {
            setLabel(e.target.value)
            setLabelEdited(true)
          }}
          placeholder={t('input.schedule.labelPlaceholder')}
          className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={add}
          disabled={!canAdd}
          className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-dashed border-border-strong px-2.5 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-40"
        >
          <Plus className="size-3.5" />
          {t('common.add')}
        </button>
      </div>
      {invalidTimeRange && (
        <p className="text-[10px] text-destructive">{t('input.schedule.timeRangeError')}</p>
      )}
    </div>
  )
}
