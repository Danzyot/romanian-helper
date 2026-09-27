import { supabase } from './sync'

/**
 * Ana's long-term memory, synced per user:
 * - name: what Ana calls her. Set in Settings, or learned once in conversation.
 *   Kept apart from the facts so it can never be confused with (or pushed
 *   out by) other people's names.
 * - facts: short sentences about her life (family, pets, interests).
 * - recentQuestions / recentTopics: what Ana asked lately, so she doesn't
 *   keep asking the same things lesson after lesson.
 *
 * Every change re-reads the stored copy first and writes back the merge, so
 * the chat and a live call (or two phones) never overwrite each other.
 */

export interface Memory {
  name: string
  facts: string[]
  recentQuestions: string[]
  recentTopics: string[]
}

const MAX_FACTS = 40
const MAX_QUESTIONS = 25
const MAX_TOPICS = 8

/** Conversation topics for a beginner; Ana gets a fresh one each lesson. */
export const TOPICS = [
  'food she likes and what she cooks',
  'her morning routine',
  'the weather today',
  'her family',
  'her home and her neighbourhood',
  'shopping at the market',
  'her plans for the weekend',
  'hobbies and free time',
  'music, films and TV she enjoys',
  'holidays and celebrations',
  'places she has visited',
  'what she did yesterday',
  'clothes and colours',
  'days of the week, time and dates',
  'animals she likes',
  'how she feels today',
  'ordering at a café',
  'Romanian food and places she knows',
  'friends and neighbours',
  'the seasons and her favourite one',
  'her childhood',
  'what she is learning Romanian for',
]

const EMPTY: Memory = { name: '', facts: [], recentQuestions: [], recentTopics: [] }
const LOCAL_KEY = 'caiet.memory-extra' // name + recents, when the table lacks their columns

// older tables only have `facts`; fall back until schema.sql is re-run
let hasExtraColumns = true
let cache: { userId: string; memory: Promise<Memory> } | null = null
let writeChain: Promise<unknown> = Promise.resolve()

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []

function readLocal(userId: string): Partial<Memory> {
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}')
    return all[userId] ?? {}
  } catch {
    return {}
  }
}

function writeLocal(userId: string, m: Memory) {
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}')
    all[userId] = { name: m.name, recentQuestions: m.recentQuestions, recentTopics: m.recentTopics }
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all))
  } catch {
    /* storage unavailable */
  }
}

const missingColumn = (e: { code?: string; message: string }) =>
  e.code === '42703' || e.code === 'PGRST204' || /column/i.test(e.message)

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

async function fetchMemory(userId: string): Promise<Memory> {
  if (hasExtraColumns) {
    const { data, error } = await supabase
      .from('tutor_memory')
      .select('facts, name, recent')
      .eq('user_id', userId)
      .maybeSingle()
    if (!error) {
      const recent = (data?.recent ?? {}) as Record<string, unknown>
      return {
        name: typeof data?.name === 'string' ? data.name : '',
        facts: strings(data?.facts),
        recentQuestions: strings(recent.questions),
        recentTopics: strings(recent.topics),
      }
    }
    if (!missingColumn(error)) throw error
    hasExtraColumns = false
  }
  const { data, error } = await supabase
    .from('tutor_memory')
    .select('facts')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  const local = readLocal(userId)
  return {
    name: local.name ?? '',
    facts: strings(data?.facts),
    recentQuestions: strings(local.recentQuestions),
    recentTopics: strings(local.recentTopics),
  }
}

/** The signed-in user's memory; cached, so the chat and calls share one copy. */
export async function loadMemory(): Promise<Memory> {
  const userId = await currentUserId()
  if (!userId) return EMPTY
  if (!cache || cache.userId !== userId) {
    const memory = fetchMemory(userId).catch(() => {
      cache = null // retry next time rather than remembering a failure
      return EMPTY
    })
    cache = { userId, memory }
  }
  return cache.memory
}

async function store(userId: string, m: Memory) {
  const row: Record<string, unknown> = {
    user_id: userId,
    facts: m.facts,
    updated_at: new Date().toISOString(),
  }
  if (hasExtraColumns) {
    row.name = m.name
    row.recent = { questions: m.recentQuestions, topics: m.recentTopics }
  } else {
    writeLocal(userId, m)
  }
  const { error } = await supabase.from('tutor_memory').upsert(row)
  if (error && hasExtraColumns && missingColumn(error)) {
    hasExtraColumns = false
    await store(userId, m)
  }
}

/**
 * Change the memory: re-reads the stored copy, applies `change`, saves.
 * Changes run one at a time.
 */
export function updateMemory(change: (m: Memory) => Memory): Promise<Memory> {
  const run = async () => {
    const userId = await currentUserId()
    if (!userId) return EMPTY
    let fresh: Memory
    try {
      fresh = await fetchMemory(userId)
    } catch {
      fresh = await loadMemory()
    }
    const next = tidy(change(fresh))
    cache = { userId, memory: Promise.resolve(next) }
    await store(userId, next).catch(() => undefined)
    return next
  }
  const p = writeChain.then(run, run)
  writeChain = p.catch(() => undefined)
  return p
}

function tidy(m: Memory): Memory {
  return {
    name: m.name.trim().slice(0, 40),
    facts: m.facts.slice(-MAX_FACTS),
    recentQuestions: m.recentQuestions.slice(-MAX_QUESTIONS),
    recentTopics: m.recentTopics.slice(-MAX_TOPICS),
  }
}

const norm = (f: string) => f.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, '').replace(/\s+/g, ' ').trim()

/** What Ana learned this turn: a new fact (optionally updating an old one) and/or her name. */
export interface Learned {
  fact?: string | null
  replaces?: string | null
  herName?: string | null
}

export function applyLearned(m: Memory, l: Learned): Memory {
  let facts = m.facts
  if (l.replaces) {
    const old = norm(l.replaces)
    facts = facts.filter((f) => norm(f) !== old)
  }
  const fact = l.fact?.trim()
  if (fact && !facts.some((f) => norm(f) === norm(fact))) facts = [...facts, fact]
  // a name she told Ana fills in a missing one; one typed in Settings wins
  const name = m.name || (l.herName ?? '').trim()
  return { ...m, facts, name }
}

/** Remember the questions in Ana's lines, so later lessons ask new ones. */
export function withQuestions(m: Memory, lines: string[]): Memory {
  const questions = lines
    .flatMap((line) => line.match(/[^.!?¿]*\?/g) ?? [])
    .map((q) => q.trim())
    .filter((q) => q.length > 3)
  if (!questions.length) return m
  const seen = new Set(questions.map(norm))
  return {
    ...m,
    recentQuestions: [...m.recentQuestions.filter((q) => !seen.has(norm(q))), ...questions],
  }
}

/** A topic she hasn't talked about lately. */
export function pickTopic(m: Memory): string {
  const recent = new Set(m.recentTopics)
  const fresh = TOPICS.filter((t) => !recent.has(t))
  const pool = fresh.length ? fresh : TOPICS
  return pool[Math.floor(Math.random() * pool.length)]
}

export function withTopic(m: Memory, topic: string): Memory {
  return { ...m, recentTopics: [...m.recentTopics.filter((t) => t !== topic), topic] }
}

/** What the tutor function needs to know about her. */
export function tutorContext(m: Memory, topic: string) {
  return {
    name: m.name,
    facts: m.facts,
    recentQuestions: m.recentQuestions.slice(-15),
    topic,
  }
}
