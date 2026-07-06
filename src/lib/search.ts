import { dictionary, type Entry } from '../data/dictionary'

/** Fold case and strip diacritics so "branza" matches "brânză". */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

interface Indexed {
  entry: Entry
  ro: string
  en: string
  he: string
}

const index: Indexed[] = dictionary.map((entry) => ({
  entry,
  ro: fold(entry.ro),
  en: fold(entry.en),
  he: entry.he.trim(),
}))

/**
 * Search across Romanian, English, and Hebrew.
 * Prefix matches rank above substring matches; Romanian above translations.
 */
export function search(query: string, limit = 8): Entry[] {
  const q = fold(query)
  if (!q) return []
  const scored: { entry: Entry; score: number }[] = []
  for (const item of index) {
    let score = -1
    if (item.ro.startsWith(q)) score = 0
    else if (item.en.startsWith(q)) score = 1
    else if (item.he.startsWith(query.trim())) score = 1
    else if (item.ro.includes(q)) score = 2
    else if (item.en.includes(q)) score = 3
    else if (item.he.includes(query.trim())) score = 3
    if (score >= 0) scored.push({ entry: item.entry, score })
  }
  scored.sort(
    (a, b) => a.score - b.score || a.entry.ro.localeCompare(b.entry.ro, 'ro'),
  )
  return scored.slice(0, limit).map((s) => s.entry)
}

export function byId(id: string): Entry | undefined {
  return dictionary.find((w) => w.id === id)
}

/** Rough check that free-typed text is pronounceable Romanian (Latin letters). */
export function looksRomanian(query: string): boolean {
  return /^[a-zA-ZăâîșțĂÂÎȘȚ' \-?!.,]+$/.test(query.trim()) && query.trim().length >= 2
}
