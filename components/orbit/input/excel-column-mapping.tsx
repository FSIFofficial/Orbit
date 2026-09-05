'use client'

import { useMemo } from 'react'
import type { Member, Project } from '@/lib/orbit/types'
import { DEPARTMENTS, DIFFICULTY_LABEL, PRIORITIES } from '@/lib/orbit/types'
import {
  VALUE_MAPPED_FIELDS,
  distinctColumnValues,
  guessDepartment,
  guessDifficulty,
  guessMember,
  guessPriority,
  guessProject,
} from '@/lib/orbit/import-excel'
import type {
  ColumnMapping,
  ImportField,
  SheetData,
  ValueMappedField,
  ValueMaps,
} from '@/lib/orbit/import-excel'
import { Button } from '@/components/ui/button'
import { FileSpreadsheet, TriangleAlert } from 'lucide-react'
import { useI18n, type TranslationKey } from '@/lib/orbit/i18n'

const IMPORT_FIELD_KEY: Record<ImportField, TranslationKey> = {
  name: 'excelMapping.importField.name',
  project: 'excelMapping.importField.project',
  department: 'excelMapping.importField.department',
  assignee: 'excelMapping.importField.assignee',
  priority: 'excelMapping.importField.priority',
  difficulty: 'excelMapping.importField.difficulty',
  category: 'excelMapping.importField.category',
  skills: 'excelMapping.importField.skills',
  startDate: 'excelMapping.importField.startDate',
  deadline: 'excelMapping.importField.deadline',
}

const FIELD_ORDER: { field: ImportField; required?: boolean }[] = [
  { field: 'name', required: true },
  { field: 'project' },
  { field: 'department' },
  { field: 'assignee' },
  { field: 'priority' },
  { field: 'difficulty' },
  { field: 'category' },
  { field: 'skills' },
  { field: 'startDate' },
  { field: 'deadline' },
]

const selectCls =
  'h-8 rounded-lg border border-border bg-card px-2 text-sm text-foreground outline-none focus:border-primary'

export function ExcelColumnMapping({
  sheetData,
  mapping,
  onMappingChange,
  valueMaps,
  onValueMapChange,
  projects,
  members,
  onCancel,
  onConfirm,
}: {
  sheetData: SheetData
  mapping: ColumnMapping
  onMappingChange: (field: ImportField, header: string | undefined) => void
  valueMaps: ValueMaps
  onValueMapChange: (field: ValueMappedField, raw: string, mapped: string) => void
  projects: Project[]
  members: Member[]
  onCancel: () => void
  onConfirm: () => void
}) {
  const canConfirm = !!mapping.name
  const { t } = useI18n()

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2">
      <div className="mb-5">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <FileSpreadsheet className="size-3.5 text-primary" />
          {t('excelMapping.badge')}
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{sheetData.fileName}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('excelMapping.subtitle', { sheetName: sheetData.sheetName, rowCount: sheetData.rows.length })}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        {FIELD_ORDER.map(({ field, required }) => (
          <div key={field} className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 text-sm font-medium text-foreground">
              {t(IMPORT_FIELD_KEY[field])}
              {required && <span className="ml-0.5 text-destructive">*</span>}
            </span>
            <select
              className={selectCls}
              value={mapping[field] ?? ''}
              onChange={(e) => onMappingChange(field, e.target.value || undefined)}
            >
              <option value="">{t('excelMapping.notUsed')}</option>
              {sheetData.headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {!mapping.name && (
        <p className="mt-2.5 flex items-center gap-1.5 text-sm text-destructive">
          <TriangleAlert className="size-4" />
          {t('excelMapping.nameRequiredWarning')}
        </p>
      )}

      {VALUE_MAPPED_FIELDS.filter((f) => mapping[f]).map((field) => (
        <ValueMappingSection
          key={field}
          field={field}
          header={mapping[field]!}
          rows={sheetData.rows}
          overrides={valueMaps[field] ?? {}}
          onChange={(raw, mapped) => onValueMapChange(field, raw, mapped)}
          projects={projects}
          members={members}
        />
      ))}

      <div className="mt-6 flex items-center justify-end gap-2 rounded-xl border border-border bg-card px-4 py-3">
        <Button variant="ghost" className="h-9" onClick={onCancel}>
          {t('excelMapping.retry')}
        </Button>
        <Button className="h-9 px-4" disabled={!canConfirm} onClick={onConfirm}>
          {t('excelMapping.confirmImport')}
        </Button>
      </div>
    </div>
  )
}

// 部門/優先度/難易度/プロジェクト/担当は選択式・参照先があるフィールドなので、
// 列に含まれる値ごとに「何に対応するか」をここでまとめて直せる（列単位の一括修正）
function ValueMappingSection({
  field,
  header,
  rows,
  overrides,
  onChange,
  projects,
  members,
}: {
  field: ValueMappedField
  header: string
  rows: Record<string, unknown>[]
  overrides: Record<string, string>
  onChange: (raw: string, mapped: string) => void
  projects: Project[]
  members: Member[]
}) {
  const { t } = useI18n()
  const splitTokens = field === 'assignee'
  const values = useMemo(
    () => distinctColumnValues(rows, header, splitTokens),
    [rows, header, splitTokens],
  )

  const guessFor = (raw: string): string => {
    switch (field) {
      case 'project':
        return guessProject(raw, projects)
      case 'department':
        return guessDepartment(raw)
      case 'priority':
        return guessPriority(raw)
      case 'difficulty':
        return guessDifficulty(raw)
      case 'assignee':
        return guessMember(raw, members)
    }
  }

  const options = (): { value: string; label: string }[] => {
    switch (field) {
      case 'project':
        return projects.map((p) => ({ value: p.id, label: p.name }))
      case 'department':
        return DEPARTMENTS.map((d) => ({ value: d, label: d }))
      case 'priority':
        return PRIORITIES.map((p) => ({ value: p, label: p }))
      case 'difficulty':
        return DIFFICULTY_LABEL.map((d) => ({ value: d, label: d }))
      case 'assignee':
        return members.map((m) => ({ value: m.id, label: m.displayName || m.name }))
    }
  }
  const opts = options()

  if (values.length === 0) return null

  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium text-foreground">
        {t('excelMapping.valueMapping.title', { field: t(IMPORT_FIELD_KEY[field]) })}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t('excelMapping.valueMapping.desc', { header, field: t(IMPORT_FIELD_KEY[field]) })}
      </p>
      <div className="mt-2.5 flex flex-col gap-1.5">
        {values.map((raw) => (
          <div key={raw} className="flex flex-wrap items-center gap-2">
            <span className="min-w-[120px] max-w-[220px] truncate text-sm text-muted-foreground" title={raw}>
              {raw}
            </span>
            <span className="text-xs text-muted-foreground">→</span>
            <select
              className={selectCls}
              value={overrides[raw] ?? guessFor(raw)}
              onChange={(e) => onChange(raw, e.target.value)}
            >
              {field === 'assignee' && <option value="">{t('excelMapping.valueMapping.noMatch')}</option>}
              {opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
