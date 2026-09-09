'use client'

import { useEffect, useMemo, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { useToast } from '@/components/orbit/toast'
import { Avatar } from '@/components/orbit/primitives'
import { Modal } from '@/components/orbit/modal'
import { Button } from '@/components/ui/button'
import { parseDepartmentPath, formatDepartmentPath, getDepartmentTops } from '@/lib/orbit/utils'
import { ChevronRight, Pencil, Plus, ArrowUp, ArrowDown, Check, X, Trash2 } from 'lucide-react'
import type { Member, DepartmentTreeNode } from '@/lib/orbit/types'
import { useI18n } from '@/lib/orbit/i18n'

interface TreeNode {
  label: string
  path: string
  children: TreeNode[]
}

// ORG-002: labelOverrides(department_tree_config由来の表示名上書き)が
// pathごとに違う名前を指定しうるので、同一階層内の既存ノード判定は
// label(表示名)ではなくpath(一意)で行う
function buildTree(paths: string[], labelOverrides?: Record<string, string>): TreeNode[] {
  const root: TreeNode[] = []

  for (const path of paths) {
    const segments = parseDepartmentPath(path)
    let level = root
    let current = ''
    for (const seg of segments) {
      current = current ? `${current}>${seg}` : seg
      let node = level.find((n) => n.path === current)
      if (!node) {
        node = { label: labelOverrides?.[current] ?? seg, path: current, children: [] }
        level.push(node)
      }
      level = node.children
    }
  }

  return root
}

// ORG-002: 部署ツリー編集の下ごしらえ — 動的導出したフルパス一覧を、
// すべての中間ノードも含めて明示的なDepartmentTreeNode配列に展開する
// (これによりエディタ上のどの行も実体を持ち、リネーム・削除・並び替えの
// 対象にできる)
function expandPathsToNodes(paths: string[]): DepartmentTreeNode[] {
  const seen = new Set<string>()
  const nodes: DepartmentTreeNode[] = []
  paths.forEach((p) => {
    const segments = parseDepartmentPath(p)
    let current = ''
    segments.forEach((seg) => {
      current = current ? `${current}>${seg}` : seg
      if (!seen.has(current)) {
        seen.add(current)
        nodes.push({ path: current })
      }
    })
  })
  return nodes
}

function parentOfPath(path: string): string {
  const idx = path.lastIndexOf('>')
  return idx === -1 ? '' : path.slice(0, idx)
}

// 同じ親を持つノード同士でのみ並び替える。表示順は配列内での相対順序が
// そのままbuildTreeでの登場順=表示順になるため、対象の2ノードのエントリを
// 入れ替えるだけでよい(間に他のノードのエントリがあっても影響しない)
function moveSibling(nodes: DepartmentTreeNode[], path: string, direction: 'up' | 'down'): DepartmentTreeNode[] {
  const parent = parentOfPath(path)
  const siblingPaths = nodes.filter((n) => parentOfPath(n.path) === parent).map((n) => n.path)
  const pos = siblingPaths.indexOf(path)
  const swapWith = direction === 'up' ? pos - 1 : pos + 1
  if (pos === -1 || swapWith < 0 || swapWith >= siblingPaths.length) return nodes
  const otherPath = siblingPaths[swapWith]
  const idxA = nodes.findIndex((n) => n.path === path)
  const idxB = nodes.findIndex((n) => n.path === otherPath)
  const next = [...nodes]
  ;[next[idxA], next[idxB]] = [next[idxB], next[idxA]]
  return next
}

// ORG-002: 部署ツリー(department_tree_config)のCRUD編集モーダル。
// 追加(名前+親ノード選択)・名前変更・削除・並び替えができる。保存すると
// store.tsx経由でSettingsのdepartment_tree_configキーに書き込まれる
function DepartmentTreeEditorModal({
  open,
  onClose,
  initialNodes,
  onSave,
}: {
  open: boolean
  onClose: () => void
  initialNodes: DepartmentTreeNode[]
  onSave: (nodes: DepartmentTreeNode[]) => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<DepartmentTreeNode[]>(initialNodes)
  const [newName, setNewName] = useState('')
  const [newParent, setNewParent] = useState('')
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  // 開くたびに最新のinitialNodesで初期化し直す
  useEffect(() => {
    if (open) {
      setDraft(initialNodes)
      setNewName('')
      setNewParent('')
      setRenamingPath(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const labelOverrides = useMemo(() => {
    const map: Record<string, string> = {}
    draft.forEach((n) => { if (n.label) map[n.path] = n.label })
    return map
  }, [draft])
  const tree = useMemo(() => buildTree(draft.map((n) => n.path), labelOverrides), [draft, labelOverrides])
  const flatRows = useMemo(() => {
    const out: { path: string; depth: number; label: string }[] = []
    const walk = (nodes: TreeNode[], depth: number) => {
      nodes.forEach((n) => {
        out.push({ path: n.path, depth, label: n.label })
        walk(n.children, depth + 1)
      })
    }
    walk(tree, 0)
    return out
  }, [tree])

  const addNode = () => {
    const name = newName.trim()
    if (!name) return
    const newPath = newParent ? `${newParent}>${name}` : name
    const existingPaths = new Set(draft.map((n) => n.path))
    if (existingPaths.has(newPath)) return
    // 親の中間ノードがまだ実体として存在しなければ、それも一緒に追加する
    const segments = parseDepartmentPath(newPath)
    let current = ''
    const toAdd: DepartmentTreeNode[] = []
    segments.forEach((seg) => {
      current = current ? `${current}>${seg}` : seg
      if (!existingPaths.has(current)) {
        toAdd.push({ path: current })
        existingPaths.add(current)
      }
    })
    setDraft((prev) => [...prev, ...toAdd])
    setNewName('')
  }

  const removeNode = (path: string) => {
    // 削除時、このノードに所属するメンバーのdepartmentPathはそのまま残す
    // (member側のフィールドは一切書き換えない — ツリー構成からの削除のみ)
    setDraft((prev) => prev.filter((n) => n.path !== path && !n.path.startsWith(`${path}>`)))
  }

  const renameNode = (path: string, label: string) => {
    setDraft((prev) => prev.map((n) => (n.path === path ? { ...n, label: label.trim() || undefined } : n)))
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-base font-semibold">{t('admin.orgTree.editModal.title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('admin.orgTree.editModal.desc')}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t('admin.orgTree.editModal.deleteNote')}</p>

      <div className="mt-4 max-h-72 overflow-auto orbit-scroll rounded-lg border border-border">
        {flatRows.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('admin.orgTree.editModal.empty')}</p>
        ) : (
          flatRows.map(({ path, depth, label }) => (
            <div
              key={path}
              style={{ paddingLeft: `${depth * 16 + 12}px` }}
              className="flex items-center gap-1.5 border-b border-border py-1.5 pr-2 text-sm last:border-b-0"
            >
              {renamingPath === path ? (
                <>
                  <input
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      renameNode(path, renameDraft)
                      setRenamingPath(null)
                    }}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <Check className="size-3.5" />
                  </button>
                  <button onClick={() => setRenamingPath(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
                    <X className="size-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <button
                    onClick={() => setDraft((prev) => moveSibling(prev, path, 'up'))}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={t('admin.orgTree.editModal.moveUp')}
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    onClick={() => setDraft((prev) => moveSibling(prev, path, 'down'))}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={t('admin.orgTree.editModal.moveDown')}
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setRenamingPath(path)
                      setRenameDraft(label)
                    }}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={t('admin.orgTree.editModal.rename')}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => removeNode(path)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('admin.orgTree.editModal.namePlaceholder')}
          className="h-9 w-40 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
        />
        <select
          value={newParent}
          onChange={(e) => setNewParent(e.target.value)}
          className="h-9 cursor-pointer rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
        >
          <option value="">{t('admin.orgTree.editModal.noParent')}</option>
          {flatRows.map(({ path, depth, label }) => (
            <option key={path} value={path}>
              {'　'.repeat(depth) + label}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" className="h-9" disabled={!newName.trim()} onClick={addNode}>
          <Plus className="size-4" />
          {t('admin.orgTree.editModal.addButton')}
        </Button>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setDraft([])}
          className="text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
        >
          {t('admin.orgTree.editModal.resetToDynamic')}
        </button>
        <div className="flex gap-2">
          <Button variant="ghost" className="h-9" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            className="h-9"
            onClick={() => {
              onSave(draft)
              onClose()
            }}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function MemberRow({ m, onClick }: { m: Member; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
    >
      <Avatar member={m} size={32} />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{m.displayName || m.name}</div>
        <div className="text-xs text-muted-foreground">{m.affiliation}</div>
      </div>
    </button>
  )
}

function TreeNodeRow({
  node,
  members,
  depth,
  selected,
  onSelect,
}: {
  node: TreeNode
  members: Member[]
  depth: number
  selected: string | null
  onSelect: (path: string) => void
}) {
  const [open, setOpen] = useState(depth === 0)
  const hasChildren = node.children.length > 0
  const deptMembers = members.filter((m) => m.departmentPath === node.path)
  const isSelected = selected === node.path

  return (
    <div>
      <button
        onClick={() => {
          onSelect(node.path)
          if (hasChildren) setOpen((o) => !o)
        }}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        className={`flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-sm transition-colors ${
          isSelected ? 'bg-accent font-medium text-accent-foreground' : 'hover:bg-accent/60'
        }`}
      >
        {hasChildren ? (
          <ChevronRight
            className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
          />
        ) : (
          <span className="size-3.5 shrink-0" />
        )}
        <span className="truncate">{node.label}</span>
        {deptMembers.length > 0 && (
          // item 6: 開かなくても直下メンバーが一目で分かるよう常時表示。
          // 重なりアバターに残数（+N）が出るため、別枠の人数バッジは
          // 冗長になるので置き換えた（admin-projects.tsxの一覧行と同じ見た目）
          <span className="ml-auto flex -space-x-1.5">
            {deptMembers.slice(0, 4).map((m) => (
              <span key={m.id} className="rounded-full ring-2 ring-card" title={m.displayName || m.name}>
                <Avatar member={m} size={18} />
              </span>
            ))}
            {deptMembers.length > 4 && (
              <span className="flex size-[18px] items-center justify-center rounded-full bg-secondary text-[9px] font-medium text-muted-foreground ring-2 ring-card">
                +{deptMembers.length - 4}
              </span>
            )}
          </span>
        )}
      </button>
      {open && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.path}
              node={child}
              members={members}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function AdminOrgTree() {
  const { members, departmentTreeConfig, updateDepartmentTreeConfig, isFullAdmin } = useOrbit()
  const { go } = useNav()
  const { t } = useI18n()
  const toast = useToast()
  const [selected, setSelected] = useState<string | null>(null)
  const [editingTree, setEditingTree] = useState(false)

  const dynamicPaths = useMemo(
    () => Array.from(new Set(members.map((m) => m.departmentPath).filter(Boolean) as string[])),
    [members],
  )

  // ORG-002: department_tree_configが設定されていればそちらを優先し、
  // 未設定(空配列)なら従来通りdepartmentPathから動的導出する
  const usingConfig = departmentTreeConfig.length > 0
  const paths = usingConfig ? departmentTreeConfig.map((n) => n.path) : dynamicPaths
  const labelOverrides = useMemo(() => {
    const map: Record<string, string> = {}
    departmentTreeConfig.forEach((n) => {
      if (n.label) map[n.path] = n.label
    })
    return map
  }, [departmentTreeConfig])

  const tree = useMemo(() => buildTree(paths, labelOverrides), [paths, labelOverrides])

  const deptMembers = useMemo(
    () => (selected ? members.filter((m) => m.departmentPath === selected) : []),
    [members, selected],
  )

  const tops = useMemo(
    () => (selected ? getDepartmentTops(selected, members) : []),
    [selected, members],
  )

  const editorModal = isFullAdmin && (
    <DepartmentTreeEditorModal
      open={editingTree}
      onClose={() => setEditingTree(false)}
      initialNodes={usingConfig ? departmentTreeConfig : expandPathsToNodes(dynamicPaths)}
      onSave={(nodes) => {
        updateDepartmentTreeConfig(nodes)
        toast(t('admin.orgTree.editModal.savedToast'))
      }}
    />
  )

  if (paths.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Org Tree</h1>
          {isFullAdmin && (
            <Button variant="outline" size="sm" onClick={() => setEditingTree(true)}>
              <Pencil className="size-4" />
              {t('admin.orgTree.editButton')}
            </Button>
          )}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {t('admin.orgTree.noPaths')}
        </p>
        {editorModal}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Org Tree</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('admin.orgTree.subtitle')}
          </p>
        </div>
        {isFullAdmin && (
          <Button variant="outline" size="sm" onClick={() => setEditingTree(true)}>
            <Pencil className="size-4" />
            {t('admin.orgTree.editButton')}
          </Button>
        )}
      </div>

      <div className="mt-6 flex gap-4">
        {/* Tree panel */}
        <div className="w-64 shrink-0 overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">
            {t('admin.orgTree.treeHeading')}
          </div>
          <div className="p-2">
            {tree.map((node) => (
              <TreeNodeRow
                key={node.path}
                node={node}
                members={members}
                depth={0}
                selected={selected}
                onSelect={setSelected}
              />
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="min-w-0 flex-1">
          {!selected ? (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              {t('admin.orgTree.selectPrompt')}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <div className="font-semibold">{formatDepartmentPath(selected)}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {t('admin.orgTree.memberCount', { count: deptMembers.length })}
                </div>
              </div>

              {tops.length > 0 && (
                <div className="border-b border-border px-4 py-3">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">{t('admin.orgTree.deptTop')}</div>
                  <div className="flex flex-wrap gap-2">
                    {tops.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => go({ name: 'person', id: m.id })}
                        className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary"
                      >
                        <Avatar member={m} size={24} />
                        <span className="font-medium">{m.displayName || m.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-2">
                {deptMembers.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">
                    {t('admin.orgTree.noDirectMembers')}
                  </p>
                ) : (
                  deptMembers.map((m) => (
                    <MemberRow
                      key={m.id}
                      m={m}
                      onClick={() => go({ name: 'person', id: m.id })}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {editorModal}
    </div>
  )
}
