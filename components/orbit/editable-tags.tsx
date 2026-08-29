'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'

export function EditableTags({
  tags,
  editable,
  onChange,
  emptyText,
  placeholder,
  variant = 'will',
  options = [],
  onNewOption,
}: {
  tags: string[]
  editable: boolean
  onChange: (next: string[]) => void
  emptyText: string
  placeholder: string
  variant?: 'will' | 'judgment'
  // existing option pool selectable via dropdown (e.g. store.skillOptions),
  // in addition to freely typing a new one
  options?: string[]
  onNewOption?: (value: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')
  const selectableOptions = options.filter((o) => !tags.includes(o))

  const commit = () => {
    const v = value.trim()
    if (v && !tags.includes(v)) {
      onChange([...tags, v])
      onNewOption?.(v)
    }
    setValue('')
    setAdding(false)
  }

  const chipCls =
    variant === 'judgment'
      ? 'bg-violet-50 text-violet-700 border-violet-200'
      : 'bg-primary-muted text-accent-foreground border-transparent'

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.length === 0 && !adding && (
        <span className="text-sm text-muted-foreground">{emptyText}</span>
      )}
      {tags.map((t) => (
        <span
          key={t}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium ${chipCls}`}
        >
          {t}
          {editable && (
            <button
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="opacity-60 hover:opacity-100"
              aria-label={`${t} を削除`}
            >
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
      {editable && selectableOptions.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            const v = e.target.value
            if (v) onChange([...tags, v])
          }}
          className="h-6 cursor-pointer rounded-md border border-dashed border-border-strong bg-transparent px-1.5 text-xs text-muted-foreground outline-none hover:border-border"
          aria-label="既存の選択肢から追加"
        >
          <option value="">選択して追加</option>
          {selectableOptions.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
      {editable &&
        (adding ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setValue('')
                setAdding(false)
              }
            }}
            placeholder={placeholder}
            className="h-6 w-32 rounded-md border border-primary bg-card px-1.5 text-xs outline-none"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-border-strong px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-secondary"
          >
            <Plus className="size-3" />
            追加
          </button>
        ))}
    </div>
  )
}
