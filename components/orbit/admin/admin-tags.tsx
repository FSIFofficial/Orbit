'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useToast } from '@/components/orbit/toast'
import { Tag, SectionLabel, Avatar } from '@/components/orbit/primitives'
import { Button } from '@/components/ui/button'
import { ADMIN_SECTIONS, DEFAULT_NON_TOP_SECTIONS, BASE_ROLE } from '@/lib/orbit/types'
import type { AdminSection, CustomMemberColumn } from '@/lib/orbit/types'
import { Plus, Check, ChevronUp, ChevronDown, X, Trash2 } from 'lucide-react'
import { useI18n, type TranslationKey } from '@/lib/orbit/i18n'

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
    isFullAdmin,
  } = useOrbit()
  const toast = useToast()
  const { t } = useI18n()
  // item 17: ポジション要件 — every role, including 一般, has a position
  const jobTypes = [BASE_ROLE, ...roleLevels]

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Tags</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('admin.tags.subtitle')}
      </p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <TagGroup
          title={t('admin.tags.requiredSkills')}
          options={skillOptions}
          onAdd={addSkillOption}
          onRemove={removeSkillOption}
        />
        <div>
          <TagGroup
            title={t('admin.tags.requiredFields')}
            options={skillFieldOptions}
            onAdd={addSkillFieldOption}
            onRemove={removeSkillFieldOption}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {t('admin.tags.requiredFieldsDesc')}
          </p>
        </div>
        <TagGroup
          title={t('admin.tags.categories')}
          options={categoryOptions}
          onAdd={addCategoryOption}
          onRemove={removeCategoryOption}
        />
        <div>
          <SectionLabel>{t('admin.tags.permissionLevels')}</SectionLabel>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('admin.tags.permissionLevelsDesc')}
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
                    {isRestricted ? t('admin.tags.restricted') : t('admin.tags.unrestricted')}
                  </button>
                </div>
              )
            })}
          </div>
          <RoleLevelAdd onAdd={addRoleLevel} />
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <SectionLabel>{t('admin.tags.fieldComposition')}</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('admin.tags.fieldCompositionDesc')}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="skill-field-threshold">
            {t('admin.tags.thresholdLabel')}
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
          <span className="text-xs text-muted-foreground">{t('admin.tags.thresholdUnitNote')}</span>
        </div>
        {skillFieldOptions.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {t('admin.tags.addFieldsFirst')}
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
        <SectionLabel>{t('admin.tags.positionRequirements')}</SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('admin.tags.positionRequirementsDesc')}
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
          <SectionLabel>{t('admin.tags.visibilityByLevel')}</SectionLabel>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('admin.tags.visibilityByLevelDesc')}
          </p>
          {restrictedRoles.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('admin.tags.noRestrictedLevels')}
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

      {/* item 20: 1on1ワークシート質問項目 */}
      <OneOnOneQuestionsEditor />

      {/* item 26: 通知種別・頻度設定 */}
      <NotifySettingsEditor />

      {/* アンケート回答対象者の限定 */}
      <SurveyInviteEditor />

      {/* 人材DBのカスタム列 */}
      <CustomMemberColumnsEditor />
    </div>
  )
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
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
  const { t } = useI18n()
  const toggle = (skill: string) => {
    onChange(skills.includes(skill) ? skills.filter((s) => s !== skill) : [...skills, skill])
  }
  return (
    <div>
      <div className="text-sm font-medium">{role}</div>
      {options.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t('admin.tags.addSkillsFirst')}
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
  const { t } = useI18n()
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
        placeholder={t('admin.tags.levelAddPlaceholder')}
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
  const { t } = useI18n()
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
          <span className="text-sm text-muted-foreground">{t('admin.tags.noOptions')}</span>
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
          placeholder={t('admin.tags.newOptionPlaceholder')}
          className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        <button
          onClick={submit}
          disabled={!draft.trim()}
          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border-strong text-muted-foreground hover:bg-secondary disabled:opacity-40"
          aria-label={t('admin.tags.addAriaLabel')}
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
  const { t } = useI18n()
  const [draft, setDraft] = useState('')

  const add = () => {
    const v = draft.trim()
    if (!v || oneOnOneQuestions.includes(v)) { setDraft(''); return }
    setOneOnOneQuestions([...oneOnOneQuestions, v])
    setDraft('')
    toast(t('admin.tags.oneOnOne.addedToast'))
  }
  const remove = (q: string) => setOneOnOneQuestions(oneOnOneQuestions.filter((x) => x !== q))

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <SectionLabel>{t('admin.tags.oneOnOne.title')}</SectionLabel>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('admin.tags.oneOnOne.desc')}
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
              aria-label={t('admin.tags.oneOnOne.deleteAriaLabel')}
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
          placeholder={t('admin.tags.oneOnOne.placeholder')}
          className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        <Button variant="outline" className="h-8 text-xs" disabled={!draft.trim()} onClick={add}>
          <Plus className="size-3.5" />
          {t('admin.tags.oneOnOne.add')}
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

const NOTIFY_KIND_KEY: Record<keyof NotifySettings, TranslationKey> = {
  overdue: 'admin.tags.notify.kind.overdue',
  approval: 'admin.tags.notify.kind.approval',
  inactive: 'admin.tags.notify.kind.inactive',
  assign: 'admin.tags.notify.kind.assign',
}

const FREQ_KEY: Record<NotifyFrequency, TranslationKey> = {
  immediate: 'admin.tags.notify.freq.immediate',
  daily: 'admin.tags.notify.freq.daily',
  weekly: 'admin.tags.notify.freq.weekly',
  off: 'admin.tags.notify.freq.off',
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
  const { t } = useI18n()

  const update = (kind: keyof NotifySettings, freq: NotifyFrequency) => {
    const next = { ...settings, [kind]: freq }
    setSettings(next)
    try { window.localStorage.setItem(NOTIFY_SETTINGS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    toast(t('admin.tags.notify.updatedToast', { kind: t(NOTIFY_KIND_KEY[kind]), freq: t(FREQ_KEY[freq]) }))
  }

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <SectionLabel>{t('admin.tags.notify.title')}</SectionLabel>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('admin.tags.notify.desc')}
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {(Object.keys(NOTIFY_KIND_KEY) as (keyof NotifySettings)[]).map((kind) => (
          <div key={kind} className="flex items-center gap-3">
            <span className="w-40 shrink-0 text-sm">{t(NOTIFY_KIND_KEY[kind])}</span>
            <div className="flex gap-1">
              {FREQ_OPTIONS.map((freq) => (
                <button
                  key={freq}
                  onClick={() => update(kind, freq)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${settings[kind] === freq ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
                >
                  {t(FREQ_KEY[freq])}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// アンケートの回答対象者限定（item 3） — 選択したメンバーのみが
// survey-screen.tsxの経験値アンケートに回答できる。空選択=全員回答可。
function SurveyInviteEditor() {
  const { members, surveyInvitedIds, updateSurveyInvitedIds } = useOrbit()
  const toast = useToast()
  const { t } = useI18n()

  const toggle = (memberId: string) => {
    const next = surveyInvitedIds.includes(memberId)
      ? surveyInvitedIds.filter((id) => id !== memberId)
      : [...surveyInvitedIds, memberId]
    updateSurveyInvitedIds(next)
    toast(t('admin.tags.surveyInvite.updatedToast'))
  }

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <SectionLabel>{t('admin.tags.surveyInvite.title')}</SectionLabel>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('admin.tags.surveyInvite.desc')}
      </p>
      {surveyInvitedIds.length === 0 && (
        <p className="mt-2 text-xs font-medium text-primary">
          {t('admin.tags.surveyInvite.everyone')}
        </p>
      )}
      <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {members.filter((m) => !m.inactive).map((m) => {
          const checked = surveyInvitedIds.includes(m.id)
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m.id)}
              className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors ${checked ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-secondary/60'}`}
            >
              <Avatar member={m} size={22} />
              <span className="min-w-0 flex-1 truncate">{m.displayName || m.name}</span>
              {checked && <Check className="size-4 shrink-0 text-primary" strokeWidth={3} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// 人材DBのカスタム列（item 1）— 団体ごとに任意の列（現状typeは'text'
// のみ）を追加できる。列定義はSettings、値はMember.customFieldsに保持。
// 既存キーの削除は表示上外れるだけで、Members側のcustom_fields_jsonに
// 残ったデータを一括削除する必要はない（仕様通り）。
function CustomMemberColumnsEditor() {
  const { customMemberColumns, updateCustomMemberColumns } = useOrbit()
  const toast = useToast()
  const { t } = useI18n()
  const [draftKey, setDraftKey] = useState('')
  const [draftLabel, setDraftLabel] = useState('')

  const add = () => {
    const key = draftKey.trim()
    const label = draftLabel.trim()
    if (!key || !label) return
    if (customMemberColumns.some((c) => c.key === key)) {
      toast(t('admin.tags.customColumns.duplicateKeyToast'))
      return
    }
    const next: CustomMemberColumn[] = [...customMemberColumns, { key, label, type: 'text' }]
    updateCustomMemberColumns(next)
    setDraftKey('')
    setDraftLabel('')
    toast(t('admin.tags.customColumns.addedToast'))
  }

  const remove = (key: string) => {
    updateCustomMemberColumns(customMemberColumns.filter((c) => c.key !== key))
  }

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <SectionLabel>{t('admin.tags.customColumns.title')}</SectionLabel>
      <p className="mt-1 text-xs text-muted-foreground">{t('admin.tags.customColumns.desc')}</p>
      <div className="mt-3 flex flex-col gap-1.5">
        {customMemberColumns.length === 0 ? (
          <span className="text-sm text-muted-foreground">{t('admin.tags.noOptions')}</span>
        ) : (
          customMemberColumns.map((col) => (
            <div
              key={col.key}
              className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs"
            >
              <span className="font-medium">{col.label}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{col.key}</span>
              <button
                onClick={() => remove(col.key)}
                className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={t('admin.tags.customColumns.removeAriaLabel')}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <input
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
          placeholder={t('admin.tags.customColumns.keyPlaceholder')}
          className="h-8 w-32 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        <input
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter') { e.preventDefault(); add() }
          }}
          placeholder={t('admin.tags.customColumns.labelPlaceholder')}
          className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        />
        <Button variant="outline" className="h-8 text-xs" disabled={!draftKey.trim() || !draftLabel.trim()} onClick={add}>
          <Plus className="size-3.5" />
          {t('common.add')}
        </Button>
      </div>
    </div>
  )
}
