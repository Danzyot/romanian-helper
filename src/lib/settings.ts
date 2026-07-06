import type { Level } from './progress'

export interface Settings {
  /** 'auto' derives the level from progress; otherwise a manual override */
  levelMode: 'auto' | Level
  /** questions per quiz round */
  quizLength: number
  /** playback rate for the slow listen button */
  slowRate: number
}

const KEY = 'romanian-helper:settings:v1'

const DEFAULTS: Settings = {
  levelMode: 'auto',
  quizLength: 10,
  slowRate: 0.6,
}

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}
