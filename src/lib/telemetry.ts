import { supabase } from './sync'

/**
 * Lightweight usage logging + feedback gating.
 * Events go to usage_events (owner-only rows); everything is fire-and-forget
 * and silent on failure, so the app never stumbles over telemetry.
 */

export function logEvent(kind: string, detail: Record<string, unknown> = {}): void {
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) return
      await supabase.from('usage_events').insert({
        user_id: data.session.user.id,
        kind,
        detail,
      })
    } catch {
      /* telemetry must never break the app */
    }
  })()
}

// ——— feedback prompt gating: at most one prompt per day, and the same
// context no more than once a week ———

const FB_KEY = 'romanian-helper:feedback:v1'

interface FbState {
  lastPromptDay?: string
  contexts: Record<string, string>
}

function fbState(): FbState {
  try {
    return { contexts: {}, ...JSON.parse(localStorage.getItem(FB_KEY) ?? '{}') }
  } catch {
    return { contexts: {} }
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysSince(day: string | undefined): number {
  if (!day) return Infinity
  return (Date.now() - new Date(day).getTime()) / 86_400_000
}

export function shouldPromptFeedback(context: string): boolean {
  const st = fbState()
  return st.lastPromptDay !== today() && daysSince(st.contexts[context]) >= 7
}

export function markFeedbackPrompted(context: string): void {
  const st = fbState()
  st.lastPromptDay = today()
  st.contexts[context] = today()
  localStorage.setItem(FB_KEY, JSON.stringify(st))
}

export function recordFeedback(context: string, helpful: boolean): void {
  logEvent('feedback', { context, helpful })
}
