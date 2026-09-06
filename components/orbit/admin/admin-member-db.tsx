'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { Download, Upload, Eye, Search } from 'lucide-react'
import type { Member } from '@/lib/orbit/types'
import { BASE_ROLE } from '@/lib/orbit/types'
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
    updateSearchProfile,
    updateCareerGoals,
    updateJoinedAt,
    bulkUpdateSkills,
    currentUser,
    isFullAdmin,
    adminProjects,
  } = useOrbit()
  const { t } = useI18n()

  // true for any admin role (代表・班長 etc.), false for 一般
  const isAnyAdmin = !!(currentUser?.role) && currentUser.role !== BASE_ROLE

  // Columns the current viewer is allowed to see/export
  const allowedCols = useMemo(() => filterColsForViewer(buildBaseCols(t), isAnyAdmin), [isAnyAdmin, t])

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

  // filters per column key
  const [filters, setFilters] = useState<Record<string, string>>({})

  // in-place editing
  const [editCell, setEditCell] = useState<{ memberId: string; colKey: string } | null>(null)
  const [editVal, setEditVal] = useState('')

  // skill CSV upload
  const skillCsvRef = useRef<HTMLInputElement>(null)
  const [skillCsvError, setSkillCsvError] = useState('')
  const [skillCsvOk, setSkillCsvOk] = useState(false)

  const visibleCols = allowedCols.filter((c) => !hiddenCols.has(c.key))

  // filtered rows (applied on top of the already-scoped member list)
  const filteredMembers = useMemo(() => {
    return scopedMembers.filter((m) => {
      return allowedCols.every((col) => {
        const f = filters[col.key]?.toLowerCase().trim()
        if (!f) return true
        return col.getValue(m).toLowerCase().includes(f)
      })
    })
  }, [scopedMembers, allowedCols, filters])

  // ---- commit cell edit ----
  const commitEdit = useCallback((memberId: string, colKey: string, val: string) => {
    const member = members.find((m) => m.id === memberId)
    if (!member) return
    if (colKey === 'yearsOfExperience') {
      updateSearchProfile(memberId, {
        yearsOfExperience: val === '' ? null : Number(val),
        hasManagementExperience: member.hasManagementExperience ?? false,
        desiredAreas: member.desiredAreas ?? [],
      })
    } else if (colKey === 'joinedAt') {
      updateJoinedAt(memberId, val || null)
    } else if (colKey === 'careerAspiration' || colKey === 'desiredFutureRole') {
      updateCareerGoals(memberId, {
        careerAspiration: colKey === 'careerAspiration' ? val : (member.careerAspiration ?? ''),
        desiredFutureRole: colKey === 'desiredFutureRole' ? val : (member.desiredFutureRole ?? ''),
        careerPlan: member.careerPlan ?? '',
      })
    }
    setEditCell(null)
  }, [members, updateSearchProfile, updateCareerGoals, updateJoinedAt])

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

  // ---- skill level CSV import ----
  const handleSkillCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setSkillCsvError('')
    setSkillCsvOk(false)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string
        const lines = text.split(/\r?\n/).filter((l) => l.trim())
        if (lines.length < 2) { setSkillCsvError(t('admin.memberDb.skillCsvError.noDataRows')); return }
        const parse = (line: string) => line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
        const headers = parse(lines[0])
        if (headers[0].toLowerCase().includes('氏名') || headers[0].toLowerCase().includes('name')) {
          headers.shift() // remove name column header
        }
        const skillCols = headers
        const updates: { memberId: string; skill: string; level: number }[] = []
        for (let i = 1; i < lines.length; i++) {
          const cols = parse(lines[i])
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
        if (updates.length === 0) { setSkillCsvError(t('admin.memberDb.skillCsvError.noUpdates')); return }
        bulkUpdateSkills(updates)
        setSkillCsvOk(true)
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
              <div className="absolute right-0 top-full z-50 mt-1 rounded-md border border-border bg-card shadow-md p-3 space-y-1 min-w-[160px]">
                {allowedCols.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!hiddenCols.has(col.key)}
                      onChange={() => {
                        setHiddenCols((prev) => {
                          const next = new Set(prev)
                          if (next.has(col.key)) next.delete(col.key)
                          else next.add(col.key)
                          return next
                        })
                      }}
                    />
                    {col.label}
                  </label>
                ))}
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

          {/* Skill CSV import */}
          <label className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent cursor-pointer">
            <Upload className="size-3.5" />
            {t('admin.memberDb.skillCsvImport')}
            <input
              ref={skillCsvRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleSkillCsvUpload}
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
    </div>
  )
}
