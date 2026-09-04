// Google Calendar REST API helpers (browser-side, token from google-sheet-sync.ts)
// Docs: https://developers.google.com/calendar/api/v3/reference

export interface GCalEvent {
  id: string
  summary: string
  description?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  htmlLink?: string
  colorId?: string
}

const BASE = 'https://www.googleapis.com/calendar/v3'

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/** Fetch events from primary calendar between two ISO date strings. */
export async function fetchCalendarEvents(
  token: string,
  timeMin: string, // ISO 8601
  timeMax: string,
): Promise<GCalEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })
  const res = await fetch(`${BASE}/calendars/primary/events?${params}`, {
    headers: authHeader(token),
  })
  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`)
  const data = await res.json() as { items?: GCalEvent[] }
  return data.items ?? []
}

/** Create an event on the primary calendar. */
export async function createCalendarEvent(
  token: string,
  event: {
    summary: string
    description?: string
    startDateTime?: string // ISO 8601 — omit for all-day
    endDateTime?: string
    startDate?: string // YYYY-MM-DD — for all-day
    endDate?: string
  },
): Promise<GCalEvent> {
  const body: Record<string, unknown> = { summary: event.summary }
  if (event.description) body.description = event.description
  if (event.startDateTime) {
    body.start = { dateTime: event.startDateTime, timeZone: 'Asia/Tokyo' }
    body.end = { dateTime: event.endDateTime ?? event.startDateTime, timeZone: 'Asia/Tokyo' }
  } else {
    body.start = { date: event.startDate }
    body.end = { date: event.endDate ?? event.startDate }
  }
  const res = await fetch(`${BASE}/calendars/primary/events`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Calendar create error: ${res.status}`)
  return res.json() as Promise<GCalEvent>
}

/** Query free/busy for the primary calendar over a time range. */
export interface FreeBusySlot { start: string; end: string }

export async function fetchFreeBusy(
  token: string,
  timeMin: string,
  timeMax: string,
): Promise<FreeBusySlot[]> {
  const res = await fetch(`${BASE}/freeBusy`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone: 'Asia/Tokyo',
      items: [{ id: 'primary' }],
    }),
  })
  if (!res.ok) throw new Error(`FreeBusy API error: ${res.status}`)
  const data = await res.json() as { calendars?: { primary?: { busy?: FreeBusySlot[] } } }
  return data.calendars?.primary?.busy ?? []
}

/** Delete an event by ID from the primary calendar. */
export async function deleteCalendarEvent(token: string, eventId: string): Promise<void> {
  await fetch(`${BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}
