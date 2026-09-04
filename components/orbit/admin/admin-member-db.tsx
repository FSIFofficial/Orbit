'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { Download, Upload, Eye, EyeOff, Search } from 'lucide-react'
import type { Member } from '@/lib/orbit/types'

// ---------- column definitions ----------

interface ColDef {
  key: string
  label: string
  getValue: (m: Member) => string
  setValue?: (m: Member, val: string) => void
  editable?: boolean
  width?: number
}

function skillLevelText(m: Member, skill: string): string {
  const sl = m.skillLevels?.find((s) => s.skill === skill)
  return sl ? String(sl.level) : ''
}

const BASE_COLS: ColDef[] = [
  { key: 'name', label: '氏名', getValue: (m) => m.name, editable: false, width: 140 },
  { key: 'affiliation', label: '所属', getValue: (m) => m.affiliation, editable: true, width: 140 },
  { key: 'role', label: '役職', getValue: (m) => m.role, editable: false, width: 100 },
  { key: 'skills', label: 'スキル', getValue: (m) => (m.skills ?? []).join(', '), editable: false, width: 180 },
  { key: 'yearsOfExperience', label: '経験年数', getValue: (m) => m.yearsOfExperience != null ? String(m.yearsOfExperience) : '', editable: true, width: 90 },
  { key: 'hasManagementExperience', label: '管理職経験', getValue: (m) => m.hasManagementExperience ? '有' : '無', editable: false, width: 90 },
  { key: 'joinedAt', label: '所属開始日', getValue: (m) => m.joinedAt ?? '', editable: true, width: 110 },
  { key: 'careerAspiration', label: 'キャリア目標', getValue: (m) => m.careerAspiration ?? '', editable: true, width: 180 },
  { key: 'desiredFutureRole', label: '希望役職', getValue: (m) => m.desiredFutureRole ?? '', editable: true, width: 120 },
  { key: 'email', label: 'メール', getValue: (m) => m.email ?? '', editable: false, width: 180 },
]

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
  const { members, skillOptions, updateSearchProfile, updateCareerGoals, updateJoinedAt, bulkUpdateSkills } = useOrbit()

  // visible columns
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

  const visibleCols = BASE_COLS.filter((c) => !hiddenCols.has(c.key))

  // filtered rows
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      return BASE_COLS.every((col) => {
        const f = filters[col.key]?.toLowerCase().trim()
        if (!f) return true
        return col.getValue(m).toLowerCase().includes(f)
      })
    })
  }, [members, filters])

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

  // ---- member CSV export ----
  const exportMemberCsv = () => {
    const headers = visibleCols.map((c) => c.label)
    const rows = filteredMembers.map((m) => visibleCols.map((c) => c.getValue(m)))
    downloadCsv('members.csv', [headers, ...rows])
  }

  // ---- skill level CSV export ----
  const exportSkillCsv = () => {
    const headers = ['氏名', ...skillOptions]
    const rows = members.map((m) => {
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
        if (lines.length < 2) { setSkillCsvError('データ行がありません'); return }
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
        if (updates.length === 0) { setSkillCsvError('更新対象データがありませんでした'); return }
        bulkUpdateSkills(updates)
        setSkillCsvOk(true)
      } catch {
        setSkillCsvError('CSVの解析に失敗しました')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">人材データベース</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Column visibility */}
          <div className="relative">
            <button
              onClick={() => setColPanelOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent"
            >
              <Eye className="size-3.5" />
              列表示
            </button>
            {colPanelOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 rounded-md border border-border bg-card shadow-md p-3 space-y-1 min-w-[160px]">
                {BASE_COLS.map((col) => (
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
            メンバーCSV
          </button>

          {/* Skill CSV export */}
          <button
            onClick={exportSkillCsv}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent"
          >
            <Download className="size-3.5" />
            スキルCSV
          </button>

          {/* Skill CSV import */}
          <label className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent cursor-pointer">
            <Upload className="size-3.5" />
            スキルCSV取込
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
        <div className="rounded-md bg-green-500/10 p-2 text-xs text-green-700 dark:text-green-400">スキルデータを一括更新しました</div>
      )}

      <p className="text-xs text-muted-foreground">
        {filteredMembers.length} / {members.length} 件表示 · セルをクリックで編集
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
                          title={val}
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
                  該当するメンバーがいません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Skill level reference */}
      <p className="text-[11px] text-muted-foreground">
        スキルCSVフォーマット: 1行目=「氏名,スキル1,スキル2,...」、2行目以降=メンバー名+レベル(1〜5)
      </p>
    </div>
  )
}
