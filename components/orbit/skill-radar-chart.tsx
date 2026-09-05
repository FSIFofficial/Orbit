'use client'

import type { RadarAxis, SkillLevel } from '@/lib/orbit/types'
import { useI18n } from '@/lib/orbit/i18n'

interface Props {
  axes: RadarAxis[]
  skillLevels: SkillLevel[]
  size?: number
  maxLevel?: number
  color?: string
  label?: string
}

export function SkillRadarChart({
  axes,
  skillLevels,
  size = 200,
  maxLevel = 5,
  color = 'hsl(var(--primary))',
  label,
}: Props) {
  const { t } = useI18n()
  if (axes.length < 3) return null

  const cx = size / 2
  const cy = size / 2
  const r = size * 0.38
  const n = axes.length

  const angleOf = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2

  const pointAt = (i: number, value: number) => {
    const ratio = value / maxLevel
    const angle = angleOf(i)
    return {
      x: cx + r * ratio * Math.cos(angle),
      y: cy + r * ratio * Math.sin(angle),
    }
  }

  const gridLevels = Array.from({ length: maxLevel }, (_, i) => i + 1)

  const levelOf = (skill: string) => {
    const found = skillLevels.find((sl) => sl.skill === skill)
    return found ? found.level : 0
  }

  const dataPoints = axes.map((ax, i) => pointAt(i, levelOf(ax.skill)))
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={label ?? t('career.radarChart.title')}>
      {/* Grid rings */}
      {gridLevels.map((lv) => {
        const pts = axes.map((_, i) => {
          const p = pointAt(i, lv)
          return `${p.x},${p.y}`
        })
        return (
          <polygon
            key={lv}
            points={pts.join(' ')}
            fill="none"
            stroke="var(--border)"
            strokeWidth={0.5}
          />
        )
      })}

      {/* Axis lines */}
      {axes.map((ax, i) => {
        const outer = pointAt(i, maxLevel)
        return (
          <line
            key={ax.skill}
            x1={cx}
            y1={cy}
            x2={outer.x}
            y2={outer.y}
            stroke="var(--border)"
            strokeWidth={0.5}
          />
        )
      })}

      {/* Data polygon */}
      <path d={dataPath} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={1.5} />

      {/* Axis labels */}
      {axes.map((ax, i) => {
        const angle = angleOf(i)
        const lx = cx + (r + 18) * Math.cos(angle)
        const ly = cy + (r + 18) * Math.sin(angle)
        const anchor = Math.abs(Math.cos(angle)) < 0.1 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end'
        return (
          <text
            key={ax.skill}
            x={lx}
            y={ly}
            textAnchor={anchor}
            dominantBaseline="central"
            fontSize={9}
            fill="var(--muted-foreground)"
          >
            {ax.label ?? ax.skill}
          </text>
        )
      })}

      {/* Level dots */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color} />
      ))}
    </svg>
  )
}
