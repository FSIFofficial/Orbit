'use client'

import { useMemo, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useNav } from '@/lib/orbit/nav'
import { Avatar } from '@/components/orbit/primitives'
import { parseDepartmentPath, formatDepartmentPath, getDepartmentTops } from '@/lib/orbit/utils'
import { ChevronRight, Users } from 'lucide-react'
import type { Member } from '@/lib/orbit/types'

interface TreeNode {
  label: string
  path: string
  children: TreeNode[]
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = []

  for (const path of paths) {
    const segments = parseDepartmentPath(path)
    let level = root
    let current = ''
    for (const seg of segments) {
      current = current ? `${current}>${seg}` : seg
      let node = level.find((n) => n.label === seg)
      if (!node) {
        node = { label: seg, path: current, children: [] }
        level.push(node)
      }
      level = node.children
    }
  }

  return root
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
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3" />
            {deptMembers.length}
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
  const { members } = useOrbit()
  const { go } = useNav()
  const [selected, setSelected] = useState<string | null>(null)

  const paths = useMemo(
    () => Array.from(new Set(members.map((m) => m.departmentPath).filter(Boolean) as string[])),
    [members],
  )

  const tree = useMemo(() => buildTree(paths), [paths])

  const deptMembers = useMemo(
    () => (selected ? members.filter((m) => m.departmentPath === selected) : []),
    [members, selected],
  )

  const tops = useMemo(
    () => (selected ? getDepartmentTops(selected, members) : []),
    [selected, members],
  )

  if (paths.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-xl font-semibold tracking-tight">Org Tree</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          department_path が設定されているメンバーがいません。メンバーページで組織パスを設定してください。
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Org Tree</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        部署を選択してメンバーを確認できます。
      </p>

      <div className="mt-6 flex gap-4">
        {/* Tree panel */}
        <div className="w-64 shrink-0 overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">
            組織ツリー
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
              左のツリーから部署を選択してください
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <div className="font-semibold">{formatDepartmentPath(selected)}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {deptMembers.length} 名
                </div>
              </div>

              {tops.length > 0 && (
                <div className="border-b border-border px-4 py-3">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">部署トップ</div>
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
                    この部署に直接所属するメンバーはいません。
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
    </div>
  )
}
