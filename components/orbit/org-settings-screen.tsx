'use client'

import { useRef, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { isRemoteConfigured as remoteConfigured } from '@/lib/orbit/remote'
import { useToast } from '@/components/orbit/toast'
import { Tag, SectionLabel } from '@/components/orbit/primitives'
import { Button } from '@/components/ui/button'
import { Building2, ImageUp, Loader2, Mail, MessageSquare, X, Plus } from 'lucide-react'
import { useI18n } from '@/lib/orbit/i18n'

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      {children}
    </div>
  )
}

export function OrgSettingsScreen() {
  const {
    orgName,
    setOrgName,
    orgLogoUrl,
    setOrgLogoUrl,
    uploadOrgLogo,
    driveEnabled,
    orgNotificationEmails,
    addOrgNotificationEmail,
    removeOrgNotificationEmail,
    setDiscordWebhookUrl,
    setSlackWebhookUrl,
    isFullAdmin,
  } = useOrbit()
  const toast = useToast()
  const { t } = useI18n()

  const [orgNameDraft, setOrgNameDraft] = useState(orgName)
  const [orgEmailDraft, setOrgEmailDraft] = useState('')
  const [discordDraft, setDiscordDraft] = useState('')
  const [slackDraft, setSlackDraft] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoFileRef = useRef<HTMLInputElement>(null)

  const remoteOk = remoteConfigured

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2.5">
        <Building2 className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">{t('orgSettings.title')}</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        {t('orgSettings.subtitle')}
      </p>

      <div className="flex flex-col gap-5">
        <Section>
          <SectionLabel>{t('orgSettings.nameLogo.label')}</SectionLabel>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('orgSettings.nameLogo.desc')}
          </p>

          <div className="mt-4">
            <label className="block text-xs font-medium text-muted-foreground">{t('orgSettings.nameLogo.nameLabel')}</label>
            <div className="mt-1.5 flex gap-2">
              <input
                value={orgNameDraft}
                onChange={(e) => setOrgNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  if (e.key === 'Enter') { setOrgName(orgNameDraft.trim()); toast(t('orgSettings.nameLogo.savedToast')) }
                }}
                placeholder={t('orgSettings.nameLogo.namePlaceholder')}
                className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
              <Button size="sm" onClick={() => { setOrgName(orgNameDraft.trim()); toast(t('orgSettings.nameLogo.savedToast')) }}>
                {t('orgSettings.nameLogo.save')}
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-muted-foreground">{t('orgSettings.nameLogo.logoLabel')}</label>
            <input
              ref={logoFileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                if (!driveEnabled) { toast(t('orgSettings.nameLogo.driveNotConfiguredToast')); return }
                setUploadingLogo(true)
                try {
                  await uploadOrgLogo(await fileToDataUrl(file), 'org-logo.jpg')
                  toast(t('orgSettings.nameLogo.uploadedToast'))
                } catch {
                  toast(t('orgSettings.nameLogo.uploadFailedToast'))
                } finally {
                  setUploadingLogo(false)
                  e.target.value = ''
                }
              }}
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {orgLogoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={orgLogoUrl} alt={t('orgSettings.nameLogo.altText')} className="h-10 w-10 rounded-md border border-border object-contain" />
              )}
              <input
                value={orgLogoUrl}
                onChange={(e) => setOrgLogoUrl(e.target.value)}
                placeholder={t('orgSettings.nameLogo.urlPlaceholder')}
                className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary"
              />
              {driveEnabled && (
                <Button size="sm" variant="outline" disabled={uploadingLogo} onClick={() => logoFileRef.current?.click()} className="gap-1.5">
                  {uploadingLogo ? <Loader2 className="size-3.5 animate-spin" /> : <ImageUp className="size-3.5" />}
                  {t('orgSettings.nameLogo.upload')}
                </Button>
              )}
              {orgLogoUrl && (
                <button type="button" onClick={() => setOrgLogoUrl('')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
                  <X className="size-3.5" />{t('orgSettings.nameLogo.remove')}
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('orgSettings.nameLogo.hint')}
            </p>
          </div>
        </Section>

        {isFullAdmin && (
          <Section>
            <div className="flex items-center gap-1.5">
              <Mail className="size-4 text-muted-foreground" />
              <SectionLabel>{t('orgSettings.email.label')}</SectionLabel>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('orgSettings.email.desc')}
            </p>
            {!remoteOk && (
              <p className="mt-1 text-xs text-warning">{t('orgSettings.remoteWarning')}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {orgNotificationEmails.map((email) => (
                <Tag key={email} onRemove={() => removeOrgNotificationEmail(email)}>{email}</Tag>
              ))}
              {orgNotificationEmails.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('orgSettings.email.empty')}</p>
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
              <Button className="h-9 shrink-0" disabled={!orgEmailDraft.trim()} onClick={() => { addOrgNotificationEmail(orgEmailDraft.trim()); setOrgEmailDraft('') }}>
                <Plus className="size-4" />{t('orgSettings.email.add')}
              </Button>
            </div>
          </Section>
        )}

        <Section>
          <div className="flex items-center gap-1.5">
            <MessageSquare className="size-4 text-muted-foreground" />
            <SectionLabel>{t('orgSettings.discord.label')}</SectionLabel>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('orgSettings.discord.desc')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('orgSettings.discord.urlNote')}
          </p>
          {!remoteOk && (
            <p className="mt-1 text-xs text-warning">{t('orgSettings.remoteWarning')}</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <input
              value={discordDraft}
              onChange={(e) => setDiscordDraft(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <Button className="h-9 shrink-0" disabled={!discordDraft.trim() || !remoteOk} onClick={() => { setDiscordWebhookUrl(discordDraft.trim()); setDiscordDraft(''); toast(t('orgSettings.discord.savedToast')) }}>
              {t('orgSettings.nameLogo.save')}
            </Button>
          </div>
        </Section>

        <Section>
          <div className="flex items-center gap-1.5">
            <MessageSquare className="size-4 text-muted-foreground" />
            <SectionLabel>{t('orgSettings.slack.label')}</SectionLabel>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('orgSettings.slack.desc')}
          </p>
          {!remoteOk && (
            <p className="mt-1 text-xs text-warning">{t('orgSettings.remoteWarning')}</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <input
              value={slackDraft}
              onChange={(e) => setSlackDraft(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <Button className="h-9 shrink-0" disabled={!slackDraft.trim() || !remoteOk} onClick={() => { setSlackWebhookUrl(slackDraft.trim()); setSlackDraft(''); toast(t('orgSettings.slack.savedToast')) }}>
              {t('orgSettings.nameLogo.save')}
            </Button>
          </div>
        </Section>
      </div>
    </div>
  )
}
