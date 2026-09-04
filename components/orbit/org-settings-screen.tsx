'use client'

import { useRef, useState } from 'react'
import { useOrbit } from '@/lib/orbit/store'
import { isRemoteConfigured as remoteConfigured } from '@/lib/orbit/remote'
import { useToast } from '@/components/orbit/toast'
import { Tag, SectionLabel } from '@/components/orbit/primitives'
import { Button } from '@/components/ui/button'
import { Building2, ImageUp, Loader2, Mail, MessageSquare, X, Plus } from 'lucide-react'

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
    uploadAvatarImage,
    driveEnabled,
    orgNotificationEmails,
    addOrgNotificationEmail,
    removeOrgNotificationEmail,
    setDiscordWebhookUrl,
    setSlackWebhookUrl,
    isFullAdmin,
  } = useOrbit()
  const toast = useToast()

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
        <h1 className="text-xl font-semibold">団体設定</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        団体名・ロゴや通知先（メール・Discord・Slack）など、組織全体の設定を管理します。
      </p>

      <div className="flex flex-col gap-5">
        {/* 団体名・ロゴ */}
        <Section>
          <SectionLabel>団体名・ロゴ</SectionLabel>
          <p className="mt-1 text-xs text-muted-foreground">
            ヘッダーに表示する団体名とロゴ画像を設定します。
          </p>

          <div className="mt-4">
            <label className="block text-xs font-medium text-muted-foreground">団体名</label>
            <div className="mt-1.5 flex gap-2">
              <input
                value={orgNameDraft}
                onChange={(e) => setOrgNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  if (e.key === 'Enter') { setOrgName(orgNameDraft.trim()); toast('団体名を保存しました') }
                }}
                placeholder="例: ○○大学 △△サークル"
                className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
              <Button size="sm" onClick={() => { setOrgName(orgNameDraft.trim()); toast('団体名を保存しました') }}>
                保存
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-muted-foreground">ロゴ画像</label>
            <input
              ref={logoFileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                if (!driveEnabled) { toast('Google Driveが未設定のためアップロードできません'); return }
                setUploadingLogo(true)
                try {
                  await uploadAvatarImage('org-logo', await fileToDataUrl(file), 'org-logo.jpg')
                  toast('ロゴをアップロードしました（Drive公開URLを下の欄に貼り付けてください）')
                } catch {
                  toast('アップロードに失敗しました')
                } finally {
                  setUploadingLogo(false)
                  e.target.value = ''
                }
              }}
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {orgLogoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={orgLogoUrl} alt="団体ロゴ" className="h-10 w-10 rounded-md border border-border object-contain" />
              )}
              <input
                value={orgLogoUrl}
                onChange={(e) => setOrgLogoUrl(e.target.value)}
                placeholder="画像URLを直接入力（またはアップロードして公開URLを貼付け）"
                className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary"
              />
              {driveEnabled && (
                <Button size="sm" variant="outline" disabled={uploadingLogo} onClick={() => logoFileRef.current?.click()} className="gap-1.5">
                  {uploadingLogo ? <Loader2 className="size-3.5 animate-spin" /> : <ImageUp className="size-3.5" />}
                  アップロード
                </Button>
              )}
              {orgLogoUrl && (
                <button type="button" onClick={() => setOrgLogoUrl('')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
                  <X className="size-3.5" />削除
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              推奨: 正方形PNG（256×256px以上）。Drive共有リンクを直接URLに貼ることもできます。
            </p>
          </div>
        </Section>

        {/* 団体メール */}
        {isFullAdmin && (
          <Section>
            <div className="flex items-center gap-1.5">
              <Mail className="size-4 text-muted-foreground" />
              <SectionLabel>団体メール通知先</SectionLabel>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              承認依頼・確認待ちなどの管理者向け通知が、個々のメンバーの設定に関わらず常にここにも届きます。
              団体で共有しているメーリングリストやグループアドレスの登録を想定しています。
            </p>
            {!remoteOk && (
              <p className="mt-1 text-xs text-warning">スプレッドシート連携が未設定のため、保存しても反映されません。</p>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {orgNotificationEmails.map((email) => (
                <Tag key={email} onRemove={() => removeOrgNotificationEmail(email)}>{email}</Tag>
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
              <Button className="h-9 shrink-0" disabled={!orgEmailDraft.trim()} onClick={() => { addOrgNotificationEmail(orgEmailDraft.trim()); setOrgEmailDraft('') }}>
                <Plus className="size-4" />追加
              </Button>
            </div>
          </Section>
        )}

        {/* Discord */}
        <Section>
          <div className="flex items-center gap-1.5">
            <MessageSquare className="size-4 text-muted-foreground" />
            <SectionLabel>Discord Webhook 連携</SectionLabel>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            タスクが確認待ちになったとき・期限超過タスクの日次サマリーが指定したDiscordチャンネルに通知されます。
            チャンネル設定 → 連携サービス → ウェブフックで発行したURLを貼り付けてください。
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            URLは書き込み専用（保存後は画面に表示されません）。Apps Script側のみに保管されます。
          </p>
          {!remoteOk && (
            <p className="mt-1 text-xs text-warning">スプレッドシート連携が未設定のため、保存しても反映されません。</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <input
              value={discordDraft}
              onChange={(e) => setDiscordDraft(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <Button className="h-9 shrink-0" disabled={!discordDraft.trim() || !remoteOk} onClick={() => { setDiscordWebhookUrl(discordDraft.trim()); setDiscordDraft(''); toast('Discord Webhook URLを保存しました') }}>
              保存
            </Button>
          </div>
        </Section>

        {/* Slack */}
        <Section>
          <div className="flex items-center gap-1.5">
            <MessageSquare className="size-4 text-muted-foreground" />
            <SectionLabel>Slack Incoming Webhook 連携</SectionLabel>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            タスクが確認待ちになったとき・期限超過タスクの日次サマリーが指定したSlackチャンネルに通知されます。
            SlackのAppからIncoming Webhookを発行してURLを貼り付けてください。
          </p>
          {!remoteOk && (
            <p className="mt-1 text-xs text-warning">スプレッドシート連携が未設定のため、保存しても反映されません。</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <input
              value={slackDraft}
              onChange={(e) => setSlackDraft(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <Button className="h-9 shrink-0" disabled={!slackDraft.trim() || !remoteOk} onClick={() => { setSlackWebhookUrl(slackDraft.trim()); setSlackDraft(''); toast('Slack Webhook URLを保存しました') }}>
              保存
            </Button>
          </div>
        </Section>
      </div>
    </div>
  )
}
