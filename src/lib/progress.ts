import { dictionary, type Entry } from '../data/dictionary'
import { getSettings } from './settings'

/**
 * Local-first progress store.
 *
 * All reads/writes go through this module; the Supabase sync layer
 * (src/lib/sync.ts) subscribes via `onChange` to push updates and calls
 * `mergeRemote` after pulling rows. See supabase/schema.sql.
 */

export interface WordStat {
  /** Leitner box 0-5; >=4 counts as mastered */
  box: number
  /** epoch ms when the word is due for review */
  due: number
  seen: number
  correct: number
  wrong: number
  /** last pronunciation score 0-100, when available */
  lastScore?: number
}

export interface ProgressState {
  stats: Record<string, WordStat>
  /** ISO dates (YYYY-MM-DD) with at least one activity, capped at 400 */
  activeDays: string[]
  /** rolling record of the last quiz answers, newest last, capped at 30 */
  recentAnswers: boolean[]
}

const KEY = 'romanian-helper:progress:v1'

// Review intervals per Leitner box, in hours.
const INTERVALS_H = [0, 4, 24, 72, 24 * 7, 24 * 16]

export const LEVELS = ['A0', 'A1', 'A2', 'B1'] as const
export type Level = (typeof LEVELS)[number]
// Points needed to *reach* each level (mastered words weighted by tier).
const LEVEL_POINTS = [0, 25, 90, 220]

type ChangeListener = (changedWordId: string | null, day: string) => void
const listeners: ChangeListener[] = []

/** Subscribe to progress changes (used by the sync layer). */
export function onChange(fn: ChangeListener): void {
  listeners.push(fn)
}

function emptyState(): ProgressState {
  return { stats: {}, activeDays: [], recentAnswers: [] }
}

export function load(): ProgressState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyState()
    return { ...emptyState(), ...JSON.parse(raw) }
  } catch {
    return emptyState()
  }
}

function save(state: ProgressState, changedWordId: string | null): void {
  localStorage.setItem(KEY, JSON.stringify(state))
  const day = today()
  for (const fn of listeners) fn(changedWordId, day)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function touchDay(state: ProgressState): void {
  const day = today()
  if (state.activeDays[state.activeDays.length - 1] !== day) {
    state.activeDays.push(day)
    if (state.activeDays.length > 400) state.activeDays.shift()
  }
}

function stat(state: ProgressState, id: string): WordStat {
  return (state.stats[id] ??= { box: 0, due: 0, seen: 0, correct: 0, wrong: 0 })
}

function applyResult(s: WordStat, ok: boolean): void {
  s.seen += 1
  if (ok) {
    s.correct += 1
    s.box = Math.min(5, s.box + 1)
  } else {
    s.wrong += 1
    s.box = Math.max(1, s.box - 1)
  }
  s.due = Date.now() + INTERVALS_H[s.box] * 3_600_000
}

/** Record a quiz answer tied to a dictionary word. */
export function recordQuiz(id: string, ok: boolean): void {
  const state = load()
  applyResult(stat(state, id), ok)
  pushAnswer(state, ok)
  touchDay(state)
  save(state, id)
}

/** Record an answer not tied to a dictionary word (sentences, texts). */
export function recordOutcome(ok: boolean): void {
  const state = load()
  pushAnswer(state, ok)
  touchDay(state)
  save(state, null)
}

function pushAnswer(state: ProgressState, ok: boolean): void {
  state.recentAnswers.push(ok)
  if (state.recentAnswers.length > 30) state.recentAnswers.shift()
}

/**
 * Record a pronunciation attempt. Until AI grading lands, callers pass no
 * score and it only counts as exposure; with a score it also moves the
 * Leitner box (>=70 counts as success).
 */
export function recordPractice(id: string, score?: number): void {
  const state = load()
  const s = stat(state, id)
  if (score === undefined) {
    s.seen += 1
  } else {
    s.lastScore = score
    applyResult(s, score >= 70)
  }
  touchDay(state)
  save(state, id)
}

/** Merge rows pulled from the remote store; keeps whichever side saw more. */
export function mergeRemote(
  remoteStats: Record<string, WordStat>,
  remoteDays: string[],
): void {
  const state = load()
  for (const [id, remote] of Object.entries(remoteStats)) {
    const local = state.stats[id]
    if (!local || remote.seen > local.seen) {
      state.stats[id] = remote
    }
  }
  state.activeDays = [...new Set([...state.activeDays, ...remoteDays])].sort()
  if (state.activeDays.length > 400) {
    state.activeDays = state.activeDays.slice(-400)
  }
  localStorage.setItem(KEY, JSON.stringify(state))
}

/** Wipe all local progress (used by settings → reset). */
export function resetProgress(): void {
  localStorage.removeItem(KEY)
}

// ——— derived metrics ———

export interface Summary {
  level: Level
  /** 0-1 progress toward the next level (1 when at top level) */
  levelProgress: number
  points: number
  mastered: number
  practiced: number
  streak: number
  /** rolling quiz accuracy 0-1, or null with no data */
  accuracy: number | null
}

export function summary(state = load()): Summary {
  let points = 0
  let mastered = 0
  let practiced = 0
  for (const w of dictionary) {
    const s = state.stats[w.id]
    if (!s || s.seen === 0) continue
    practiced += 1
    if (s.box >= 4) {
      mastered += 1
      points += w.tier
    }
  }

  let levelIdx = 0
  for (let i = LEVEL_POINTS.length - 1; i >= 0; i--) {
    if (points >= LEVEL_POINTS[i]) {
      levelIdx = i
      break
    }
  }
  const next = LEVEL_POINTS[levelIdx + 1]
  const cur = LEVEL_POINTS[levelIdx]
  const levelProgress =
    next === undefined ? 1 : Math.min(1, (points - cur) / (next - cur))

  const answers = state.recentAnswers
  const accuracy =
    answers.length >= 5
      ? answers.filter(Boolean).length / answers.length
      : null

  return {
    level: LEVELS[levelIdx],
    levelProgress,
    points,
    mastered,
    practiced,
    streak: streak(state),
    accuracy,
  }
}

function streak(state: ProgressState): number {
  const days = new Set(state.activeDays)
  let count = 0
  const d = new Date()
  // today counts if active; otherwise start from yesterday
  if (!days.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1)
  while (days.has(d.toISOString().slice(0, 10))) {
    count += 1
    d.setDate(d.getDate() - 1)
  }
  return count
}

// ——— level & adaptive selection ———

/** The level shown and used for content: manual override or computed. */
export function effectiveLevel(state = load()): Level {
  const mode = getSettings().levelMode
  return mode === 'auto' ? summary(state).level : mode
}

function tierForLevel(level: Level): 1 | 2 | 3 {
  if (level === 'A0') return 1
  if (level === 'A1') return 2
  return 3
}

/** Highest content tier the learner should currently see. */
export function unlockedTier(state = load()): 1 | 2 | 3 {
  const mode = getSettings().levelMode
  if (mode !== 'auto') return tierForLevel(mode)
  const { level, accuracy, mastered } = summary(state)
  const confident = accuracy === null || accuracy >= 0.6
  if (level === 'A0') return confident && mastered >= 10 ? 2 : 1
  if (level === 'A1') return 2
  return 3
}

/**
 * Pick the next words to work on: overdue reviews first (most overdue
 * first), then unseen words from unlocked tiers, easiest tier first.
 */
export function pickWords(count: number, state = load()): Entry[] {
  const now = Date.now()
  const maxTier = unlockedTier(state)

  const due: { entry: Entry; due: number }[] = []
  const fresh: Entry[] = []
  for (const w of dictionary) {
    const s = state.stats[w.id]
    if (s && s.seen > 0) {
      if (s.due <= now && s.box < 5) due.push({ entry: w, due: s.due })
    } else if (w.tier <= maxTier) {
      fresh.push(w)
    }
  }
  due.sort((a, b) => a.due - b.due)
  fresh.sort((a, b) => a.tier - b.tier)

  const reviewShare = Math.min(due.length, Math.ceil(count * 0.6))
  const picked: Entry[] = due.slice(0, reviewShare).map((d) => d.entry)
  for (const w of fresh) {
    if (picked.length >= count) break
    picked.push(w)
  }
  // top up with any due reviews beyond the 60% share if fresh ran out
  for (const d of due.slice(reviewShare)) {
    if (picked.length >= count) break
    picked.push(d.entry)
  }
  return picked
}
