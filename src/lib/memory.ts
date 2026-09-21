import { supabase } from './sync'

/** Ana's long-term memory: short facts about the learner, synced per user. */

const MAX_FACTS = 40

export async function loadFacts(): Promise<string[]> {
  const { data: s } = await supabase.auth.getSession()
  if (!s.session) return []
  const { data } = await supabase
    .from('tutor_memory')
    .select('facts')
    .eq('user_id', s.session.user.id)
    .maybeSingle()
  return Array.isArray(data?.facts) ? (data.facts as string[]) : []
}

export async function saveFacts(facts: string[]): Promise<void> {
  const { data: s } = await supabase.auth.getSession()
  if (!s.session) return
  await supabase.from('tutor_memory').upsert({
    user_id: s.session.user.id,
    facts: facts.slice(-MAX_FACTS),
    updated_at: new Date().toISOString(),
  })
}

/** Append a fact unless a near-duplicate is already stored. */
export function addFact(facts: string[], fact: string): string[] {
  const norm = (f: string) => f.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, '').trim()
  if (facts.some((f) => norm(f) === norm(fact))) return facts
  return [...facts, fact].slice(-MAX_FACTS)
}
