'use client'

import { cn } from '@/lib/utils'
import {
  STATUS_COLOR,
  STATUS_LABEL,
  PRIORITY_LINE,
  type Difficulty,
  type Priority,
  type TaskStatus,
} from '@/lib/orbit/types'
import type { Member } from '@/lib/orbit/types'

export function Avatar({
  member,
  size = 28,
  className,
}: {
  member?: Member | null
  size?: number
  className?: string
}) {
  if (!member) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-muted-foreground',
          className,
        )}
        style={{ width: size, height: size, fontSize: size * 0.36 }}
        aria-hidden
      >
        ?
      </span>
    )
  }
  if (member.avatarUrl) {
    return (
      <img
        src={member.avatarUrl}
        alt={member.displayName || member.name}
        title={member.displayName || member.name}
        className={cn('inline-block shrink-0 rounded-full object-cover', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        backgroundColor: member.avatarColor,
      }}
      title={member.displayName || member.name}
    >
      {member.initials}
    </span>
  )
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const color = STATUS_COLOR[status]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
      <span
        className="inline-block size-2 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {STATUS_LABEL[status]}
    </span>
  )
}

export function StatusDot({ status }: { status: TaskStatus }) {
  return (
    <span
      className="inline-block size-2 rounded-full"
      style={{ backgroundColor: STATUS_COLOR[status] }}
      aria-hidden
    />
  )
}

const difficultyStyles: Record<Difficulty, string> = {
  新人歓迎: 'bg-success-muted text-success border-success-border',
  少し経験必要: 'bg-warning-muted text-warning border-warning-border',
  経験者向け: 'bg-danger-muted text-danger border-danger-border',
}

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
        difficultyStyles[difficulty],
      )}
    >
      {difficulty}
    </span>
  )
}

export function Tag({
  children,
  className,
  onRemove,
}: {
  children: React.ReactNode
  className?: string
  onRemove?: () => void
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground',
        className,
      )}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-foreground"
          aria-label="削除"
        >
          ×
        </button>
      )}
    </span>
  )
}

export function ProjectTag({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="inline-block size-1.5 rounded-full bg-primary/60" aria-hidden />
      {name}
    </span>
  )
}

export function DepartmentTag({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-info-border bg-info-muted px-1.5 py-0.5 text-[11px] font-medium text-info">
      {name}
    </span>
  )
}

export function UnassignedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md bg-warning-muted px-1.5 py-0.5 text-[11px] font-medium text-warning',
        className,
      )}
    >
      未アサイン
    </span>
  )
}

// Small priority indicator: filled dot + label. High priority is emphasized.
export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-medium',
        priority === '高' ? 'text-danger' : 'text-muted-foreground',
      )}
    >
      <span
        className="inline-block size-1.5 rounded-full"
        style={{ backgroundColor: PRIORITY_LINE[priority] }}
        aria-hidden
      />
      優先度: {priority}
    </span>
  )
}

export function Card({
  children,
  className,
  onClick,
  as: As = 'div',
}: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  as?: 'div' | 'button'
}) {
  return (
    <As
      onClick={onClick}
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground shadow-[0_1px_2px_rgba(16,24,40,0.04)]',
        onClick &&
          'cursor-pointer text-left transition-all hover:border-border-strong hover:shadow-[0_2px_8px_rgba(16,24,40,0.06)]',
        className,
      )}
    >
      {children}
    </As>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  )
}

export function OrbitMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="text-primary"
    >
      <ellipse
        cx="12"
        cy="12"
        rx="10"
        ry="5"
        stroke="currentColor"
        strokeWidth="1.4"
        transform="rotate(-30 12 12)"
      />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <circle cx="20.2" cy="6.6" r="1.6" fill="currentColor" />
    </svg>
  )
}
