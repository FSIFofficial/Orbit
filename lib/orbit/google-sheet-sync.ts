// Google Identity Services (GIS) — token client for OAuth flows.
// The GIS script is loaded globally in app/layout.tsx.
// No npm packages needed: GIS is loaded via <script> tag, Sheets API via fetch().

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; error?: string }) => void
          }) => {
            requestAccessToken: (options?: { prompt?: string }) => void
          }
        }
      }
    }
  }
}

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const LOGIN_SCOPE = 'openid email profile'

function waitForGIS(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('ブラウザ環境でのみ使用できます'))
      return
    }
    if (window.google?.accounts?.oauth2) {
      resolve()
      return
    }
    let attempts = 0
    const interval = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(interval)
        resolve()
      } else if (++attempts > 100) {
        clearInterval(interval)
        reject(new Error('Google Identity Services の読み込みタイムアウト'))
      }
    }, 100)
  })
}

function requestToken(scope: string, silent = false): Promise<string> {
  if (!CLIENT_ID) return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID が設定されていません'))
  return waitForGIS().then(
    () =>
      new Promise((resolve, reject) => {
        const client = window.google!.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID!,
          scope,
          callback: (resp) => {
            if (resp.error || !resp.access_token) {
              reject(new Error(resp.error ?? '認証に失敗しました'))
            } else {
              resolve(resp.access_token)
            }
          },
        })
        client.requestAccessToken(silent ? { prompt: '' } : undefined)
      }),
  )
}

// ---- login (openid email profile) ----------------------------------------

export function isGoogleOAuthConfigured(): boolean {
  return !!CLIENT_ID
}

export function requestGoogleLoginToken(): Promise<string> {
  return requestToken(LOGIN_SCOPE)
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<{ email: string }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('ユーザー情報の取得に失敗しました')
  return res.json() as Promise<{ email: string }>
}

// ---- personal sheet sync (spreadsheets scope) ----------------------------

export function requestSheetsToken(silent = false): Promise<string> {
  return requestToken(SHEETS_SCOPE, silent)
}

export function extractSpreadsheetId(input: string): string | null {
  const match = input.match(/\/spreadsheets\/d\/([-\w]+)/)
  if (match) return match[1]
  if (/^[-\w]{20,}$/.test(input.trim())) return input.trim()
  return null
}

export async function verifySheetAccess(
  spreadsheetId: string,
  accessToken: string,
): Promise<{ ok: boolean; title?: string; error?: string }> {
  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=properties.title`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: { message?: string } }
      return { ok: false, error: data?.error?.message ?? `HTTP ${res.status}` }
    }
    const data = await res.json() as { properties?: { title?: string } }
    return { ok: true, title: data?.properties?.title }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export interface SyncRow {
  taskName: string
  project: string
  department: string
  assignees: string
  status: string
  priority: string
  difficulty: string
  category: string
  skills: string
  startDate: string
  deadline: string
  completedDate: string
  progress: string
  description: string
}

const SHEET_NAME = 'Orbit Sync'

const HEADER = [
  'タスク名', 'プロジェクト', '部門', '担当者', 'ステータス',
  '優先度', '難易度', 'カテゴリ', '必要スキル', '開始日', '期限', '完了日', '進捗', '説明',
]

export async function syncTasksToSheet(
  spreadsheetId: string,
  accessToken: string,
  rows: SyncRow[],
): Promise<void> {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  const values = [HEADER, ...rows.map((r) => [
    r.taskName, r.project, r.department, r.assignees, r.status,
    r.priority, r.difficulty, r.category, r.skills,
    r.startDate, r.deadline, r.completedDate, r.progress, r.description,
  ])]

  // Clear existing data, then write fresh
  await fetch(`${base}/values/${encodeURIComponent(SHEET_NAME)}:clear`, {
    method: 'POST', headers, body: JSON.stringify({}),
  }).catch(() => {}) // sheet may not exist yet — ignore clear failure

  const res = await fetch(
    `${base}/values/${encodeURIComponent(`${SHEET_NAME}!A1`)}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', headers, body: JSON.stringify({ values }) },
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(data?.error?.message ?? `書き込みエラー HTTP ${res.status}`)
  }
}

// ---- localStorage helpers (per-user, browser-only) -----------------------

function personalSheetKey(userId: string) {
  return `orbit-personal-sheet-id-${userId}`
}

export function loadPersonalSheetId(userId: string): string {
  try {
    return localStorage.getItem(personalSheetKey(userId)) ?? ''
  } catch {
    return ''
  }
}

export function savePersonalSheetId(userId: string, sheetId: string): void {
  try {
    if (sheetId) {
      localStorage.setItem(personalSheetKey(userId), sheetId)
    } else {
      localStorage.removeItem(personalSheetKey(userId))
    }
  } catch {
    // ignore
  }
}
