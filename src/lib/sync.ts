import { createClient, type Session } from '@supabase/supabase-js'
import { load, mergeRemote, onChange, type WordStat } from './progress'

// Publishable key — safe to ship in the client; row-level security in
// supabase/schema.sql restricts every row to its owner.
const SUPABASE_URL = 'https://ksnxtethxreewwfwmwxh.supabase.co'
const SUPABASE_KEY = 'sb_publishable_ZPLBtLPuMrMiOMBe3A0vdQ_U3zkPVs7'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export type SyncStatus = 'off' | 'syncing' | 'ok' | 'error'

let session: Session | null = null
let status: SyncStatus = 'off'
let statusListener: ((s: SyncStatus) => void) | null = null

function setStatus(s: SyncStatus): void {
  status = s
  statusListener?.(s)
}

export function getSyncStatus(): SyncStatus {
  return status
}

export function onSyncStatus(fn: (s: SyncStatus) => void): void {
  statusListener = fn
  fn(status)
}

export function currentUserEmail(): string | null {
  return session?.user.email ?? null
}

// ——— auth ———

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? error.message : null
}

export async function sendLoginLink(email: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      // land back in the app; the client picks the session out of the URL
      emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
    },
  })
  return error ? error.message : null
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

// ——— sync ———

async function pullAndMerge(userId: string): Promise<void> {
  const [statsRes, daysRes] = await Promise.all([
    supabase.from('word_stats').select('*').eq('user_id', userId),
    supabase.from('activity_days').select('day').eq('user_id', userId),
  ])
  if (statsRes.error || daysRes.error) throw statsRes.error ?? daysRes.error

  const remoteStats: Record<string, WordStat> = {}
  for (const row of statsRes.data) {
    remoteStats[row.word_id] = {
      box: row.box,
      due: row.due ? new Date(row.due).getTime() : 0,
      seen: row.seen,
      correct: row.correct,
      wrong: row.wrong,
      lastScore: row.last_score ?? undefined,
    }
  }
  mergeRemote(
    remoteStats,
    daysRes.data.map((d) => d.day),
  )
}

async function pushAll(userId: string): Promise<void> {
  const state = load()
  const rows = Object.entries(state.stats).map(([wordId, s]) => ({
    user_id: userId,
    word_id: wordId,
    box: s.box,
    due: s.due ? new Date(s.due).toISOString() : null,
    seen: s.seen,
    correct: s.correct,
    wrong: s.wrong,
    last_score: s.lastScore ?? null,
    updated_at: new Date().toISOString(),
  }))
  const days = state.activeDays.map((day) => ({ user_id: userId, day }))

  if (rows.length) {
    const { error } = await supabase.from('word_stats').upsert(rows)
    if (error) throw error
  }
  if (days.length) {
    const { error } = await supabase
      .from('activity_days')
      .upsert(days, { ignoreDuplicates: true })
    if (error) throw error
  }
}

/** Pull remote state, merge, and push the merged result. */
export async function fullSync(): Promise<void> {
  if (!session) return
  setStatus('syncing')
  try {
    await pullAndMerge(session.user.id)
    await pushAll(session.user.id)
    setStatus('ok')
  } catch {
    setStatus('error')
  }
}

// Debounced incremental push after each recorded answer/practice.
let pushTimer: ReturnType<typeof setTimeout> | undefined
const pendingWords = new Set<string>()
let pendingDay: string | null = null

onChange((wordId, day) => {
  if (!session) return
  if (wordId) pendingWords.add(wordId)
  pendingDay = day
  clearTimeout(pushTimer)
  pushTimer = setTimeout(flushPending, 2000)
})

async function flushPending(): Promise<void> {
  if (!session) return
  const userId = session.user.id
  const state = load()
  const words = [...pendingWords]
  pendingWords.clear()
  const day = pendingDay
  pendingDay = null
  try {
    if (words.length) {
      const rows = words
        .filter((id) => state.stats[id])
        .map((id) => {
          const s = state.stats[id]
          return {
            user_id: userId,
            word_id: id,
            box: s.box,
            due: s.due ? new Date(s.due).toISOString() : null,
            seen: s.seen,
            correct: s.correct,
            wrong: s.wrong,
            last_score: s.lastScore ?? null,
            updated_at: new Date().toISOString(),
          }
        })
      const { error } = await supabase.from('word_stats').upsert(rows)
      if (error) throw error
    }
    if (day) {
      const { error } = await supabase
        .from('activity_days')
        .upsert([{ user_id: userId, day }], { ignoreDuplicates: true })
      if (error) throw error
    }
    setStatus('ok')
  } catch {
    setStatus('error')
  }
}

/** Call once at app start. Resolves the stored session and syncs. */
export async function initSync(): Promise<void> {
  const { data } = await supabase.auth.getSession()
  session = data.session
  supabase.auth.onAuthStateChange((_event, newSession) => {
    const hadSession = session !== null
    session = newSession
    if (session && !hadSession) void fullSync()
    if (!session) setStatus('off')
  })
  if (session) void fullSync()
}
