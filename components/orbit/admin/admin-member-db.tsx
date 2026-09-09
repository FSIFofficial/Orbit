'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { useOrbit } from '@/lib/orbit/store'
import { Modal } from '@/components/orbit/modal'
import { Button } from '@/components/ui/button'
import { Download, Upload, Eye, Search } from 'lucide-react'
import type { CustomMemberColumn, Member } from '@/lib/orbit/types'
import { BASE_ROLE } from '@/lib/orbit/types'
import { exportSkillExcel } from '@/lib/orbit/export-excel'
import { useI18n, type TranslationKey } from '@/lib/orbit/i18n'

type TranslationFn = (key: TranslationKey, vars?: Record<string, string | number>) => string

// ---------- column definitions ----------

interface ColDef {
  key: string
  label: string
  getValue: (m: Member) => string
  setValue?: (m: Member, val: string) => void
  editable?: boolean
  width?: number
  tooltip?: string
}

function skillLevelText(m: Member, skill: string): string {
  const sl = m.skillLevels?.find((s) => s.skill === skill)
  return sl ? String(sl.level) : ''
}

// SKL-003: CSV/xlsxのどちらも、同じ「1行目=氏名,スキル1,スキル2,...、
// 2行目以降=メンバー名+レベル(1〜5)」の2次元配列に正規化してから、
// この共通ロジックでbulkUpdateSkills向けの更新配列に変換する
function parseSkillRows(
  rows2d: string[][],
  members: Member[],
): { memberId: string; skill: string; level: number }[] {
  if (rows2d.length < 2) return []
  const headers = [...rows2d[0]]
  if (headers[0]?.toLowerCase().includes('氏名') || headers[0]?.toLowerCase().includes('name')) {
    headers.shift() // remove name column header
  }
  const skillCols = headers
  const updates: { memberId: string; skill: string; level: number }[] = []
  for (let i = 1; i < rows2d.length; i++) {
    const cols = rows2d[i]
    const nameVal = cols[0]
    const member = members.find((m) => m.name === nameVal || m.displayName === nameVal)
    if (!member) continue
    for (let j = 0; j < skillCols.length; j++) {
      const skill = skillCols[j]
      const raw = cols[j + 1]
      if (!raw || raw === '') continue
      const level = Number(raw)
      if (isNaN(level) || level < 1 || level > 5) continue
      updates.push({ memberId: member.id, skill, level })
    }
  }
  return updates
}

function buildBaseCols(t: TranslationFn): ColDef[] {
  return [
    { key: 'name', label: t('admin.memberDb.col.name'), getValue: (m) => m.name, editable: false, width: 140 },
    { key: 'affiliation', label: t('admin.memberDb.col.affiliation'), getValue: (m) => m.affiliation, editable: false, width: 140, tooltip: t('admin.memberDb.col.affiliationTooltip') },
    { key: 'role', label: t('admin.memberDb.col.role'), getValue: (m) => m.role, editable: false, width: 100 },
    { key: 'skills', label: t('admin.memberDb.col.skills'), getValue: (m) => (m.skills ?? []).join(', '), editable: false, width: 180 },
    { key: 'yearsOfExperience', label: t('admin.memberDb.col.yearsOfExperience'), getValue: (m) => m.yearsOfExperience != null ? String(m.yearsOfExperience) : '', editable: true, width: 90 },
    { key: 'hasManagementExperience', label: t('admin.memberDb.col.hasManagementExperience'), getValue: (m) => m.hasManagementExperience ? t('admin.memberDb.yes') : t('admin.memberDb.no'), editable: false, width: 90 },
    { key: 'joinedAt', label: t('admin.memberDb.col.joinedAt'), getValue: (m) => m.joinedAt ?? '', editable: true, width: 110 },
    { key: 'careerAspiration', label: t('admin.memberDb.col.careerAspiration'), getValue: (m) => m.careerAspiration ?? '', editable: true, width: 180 },
    { key: 'desiredFutureRole', label: t('admin.memberDb.col.desiredFutureRole'), getValue: (m) => m.desiredFutureRole ?? '', editable: true, width: 120 },
    // admin-only: hidden from 一般 (see filterColsForViewer)
    { key: 'email', label: t('admin.memberDb.col.email'), getValue: (m) => m.email ?? '', editable: false, width: 180 },
    { key: 'university', label: t('admin.memberDb.col.university'), getValue: (m) => m.university ?? '', editable: false, width: 140 },
    { key: 'faculty', label: t('admin.memberDb.col.faculty'), getValue: (m) => m.faculty ?? '', editable: false, width: 120 },
    { key: 'departmentName', label: t('admin.memberDb.col.departmentName'), getValue: (m) => m.departmentName ?? '', editable: false, width: 120 },
    { key: 'gradeYear', label: t('admin.memberDb.col.gradeYear'), getValue: (m) => m.gradeYear ?? '', editable: false, width: 80 },
  ]
}

// 団体ごとにAdmin > Tagsで追加できるカスタム列。値はMember.customFields[key]。
// 本人・管理者双方が編集できる（selfOrAdmin相当。この画面自体が既に
// admin/班長のみ到達できる前提のため一律editable:trueでよい）。
const CUSTOM_COL_PREFIX = 'custom:'

function buildCustomCols(columns: CustomMemberColumn[]): ColDef[] {
  return columns.map((col) => ({
    key: CUSTOM_COL_PREFIX + col.key,
    label: col.label,
    getValue: (m) => m.customFields?.[col.key] ?? '',
    editable: true,
    width: 140,
  }))
}

// SKL-006: スキル表グリッド(skill-grid-screen.tsx)を人材DBのテーブルに
// 統合する。列名はスキル名そのもの(skill-grid-screen.tsxのヘッダーと同じ、
// 自由記述のためi18nキー化はしない)
const SKILL_COL_PREFIX = 'skill:'

function buildSkillCols(skillOptions: string[]): ColDef[] {
  return skillOptions.map((skill) => ({
    key: SKILL_COL_PREFIX + skill,
    label: skill,
    getValue: (m) => skillLevelText(m, skill),
    editable: true,
    width: 70,
  }))
}

// skill-grid-screen.tsxのrequiredLevelGapと同じロジック(そちらは一切
// 変更しない方針のため、あえて共有せずこちらに個別実装する)。そのメンバーが
// 担当中で未完了のタスクのうち、このスキルについてtask.requiredSkillLevels
// が現在のレベルを上回っているものの最大値を返す
function requiredLevelGap(member: Member, skill: string, tasks: import('@/lib/orbit/types').Task[]): number | undefined {
  const current = Number(skillLevelText(member, skill)) || 0
  let max: number | undefined
  for (const task of tasks) {
    if (task.status === 'done' || !task.assigneeIds.includes(member.id)) continue
    const required = task.requiredSkillLevels?.[skill]
    if (required && required > current && (max === undefined || required > max)) {
      max = required
    }
  }
  return max
}

// Keys that must not be shown to non-admin (一般) viewers.
// Keep this in sync with the server-side GAS restriction list.
const ADMIN_ONLY_COL_KEYS = new Set([
  'email',
  'university',
  'faculty',
  'departmentName',
  'gradeYear',
])

// Returns the subset of columns a viewer with the given admin status may see.
function filterColsForViewer(cols: ColDef[], isAnyAdmin: boolean): ColDef[] {
  if (isAnyAdmin) return cols
  return cols.filter((c) => !ADMIN_ONLY_COL_KEYS.has(c.key))
}

// ---------- CSV helpers ----------

function escapeCsv(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(escapeCsv).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ---------- main component ----------

export function AdminMemberDb() {
  const {
    members,
    skillOptions,
    visibleTasks,
    updateSearchProfile,
    updateCareerGoals,
    updateJoinedAt,
    bulkUpdateSkills,
    updateSkillLevels,
    currentUser,
    isFullAdmin,
    adminProjects,
    customMemberColumns,
    updateCustomField,
  } = useOrbit()
  const { t } = useI18n()

  // true for any admin role (代表・班長 etc.), false for 一般
  const isAnyAdmin = !!(currentUser?.role) && currentUser.role !== BASE_ROLE

  // updateJoinedAtはGAS側で常にisDaihyo固定。このテーブルはisAnyAdmin
  // （代表以外の管理者ロールも含む）に編集可能な列として見えるため、
  // セルクリックで編集を試みると代表以外は保存時にエラーになる
  const isDaihyo = currentUser?.role === '代表'

  // Columns the current viewer is allowed to see/export — fixed cols +
  // dynamically-defined custom cols (Admin > Tags「カスタム項目」)
  const allCols = useMemo(() => {
    const cols = [...buildBaseCols(t), ...buildCustomCols(customMemberColumns), ...buildSkillCols(skillOptions)]
    if (!isDaihyo) {
      const joinedAtCol = cols.find((c) => c.key === 'joinedAt')
      if (joinedAtCol) joinedAtCol.tooltip = t('admin.accessNote.daihyo')
    }
    return cols
  }, [t, customMemberColumns, skillOptions, isDaihyo])
  const allowedCols = useMemo(() => filterColsForViewer(allCols, isAnyAdmin), [allCols, isAnyAdmin])

  // Members scoped to this viewer's access:
  //   full admin  → all members
  //   班長 (non-full admin) → only members belonging to their managed projects
  //   一般 → shouldn't reach this screen, but fall back to all as defensive
  const scopedMembers = useMemo(() => {
    if (isFullAdmin || !isAnyAdmin) return members
    const memberIdSet = new Set(adminProjects.flatMap((p) => p.memberIds ?? []))
    return members.filter((m) => memberIdSet.has(m.id))
  }, [isFullAdmin, isAnyAdmin, members, adminProjects])

  // visible columns (after user-toggled hiddenCols)
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set())
  const [colPanelOpen, setColPanelOpen] = useState(false)

  // SKL-006: スキル列は数が多くなりうるため、デフォルトでは先頭N件のみ
  // 表示し、それ以外は列非表示UIから個別にON/OFFできるようにする。
  // hiddenColsとは別のmapで管理し、明示的に触られたスキル列だけ上書きする
  const SKILL_COLS_DEFAULT_VISIBLE = 3
  const [skillColOverrides, setSkillColOverrides] = useState<Record<string, boolean>>({})
  const isSkillColVisible = useCallback(
    (colKey: string) => {
      const override = skillColOverrides[colKey]
      if (override !== undefined) return override
      const skill = colKey.slice(SKILL_COL_PREFIX.length)
      return skillOptions.indexOf(skill) < SKILL_COLS_DEFAULT_VISIBLE
    },
    [skillColOverrides, skillOptions],
  )

  // filters per column key
  const [filters, setFilters] = useState<Record<string, string>>({})
  // HRD-006: 休止中メンバーはデフォルトで一覧から除外する
  const [showInactive, setShowInactive] = useState(false)

  // in-place editing
  const [editCell, setEditCell] = useState<{ memberId: string; colKey: string } | null>(null)
  const [editVal, setEditVal] = useState('')

  // skill CSV upload
  const skillCsvRef = useRef<HTMLInputElement>(null)
  const [skillCsvError, setSkillCsvError] = useState('')
  const [skillCsvOk, setSkillCsvOk] = useState(false)

  // SKL-006: 要求スキルレベル不足のハイライト+ワンクリック承認
  // (skill-grid-screen.tsxの仕組みをこの統合テーブル向けに個別実装)
  const [approving, setApproving] = useState<{ memberId: string; memberName: string; skill: string; level: number } | null>(null)

  const visibleCols = allowedCols.filter((c) =>
    c.key.startsWith(SKILL_COL_PREFIX) ? isSkillColVisible(c.key) : !hiddenCols.has(c.key),
  )

  // filtered rows (applied on top of the already-scoped member list)
  const filteredMembers = useMemo(() => {
    return scopedMembers.filter((m) => {
      if (!showInactive && m.inactive) return false
      return allowedCols.every((col) => {
        const f = filters[col.key]?.toLowerCase().trim()
        if (!f) return true
        return col.getValue(m).toLowerCase().includes(f)
      })
    })
  }, [scopedMembers, allowedCols, filters, showInactive])

  // ---- commit cell edit ----
  const commitEdit = useCallback((memberId: string, colKey: string, val: string) => {
    const member = members.find((m) => m.id === memberId)
    if (!member) return
    if (colKey.startsWith(CUSTOM_COL_PREFIX)) {
      updateCustomField(memberId, colKey.slice(CUSTOM_COL_PREFIX.length), val)
    } else if (colKey === 'yearsOfExperience') {
      updateSearchProfile(memberId, {
        yearsOfExperience: val === '' ? null : Number(val),
        hasManagementExperience: member.hasManagementExperience ?? false,
        desiredAreas: member.desiredAreas ?? [],
        desiredSkills: member.desiredSkills ?? [],
      })
    } else if (colKey === 'joinedAt') {
      updateJoinedAt(memberId, val || null)
    } else if (colKey === 'careerAspiration' || colKey === 'desiredFutureRole') {
      updateCareerGoals(memberId, {
        careerAspiration: colKey === 'careerAspiration' ? val : (member.careerAspiration ?? ''),
        desiredFutureRole: colKey === 'desiredFutureRole' ? val : (member.desiredFutureRole ?? ''),
        careerPlan: member.careerPlan ?? '',
      })
    } else if (colKey.startsWith(SKILL_COL_PREFIX)) {
      const skill = colKey.slice(SKILL_COL_PREFIX.length)
      if (val === '') {
        // bulkUpdateSkillsはレベル解除に対応していないため、本人分の配列を
        // 組み立ててupdateSkillLevelsで送る(skill-grid-screen.tsxと同じ考え方)
        updateSkillLevels(memberId, (member.skillLevels ?? []).filter((s) => s.skill !== skill))
      } else {
        const level = Number(val)
        if (!isNaN(level) && level >= 1 && level <= 5) {
          bulkUpdateSkills([{ memberId, skill, level }])
        }
      }
    }
    setEditCell(null)
  }, [members, updateSearchProfile, updateCareerGoals, updateJoinedAt, updateCustomField, updateSkillLevels, bulkUpdateSkills])

  // ---- member CSV export (uses viewer-scoped cols and members) ----
  const exportMemberCsv = () => {
    const cols = visibleCols
    const headers = cols.map((c) => c.label)
    const rows = filteredMembers.map((m) => cols.map((c) => c.getValue(m)))
    downloadCsv('members.csv', [headers, ...rows])
  }

  // ---- skill level CSV export ----
  const exportSkillCsv = () => {
    const headers = ['氏名', ...skillOptions]
    const rows = scopedMembers.map((m) => {
      return [m.name, ...skillOptions.map((sk) => skillLevelText(m, sk))]
    })
    downloadCsv('skills.csv', [headers, ...rows])
  }

  // ---- skill level CSV/xlsx import ----
  // SKL-003: 拡張子で分岐 — .xlsxはSheetJS(xlsx)で最初のシートを読み込み、
  // .csvは既存のテキスト解析のまま。どちらも同じparseSkillRowsに渡す
  const handleBulkSkillUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setSkillCsvError('')
    setSkillCsvOk(false)

    const finish = (rows2d: string[][]) => {
      try {
        if (rows2d.length < 2) { setSkillCsvError(t('admin.memberDb.skillCsvError.noDataRows')); return }
        const updates = parseSkillRows(rows2d, members)
        if (updates.length === 0) { setSkillCsvError(t('admin.memberDb.skillCsvError.noUpdates')); return }
        bulkUpdateSkills(updates)
        setSkillCsvOk(true)
      } catch {
        setSkillCsvError(t('admin.memberDb.skillCsvError.parseFailed'))
      }
    }

    if (/\.xlsx$/i.test(file.name)) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const data = ev.target?.result as ArrayBuffer
          const wb = XLSX.read(data, { type: 'array' })
          const sheet = wb.Sheets[wb.SheetNames[0]]
          if (!sheet) { setSkillCsvError(t('admin.memberDb.skillCsvError.parseFailed')); return }
          const rows2d = XLSX.utils
            .sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
            .map((cols) => cols.map((c) => String(c ?? '').trim()))
          finish(rows2d)
        } catch {
          setSkillCsvError(t('admin.memberDb.skillCsvError.parseFailed'))
        }
      }
      reader.readAsArrayBuffer(file)
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string
        const rows2d = text
          .split(/\r?\n/)
          .filter((l) => l.trim())
          .map((line) => line.split(',').map((c) => c.trim().replace(/^"|"$/g, '')))
        finish(rows2d)
      } catch {
        setSkillCsvError(t('admin.memberDb.skillCsvError.parseFailed'))
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">{t('admin.memberDb.title')}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {/* HRD-006: 休止中メンバーの表示切替(デフォルトOFF) */}
          <label className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            {t('admin.members.search.showInactive')}
          </label>

          {/* Column visibility */}
          <div className="relative">
            <button
              onClick={() => setColPanelOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent"
            >
              <Eye className="size-3.5" />
              {t('admin.memberDb.colVisibility')}
            </button>
            {colPanelOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 max-h-80 overflow-auto orbit-scroll rounded-md border border-border bg-card shadow-md p-3 space-y-1 min-w-[160px]">
                {allowedCols.map((col) => {
                  const isSkill = col.key.startsWith(SKILL_COL_PREFIX)
                  const checked = isSkill ? isSkillColVisible(col.key) : !hiddenCols.has(col.key)
                  return (
                    <label key={col.key} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          if (isSkill) {
                            setSkillColOverrides((prev) => ({ ...prev, [col.key]: !checked }))
                          } else {
                            setHiddenCols((prev) => {
                              const next = new Set(prev)
                              if (next.has(col.key)) next.delete(col.key)
                              else next.add(col.key)
                              return next
                            })
                          }
                        }}
                      />
                      {col.label}
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {/* Member CSV export */}
          <button
            onClick={exportMemberCsv}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent"
          >
            <Download className="size-3.5" />
            {t('admin.memberDb.memberCsv')}
          </button>

          {/* Skill CSV export */}
          <button
            onClick={exportSkillCsv}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent"
          >
            <Download className="size-3.5" />
            {t('admin.memberDb.skillCsv')}
          </button>

          {/* SKL-004: Skill Excel export */}
          <button
            onClick={() => exportSkillExcel(scopedMembers, skillOptions)}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent"
          >
            <Download className="size-3.5" />
            {t('admin.memberDb.skillExcel')}
          </button>

          {/* Skill CSV/xlsx import */}
          <label className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent cursor-pointer">
            <Upload className="size-3.5" />
            {t('admin.memberDb.skillCsvImport')}
            <input
              ref={skillCsvRef}
              type="file"
              accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleBulkSkillUpload}
              className="sr-only"
            />
          </label>
        </div>
      </div>

      {skillCsvError && (
        <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{skillCsvError}</div>
      )}
      {skillCsvOk && (
        <div className="rounded-md bg-green-500/10 p-2 text-xs text-green-700 dark:text-green-400">{t('admin.memberDb.skillCsvOk')}</div>
      )}

      <p className="text-xs text-muted-foreground">
        {t('admin.memberDb.rowCount', { filtered: filteredMembers.length, total: scopedMembers.length })}
      </p>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            {/* Filter row */}
            <tr className="bg-muted/30">
              {visibleCols.map((col) => (
                <th key={col.key + '-filter'} className="border-b border-border p-1" style={{ width: col.width }}>
                  <div className="flex items-center gap-1">
                    <Search className="size-3 text-muted-foreground shrink-0" />
                    <input
                      value={filters[col.key] ?? ''}
                      onChange={(e) => setFilters((f) => ({ ...f, [col.key]: e.target.value }))}
                      placeholder={col.label}
                      className="w-full bg-transparent outline-none placeholder:text-muted-foreground/60 text-[11px]"
                    />
                    {filters[col.key] && (
                      <button onClick={() => setFilters((f) => ({ ...f, [col.key]: '' }))} className="text-muted-foreground hover:text-foreground">×</button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
            {/* Header row */}
            <tr className="bg-muted/50">
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  className="border-b border-border px-2 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap"
                  style={{ width: col.width }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredMembers.map((m, ri) => (
              <tr key={m.id} className={ri % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                {visibleCols.map((col) => {
                  const isEditing = editCell?.memberId === m.id && editCell?.colKey === col.key
                  const val = col.getValue(m)

                  // SKL-006: 要求スキルレベル不足のハイライト+クリックで承認
                  // (skill-grid-screen.tsxと同じ挙動。不足がある間は通常の
                  // インライン編集ではなく、この承認導線のみを提供する)
                  if (col.key.startsWith(SKILL_COL_PREFIX) && !isEditing) {
                    const skill = col.key.slice(SKILL_COL_PREFIX.length)
                    const gap = requiredLevelGap(m, skill, visibleTasks)
                    if (gap !== undefined) {
                      return (
                        <td
                          key={col.key}
                          className="border-b border-border/50 px-2 py-1 text-center align-top"
                          style={{ width: col.width, maxWidth: col.width ?? 200 }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setApproving({ memberId: m.id, memberName: m.displayName || m.name, skill, level: gap })
                            }
                            title={t('admin.memberDb.skillGap.tooltip', { level: gap })}
                            className="inline-flex size-6 items-center justify-center rounded-md bg-amber-100 text-[11px] font-semibold text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60"
                          >
                            {val || '—'}
                          </button>
                        </td>
                      )
                    }
                  }

                  return (
                    <td
                      key={col.key}
                      className="border-b border-border/50 px-2 py-1 align-top"
                      style={{ width: col.width, maxWidth: col.width ?? 200 }}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editVal}
                          onChange={(e) => setEditVal(e.target.value)}
                          onBlur={() => commitEdit(m.id, col.key, editVal)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(m.id, col.key, editVal)
                            if (e.key === 'Escape') setEditCell(null)
                          }}
                          className="w-full rounded border border-primary bg-background px-1 py-0.5 text-xs outline-none"
                        />
                      ) : (
                        <span
                          onClick={() => {
                            if (!col.editable) return
                            setEditCell({ memberId: m.id, colKey: col.key })
                            setEditVal(val)
                          }}
                          className={`block truncate ${col.editable ? 'cursor-text hover:bg-accent/40 rounded px-0.5' : ''}`}
                          title={col.tooltip ?? val}
                        >
                          {val || <span className="text-muted-foreground/40">—</span>}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            {filteredMembers.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length} className="py-6 text-center text-xs text-muted-foreground">
                  {t('admin.memberDb.noMembers')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Skill level reference */}
      <p className="text-[11px] text-muted-foreground">
        {t('admin.memberDb.skillCsvFormatHint')}
      </p>

      {/* SKL-006: 要求スキルレベル不足の承認確認(skill-grid-screen.tsxの
          approveModalと同じ考え方) */}
      <Modal open={!!approving} onClose={() => setApproving(null)}>
        <h2 className="text-base font-semibold">{t('admin.memberDb.skillGap.approveModal.title')}</h2>
        {approving && (
          <p className="mt-2 text-sm text-muted-foreground">
            {t('admin.memberDb.skillGap.approveModal.desc', {
              name: approving.memberName,
              skill: approving.skill,
              level: approving.level,
            })}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" className="h-9" onClick={() => setApproving(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            className="h-9"
            onClick={() => {
              if (approving) bulkUpdateSkills([{ memberId: approving.memberId, skill: approving.skill, level: approving.level }])
              setApproving(null)
            }}
          >
            {t('admin.memberDb.skillGap.approveModal.confirm')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
