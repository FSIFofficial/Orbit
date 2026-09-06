'use client'

import { useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { useToast } from '@/components/orbit/toast'
import { Modal } from '@/components/orbit/modal'
import { Button } from '@/components/ui/button'
import { SectionLabel } from '@/components/orbit/primitives'
import { Plus, Trash2, UserPlus2, Briefcase } from 'lucide-react'
import type { Candidate } from '@/lib/orbit/types'
import { useI18n, type TranslationKey } from '@/lib/orbit/i18n'

const STATUS_LABEL_KEY: Record<Candidate['status'], TranslationKey> = {
  candidate: 'admin.recruiting.status.candidate',
  hired: 'admin.recruiting.status.hired',
  rejected: 'admin.recruiting.status.rejected',
}

const STATUS_BADGE_CLASS: Record<Candidate['status'], string> = {
  candidate: 'bg-secondary text-muted-foreground',
  hired: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
}

// アクセス判定はadmin-screen.tsxのcanAccessRecruitingで既に行われているが、
// このコンポーネント単体で直接マウントされるケース（将来的な変更）に備えて
// 二重にガードしておく
function useCanAccessRecruiting(): boolean {
  const { isFullAdmin, currentUser } = useOrbit()
  return (
    isFullAdmin ||
    (currentUser?.permissionOverrides ?? []).some(
      (ov) => ov.targetType === 'recruiting' && (ov.access === 'edit' || ov.access === 'approve'),
    )
  )
}

function CandidateEditor({
  candidate,
  onClose,
}: {
  candidate: Candidate | null
  onClose: () => void
}) {
  const { addCandidate, updateCandidate } = useOrbit()
  const toast = useToast()
  const { t } = useI18n()
  const [name, setName] = useState(candidate?.name ?? '')
  const [email, setEmail] = useState(candidate?.email ?? '')
  const [phone, setPhone] = useState(candidate?.phone ?? '')
  const [resumeText, setResumeText] = useState(candidate?.resumeText ?? '')
  const [interviewNotes, setInterviewNotes] = useState(candidate?.interviewNotes ?? '')
  const [status, setStatus] = useState<Candidate['status']>(candidate?.status ?? 'candidate')

  const save = () => {
    if (!name.trim()) return
    if (candidate) {
      updateCandidate(candidate.id, { name, email, phone, resumeText, interviewNotes, status })
      toast(t('admin.recruiting.updatedToast'))
    } else {
      addCandidate({ name, email, phone, resumeText, interviewNotes })
      toast(t('admin.recruiting.addedToast'))
    }
    onClose()
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        {t('admin.recruiting.nameLabel')}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t('admin.recruiting.emailLabel')}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t('admin.recruiting.phoneLabel')}
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        {t('admin.recruiting.resumeLabel')}
        <textarea
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          rows={5}
          className="rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        {t('admin.recruiting.interviewNotesLabel')}
        <textarea
          value={interviewNotes}
          onChange={(e) => setInterviewNotes(e.target.value)}
          rows={5}
          className="rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary"
        />
      </label>
      {candidate && (
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t('admin.recruiting.statusLabel')}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Candidate['status'])}
            className="h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
          >
            {(Object.keys(STATUS_LABEL_KEY) as Candidate['status'][]).map((s) => (
              <option key={s} value={s}>{t(STATUS_LABEL_KEY[s])}</option>
            ))}
          </select>
        </label>
      )}
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={save} disabled={!name.trim()}>{t('admin.recruiting.save')}</Button>
      </div>
    </div>
  )
}

export function AdminRecruiting() {
  const canAccess = useCanAccessRecruiting()
  const { candidates, removeCandidate, convertCandidateToMember } = useOrbit()
  const toast = useToast()
  const { t } = useI18n()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Candidate | null>(null)

  if (!canAccess) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">{t('admin.recruiting.noAccess')}</p>
      </div>
    )
  }

  const openNew = () => { setEditing(null); setEditorOpen(true) }
  const openEdit = (c: Candidate) => { setEditing(c); setEditorOpen(true) }

  const remove = (c: Candidate) => {
    if (!confirm(t('admin.recruiting.confirmDelete'))) return
    removeCandidate(c.id)
    toast(t('admin.recruiting.deletedToast'))
  }

  const convert = (c: Candidate) => {
    if (!confirm(t('admin.recruiting.confirmConvert', { name: c.name }))) return
    convertCandidateToMember(c.id)
    toast(t('admin.recruiting.convertedToast', { name: c.name }))
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <SectionLabel>{t('admin.recruiting.title')}</SectionLabel>
          <p className="mt-1 text-xs text-muted-foreground">{t('admin.recruiting.desc')}</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4" />
          {t('admin.recruiting.addButton')}
        </Button>
      </div>

      {candidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Briefcase className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">{t('admin.recruiting.empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {candidates.map((c) => (
            <div
              key={c.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <button
                type="button"
                onClick={() => openEdit(c)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.name}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE_CLASS[c.status]}`}>
                    {t(STATUS_LABEL_KEY[c.status])}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {[c.email, c.phone].filter(Boolean).join(' · ')}
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1.5">
                {c.status !== 'hired' && (
                  <button
                    onClick={() => convert(c)}
                    title={t('admin.recruiting.convertButton')}
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <UserPlus2 className="size-4" />
                    {t('admin.recruiting.convertButton')}
                  </button>
                )}
                <button
                  onClick={() => remove(c)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={editorOpen} onClose={() => setEditorOpen(false)}>
        <CandidateEditor candidate={editing} onClose={() => setEditorOpen(false)} />
      </Modal>
    </div>
  )
}
