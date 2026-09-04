'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { isRemoteConfigured } from '@/lib/orbit/remote'
import { useToast } from '@/components/orbit/toast'
import { Tag, SectionLabel } from '@/components/orbit/primitives'
import { Button } from '@/components/ui/button'
import { ADMIN_SECTIONS, DEFAULT_NON_TOP_SECTIONS, BASE_ROLE } from '@/lib/orbit/types'
import type { AdminSection } from '@/lib/orbit/types'
import { Plus, Check, ChevronUp, ChevronDown } from 'lucide-react'

// dashboard always stays visible (it's the redirect target for a
// disallowed section — see store.tsx's visibleAdminSections), so there's
// nothing useful to toggle for it
const TOGGLEABLE_SECTIONS = ADMIN_SECTIONS.filter((s) => s.key !== 'dashboard')

export function AdminTags() {
  const {
    skillOptions,
    categoryOptions,
    addSkillOption,
    removeSkillOption,
    addCategoryOption,
    removeCategoryOption,
    roleLevels,
    addRoleLevel,
    removeRoleLevel,
    reorderRoleLevel,
    restrictedRoles,
    toggleRestrictedRole,
    rolePermissions,
    setRolePermissions,
    jobRequirements,
    setJobRequirements,
    skillFieldOptions,
    addSkillFieldOption,
    removeSkillFieldOption,
    skillFieldSkills,
    setSkillFieldSkills,
    skillFieldThreshold,
    setSkillFieldThreshold,
    orgNotificationEmails,
    addOrgNotificationEmail,
    removeOrgNotificationEmail,
    setDiscordWebhookUrl,
    setSlackWebhookUrl,
    isFullAdmin,
  } = useOrbit()
  const toast = useToast()
  const [webhookDraft, setWebhookDraft] = useState('')
  const [slackWebhookDraft, setSlackWebhookDraft] = useState('')
  const [orgEmailDraft, setOrgEmailDraft] = useState('')
  // item 17: ポジション要件 — every role, including 一般, has a position
  const jobTypes = [BASE_ROLE, ...roleLevels]

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Tags</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        INPUT画面の「要求スキル」「カテゴリ」や、Membersの「役職」で選べる選択肢です。ここで消すまで残り続けます。
      </p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <TagGroup
          title="要求スキル"
          options={skillOptions}
          onAdd={addSkillOption}
          onRemove={removeSkillOption}
        />
        <div>
          <TagGroup
            title="要求分野"
            options={skillFieldOptions}
            onAdd={addSkillFieldOption}
            onRemove={removeSkillFieldOption}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            要求スキルの上位グルーピングです（例：デザイン、営業、AI活用）。メンバーに直接
            割り当てるのは要求スキルのみで、分野は下の「要求分野の構成」で紐づけたスキルの
            保有率から自動的に判定されます。
          </p>
        </div>
        <TagGroup
          title="カテゴリ"
          options={categoryOptions}
          onAdd={addCategoryOption}
          onRemove={removeCategoryOption}
        />
        <div>
          <SectionLabel>権限レベル（一般より上）</SectionLabel>
          <p className="mt-1 text-xs text-muted-foreground">
            「制限あり���にしたレベルは、見せるセクションを下の「権限レベルごとの表示範囲」で個別に設定できます。それ以外は全管理者権限を持ちます。
          </p>
          <div className="mt-3 flex flex-col gap-1">
            {roleLevels.map((level, i) => {
              const isRestricted = restrictedRoles.includes(level)
              return (
                <div key={level} className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button
                      onClick={() => reorderRoleLevel(level, 'up')}
                      disabled={i === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                    >
                      <ChevronUp className="size-3.5" />
                    </button>
                    <button
                      onClick={() => reorderRoleLevel(level, 'down')}
                      disabled={i === roleLevels.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                    >
                      <ChevronDown className="size-3.5" />
                    </button>
                  </div>
                  <Tag onRemove={() => removeRoleLevel(level)}>{level}</Tag>
                  <button
                    onClick={() => toggleRestrictedRole(level)}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      isRestricted
                        ? 'bg-warning/15 text-warning hover:bg-warning/25'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {isRestricted ? '制限あり' : '制限なし'}
                  </button>
                </div>
              )
            })}
          </div>
          <RoleLevelAdd onAdd={addRoleLevel} />
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <SectionLabel>要求分野の構成</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">
          各分野に属する要求スキルを設定します。メンバーがその分野のスキルをしきい値以上
          保有すると、分野を「取得」したものとして個人ページの人材育成タブに表示されます。
        </p>
        <div className="mt-3 flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="skill-field-threshold">
            取得のしきい値
          </label>
          <input
            id="skill-field-threshold"
            type="number"
            min={0}
            max={100}
            step={5}
            value={Math.round(skillFieldThreshold * 100)}
            onChange={(e) => setSkillFieldThreshold(Number(e.target.value) / 100)}
            className="h-8 w-20 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          />
          <span className="text-xs text-muted-foreground">%（数字は仮の初期値です）</span>
        </div>
        {skillFieldOptions.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            先に「要求分野」の選択肢を追加してください。
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            {skillFieldOptions.map((field) => (
              <JobRequirementsRow
                key={field}
                role={field}
                skills={skillFieldSkills[field] ?? []}
                options={skillOptions}
                onChange={(next) => setSkillFieldSkills(field, next)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <SectionLabel>ポジション要件</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">
          役職ごとに求めるスキルを設定します。個人ページの人材育成タブで、本人の現在のスキルとの比較が表示されます。
        </p>
        <div className="mt-4 flex flex-col gap-4">
          {jobTypes.map((role) => (
            <JobRequirementsRow
              key={role}
              role={role}
              skills={jobRequirements[role] ?? []}
              options={skillOptions}
              onChange={(next) => setJobRequirements(role, next)}
            />
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <SectionLabel>権限レベルごとの表示範囲</SectionLabel>
          <p className="mt-1 text-xs text-muted-foreground">
            「制限あり」に設定したレベルのみ表示されます。未設定の場合は Members・Tags 以外の全セクションが既定で表示されます。
          </p>
          {restrictedRoles.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              制限ありのレベルがありません。上のリストで「制限なし」ボタンをクリックして制限ありに変更してください。
            </p>
          )}
          <div className="mt-4 flex flex-col gap-4">
            {restrictedRoles.filter((r) => roleLevels.includes(r)).map((role) => (
              <RolePermissionRow
                key={role}
                role={role}
                sections={rolePermissions[role] ?? DEFAULT_NON_TOP_SECTIONS}
                onChange={(next) => setRolePermissions(role, next)}
              />
            ))}
          </div>
        </div>

      {isFullAdmin && (
        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <SectionLabel>団体メール</SectionLabel>
          <p className="mt-1 text-xs text-muted-foreground">
            登録すると、承認依頼・確認待ちなどの管理者向け通知が、個々のメンバーの
            「新規タスク通知」設定に関わらず常にここに追加で届きます。団体で共有している
            メーリングリストやグループアドレスの登録を想定しています（幹部・事業責任者が管理）。
          </p>
          {!isRemoteConfigured && (
            <p className="mt-1 text-xs text-warning">
              スプレッドシート連携（GASのWeb App URL）が未設定のため、ここで保存しても
              どこにも反映されません。
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {orgNotificationEmails.map((email) => (
              <Tag key={email} onRemove={() => removeOrgNotificationEmail(email)}>
                {email}
              </Tag>
            ))}
            {orgNotificationEmails.length === 0 && (
              <p className="text-sm text-muted-foreground">まだ登録されていません。</p>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              value={orgEmailDraft}
              onChange={(e) => setOrgEmailDraft(e.target.value)}
              placeholder="info@example.com"
              type="email"
              className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <Button
              className="h-9 shrink-0"
              disabled={!orgEmailDraft.trim()}
              onClick={() => {
                addOrgNotificationEmail(orgEmailDraft.trim())
                setOrgEmailDraft('')
              }}
            >
              <Plus className="size-4" />
              追加
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <SectionLabel>Slack Incoming Webhook 連携</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">
          設定すると、タスクが確認待ちになったとき・期限超過タスクの日次サマリーが
          指定したSlackチャンネルに通知されます（item 8）。SlackのAppからIncoming
          Webhookを発行してURLを貼り付けてください。
        </p>
        {!isRemoteConfigured && (
          <p className="mt-1 text-xs text-warning">
            スプレッドシート連携が未設定のため、保存しても反映されません。
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <input
            value={slackWebhookDraft}
            onChange={(e) => setSlackWebhookDraft(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          />
          <Button
            className="h-9 shrink-0"
            disabled={!slackWebhookDraft.trim() || !isRemoteConfigured}
            onClick={() => {
              setSlackWebhookUrl(slackWebhookDraft.trim())
              setSlackWebhookDraft('')
              toast('Slack Webhook URLを保存しました')
            }}
          >
            保存
          </Button>
        </div>
      </div>

      {/* item 20: 1on1ワークシート質問項目 */}
      <OneOnOneQuestionsEditor />

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <SectionLabel>Discord Webhook 連携</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">
          設定すると、タスクが確認待ちになったとき・期限超過タスクの日次サマリーが
          指定したDiscordチャンネルに通知されます。Discordのチャンネル設定 → 連携サービス
          → ウェブフックで発行したURLを貼り付けて保存してください。
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          このURLは書き込み専用です（保存後、画面上に表示されることはありません）。
          流出すると誰でもそのDiscordチャンネルに投稿できてしまうため、公開される
          スプレッドシートには保存せず、Apps Script側だけが読める場所に保管しています
          （詳しくは gas/README.md を参照）。
        </p>
        {!isRemoteConfigured && (
          <p className="mt-1 text-xs text-warning">
            スプレッドシート連携（GASのWeb App URL）が未設定のため、ここで保存しても
            どこにも反映されません。
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <input
            value={webhookDraft}
            onChange={(e) => setWebhookDraft(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          />
          <Button
            className="h-9 shrink-0"
            disabled={!webhookDraft.trim() || !isRemoteConfigured}
            onClick={() => {
              setDiscordWebhookUrl(webhookDraft.trim())
              setWebhookDraft('')
              toast('Discord Webhook URLを保存しました')
            }}
          >
            保存
          </Button>
        </div>
      </div>

      {/* item 26: 通知種別・頻度設定 */}
      <NotifySettingsEditor />
    </div>
  )
}

function RolePermissionRow({
  role,
  sections,
  onChange,
}: {
  role: string
  sections: AdminSection[]
  onChange: (next: AdminSection[]) => void
}) {
  const toggle = (key: AdminSection) => {
    onChange(sections.includes(key) ? sections.filter((s) => s !== key) : [...sections, key])
  }
  return (
    <div>
      <div className="text-sm font-medium">{role}</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {TOGGLEABLE_SECTIONS.map((s) => {
          const checked = sections.includes(s.key)
          return (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                checked
                  ? 'border-primary/30 bg-primary-muted text-accent-foreground'
                  : 'border-border text-muted-foreground hover:bg-secondary'
              }`}
            >
              {checked && <Check className="size-3" strokeWidth={3} />}
              {s.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function JobRequirementsRow({
  role,
  skills,
  options,
  onChange,
}: {
  role: string
  skills: string[]
  options: string[]
  onChange: (next: string[]) => void
}) {
  const toggle = (skill: string) => {
    onChange(skills.includes(skill) ? skills.filter((s) => s !== skill) : [...skills, skill])
  }
  return (
    <div>
      <div className="text-sm font-medium">{role}</div>
      {options.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          先に「要求スキル」の選択肢を追加してください。
        </p>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {options.map((s) => {
            const checked = skills.includes(s)
            return (
              <button
                key={s}
                onClick={() => toggle(s)}
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                  checked
                    ? 'border-primary/30 bg-primary-muted text-accent-foreground'
                    : 'border-border text-muted-foreground hover:bg-secondary'
                }`}
              >
                {checked && <Check className="size-3" strokeWidth={3} />}
                {s}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RoleLevelAdd({ onAdd }: { onAdd: (name: string) => void }) {
  const [draft, setDraft] = useState('')
  const submit = () => {
    const v = draft.trim()
    if (v) { onAdd(v); setDraft('') }
  }
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === 'Enter') { e.preventDefault(); submit() }
        }}
        placeholder="レベルを追加"
        className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
      />
      <button
        onClick={submit}
        disabled={!draft.trim()}
        className="flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border-strong text-muted-foreground hover:bg-secondary disabled:opacity-40"
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}

function TagGroup({
  title,
  options,
  onAdd,
  onRemove,
}: {
  title: string
  options: string[]
  onAdd: (name: string) => void
  onRemove: (name: string) => void
}) {
  const [draft, setDraft] = useState('')

  const submit = () => {
    const v = draft.trim()
    if (v) onAdd(v)
    setDraft('')
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {options.length === 0 && (
          <span className="text-sm text-muted-foreground">選択肢がありません</span>
        )}
        {options.map((o) => (
          <Tag key={o} onRemove={() => onRemove(o)}>
            {o}
          </Tag>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="新しい選択肢を追加"
          className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        <button
          onClick={submit}
          disabled={!draft.trim()}
          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border-strong text-muted-foreground hover:bg-secondary disabled:opacity-40"
          aria-label="追加"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  )
}

// item 20: 1on1ワークシート質問項目エディタ
function OneOnOneQuestionsEditor() {
  const { oneOnOneQuestions, setOneOnOneQuestions } = useOrbit()
  const toast = useToast()
  const [draft, setDraft] = useState('')

  const add = () => {
    const v = draft.trim()
    if (!v || oneOnOneQuestions.includes(v)) { setDraft(''); return }
    setOneOnOneQuestions([...oneOnOneQuestions, v])
    setDraft('')
    toast('質問項目を追加しました')
  }
  const remove = (q: string) => setOneOnOneQuestions(oneOnOneQuestions.filter((x) => x !== q))

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <SectionLabel>1on1ワークシート 質問項目</SectionLabel>
      <p className="mt-1 text-xs text-muted-foreground">
        1on1記録フォームで表示される質問項目です。設定した質問ごとに入力欄が表示され、
        回答が整形されて記録に保存されます。未設定の場合は自由入力になります。
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {oneOnOneQuestions.map((q) => (
          <span
            key={q}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-2 py-1 text-xs font-medium"
          >
            {q}
            <button
              onClick={() => remove(q)}
              className="ml-0.5 opacity-60 hover:opacity-100"
              aria-label="削除"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter') { e.preventDefault(); add() }
          }}
          placeholder="例: 今月のハイライトは？"
          className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        <Button variant="outline" className="h-8 text-xs" disabled={!draft.trim()} onClick={add}>
          <Plus className="size-3.5" />
          追加
        </Button>
      </div>
    </div>
  )
}

// item 26: 通知種別・頻度選択UIをlocalStorageに保存する
// GAS側との連携は将来対応。現時点ではUIの設定値をフロント側の表示制御に利用する想定。
const NOTIFY_SETTINGS_KEY = 'orbit-notify-settings'

type NotifyFrequency = 'immediate' | 'daily' | 'weekly' | 'off'

interface NotifySettings {
  overdue: NotifyFrequency
  approval: NotifyFrequency
  inactive: NotifyFrequency
  assign: NotifyFrequency
}

const DEFAULT_NOTIFY_SETTINGS: NotifySettings = {
  overdue: 'daily',
  approval: 'immediate',
  inactive: 'weekly',
  assign: 'immediate',
}

const NOTIFY_KIND_LABEL: Record<keyof NotifySettings, string> = {
  overdue: '期限超過タスク',
  approval: '承認・確認待ち',
  inactive: '長期未ログインメンバー',
  assign: '新規タスクアサイン',
}

const FREQ_LABEL: Record<NotifyFrequency, string> = {
  immediate: '即時',
  daily: '日次',
  weekly: '週次',
  off: 'OFF',
}
const FREQ_OPTIONS: NotifyFrequency[] = ['immediate', 'daily', 'weekly', 'off']

function loadNotifySettings(): NotifySettings {
  try {
    const raw = window.localStorage.getItem(NOTIFY_SETTINGS_KEY)
    if (raw) return { ...DEFAULT_NOTIFY_SETTINGS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULT_NOTIFY_SETTINGS
}

function NotifySettingsEditor() {
  const [settings, setSettings] = useState<NotifySettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_NOTIFY_SETTINGS
    return loadNotifySettings()
  })
  const toast = useToast()

  const update = (kind: keyof NotifySettings, freq: NotifyFrequency) => {
    const next = { ...settings, [kind]: freq }
    setSettings(next)
    try { window.localStorage.setItem(NOTIFY_SETTINGS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    toast(`「${NOTIFY_KIND_LABEL[kind]}」通知を${FREQ_LABEL[freq]}に設定しました`)
  }

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <SectionLabel>通知種別・頻度設定</SectionLabel>
      <p className="mt-1 text-xs text-muted-foreground">
        各通知の頻度を設定します。OFFにすると該当通知は表示されません（ブラウザのローカル設定です）。
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {(Object.keys(NOTIFY_KIND_LABEL) as (keyof NotifySettings)[]).map((kind) => (
          <div key={kind} className="flex items-center gap-3">
            <span className="w-40 shrink-0 text-sm">{NOTIFY_KIND_LABEL[kind]}</span>
            <div className="flex gap-1">
              {FREQ_OPTIONS.map((freq) => (
                <button
                  key={freq}
                  onClick={() => update(kind, freq)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${settings[kind] === freq ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
                >
                  {FREQ_LABEL[freq]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
