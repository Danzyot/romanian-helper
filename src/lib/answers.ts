import type { Entry } from '../data/dictionary'
import { fold } from './search'

/** Levenshtein distance, early-exit above `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    let rowMin = prev[0]
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      diag = tmp
      rowMin = Math.min(rowMin, prev[j])
    }
    if (rowMin > max) return max + 1
  }
  return prev[b.length]
}

const HEBREW = /[֐-׿]/

/**
 * Check a typed answer against accepted forms.
 * Case- and diacritic-insensitive; one typo allowed for longer Latin words.
 * Hebrew answers are matched exactly (after trimming).
 */
export function checkWritten(input: string, accepted: string[]): boolean {
  const given = input.trim()
  if (!given) return false
  for (const answer of accepted) {
    if (HEBREW.test(answer)) {
      if (given === answer.trim()) return true
      continue
    }
    const a = fold(given)
    const b = fold(answer)
    if (a === b) return true
    if (b.length >= 5 && editDistance(a, b, 1) <= 1) return true
  }
  return false
}

/**
 * Accepted translations of an entry in a target language.
 * Splits alternatives on "/" and strips parentheticals:
 * "hello / hi" → ["hello", "hi"]; "orange (fruit)" → ["orange"].
 */
export function acceptedTranslations(entry: Entry, lang: 'en' | 'he'): string[] {
  const raw = lang === 'he' ? entry.he : entry.en
  return raw
    .split('/')
    .map((part) => part.replace(/\(.*?\)/g, '').replace(/[?!.]/g, '').trim())
    .filter(Boolean)
}

/** Accepted Romanian spellings of an entry ("a merge" also accepts "merge"). */
export function acceptedRomanian(entry: Entry): string[] {
  const base = entry.ro.replace(/[?!.]/g, '').trim()
  const forms = [base]
  if (base.startsWith('a ')) forms.push(base.slice(2))
  if (base.startsWith('a-și ')) forms.push(base.slice(5))
  return forms
}
