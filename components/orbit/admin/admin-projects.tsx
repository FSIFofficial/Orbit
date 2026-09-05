'use client'

import { useEffect, useMemo, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useToast } from '@/components/orbit/toast'
import { Avatar, SectionLabel, Tag } from '@/components/orbit/primitives'
import { Modal } from '@/components/orbit/modal'
import { Button } from '@/components/ui/button'
import { DEPARTMENTS, DIFFICULTY_LABEL, PRIORITIES } from '@/lib/orbit/types'
import type {
  Department,
  Difficulty,
  Member,
  Priority,
  Project,
  ProjectTemplateTask,
  RecurringTaskRule,
  Task,
  TaskSetTemplate,
  TaskSetTemplateItem,
} from '@/lib/orbit/types'
import {
  Archive,
  ArchiveRestore,
  Check,
  GripVertical,
  LayoutTemplate,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  UserCog,
  UserPlus,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// 暫定値、要調整: プロジェクトの「人材不足」閾値（未完了タスク数÷担当人数）
const UNDERSTAFFED_RATIO_THRESHOLD = 3

// 未完了タスク数 ÷ アサイン済みメンバー数（重複除く）の比率を計算する。
// メンバーがいない場合は Infinity を返す（タスクがあっても0人なら常に不足）。
function calcStaffingRatio(projectId: string, tasks: Task[], members: Member[]): number {
  const incomplete = tasks.filter(
    (t) => t.projectId === projectId && t.status !== 'done' && t.assigneeIds.length > 0,
  )
  if (incomplete.length === 0) return 0
  const uniqueAssignees = new Set(incomplete.flatMap((t) => t.assigneeIds))
  return uniqueAssignees.size === 0 ? Infinity : incomplete.length / uniqueAssignees.size
}

export function AdminProjects() {
  const {
    adminProjects: projects,
    adminTasks: visibleTasks,
    members,
    addProject,
    removeProject,
    updateProjectMembers,
    updateProjectOwner,
    updateProjectParent,
    updateProjectDetails,
    getProjectMembers,
    projectTypes,
    projectTemplates,
    setProjectTemplateTasks,
    removeProjectType,
    taskSetTemplates,
    addTaskSetTemplate,
    updateTaskSetTemplateItems,
    removeTaskSetTemplate,
    applyTaskSetTemplate,
    recurringRules,
    addRecurringRule,
    removeRecurringRule,
    toggleRecurringRule,
    updateRecurringRule,
    setProjectArchived,
    setProjectOrder,
    isFullAdmin,
  } = useOrbit()
  const toast = useToast()
  const [removing, setRemoving] = useState<Project | null>(null)
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null)
  const [applyingTo, setApplyingTo] = useState<Project | null>(null)
  const [managingMembersOf, setManagingMembersOf] = useState<Project | null>(null)
  const [managingOwnerOf, setManagingOwnerOf] = useState<Project | null>(null)
  const [editingDetailsOf, setEditingDetailsOf] = useState<Project | null>(null)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [detailsDraft, setDetailsDraft] = useState({ description: '', type: '' })
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('')
  const [parentId, setParentId] = useState('')
  const [newType, setNewType] = useState('')
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateDesc, setNewTemplateDesc] = useState('')

  const handleCreate = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    addProject(trimmed, description.trim(), type || undefined, parentId || undefined)
    const templateCount = type ? (projectTemplates[type]?.length ?? 0) : 0
    toast(
      templateCount > 0
        ? `「${trimmed}」を作成し、テンプレートの${templateCount}件のタスクを追加しました`
        : `「${trimmed}」を作成しました`,
    )
    setName('')
    setDescription('')
    setType('')
    setParentId('')
  }

  const activeList = useMemo(() => projects.filter((p) => !p.archived), [projects])
  const archivedList = useMemo(() => projects.filter((p) => p.archived), [projects])

  // プロジェクトの表示順（並び替え） — アーカイブ済みは並び替え対象外なので
  // 元の順序のまま末尾に残し、アクティブなものだけ入れ替える
  const reorderProjects = (draggedId: string, dropOnId: string) => {
    if (draggedId === dropOnId) return
    const activeIds = activeList.map((p) => p.id)
    const next = activeIds.filter((id) => id !== draggedId)
    next.splice(next.indexOf(dropOnId), 0, draggedId)
    setProjectOrder([...next, ...archivedList.map((p) => p.id)])
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isFullAdmin
          ? '新しいプロジェクトを追加します。種類を選ぶと、その種類のテンプレートタスクが自動で作成されます。'
          : '担当プロジェクトの一覧です。新規追加やテンプレート管理は代表など上位の管理者のみ行えます。'}
      </p>

      {isFullAdmin && (
        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr]">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                プロジェクト名
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：新歓イベント2027"
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">概要</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="任意"
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">種類</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              >
                <option value="">未設定</option>
                {projectTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">上位プロジェクト（任意）</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary sm:w-80"
            >
              <option value="">なし（最上位）</option>
              {activeList.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <Button className="mt-3 h-9" disabled={!name.trim()} onClick={handleCreate}>
            <Plus className="size-4" />
            プロジェクトを追加
          </Button>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              {isFullAdmin && <th className="w-8 px-2 py-2.5" />}
              <th className="px-4 py-2.5 font-medium">プロジェクト</th>
              <th className="px-4 py-2.5 font-medium">上位</th>
              <th className="px-4 py-2.5 font-medium">種類</th>
              <th className="px-4 py-2.5 font-medium">概要</th>
              <th className="px-4 py-2.5 font-medium">担当者</th>
              <th className="px-4 py-2.5 font-medium">責任者</th>
              <th className="px-4 py-2.5 font-medium">タスク数</th>
              <th className="px-4 py-2.5 font-medium" title="未完了タスク数÷担当人数の比率（暫定閾値）">人材</th>
              {isFullAdmin && <th className="px-4 py-2.5 font-medium" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {activeList.map((p) => {
              const pm = getProjectMembers(p.id)
              const owner = members.find((m) => m.id === p.ownerId)
              const parentProject = projects.find((pp) => pp.id === p.parentId)
              const taskCount = visibleTasks.filter((t) => t.projectId === p.id).length
              const staffingRatio = calcStaffingRatio(p.id, visibleTasks, members)
              const isUnderstaffed = staffingRatio >= UNDERSTAFFED_RATIO_THRESHOLD
              return (
                <tr
                  key={p.id}
                  draggable={isFullAdmin}
                  onDragStart={() => setDraggingProjectId(p.id)}
                  onDragOver={(e) => isFullAdmin && e.preventDefault()}
                  onDrop={() => {
                    if (draggingProjectId) reorderProjects(draggingProjectId, p.id)
                    setDraggingProjectId(null)
                  }}
                  onDragEnd={() => setDraggingProjectId(null)}
                  className={cn(draggingProjectId === p.id && 'opacity-40')}
                >
                  {isFullAdmin && (
                    <td className="w-8 cursor-grab px-2 py-3 text-muted-foreground">
                      <GripVertical className="size-3.5" />
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium">
                    {p.parentId && <span className="mr-1 text-muted-foreground">└</span>}
                    {p.name}
                  </td>
                  <td className="px-4 py-3">
                    {parentProject ? (
                      <div className="flex items-center gap-1">
                        <span className="max-w-[120px] truncate text-xs text-muted-foreground">{parentProject.name}</span>
                        {isFullAdmin && (
                          <button
                            onClick={() => updateProjectParent(p.id, null)}
                            className="text-muted-foreground hover:text-foreground"
                            title="上位プロジェクトを解除"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ) : isFullAdmin ? (
                      <select
                        value=""
                        onChange={(e) => e.target.value && updateProjectParent(p.id, e.target.value)}
                        className="h-7 cursor-pointer rounded-md border border-border bg-background px-1.5 text-xs outline-none focus:border-primary"
                      >
                        <option value="">設定</option>
                        {activeList.filter((pp) => pp.id !== p.id).map((pp) => (
                          <option key={pp.id} value={pp.id}>{pp.name}</option>
                        ))}
                      </select>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {p.type ? <Tag>{p.type}</Tag> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate">{p.description || '—'}</span>
                      <button
                        onClick={() => {
                          setDetailsDraft({ description: p.description, type: p.type ?? '' })
                          setEditingDetailsOf(p)
                        }}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label="概要・種類を編集"
                        title="概要・種類を編集"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {pm.length > 0 ? (
                        <div className="flex -space-x-1.5">
                          {pm.slice(0, 6).map((m) => (
                            <span key={m.id} className="rounded-full ring-2 ring-card" title={m.displayName || m.name}>
                              <Avatar member={m} size={22} />
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      <button
                        onClick={() => setManagingMembersOf(p)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="担当者を管理"
                      >
                        <UserPlus className="size-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {owner ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Avatar member={owner} size={22} />
                          <span className="text-xs">{owner.displayName || owner.name}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      <button
                        onClick={() => setManagingOwnerOf(p)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="責任者を編集"
                      >
                        <UserCog className="size-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{taskCount}</td>
                  <td className="px-4 py-3">
                    {isUnderstaffed ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                        title={`未完了タスク/担当者比率: ${staffingRatio === Infinity ? '∞' : staffingRatio.toFixed(1)}（閾値 ${UNDERSTAFFED_RATIO_THRESHOLD}、暫定値・要調整）`}
                      >
                        <AlertTriangle className="size-3" />
                        不足
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  {isFullAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {taskSetTemplates.length > 0 && (
                          <button
                            onClick={() => setApplyingTo(p)}
                            className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
                          >
                            <LayoutTemplate className="size-3.5" />
                            テンプレート適用
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setProjectArchived(p.id, true)
                            toast(`「${p.name}」をアーカイブしました`)
                          }}
                          className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
                        >
                          <Archive className="size-3.5" />
                          アーカイブ
                        </button>
                        <button
                          onClick={() => setRemoving(p)}
                          className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                          削除
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {isFullAdmin && archivedList.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5 text-sm font-medium text-muted-foreground">
            アーカイブ済みプロジェクト（{archivedList.length}）
          </div>
          <ul className="divide-y divide-border">
            {archivedList.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 truncate text-muted-foreground">{p.name}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => {
                      setProjectArchived(p.id, false)
                      toast(`「${p.name}」のアーカイブを解除しました`)
                    }}
                    className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
                  >
                    <ArchiveRestore className="size-3.5" />
                    アーカイブ解除
                  </button>
                  <button
                    onClick={() => setRemoving(p)}
                    className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Project-type templates */}
      {isFullAdmin && (
      <div className="mt-10">
        <h2 className="text-base font-semibold">プロジェクトの種類 / テンプレートタスク</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          種類ごとに、新規プロジェクト作成時に自動で追加するタスクを定義できます。
        </p>

        <div className="mt-3 flex items-center gap-1.5">
          <input
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter' && newType.trim()) {
                setProjectTemplateTasks(newType.trim(), projectTemplates[newType.trim()] ?? [])
                setNewType('')
              }
            }}
            placeholder="新しい種類名（例：コンテンツ開発）"
            className="h-9 w-64 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
          />
          <Button
            variant="outline"
            className="h-9"
            disabled={!newType.trim()}
            onClick={() => {
              setProjectTemplateTasks(newType.trim(), projectTemplates[newType.trim()] ?? [])
              setNewType('')
            }}
          >
            <Plus className="size-4" />
            種類を追加
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {projectTypes.map((t) => (
            <TemplateTypeCard
              key={t}
              type={t}
              tasks={projectTemplates[t] ?? []}
              onChange={(tasks) => setProjectTemplateTasks(t, tasks)}
              onRemoveType={() => removeProjectType(t)}
            />
          ))}
          {projectTypes.length === 0 && (
            <p className="text-sm text-muted-foreground">まだ種類が登録されていません。</p>
          )}
        </div>
      </div>
      )}

      {/* 業務テンプレート (item 1) — reusable task-set templates, applicable
          on demand to any existing project, with dependency structure */}
      {isFullAdmin && (
      <div className="mt-10">
        <h2 className="text-base font-semibold">業務テンプレート</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          よくある業務（イベント開催・記事制作など）をタスクセットとして保存し、既存プロジェクトに
          一括で適用できます。前提タスクの構造も一緒に保存されます。
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <input
            value={newTemplateName}
            onChange={(e) => setNewTemplateName(e.target.value)}
            placeholder="テンプレート名（例：イベント開催）"
            className="h-9 w-56 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
          />
          <input
            value={newTemplateDesc}
            onChange={(e) => setNewTemplateDesc(e.target.value)}
            placeholder="説明（任意）"
            className="h-9 w-56 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
          />
          <Button
            variant="outline"
            className="h-9"
            disabled={!newTemplateName.trim()}
            onClick={() => {
              addTaskSetTemplate(newTemplateName.trim(), newTemplateDesc.trim())
              setNewTemplateName('')
              setNewTemplateDesc('')
            }}
          >
            <Plus className="size-4" />
            テンプレートを追加
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {taskSetTemplates.map((t) => (
            <TaskSetTemplateCard
              key={t.id}
              template={t}
              onChangeItems={(items) => updateTaskSetTemplateItems(t.id, items)}
              onRemove={() => removeTaskSetTemplate(t.id)}
            />
          ))}
          {taskSetTemplates.length === 0 && (
            <p className="text-sm text-muted-foreground">まだ業務テンプレートがありません。</p>
          )}
        </div>
      </div>
      )}

      {/* 定期タスク (item 2) */}
      {isFullAdmin && (
      <div className="mt-10">
        <h2 className="text-base font-semibold">定期タスク</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          毎週・毎月発生する業務を自動生成します。サーバー側の定期実行はないため、該当日に誰かが
          Orbitを開いたタイミングで1回だけ生成されます。
        </p>
        <RecurringRuleForm
          projects={projects}
          editingRule={recurringRules.find((r) => r.id === editingRuleId) ?? null}
          onAdd={addRecurringRule}
          onUpdate={(fields) => {
            if (editingRuleId) updateRecurringRule(editingRuleId, fields)
            setEditingRuleId(null)
          }}
          onCancelEdit={() => setEditingRuleId(null)}
        />
        <ul className="mt-4 flex flex-col gap-1.5">
          {recurringRules.map((r) => (
            <RecurringRuleRow
              key={r.id}
              rule={r}
              editing={editingRuleId === r.id}
              projectName={projects.find((p) => p.id === r.projectId)?.name ?? ''}
              onEdit={() => setEditingRuleId(r.id)}
              onToggle={() => toggleRecurringRule(r.id)}
              onRemove={() => {
                if (editingRuleId === r.id) setEditingRuleId(null)
                removeRecurringRule(r.id)
              }}
            />
          ))}
          {recurringRules.length === 0 && (
            <li className="text-sm text-muted-foreground">まだ定期タスクがありません。</li>
          )}
        </ul>
      </div>
      )}

      <Modal open={!!applyingTo} onClose={() => setApplyingTo(null)}>
        <h2 className="text-base font-semibold">「{applyingTo?.name}」にテンプレートを適用</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          選んだテンプレートのタスクが、前提タスク構造ごとこのプロジェクトに追加されます。
        </p>
        <div className="mt-3 flex max-h-80 flex-col gap-1 overflow-auto orbit-scroll">
          {taskSetTemplates.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                if (!applyingTo) return
                applyTaskSetTemplate(t.id, applyingTo.id)
                toast(`「${t.name}」を「${applyingTo.name}」に適用し、${t.items.length}件のタスクを追加しました`)
                setApplyingTo(null)
              }}
              disabled={t.items.length === 0}
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <div>
                <div className="font-medium">{t.name}</div>
                {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{t.items.length}件</span>
            </button>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="ghost" className="h-9" onClick={() => setApplyingTo(null)}>
            閉じる
          </Button>
        </div>
      </Modal>

      <Modal open={!!managingMembersOf} onClose={() => setManagingMembersOf(null)}>
        <h2 className="text-base font-semibold">「{managingMembersOf?.name}」の担当者</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          このプロジェクトのタスクに誰かをアサインすると自動的にここへ追加されます。
        </p>
        <div className="mt-3 flex max-h-80 flex-col gap-1 overflow-auto orbit-scroll">
          {members.map((m) => {
            const checked = !!managingMembersOf?.memberIds?.includes(m.id)
            return (
              <button
                key={m.id}
                onClick={() => {
                  if (!managingMembersOf) return
                  const cur = managingMembersOf.memberIds ?? []
                  const next = checked ? cur.filter((id) => id !== m.id) : [...cur, m.id]
                  updateProjectMembers(managingMembersOf.id, next)
                  setManagingMembersOf({ ...managingMembersOf, memberIds: next })
                }}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary',
                  checked && 'bg-primary-muted',
                )}
              >
                <Avatar member={m} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{m.displayName || m.name}</div>
                  <div className="text-xs text-muted-foreground">{m.affiliation}</div>
                </div>
                {checked && <Check className="size-4 shrink-0 text-primary" strokeWidth={3} />}
              </button>
            )
          })}
        </div>
        <div className="mt-5 flex justify-end">
          <Button className="h-9" onClick={() => setManagingMembersOf(null)}>
            閉じる
          </Button>
        </div>
      </Modal>

      <Modal open={!!managingOwnerOf} onClose={() => setManagingOwnerOf(null)}>
        <h2 className="text-base font-semibold">「{managingOwnerOf?.name}」の責任者</h2>
        <div className="mt-3 flex max-h-80 flex-col gap-1 overflow-auto orbit-scroll">
          <button
            onClick={() => {
              if (!managingOwnerOf) return
              updateProjectOwner(managingOwnerOf.id, null)
              setManagingOwnerOf(null)
            }}
            className="flex items-center gap-2.5 rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
          >
            <Avatar member={null} size={28} />
            未設定
          </button>
          {members.map((m) => {
            const checked = managingOwnerOf?.ownerId === m.id
            return (
              <button
                key={m.id}
                onClick={() => {
                  if (!managingOwnerOf) return
                  updateProjectOwner(managingOwnerOf.id, m.id)
                  setManagingOwnerOf(null)
                }}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary',
                  checked && 'bg-primary-muted',
                )}
              >
                <Avatar member={m} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{m.displayName || m.name}</div>
                  <div className="text-xs text-muted-foreground">{m.affiliation}</div>
                </div>
                {checked && <Check className="size-4 shrink-0 text-primary" strokeWidth={3} />}
              </button>
            )
          })}
        </div>
      </Modal>

      <Modal open={!!editingDetailsOf} onClose={() => setEditingDetailsOf(null)}>
        <h2 className="text-base font-semibold">「{editingDetailsOf?.name}」の概要・種類を編集</h2>
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">概要</label>
            <input
              value={detailsDraft.description}
              onChange={(e) => setDetailsDraft({ ...detailsDraft, description: e.target.value })}
              placeholder="任意"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">種類</label>
            <select
              value={detailsDraft.type}
              onChange={(e) => setDetailsDraft({ ...detailsDraft, type: e.target.value })}
              className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            >
              <option value="">未設定</option>
              {projectTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              種類を変更しても、既存タスクやこのプロジェクトには影響しません（新規作成時のテンプレート自動追加のみに使われます）。
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" className="h-9" onClick={() => setEditingDetailsOf(null)}>
            キャンセル
          </Button>
          <Button
            className="h-9"
            onClick={() => {
              if (editingDetailsOf) {
                updateProjectDetails(
                  editingDetailsOf.id,
                  detailsDraft.description.trim(),
                  detailsDraft.type || undefined,
                )
                toast('プロジェクトを更新しました')
              }
              setEditingDetailsOf(null)
            }}
          >
            保存
          </Button>
        </div>
      </Modal>

      <Modal open={!!removing} onClose={() => setRemoving(null)}>
        <h2 className="text-base font-semibold">「{removing?.name}」を削除しますか？</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          このプロジェクトに紐づくタスク（
          {removing ? visibleTasks.filter((t) => t.projectId === removing.id).length : 0}
          件）もすべて削除されます。この操作は取り消せません。
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
                removeProject(removing.id)
                toast(`「${removing.name}」を削除しました`)
              }
              setRemoving(null)
            }}
          >
            削除する
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function TemplateTypeCard({
  type,
  tasks,
  onChange,
  onRemoveType,
}: {
  type: string
  tasks: ProjectTemplateTask[]
  onChange: (tasks: ProjectTemplateTask[]) => void
  onRemoveType: () => void
}) {
  const [draft, setDraft] = useState({
    name: '',
    department: DEPARTMENTS[0] as Department,
    category: '',
    skills: '',
    difficulty: DIFFICULTY_LABEL[0] as Difficulty,
    priority: '中' as Priority,
  })

  const addTask = () => {
    if (!draft.name.trim()) return
    const newTask: ProjectTemplateTask = {
      id: `tpl-${Math.random().toString(36).slice(2, 9)}`,
      name: draft.name.trim(),
      department: draft.department,
      category: draft.category.trim(),
      skills: draft.skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      difficulty: draft.difficulty,
      priority: draft.priority,
    }
    onChange([...tasks, newTask])
    setDraft({ ...draft, name: '', category: '', skills: '' })
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>{type}</SectionLabel>
        <button
          onClick={onRemoveType}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
          種類を削除
        </button>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {tasks.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-secondary/40 px-3 py-1.5 text-sm"
          >
            <div className="min-w-0 flex-1">
              <span className="font-medium">{t.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {t.department} ・ {t.category} ・ {t.difficulty} ・ 優先度{t.priority}
              </span>
            </div>
            <button
              onClick={() => onChange(tasks.filter((x) => x.id !== t.id))}
              className="shrink-0 text-muted-foreground hover:text-destructive"
              aria-label="削除"
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
        {tasks.length === 0 && (
          <li className="text-xs text-muted-foreground">まだテンプレートタスクがありません。</li>
        )}
      </ul>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="タスク名"
          className="col-span-2 h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary sm:col-span-2"
        />
        <select
          value={draft.department}
          onChange={(e) => setDraft({ ...draft, department: e.target.value as Department })}
          className="h-8 cursor-pointer rounded-md border border-border bg-background px-1 text-xs outline-none"
        >
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          placeholder="カテゴリ"
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        <select
          value={draft.difficulty}
          onChange={(e) => setDraft({ ...draft, difficulty: e.target.value as Difficulty })}
          className="h-8 cursor-pointer rounded-md border border-border bg-background px-1 text-xs outline-none"
        >
          {DIFFICULTY_LABEL.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={draft.priority}
          onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}
          className="h-8 cursor-pointer rounded-md border border-border bg-background px-1 text-xs outline-none"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              優先度{p}
            </option>
          ))}
        </select>
        <input
          value={draft.skills}
          onChange={(e) => setDraft({ ...draft, skills: e.target.value })}
          placeholder="要求スキル（カンマ区切り）"
          className="col-span-2 h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary sm:col-span-3"
        />
        <Button
          variant="outline"
          className="col-span-2 h-8 text-xs sm:col-span-3"
          disabled={!draft.name.trim()}
          onClick={addTask}
        >
          <Plus className="size-3.5" />
          テンプレートタスクを追加
        </Button>
      </div>
    </div>
  )
}

const EMPTY_TASK_SET_DRAFT = {
  name: '',
  department: DEPARTMENTS[0] as Department,
  category: '',
  skills: '',
  difficulty: DIFFICULTY_LABEL[0] as Difficulty,
  priority: '中' as Priority,
  dependsOn: [] as string[],
}

function TaskSetTemplateCard({
  template,
  onChangeItems,
  onRemove,
}: {
  template: TaskSetTemplate
  onChangeItems: (items: TaskSetTemplateItem[]) => void
  onRemove: () => void
}) {
  const [draft, setDraft] = useState(EMPTY_TASK_SET_DRAFT)
  const [editingId, setEditingId] = useState<string | null>(null)

  const itemName = (id: string) => template.items.find((i) => i.id === id)?.name ?? '?'

  const startEdit = (item: TaskSetTemplateItem) => {
    setEditingId(item.id)
    setDraft({
      name: item.name,
      department: item.department,
      category: item.category,
      skills: item.skills.join(','),
      difficulty: item.difficulty,
      priority: item.priority,
      dependsOn: item.dependsOn ?? [],
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft(EMPTY_TASK_SET_DRAFT)
  }

  const submitItem = () => {
    if (!draft.name.trim()) return
    const skills = draft.skills.split(',').map((s) => s.trim()).filter(Boolean)
    const dependsOn = draft.dependsOn.length > 0 ? draft.dependsOn : undefined
    if (editingId) {
      onChangeItems(
        template.items.map((i) =>
          i.id === editingId
            ? {
                ...i,
                name: draft.name.trim(),
                department: draft.department,
                category: draft.category.trim(),
                skills,
                difficulty: draft.difficulty,
                priority: draft.priority,
                dependsOn,
              }
            : i,
        ),
      )
      setEditingId(null)
    } else {
      const newItem: TaskSetTemplateItem = {
        id: `tsti-${Math.random().toString(36).slice(2, 9)}`,
        name: draft.name.trim(),
        department: draft.department,
        category: draft.category.trim(),
        skills,
        difficulty: draft.difficulty,
        priority: draft.priority,
        dependsOn,
      }
      onChangeItems([...template.items, newItem])
    }
    setDraft({ ...EMPTY_TASK_SET_DRAFT })
  }

  const removeItem = (id: string) => {
    if (editingId === id) cancelEdit()
    onChangeItems(
      template.items
        .filter((i) => i.id !== id)
        .map((i) => ({ ...i, dependsOn: i.dependsOn?.filter((d) => d !== id) })),
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <SectionLabel>{template.name}</SectionLabel>
          {template.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{template.description}</p>
          )}
        </div>
        <button
          onClick={onRemove}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
          テンプレートを削除
        </button>
      </div>

      <ol className="mt-3 flex flex-col gap-1.5">
        {template.items.map((item, i) => (
          <li
            key={item.id}
            className={cn(
              'flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm',
              editingId === item.id
                ? 'border-primary/40 bg-primary-muted/40'
                : 'border-border/60 bg-secondary/40',
            )}
          >
            <div className="min-w-0 flex-1">
              <span className="font-mono text-xs text-muted-foreground">{i + 1}.</span>{' '}
              <span className="font-medium">{item.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {item.department} ・ {item.category} ・ {item.difficulty} ・ 優先度{item.priority}
              </span>
              {item.dependsOn && item.dependsOn.length > 0 && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  前提：{item.dependsOn.map(itemName).join('、')}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => startEdit(item)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="編集"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                onClick={() => removeItem(item.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="削除"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </li>
        ))}
        {template.items.length === 0 && (
          <li className="text-xs text-muted-foreground">まだタスクがありません。</li>
        )}
      </ol>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="タスク名"
          className="col-span-2 h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary sm:col-span-2"
        />
        <select
          value={draft.department}
          onChange={(e) => setDraft({ ...draft, department: e.target.value as Department })}
          className="h-8 cursor-pointer rounded-md border border-border bg-background px-1 text-xs outline-none"
        >
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          placeholder="カテゴリ"
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        <select
          value={draft.difficulty}
          onChange={(e) => setDraft({ ...draft, difficulty: e.target.value as Difficulty })}
          className="h-8 cursor-pointer rounded-md border border-border bg-background px-1 text-xs outline-none"
        >
          {DIFFICULTY_LABEL.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={draft.priority}
          onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}
          className="h-8 cursor-pointer rounded-md border border-border bg-background px-1 text-xs outline-none"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              優先度{p}
            </option>
          ))}
        </select>
        <input
          value={draft.skills}
          onChange={(e) => setDraft({ ...draft, skills: e.target.value })}
          placeholder="要求スキル（カンマ区切り）"
          className="col-span-2 h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary sm:col-span-3"
        />
      </div>

      {template.items.filter((item) => item.id !== editingId).length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">前提タスク（任意）</p>
          <div className="flex flex-wrap gap-1.5">
            {template.items
              .filter((item) => item.id !== editingId)
              .map((item) => {
                const checked = draft.dependsOn.includes(item.id)
                return (
                  <button
                    key={item.id}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        dependsOn: checked
                          ? draft.dependsOn.filter((id) => id !== item.id)
                          : [...draft.dependsOn, item.id],
                      })
                    }
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                      checked
                        ? 'border-primary/30 bg-primary-muted text-accent-foreground'
                        : 'border-border text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    {checked && <Check className="size-3" strokeWidth={3} />}
                    {item.name}
                  </button>
                )
              })}
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        <Button
          variant="outline"
          className="h-8 flex-1 text-xs"
          disabled={!draft.name.trim()}
          onClick={submitItem}
        >
          {editingId ? (
            <>
              <Check className="size-3.5" />
              変更を保存
            </>
          ) : (
            <>
              <Plus className="size-3.5" />
              タスクを追加
            </>
          )}
        </Button>
        {editingId && (
          <Button variant="ghost" className="h-8 shrink-0 text-xs" onClick={cancelEdit}>
            キャンセル
          </Button>
        )}
      </div>
    </div>
  )
}

const EMPTY_RECURRING_DRAFT = {
  name: '',
  department: DEPARTMENTS[0] as Department,
  category: '',
  difficulty: DIFFICULTY_LABEL[0] as Difficulty,
  priority: '中' as Priority,
  frequency: 'weekly' as 'weekly' | 'monthly',
  dayOfWeek: 1,
  dayOfMonth: 1,
  dueInDays: 3,
  // item 13: 状態起点（前タスクがこのステータスになったら次を生成）
  triggerOnStatus: '' as '' | import('@/lib/orbit/types').TaskStatus,
  // item 13: 例外スキップ日（カンマ区切り入力 → 保存時配列に変換）
  skipDatesInput: '',
}

function RecurringRuleForm({
  projects,
  editingRule,
  onAdd,
  onUpdate,
  onCancelEdit,
}: {
  projects: Project[]
  editingRule: RecurringTaskRule | null
  onAdd: (rule: Omit<RecurringTaskRule, 'id' | 'active' | 'lastGeneratedDate'>) => void
  onUpdate: (fields: Omit<RecurringTaskRule, 'id' | 'active' | 'lastGeneratedDate'>) => void
  onCancelEdit: () => void
}) {
  const [draft, setDraft] = useState({ ...EMPTY_RECURRING_DRAFT, projectId: projects[0]?.id ?? '' })

  useEffect(() => {
    if (editingRule) {
      setDraft({
        name: editingRule.name,
        projectId: editingRule.projectId,
        department: editingRule.department,
        category: editingRule.category,
        difficulty: editingRule.difficulty,
        priority: editingRule.priority,
        frequency: editingRule.frequency,
        dayOfWeek: editingRule.dayOfWeek ?? 1,
        dayOfMonth: editingRule.dayOfMonth ?? 1,
        dueInDays: editingRule.dueInDays ?? 3,
        triggerOnStatus: (editingRule.triggerOnStatus ?? '') as '' | import('@/lib/orbit/types').TaskStatus,
        skipDatesInput: (editingRule.skipDates ?? []).join(', '),
      })
    }
  }, [editingRule])

  const submit = () => {
    if (!draft.name.trim() || !draft.projectId) return
    const skipDates = draft.skipDatesInput
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
    const rule = {
      name: draft.name.trim(),
      projectId: draft.projectId,
      department: draft.department,
      category: draft.category.trim(),
      skills: [],
      difficulty: draft.difficulty,
      priority: draft.priority,
      frequency: draft.frequency,
      dayOfWeek: draft.frequency === 'weekly' ? draft.dayOfWeek : undefined,
      dayOfMonth: draft.frequency === 'monthly' ? draft.dayOfMonth : undefined,
      dueInDays: draft.dueInDays,
      triggerOnStatus: draft.triggerOnStatus || undefined,
      skipDates: skipDates.length ? skipDates : undefined,
    }
    if (editingRule) {
      onUpdate(rule)
    } else {
      onAdd(rule)
      setDraft({ ...EMPTY_RECURRING_DRAFT, projectId: projects[0]?.id ?? '' })
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-card p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="タスク名（例：週刊宇宙ニュース作成）"
          className="col-span-2 h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        <select
          value={draft.projectId}
          onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}
          className="h-8 cursor-pointer rounded-md border border-border bg-background px-1 text-xs outline-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={draft.department}
          onChange={(e) => setDraft({ ...draft, department: e.target.value as Department })}
          className="h-8 cursor-pointer rounded-md border border-border bg-background px-1 text-xs outline-none"
        >
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          placeholder="カテゴリ"
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        <select
          value={draft.frequency}
          onChange={(e) => setDraft({ ...draft, frequency: e.target.value as 'weekly' | 'monthly' })}
          className="h-8 cursor-pointer rounded-md border border-border bg-background px-1 text-xs outline-none"
        >
          <option value="weekly">毎週</option>
          <option value="monthly">毎月</option>
        </select>
        {draft.frequency === 'weekly' ? (
          <select
            value={draft.dayOfWeek}
            onChange={(e) => setDraft({ ...draft, dayOfWeek: Number(e.target.value) })}
            className="h-8 cursor-pointer rounded-md border border-border bg-background px-1 text-xs outline-none"
          >
            {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
              <option key={d} value={i}>
                毎週{d}曜日
              </option>
            ))}
          </select>
        ) : (
          <select
            value={draft.dayOfMonth}
            onChange={(e) => setDraft({ ...draft, dayOfMonth: Number(e.target.value) })}
            className="h-8 cursor-pointer rounded-md border border-border bg-background px-1 text-xs outline-none"
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                毎月{d}日
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            value={draft.dueInDays}
            onChange={(e) => setDraft({ ...draft, dueInDays: Number(e.target.value) })}
            className="h-8 w-16 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          />
          <span className="text-xs text-muted-foreground">日後が期限</span>
        </div>
      </div>
      {/* item 13: 状態起点・例外スキップ日 */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">状態起点（前タスクがこのステータスになったら次を生成）</span>
          <select
            value={draft.triggerOnStatus}
            onChange={(e) => setDraft({ ...draft, triggerOnStatus: e.target.value as '' | import('@/lib/orbit/types').TaskStatus })}
            className="h-8 cursor-pointer rounded-md border border-border bg-background px-1 text-xs outline-none"
          >
            <option value="">日付起点（従来どおり）</option>
            <option value="review">確認待ちになったら</option>
            <option value="done">完了になったら</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">例外スキップ日（YYYY-MM-DD、カンマ区切り）</span>
          <input
            value={draft.skipDatesInput}
            onChange={(e) => setDraft({ ...draft, skipDatesInput: e.target.value })}
            placeholder="例: 2025-08-11, 2025-12-31"
            className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <Button
          variant="outline"
          className="h-8 text-xs"
          disabled={!draft.name.trim() || !draft.projectId}
          onClick={submit}
        >
          {editingRule ? (
            <>
              <Check className="size-3.5" />
              変更を保存
            </>
          ) : (
            <>
              <Plus className="size-3.5" />
              定期タスクを追加
            </>
          )}
        </Button>
        {editingRule && (
          <Button variant="ghost" className="h-8 text-xs" onClick={onCancelEdit}>
            キャンセル
          </Button>
        )}
      </div>
    </div>
  )
}

function RecurringRuleRow({
  rule,
  editing,
  projectName,
  onEdit,
  onToggle,
  onRemove,
}: {
  rule: RecurringTaskRule
  editing: boolean
  projectName: string
  onEdit: () => void
  onToggle: () => void
  onRemove: () => void
}) {
  const schedule =
    rule.frequency === 'weekly'
      ? `毎週${['日', '月', '火', '水', '木', '金', '土'][rule.dayOfWeek ?? 0]}曜日`
      : `毎月${rule.dayOfMonth ?? 1}日`
  return (
    <li
      className={cn(
        'flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm',
        editing ? 'border-primary/40 bg-primary-muted/40' : 'border-border/60 bg-secondary/40',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Repeat className="size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <span className="font-medium">{rule.name}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {projectName} ・ {schedule}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={onToggle}
          className={cn(
            'rounded-md border px-2 py-1 text-xs font-medium transition-colors',
            rule.active
              ? 'border-primary/30 bg-primary-muted text-accent-foreground'
              : 'border-border text-muted-foreground hover:bg-secondary',
          )}
        >
          {rule.active ? 'ON' : 'OFF'}
        </button>
        <button
          onClick={onEdit}
          className="text-muted-foreground hover:text-foreground"
          aria-label="編集"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
          aria-label="削除"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  )
}
