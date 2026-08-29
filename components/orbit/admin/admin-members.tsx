'use client'

import { useMemo, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { useToast } from '@/components/orbit/toast'
import { Avatar } from '@/components/orbit/primitives'
import { EditableTags } from '@/components/orbit/editable-tags'
import { Modal } from '@/components/orbit/modal'
import { Button } from '@/components/ui/button'
import { Search, Bell, UserMinus, UserPlus, FolderKanban, Check } from 'lucide-react'
import { BASE_ROLE } from '@/lib/orbit/types'
import type { Member, Role } from '@/lib/orbit/types'
import { tenureYears } from '@/lib/orbit/utils'

function workload(count: number): { label: string; className: string } {
  if (count <= 2) return { label: '稼働少なめ', className: 'text-muted-foreground' }
  if (count <= 5) return { label: '通常', className: 'text-foreground' }
  return { label: 'タスク多め', className: 'text-[var(--status-review-fg)]' }
}

export function AdminMembers() {
  const {
    members,
    projects,
    visibleTasks: tasks,
    updateNotify,
    removeMember,
    updateRole,
    updateReportsTo,
    updateMemberProjects,
    updateJudgment,
    skillOptions,
    addSkillOption,
    roleLevels,
    addMember,
    isFullAdmin,
  } = useOrbit()
  const { go } = useNav()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [removing, setRemoving] = useState<Member | null>(null)
  const [assigningProjects, setAssigningProjects] = useState<Member | null>(null)
  // 人材検索: filters beyond the free-text query, using the talent-management
  // fields set on the person page's 経歴・キャリア tab。経験年数（自己申告の
  // 概数）ではなく、正確な所属日(joinedAt)ベースの所属歴で絞り込む
  const [minTenureYears, setMinTenureYears] = useState('')
  const [managementOnly, setManagementOnly] = useState(false)
  const [desiredArea, setDesiredArea] = useState('')
  const ROLES: Role[] = [BASE_ROLE, ...roleLevels]
  const isTopRole = (role: Role) => roleLevels.length <= 1 || role !== roleLevels[0]

  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newAffiliation, setNewAffiliation] = useState('')
  const [newRole, setNewRole] = useState<Role>(BASE_ROLE)

  const handleAddMember = () => {
    const name = newName.trim()
    if (!name) return
    addMember(name, newEmail.trim(), newAffiliation.trim(), newRole)
    toast(`${name} を登録しました`)
    setNewName('')
    setNewEmail('')
    setNewAffiliation('')
    setNewRole(BASE_ROLE)
  }

  const activeCount = (m: Member) =>
    tasks.filter((t) => t.assigneeIds.includes(m.id) && t.status !== 'done').length

  // 全メンバーが持つ「成長したい領域」の一覧 — 詳細検索の選択肢に使う
  const allDesiredAreas = useMemo(
    () => Array.from(new Set(members.flatMap((m) => m.desiredAreas ?? []))).sort(),
    [members],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const minTenure = minTenureYears.trim() ? Number(minTenureYears) : null
    return members.filter((m) => {
      if (q) {
        const matchesText = [
          m.name,
          m.displayName ?? '',
          m.affiliation,
          ...m.will,
          ...m.judgment,
          ...m.skills,
        ].some((v) => v.toLowerCase().includes(q))
        if (!matchesText) return false
      }
      if (minTenure !== null && (!m.joinedAt || tenureYears(m.joinedAt) < minTenure)) return false
      if (managementOnly && !m.hasManagementExperience) return false
      if (desiredArea && !(m.desiredAreas ?? []).includes(desiredArea)) return false
      return true
    })
  }, [members, query, minTenureYears, managementOnly, desiredArea])

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Members</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        メンバーのWill・Judgment・実績の一覧です。稼働状況は目安として表示しています。
      </p>

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <div className="text-sm font-medium">メンバーを登録</div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          役職を「一般」以外にすれば、最初から管理者としてメンバーを追加できます。
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1.2fr_1.2fr_1fr_0.8fr_auto]">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="氏名"
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          />
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="メールアドレス（任意）"
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          />
          <input
            value={newAffiliation}
            onChange={(e) => setNewAffiliation(e.target.value)}
            placeholder="所属（任意）"
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            className="h-9 cursor-pointer rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <Button className="h-9" disabled={!newName.trim()} onClick={handleAddMember}>
            <UserPlus className="size-4" />
            登録
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="名前・所属・タグで検索"
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
        {/* 人材検索: 経歴・キャリアタブで登録された属性での絞り込み */}
        <input
          type="number"
          min={0}
          value={minTenureYears}
          onChange={(e) => setMinTenureYears(e.target.value)}
          placeholder="所属○年以上"
          title="所属日（joinedAt）からの正確な所属歴で絞り込みます"
          className="h-9 w-28 rounded-lg border border-border bg-card px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
        />
        <label className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-sm">
          <input
            type="checkbox"
            checked={managementOnly}
            onChange={(e) => setManagementOnly(e.target.checked)}
            className="size-3.5 accent-primary"
          />
          管理職経験あり
        </label>
        {allDesiredAreas.length > 0 && (
          <select
            value={desiredArea}
            onChange={(e) => setDesiredArea(e.target.value)}
            className="h-9 cursor-pointer rounded-lg border border-border bg-card px-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="">成長したい領域（すべて）</option>
            {allDesiredAreas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">役職</th>
                <th className="px-4 py-3 font-medium">報告先</th>
                {isFullAdmin && <th className="px-4 py-3 font-medium">担当プロジェクト</th>}
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium">Will</th>
                <th className="px-4 py-3 font-medium">Judgment</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">新規タスク通知</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((m) => {
                const count = activeCount(m)
                const wl = workload(count)
                return (
                  <tr key={m.id} className="transition-colors hover:bg-accent/40">
                    <td className="cursor-pointer px-4 py-3" onClick={() => go({ name: 'person', id: m.id })}>
                      <div className="flex items-center gap-2.5">
                        <Avatar member={m} size={30} />
                        <div>
                          <div className="font-medium">{m.displayName || m.name}</div>
                          <div className="text-xs text-muted-foreground">{m.affiliation}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={m.role}
                        onChange={(e) => updateRole(m.id, e.target.value as Role)}
                        className="h-8 cursor-pointer rounded-md border border-border bg-background px-1.5 text-xs outline-none focus:border-primary"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={m.reportsToId ?? ''}
                        onChange={(e) => updateReportsTo(m.id, e.target.value || null)}
                        className="h-8 w-32 cursor-pointer rounded-md border border-border bg-background px-1.5 text-xs outline-none focus:border-primary"
                      >
                        <option value="">（デフォルト）</option>
                        {members
                          .filter((cand) => cand.id !== m.id && cand.role !== BASE_ROLE)
                          .map((cand) => (
                            <option key={cand.id} value={cand.id}>
                              {cand.displayName || cand.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    {isFullAdmin && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {m.role !== BASE_ROLE && !isTopRole(m.role) ? (
                          <button
                            onClick={() => setAssigningProjects(m)}
                            className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
                          >
                            <FolderKanban className="size-3.5" />
                            {(m.projectIds ?? []).length}件
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {m.role === BASE_ROLE ? '—' : '全て'}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="font-mono tabular-nums">{count}</span>
                    </td>
                    <td className="max-w-[200px] px-4 py-3 text-xs text-muted-foreground">
                      {m.will.length > 0 ? m.will.join(' / ') : '—'}
                    </td>
                    <td className="min-w-[220px] max-w-[280px] px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <EditableTags
                        tags={m.judgment}
                        editable
                        onChange={(next) => updateJudgment(m.id, next)}
                        emptyText="—"
                        placeholder="評価を追加"
                        variant="judgment"
                        options={skillOptions}
                        onNewOption={addSkillOption}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${wl.className}`}>{wl.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => updateNotify(m.id, !m.notify)}
                        className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                          m.notify
                            ? 'border-primary/30 bg-primary-muted text-accent-foreground'
                            : 'border-border text-muted-foreground hover:bg-secondary'
                        }`}
                      >
                        <Bell className="size-3.5" />
                        {m.notify ? 'ON' : 'OFF'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setRemoving(m)}
                        className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                      >
                        <UserMinus className="size-3.5" />
                        退会
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={isFullAdmin ? 10 : 9}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    条件に一致するメンバーがいません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!removing} onClose={() => setRemoving(null)}>
        <h2 className="text-base font-semibold">{removing?.name} を退会させますか？</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          このメンバーが担当していたタスクはすべて未アサインに戻ります。この操作は取り消せません。
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" className="h-9" onClick={() => setRemoving(null)}>
            キャンセル
          </Button>
          <Button
            variant="destructive"
            className="h-9"
            onClick={() => {
              if (removing) {
                removeMember(removing.id)
                toast(`${removing.name} を退会させました`)
              }
              setRemoving(null)
            }}
          >
            退会させる
          </Button>
        </div>
      </Modal>

      <Modal open={!!assigningProjects} onClose={() => setAssigningProjects(null)}>
        <h2 className="text-base font-semibold">
          {assigningProjects?.displayName || assigningProjects?.name} の担当プロジェクト
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          選んだプロジェクトのタスクだけがAdmin画面に表示されるようになります。
        </p>
        <div className="mt-3 flex max-h-80 flex-col gap-1 overflow-auto orbit-scroll">
          {projects.map((p) => {
            const checked = !!assigningProjects?.projectIds?.includes(p.id)
            return (
              <button
                key={p.id}
                onClick={() => {
                  if (!assigningProjects) return
                  const cur = assigningProjects.projectIds ?? []
                  const next = checked ? cur.filter((id) => id !== p.id) : [...cur, p.id]
                  updateMemberProjects(assigningProjects.id, next)
                  setAssigningProjects({ ...assigningProjects, projectIds: next })
                }}
                className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary ${
                  checked ? 'bg-primary-muted' : ''
                }`}
              >
                {p.name}
                {checked && <Check className="size-4 shrink-0 text-primary" strokeWidth={3} />}
              </button>
            )
          })}
          {projects.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">プロジェクトがありません。</p>
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <Button className="h-9" onClick={() => setAssigningProjects(null)}>
            閉じる
          </Button>
        </div>
      </Modal>
    </div>
  )
}
