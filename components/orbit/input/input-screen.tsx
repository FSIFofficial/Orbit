'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { useToast } from '../toast'
import { Modal } from '../modal'
import { buildDemoParse, DEMO_INPUT } from '@/lib/orbit/seed'
import { DEPARTMENTS, DIFFICULTY_LABEL, PRIORITIES } from '@/lib/orbit/types'
import type {
  ParsedTask,
  Department,
  Difficulty,
  FormFieldDef,
  FormFieldType,
  Member,
  Priority,
  Project,
  ScheduleCandidate,
  TaskInput,
  TaskSetTemplate,
} from '@/lib/orbit/types'
import { ParsedTaskCard } from './parsed-task-card'
import { ExcelColumnMapping } from './excel-column-mapping'
import { Avatar, OrbitMark, SectionLabel, StatusBadge } from '../primitives'
import { formatDateTime, findSimilarTasks } from '@/lib/orbit/utils'
import { buildParsedTasks, detectColumns, readExcelFile } from '@/lib/orbit/import-excel'
import type {
  ColumnMapping,
  ImportField,
  SheetData,
  ValueMappedField,
  ValueMaps,
} from '@/lib/orbit/import-excel'
import { cn } from '@/lib/utils'
import {
  ArrowRight,
  CalendarClock,
  Check,
  FileSpreadsheet,
  FileText,
  History,
  LayoutTemplate,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wand2,
  X,
} from 'lucide-react'

type Phase = 'input' | 'parsing' | 'mapping' | 'result'

// Keeps the in-progress draft text across screen switches (INPUT unmounts
// whenever the user navigates away), scoped per-user so it doesn't leak
// between demo accounts on the same browser.
function draftKey(userId: string | null | undefined): string {
  return `orbit-input-draft-${userId ?? 'anon'}`
}
function loadDraft(userId: string | null | undefined): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(draftKey(userId)) ?? ''
  } catch {
    return ''
  }
}

export function InputScreen() {
  const {
    addTasksFromInput,
    setMode,
    currentUser,
    inputs,
    tasks,
    projects,
    categoryOptions,
    members,
    taskSetTemplates,
    applyTaskSetTemplate,
    createScheduleTask,
    createFormTask,
    isFullAdmin,
  } = useOrbit()
  const { go } = useNav()
  const toast = useToast()

  const [text, setText] = useState(() => loadDraft(currentUser?.id))
  const [phase, setPhase] = useState<Phase>('input')
  const [parsed, setParsed] = useState<ParsedTask[]>([])
  const [emptyError, setEmptyError] = useState(false)
  const [parseFailed, setParseFailed] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [historyInput, setHistoryInput] = useState<TaskInput | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importError, setImportError] = useState<string | null>(null)
  const [importSource, setImportSource] = useState<string | null>(null)
  const [sheetData, setSheetData] = useState<SheetData | null>(null)
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({})
  const [valueMaps, setValueMaps] = useState<ValueMaps>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const myInputs = inputs.filter((i) => i.createdById === currentUser?.id)

  // persist the draft text as the user types, so it survives switching to
  // OUTPUT and back (or a page reload) — cleared once tasks are registered
  useEffect(() => {
    try {
      if (text) window.localStorage.setItem(draftKey(currentUser?.id), text)
      else window.localStorage.removeItem(draftKey(currentUser?.id))
    } catch {
      /* ignore */
    }
  }, [text, currentUser?.id])

  const handleParse = () => {
    if (!text.trim()) {
      setEmptyError(true)
      return
    }
    // プロジェクトが1つも登録されていないと、解析結果の project_id が
    // 空文字のまま登録されてしまう（docs/onboarding.md はプロジェクト登録を
    // 先に済ませる想定だが、念のためここでも防ぐ）。バナー自体は
    // projects.length を直接見て表示するので、ここでは解析を止めるだけでよい
    if (projects.length === 0) return
    setEmptyError(false)
    setParseFailed(false)
    setPhase('parsing')
    setTimeout(() => {
      // Fake AI: demo input yields the predefined result; anything else
      // yields a light heuristic split by lines. Empty-ish -> fail.
      const result = parseText(text, projects)
      if (result.length === 0) {
        setParseFailed(true)
        setPhase('input')
        return
      }
      setParsed(result)
      setPhase('result')
      const dupCount = result.filter((p) => findSimilarTasks(p, tasks).length > 0).length
      if (dupCount > 0) {
        toast(`${dupCount}件のタスクに似た既存タスクがあります。内容をご確認ください`)
      }
    }, 1600)
  }

  // Excelファイルは列の並び・型が保証されないので、まずヘッダー文字列から
  // 「たぶんこの列だろう」を推測して確認画面（ExcelColumnMapping）を出し、
  // ユーザーにどの列を使うか・値の対応を確認してもらう。エラーで止めるのではなく
  // 常にこの確認画面に進み、そこで列を選び直せば必ず取り込める
  const handleExcelFile = async (file: File) => {
    if (projects.length === 0) return
    setImportError(null)
    try {
      const data = await readExcelFile(file)
      setSheetData(data)
      setColumnMapping(detectColumns(data.headers))
      setValueMaps({})
      setPhase('mapping')
    } catch {
      setImportError('ファイルを読み込めませんでした。Excel(.xlsx)形式か確認してください')
    }
  }

  const handleMappingChange = (field: ImportField, header: string | undefined) => {
    setColumnMapping((prev) => {
      const next = { ...prev }
      if (header) next[field] = header
      else delete next[field]
      return next
    })
  }

  const handleValueMapChange = (field: ValueMappedField, raw: string, mapped: string) => {
    setValueMaps((prev) => ({ ...prev, [field]: { ...prev[field], [raw]: mapped } }))
  }

  const handleMappingConfirm = () => {
    if (!sheetData || !columnMapping.name) return
    const { parsed: result, skippedRows } = buildParsedTasks(
      sheetData.rows,
      columnMapping,
      valueMaps,
      projects,
      members,
    )
    if (result.length === 0) {
      setImportError('タスクとして読み込める行が見つかりませんでした')
      setPhase('input')
      return
    }
    setImportSource(`Excelインポート: ${sheetData.fileName}`)
    setParsed(result)
    setSelectedIds(new Set())
    setPhase('result')
    toast(
      skippedRows > 0
        ? `${result.length}件を読み込みました（タスク名が空の${skippedRows}行はスキップ）`
        : `${result.length}件を読み込みました`,
    )
  }

  // 解析結果のうち、既存タスクと似ているものだけを抜き出したもの。各カードにも
  // 同じ警告が出るが、件数が多いとスクロールして見落とすため、ここでもまとめて示す
  const duplicateFlags = useMemo(
    () =>
      parsed
        .map((p) => ({ task: p, similar: findSimilarTasks(p, tasks) }))
        .filter((x) => x.similar.length > 0),
    [parsed, tasks],
  )

  const approvedCount = parsed.filter((p) => p.approved).length
  const allSelected = parsed.length > 0 && parsed.every((p) => selectedIds.has(p.id))
  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(parsed.map((p) => p.id)))
  const toggleSelectOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  // 入力画面でプロジェクトなどを一括で変えたい — applies one field to every
  // currently-checked card at once
  const bulkApply = <K extends keyof ParsedTask>(key: K, value: ParsedTask[K]) => {
    setParsed((prev) => prev.map((p) => (selectedIds.has(p.id) ? { ...p, [key]: value } : p)))
  }

  const handleRegister = () => {
    const approved = parsed.filter((p) => p.approved)
    if (approved.length === 0) return
    addTasksFromInput(importSource ?? text, approved)
    toast(`${approved.length}件のタスクを登録しました`)
    setPhase('input')
    setText('')
    setParsed([])
    setSelectedIds(new Set())
    setImportSource(null)
    setSheetData(null)
    setColumnMapping({})
    setValueMaps({})
    setRegistered(true)
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      {phase !== 'result' && phase !== 'mapping' && (
        <>
          {/* Hero */}
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" />
              INPUT
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px] text-balance">
              今日、何を進めますか？
            </h1>
            <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground text-pretty">
              やることをそのまま書いてください。Orbitがタスクとして整理します。
            </p>
          </div>

          {/* Textarea */}
          <div className="rounded-2xl border border-border bg-card p-2 shadow-[0_1px_3px_rgba(16,24,40,0.05)] focus-within:border-border-strong focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.12)]">
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                if (e.target.value.trim()) setEmptyError(false)
              }}
              rows={7}
              disabled={phase === 'parsing'}
              placeholder="来週金曜日までにイベント用のポスターを作成する。Canvaを使える人にお願いしたい。"
              className="min-h-[168px] w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60"
              aria-label="やること"
            />
            <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-1">
              <span className="text-xs text-muted-foreground">
                複数のタスクをまとめて入力できます。
              </span>
              <div className="flex items-center gap-2">
                {!!text && phase !== 'parsing' && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setText('')
                      setEmptyError(false)
                      setParseFailed(false)
                    }}
                    className="h-9 px-3 text-muted-foreground"
                  >
                    <Trash2 className="size-4" />
                    クリア
                  </Button>
                )}
                <Button
                  onClick={handleParse}
                  disabled={phase === 'parsing' || projects.length === 0}
                  className="h-9 px-4"
                >
                  {phase === 'parsing' ? (
                    <>
                      <OrbitMark size={15} />
                      整理中…
                    </>
                  ) : (
                    <>
                      <Wand2 className="size-4" />
                      タスクを整理する
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {emptyError && (
            <p className="mt-2.5 flex items-center gap-1.5 text-sm text-destructive">
              <TriangleAlert className="size-4" />
              タスク内容を入力してください
            </p>
          )}
          {projects.length === 0 && (
            <p className="mt-2.5 flex items-center gap-1.5 text-sm text-destructive">
              <TriangleAlert className="size-4" />
              プロジェクトが1件も登録されていません。先にAdmin → Projectsから登録してください。
            </p>
          )}
          {parseFailed && (
            <p className="mt-2.5 flex items-center gap-1.5 text-sm text-destructive">
              <TriangleAlert className="size-4" />
              分類できませんでした。内容を確認して手動で編集してください。
            </p>
          )}
          {importError && (
            <p className="mt-2.5 flex items-center gap-1.5 text-sm text-destructive">
              <TriangleAlert className="size-4" />
              {importError}
            </p>
          )}

          {/* Excelインポート — 列の並び・型は保証されないので、ヘッダー文字列を
              手がかりにタスク名・プロジェクトなどを判別する（lib/orbit/import-excel.ts） */}
          {phase === 'input' && projects.length > 0 && (
            <div className="mt-3 flex justify-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) void handleExcelFile(file)
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                <FileSpreadsheet className="size-3.5" />
                Excelファイルから読み込む
              </button>
            </div>
          )}

          {/* demo helper */}
          {phase === 'input' && !text && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">例文を使う:</span>
              <button
                type="button"
                onClick={() => setText(DEMO_INPUT)}
                className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-secondary"
              >
                イベント準備の4タスクを入力
              </button>
            </div>
          )}

          {registered && phase === 'input' && (
            <div className="mt-6 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <span className="text-sm font-medium text-emerald-800">
                タスクを登録しました。OUTPUTで確認できます。
              </span>
              <Button
                variant="outline"
                className="h-8 border-emerald-300 bg-card text-emerald-700"
                onClick={() => {
                  setMode('output')
                  go({ name: 'output' })
                }}
              >
                OUTPUTを見る
                <ArrowRight className="size-4" />
              </Button>
            </div>
          )}

          {phase === 'parsing' && (
            <div className="mt-8 flex flex-col items-center gap-3 text-center">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="relative flex size-4">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/40" />
                  <span className="relative inline-flex size-4 rounded-full bg-primary" />
                </span>
                Orbitがタスクを整理しています…
              </div>
              <div className="w-full max-w-sm space-y-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-xl border border-border bg-card"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          {phase === 'input' && projects.length > 0 && (
            <div className="mt-10">
              <div className="mb-2 flex items-center gap-1.5">
                <LayoutTemplate className="size-3.5 text-muted-foreground" />
                <SectionLabel>クイック追加</SectionLabel>
              </div>
              <div className="flex flex-col gap-2">
                {isFullAdmin && taskSetTemplates.length > 0 && (
                  <TemplateQuickAdd
                    projects={projects}
                    templates={taskSetTemplates}
                    onApply={applyTaskSetTemplate}
                  />
                )}
                <ScheduleQuickAdd projects={projects} members={members} onCreate={createScheduleTask} />
                <FormQuickAdd projects={projects} members={members} onCreate={createFormTask} />
              </div>
            </div>
          )}

          {phase === 'input' && myInputs.length > 0 && (
            <div className="mt-10">
              <div className="mb-2 flex items-center gap-1.5">
                <History className="size-3.5 text-muted-foreground" />
                <SectionLabel>入力履歴</SectionLabel>
              </div>
              <div className="flex flex-col gap-2">
                {myInputs.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setHistoryInput(i)}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 text-left transition-colors hover:border-border-strong hover:bg-secondary/50"
                  >
                    <p className="min-w-0 flex-1 truncate text-sm text-foreground">{i.text}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {i.generatedTaskIds.length}件・{formatDateTime(i.createdAt)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {phase === 'mapping' && sheetData && (
        <ExcelColumnMapping
          sheetData={sheetData}
          mapping={columnMapping}
          onMappingChange={handleMappingChange}
          valueMaps={valueMaps}
          onValueMapChange={handleValueMapChange}
          projects={projects}
          members={members}
          onCancel={() => {
            setPhase('input')
            setSheetData(null)
            setColumnMapping({})
            setValueMaps({})
          }}
          onConfirm={handleMappingConfirm}
        />
      )}

      {phase === 'result' && (
        <div className="animate-in fade-in slide-in-from-bottom-2">
          <div className="mb-5">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              {importSource ? (
                <FileSpreadsheet className="size-3.5 text-primary" />
              ) : (
                <Sparkles className="size-3.5 text-primary" />
              )}
              {importSource ? 'Excelインポート結果' : '解析結果'}
            </div>
            <h2 className="text-xl font-semibold tracking-tight">
              {parsed.length}件のタスクを見つけました
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              内容を確認し、必要であれば修正してください。承認したタスクだけ登録されます。
            </p>
          </div>

          {duplicateFlags.length > 0 && (
            <div className="mb-4 rounded-xl border border-warning/30 bg-warning-muted px-4 py-3">
              <div className="flex items-center gap-1.5 text-sm font-medium text-warning">
                <TriangleAlert className="size-4 shrink-0" />
                {duplicateFlags.length}件のタスクに似た既存タスクがあります
              </div>
              <ul className="mt-1.5 flex flex-col gap-1">
                {duplicateFlags.map(({ task, similar }) => (
                  <li key={task.id} className="text-xs text-muted-foreground">
                    「{task.name}」→ {similar.map(({ task: s }) => s.name).join('、')}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-muted-foreground">
                各カードの詳細も合わせてご確認ください。
              </p>
            </div>
          )}

          {parsed.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
              <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="size-3.5 cursor-pointer accent-primary"
                />
                すべて選択{selectedIds.size > 0 && `（${selectedIds.size}件）`}
              </label>
              {selectedIds.size > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">一括変更:</span>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) bulkApply('projectId', e.target.value)
                      e.target.value = ''
                    }}
                    className="h-7 cursor-pointer rounded-md border border-border bg-background px-1.5 text-xs outline-none"
                  >
                    <option value="">プロジェクト</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) bulkApply('department', e.target.value as Department)
                      e.target.value = ''
                    }}
                    className="h-7 cursor-pointer rounded-md border border-border bg-background px-1.5 text-xs outline-none"
                  >
                    <option value="">部門</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) bulkApply('category', e.target.value)
                      e.target.value = ''
                    }}
                    className="h-7 cursor-pointer rounded-md border border-border bg-background px-1.5 text-xs outline-none"
                  >
                    <option value="">カテゴリ</option>
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) bulkApply('difficulty', e.target.value as Difficulty)
                      e.target.value = ''
                    }}
                    className="h-7 cursor-pointer rounded-md border border-border bg-background px-1.5 text-xs outline-none"
                  >
                    <option value="">難易度</option>
                    {DIFFICULTY_LABEL.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) bulkApply('priority', e.target.value as Priority)
                      e.target.value = ''
                    }}
                    className="h-7 cursor-pointer rounded-md border border-border bg-background px-1.5 text-xs outline-none"
                  >
                    <option value="">優先度</option>
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        優先度{p}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}

          <div className="space-y-3">
            {parsed.map((p) => (
              <ParsedTaskCard
                key={p.id}
                task={p}
                selected={selectedIds.has(p.id)}
                onToggleSelect={() => toggleSelectOne(p.id)}
                onChange={(t) =>
                  setParsed((prev) => prev.map((x) => (x.id === t.id ? t : x)))
                }
                onToggle={() =>
                  setParsed((prev) =>
                    prev.map((x) =>
                      x.id === p.id ? { ...x, approved: !x.approved } : x,
                    ),
                  )
                }
                onDelete={() => {
                  setParsed((prev) => prev.filter((x) => x.id !== p.id))
                  setSelectedIds((prev) => {
                    const next = new Set(prev)
                    next.delete(p.id)
                    return next
                  })
                }}
              />
            ))}
            {parsed.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">
                すべてのタスクを削除しました。
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{approvedCount}</span>
              /{parsed.length} 件を承認中
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                className="h-9"
                onClick={() => {
                  setPhase('input')
                  setParsed([])
                  setSelectedIds(new Set())
                  setImportSource(null)
                  setSheetData(null)
                  setColumnMapping({})
                  setValueMaps({})
                }}
              >
                やり直す
              </Button>
              <Button
                className="h-9 px-4"
                disabled={approvedCount === 0}
                onClick={handleRegister}
              >
                選択したタスクを登録
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={!!historyInput}
        onClose={() => setHistoryInput(null)}
        labelledBy="history-input-title"
      >
        {historyInput && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h2 id="history-input-title" className="text-base font-semibold">
                入力内容
              </h2>
              <button onClick={() => setHistoryInput(null)} aria-label="閉じる">
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-secondary/50 p-3 text-sm leading-relaxed">
              {historyInput.text}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {formatDateTime(historyInput.createdAt)}
            </p>
            <div className="mt-4">
              <SectionLabel>生成されたタスク</SectionLabel>
              <ul className="mt-2 flex flex-col gap-1.5">
                {historyInput.generatedTaskIds.map((tid) => {
                  const t = tasks.find((x) => x.id === tid)
                  if (!t) return null
                  return (
                    <li
                      key={tid}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-2.5 py-1.5"
                    >
                      <span className="truncate text-sm">{t.name}</span>
                      <StatusBadge status={t.status} />
                    </li>
                  )
                })}
              </ul>
            </div>
          </>
        )}
      </Modal>
    </main>
  )
}

// クイック追加: 業務テンプレートからプロジェクトへタスクを一括追加する
// （Admin > Projectsの「テンプレート適用」と同じ操作を、INPUT画面からも
// できるようにしたもの。承認フローを経由しない admin-initiated 操作なので
// 管理者のみに表示する）
function TemplateQuickAdd({
  projects,
  templates,
  onApply,
}: {
  projects: Project[]
  templates: TaskSetTemplate[]
  onApply: (templateId: string, projectId: string) => void
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [templateId, setTemplateId] = useState('')

  const submit = () => {
    if (!projectId || !templateId) return
    const template = templates.find((t) => t.id === templateId)
    const project = projects.find((p) => p.id === projectId)
    onApply(templateId, projectId)
    toast(`「${template?.name}」を「${project?.name}」に適用し、${template?.items.length ?? 0}件のタスクを追加しました`)
    setOpen(false)
    setProjectId('')
    setTemplateId('')
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-dashed border-border-strong bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary"
      >
        <LayoutTemplate className="size-4 shrink-0" />
        業務テンプレートからタスクを追加
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <LayoutTemplate className="size-4" />
          業務テンプレートからタスクを追加
        </span>
        <button onClick={() => setOpen(false)} aria-label="閉じる">
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-9 min-w-[140px] flex-1 cursor-pointer rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
        >
          <option value="">プロジェクトを選択</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="h-9 min-w-[140px] flex-1 cursor-pointer rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
        >
          <option value="">テンプレートを選択</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}（{t.items.length}件）
            </option>
          ))}
        </select>
        <Button className="h-9 shrink-0" disabled={!projectId || !templateId} onClick={submit}>
          <Plus className="size-4" />
          追加
        </Button>
      </div>
    </div>
  )
}

// クイック追加: 候補日時＋招待メンバーを指定して、日程調整専用のタスクを
// その場で作成する（承認フローは経由しない — 招待されたメンバーがすぐに
// 〇×△で回答できる必要があるため）。誰でも使える
function ScheduleQuickAdd({
  projects,
  members,
  onCreate,
}: {
  projects: Project[]
  members: Member[]
  onCreate: (
    projectId: string,
    name: string,
    candidates: ScheduleCandidate[],
    invitedIds: string[],
  ) => void
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [name, setName] = useState('')
  const [candidates, setCandidates] = useState<ScheduleCandidate[]>([])
  const [dateTimeInput, setDateTimeInput] = useState('')
  const [invitedIds, setInvitedIds] = useState<string[]>([])

  const addCandidate = () => {
    if (!dateTimeInput) return
    const d = new Date(dateTimeInput)
    const label = `${d.getMonth() + 1}/${d.getDate()}(${'日月火水木金土'[d.getDay()]}) ${String(
      d.getHours(),
    ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    setCandidates((prev) => [
      ...prev,
      { id: `sc-${Math.random().toString(36).slice(2, 9)}`, label },
    ])
    setDateTimeInput('')
  }

  const reset = () => {
    setProjectId('')
    setName('')
    setCandidates([])
    setDateTimeInput('')
    setInvitedIds([])
  }

  const submit = () => {
    if (!projectId || !name.trim() || candidates.length === 0 || invitedIds.length === 0) return
    onCreate(projectId, name.trim(), candidates, invitedIds)
    toast(`「${name.trim()}」を作成しました。招待した${invitedIds.length}人が全員回答すると自動的に完了します`)
    setOpen(false)
    reset()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-dashed border-border-strong bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary"
      >
        <CalendarClock className="size-4 shrink-0" />
        日程調整タスクを作成
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <CalendarClock className="size-4" />
          日程調整タスクを作成
        </span>
        <button
          onClick={() => {
            setOpen(false)
            reset()
          }}
          aria-label="閉じる"
        >
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-2">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-9 min-w-[140px] flex-1 cursor-pointer rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="">プロジェクトを選択</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="タスク名（例：定例MTGの日程調整）"
            className="h-9 min-w-[180px] flex-[2] rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
          />
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">候補日時</p>
          {candidates.length > 0 && (
            <ul className="mb-1.5 flex flex-col gap-1">
              {candidates.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-secondary/60 px-2 py-1 text-sm"
                >
                  {c.label}
                  <button
                    onClick={() => setCandidates((prev) => prev.filter((x) => x.id !== c.id))}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="削除"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-1.5">
            <input
              type="datetime-local"
              value={dateTimeInput}
              onChange={(e) => setDateTimeInput(e.target.value)}
              className="h-9 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={addCandidate}
              disabled={!dateTimeInput}
              className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-dashed border-border-strong px-2.5 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-40"
            >
              <Plus className="size-3.5" />
              追加
            </button>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">招待するメンバー</p>
          <div className="flex max-h-32 flex-col gap-0.5 overflow-y-auto rounded-lg border border-border p-1 orbit-scroll">
            {members.map((m) => {
              const checked = invitedIds.includes(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    setInvitedIds((prev) =>
                      checked ? prev.filter((id) => id !== m.id) : [...prev, m.id],
                    )
                  }
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-secondary',
                    checked && 'bg-primary-muted',
                  )}
                >
                  <Avatar member={m} size={20} />
                  {m.displayName || m.name}
                  {checked && <Check className="ml-auto size-3.5 text-primary" />}
                </button>
              )
            })}
          </div>
        </div>

        <Button
          className="h-9 self-end"
          disabled={!projectId || !name.trim() || candidates.length === 0 || invitedIds.length === 0}
          onClick={submit}
        >
          <Plus className="size-4" />
          作成
        </Button>
      </div>
    </div>
  )
}

const FORM_FIELD_TYPE_LABEL: Record<FormFieldType, string> = {
  text: '一行テキスト',
  textarea: '複数行テキスト',
  select: '単一選択',
  checkbox: '複数選択',
}

// 汎用フォームタスクの作成 — 自由に質問項目を組み立て、回答してもらう
// メンバーを選ぶ。回答は招待者全員が終えると自動的にタスク完了になり、
// 作成者に結果が通知される（store.tsx の createFormTask/respondToForm）
function FormQuickAdd({
  projects,
  members,
  onCreate,
}: {
  projects: Project[]
  members: Member[]
  onCreate: (projectId: string, name: string, fields: FormFieldDef[], invitedIds: string[]) => void
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [name, setName] = useState('')
  const [fields, setFields] = useState<FormFieldDef[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [newType, setNewType] = useState<FormFieldType>('text')
  const [newOptions, setNewOptions] = useState('')
  const [newRequired, setNewRequired] = useState(true)
  const [invitedIds, setInvitedIds] = useState<string[]>([])

  const addField = () => {
    if (!newLabel.trim()) return
    const options =
      newType === 'select' || newType === 'checkbox'
        ? newOptions
            .split(/[、,,\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined
    if ((newType === 'select' || newType === 'checkbox') && (!options || options.length === 0)) return
    setFields((prev) => [
      ...prev,
      {
        id: `ff-${Math.random().toString(36).slice(2, 9)}`,
        label: newLabel.trim(),
        type: newType,
        options,
        required: newRequired,
      },
    ])
    setNewLabel('')
    setNewOptions('')
    setNewRequired(true)
  }

  const reset = () => {
    setProjectId('')
    setName('')
    setFields([])
    setNewLabel('')
    setNewOptions('')
    setNewRequired(true)
    setInvitedIds([])
  }

  const submit = () => {
    if (!projectId || !name.trim() || fields.length === 0 || invitedIds.length === 0) return
    onCreate(projectId, name.trim(), fields, invitedIds)
    toast(`「${name.trim()}」を作成しました。招待した${invitedIds.length}人が全員回答すると自動的に完了します`)
    setOpen(false)
    reset()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-dashed border-border-strong bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary"
      >
        <FileText className="size-4 shrink-0" />
        フォームタスクを作成
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <FileText className="size-4" />
          フォームタスクを作成
        </span>
        <button
          onClick={() => {
            setOpen(false)
            reset()
          }}
          aria-label="閉じる"
        >
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-2">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-9 min-w-[140px] flex-1 cursor-pointer rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="">プロジェクトを選択</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="タスク名（例：イベント参加アンケート）"
            className="h-9 min-w-[180px] flex-[2] rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
          />
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">質問項目</p>
          {fields.length > 0 && (
            <ul className="mb-1.5 flex flex-col gap-1">
              {fields.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-secondary/60 px-2 py-1 text-sm"
                >
                  <span>
                    {f.label}
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      （{FORM_FIELD_TYPE_LABEL[f.type]}
                      {f.required ? '・必須' : ''}）
                    </span>
                  </span>
                  <button
                    onClick={() => setFields((prev) => prev.filter((x) => x.id !== f.id))}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="削除"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-border-strong p-2">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="質問文（例：参加できますか？）"
              className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
            />
            <div className="flex items-center gap-1.5">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as FormFieldType)}
                className="h-9 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
              >
                {(Object.keys(FORM_FIELD_TYPE_LABEL) as FormFieldType[]).map((t) => (
                  <option key={t} value={t}>
                    {FORM_FIELD_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={newRequired}
                  onChange={(e) => setNewRequired(e.target.checked)}
                  className="size-3.5 cursor-pointer accent-primary"
                />
                必須
              </label>
            </div>
            {(newType === 'select' || newType === 'checkbox') && (
              <input
                value={newOptions}
                onChange={(e) => setNewOptions(e.target.value)}
                placeholder="選択肢をカンマ区切りで（例：〇,△,×）"
                className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
              />
            )}
            <button
              onClick={addField}
              disabled={!newLabel.trim()}
              className="flex h-9 shrink-0 items-center justify-center gap-1 rounded-lg border border-dashed border-border-strong px-2.5 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-40"
            >
              <Plus className="size-3.5" />
              質問を追加
            </button>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">回答してもらうメンバー</p>
          <div className="flex max-h-32 flex-col gap-0.5 overflow-y-auto rounded-lg border border-border p-1 orbit-scroll">
            {members.map((m) => {
              const checked = invitedIds.includes(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    setInvitedIds((prev) =>
                      checked ? prev.filter((id) => id !== m.id) : [...prev, m.id],
                    )
                  }
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-secondary',
                    checked && 'bg-primary-muted',
                  )}
                >
                  <Avatar member={m} size={20} />
                  {m.displayName || m.name}
                  {checked && <Check className="ml-auto size-3.5 text-primary" />}
                </button>
              )
            })}
          </div>
        </div>

        <Button
          className="h-9 self-end"
          disabled={!projectId || !name.trim() || fields.length === 0 || invitedIds.length === 0}
          onClick={submit}
        >
          <Plus className="size-4" />
          作成
        </Button>
      </div>
    </div>
  )
}

// Fake parser: demo string → predefined; otherwise line-based heuristic.
function parseText(text: string, projects: Project[]): ParsedTask[] {
  const normalized = text.replace(/\s+/g, '')
  const demoNorm = DEMO_INPUT.replace(/\s+/g, '')
  if (normalized === demoNorm || normalized.includes('イベント用のポスター')) {
    return buildDemoParse()
  }

  const lines = text
    .split(/[\n。]/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 3)

  return lines.map((line) => {
    const name = line.length > 24 ? line.slice(0, 24) + '…' : line
    // left for the user to pick from the おすすめ chips in ParsedTaskCard —
    // auto-guessing a required skill from keywords was more often wrong
    // than right, so this only infers the department, not skills
    let department: Department = '未分類'
    if (/デザイン|ポスター|canva/i.test(line)) {
      department = 'デザイン'
    }
    if (/メール|連絡|案内/.test(line)) {
      department = '渉外'
    }
    if (/sns|投稿|告知/i.test(line)) {
      department = '広報'
    }
    if (/記事|執筆|ライティング/.test(line)) {
      department = '広報'
    }
    const deadlineMatch = line.match(/(\d{1,2})月(\d{1,2})日/)
    const deadline = deadlineMatch
      ? `2026-${deadlineMatch[1].padStart(2, '0')}-${deadlineMatch[2].padStart(2, '0')}`
      : null
    const priority: Priority = deadline ? '高' : '中'
    return {
      id: `parsed-${Math.random().toString(36).slice(2, 9)}`,
      name,
      projectId: projects[0]?.id ?? '',
      department,
      deadline,
      // left for the user to pick from the おすすめ chips / dropdown in
      // ParsedTaskCard — a skill name isn't a meaningful category guess
      category: '未分類',
      skills: [],
      difficulty: '新人歓迎' as const,
      priority,
      assigneeIds: [],
      approved: true,
    }
  })
}
