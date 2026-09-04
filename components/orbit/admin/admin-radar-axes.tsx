'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useToast } from '@/components/orbit/toast'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Radar } from 'lucide-react'
import type { RadarAxis } from '@/lib/orbit/types'
import { SkillRadarChart } from '@/components/orbit/skill-radar-chart'

export function AdminRadarAxes() {
  const { radarAxes, updateRadarAxes, skillOptions, members, currentUser } = useOrbit()
  const toast = useToast()
  const [axes, setAxes] = useState<RadarAxis[]>(radarAxes)
  const [newSkill, setNewSkill] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [dirty, setDirty] = useState(false)

  const syncFromStore = () => {
    setAxes(radarAxes)
    setDirty(false)
  }

  const addAxis = () => {
    if (!newSkill) return
    const entry: RadarAxis = { skill: newSkill, label: newLabel.trim() || undefined }
    const next = [...axes, entry]
    setAxes(next)
    setNewSkill('')
    setNewLabel('')
    setDirty(true)
  }

  const removeAxis = (i: number) => {
    setAxes((prev) => prev.filter((_, idx) => idx !== i))
    setDirty(true)
  }

  const save = () => {
    updateRadarAxes(axes)
    toast('レーダーチャートの軸を保存しました')
    setDirty(false)
  }

  const previewMember = currentUser ?? members[0]

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold">レーダーチャート軸設定</h2>
        <p className="text-xs text-muted-foreground">
          メンバーページに表示するスキルレーダーチャートの軸を設定します（3軸以上必要）
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Axes editor */}
        <div>
          <div className="mb-3 flex flex-col gap-2">
            {axes.length === 0 ? (
              <p className="text-sm text-muted-foreground">軸がまだありません</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {axes.map((ax, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
                  >
                    <span className="flex-1 font-medium">{ax.skill}</span>
                    {ax.label && (
                      <span className="text-xs text-muted-foreground">表示名: {ax.label}</span>
                    )}
                    <button
                      onClick={() => removeAxis(i)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">軸を追加</p>
            <div className="flex flex-wrap gap-2">
              <select
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
              >
                <option value="">スキルを選択</option>
                {skillOptions
                  .filter((s) => !axes.some((ax) => ax.skill === s))
                  .map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
              </select>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="表示名（省略可）"
                className="h-8 w-32 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
              />
              <button
                onClick={addAxis}
                disabled={!newSkill}
                className="flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                <Plus className="size-3.5" /> 追加
              </button>
            </div>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            {dirty && (
              <Button variant="outline" size="sm" onClick={syncFromStore}>
                リセット
              </Button>
            )}
            <Button size="sm" onClick={save} disabled={!dirty}>
              保存
            </Button>
          </div>
        </div>

        {/* Preview */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">プレビュー</p>
          {axes.length >= 3 ? (
            <SkillRadarChart
              axes={axes}
              skillLevels={previewMember?.skillLevels ?? []}
              size={200}
            />
          ) : (
            <div className="flex h-[200px] w-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
              <Radar className="size-8 opacity-40" />
              <p className="mt-2 text-xs">3軸以上で表示</p>
            </div>
          )}
          {previewMember && (
            <p className="text-xs text-muted-foreground">
              プレビュー: {previewMember.displayName ?? previewMember.name}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
