// IANAタイムゾーン名の候補リスト。Memberレコードに保存する値そのもの
// （Intl.DateTimeFormat の timeZone にそのまま渡せる形式）。組織の主な
// 活動地域＋主要な地域を一通りカバーする実用的な短いリストで、フルの
// tzdata一覧（600件超）は選択の手間に見合わないため採用していない。
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'Asia/Tokyo', label: '日本 (Asia/Tokyo, UTC+9)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Asia/Shanghai', label: '中国 (Asia/Shanghai, UTC+8)' },
  { value: 'Asia/Seoul', label: '韓国 (Asia/Seoul, UTC+9)' },
  { value: 'Asia/Singapore', label: 'シンガポール (Asia/Singapore, UTC+8)' },
  { value: 'Asia/Kolkata', label: 'インド (Asia/Kolkata, UTC+5:30)' },
  { value: 'Europe/London', label: 'イギリス (Europe/London)' },
  { value: 'Europe/Paris', label: '中央ヨーロッパ (Europe/Paris)' },
  { value: 'America/New_York', label: '米国東部 (America/New_York)' },
  { value: 'America/Chicago', label: '米国中部 (America/Chicago)' },
  { value: 'America/Denver', label: '米国山岳部 (America/Denver)' },
  { value: 'America/Los_Angeles', label: '米国西部 (America/Los_Angeles)' },
  { value: 'Australia/Sydney', label: 'オーストラリア東部 (Australia/Sydney)' },
]

export const DEFAULT_TIMEZONE = 'Asia/Tokyo'

const TIMEZONE_STORAGE_KEY = 'orbit-timezone'

// currentUser.timezone が未設定のとき（未ログイン、または本人が一度も
// 設定していない）に使うフォールバック。ブラウザに保存した最後の選択値
// → 団体既定（DEFAULT_TIMEZONE=JST）の順に解決する。
export function loadCachedTimezone(): string {
  try {
    return window.localStorage.getItem(TIMEZONE_STORAGE_KEY) || DEFAULT_TIMEZONE
  } catch {
    return DEFAULT_TIMEZONE
  }
}

export function cacheTimezone(tz: string) {
  try {
    window.localStorage.setItem(TIMEZONE_STORAGE_KEY, tz)
  } catch {
    /* ignore */
  }
}

// 指定タイムゾーンでの「今日」を YYYY-MM-DD で返す。期限超過判定
// （isOverdue/deadlineLevel、lib/orbit/utils.ts）が使う基準日で、
// UTC基準の Date#toISOString と違い、JST等では日付が1日ずれない。
export function todayStrInTz(tz: string): string {
  try {
    // en-CA のロケールは YYYY-MM-DD 形式を返すため、そのまま使える
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIMEZONE }).format(new Date())
  }
}

// 時刻を含むISO文字列（コメントの投稿日時など）を、指定タイムゾーンの
// "M/D HH:mm" で表示する。日付のみの文字列（YYYY-MM-DD の締切など）は
// タイムゾーンに関係なくカレンダー日そのものなので、この関数の対象外
// （utils.ts の formatDeadline 系を引き続き使う）。
export function formatDateTimeInTz(iso: string | undefined, tz: string, locale: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ja-JP', {
      timeZone: tz,
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
  } catch {
    // 不正なTZ名（未知の値が紛れ込んだ場合）は既定にフォールバック
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ja-JP', {
      timeZone: DEFAULT_TIMEZONE,
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
  }
}
