/**
 * Approximate "sounds like" hint for a Romanian word, written for English
 * readers. Hand-written hints in the dictionary take precedence; this covers
 * the rest. Romanian spelling is regular enough for rules to get close.
 */
export function roHint(word: string): string {
  const w = word.toLowerCase()
  let out = ''
  let i = 0
  while (i < w.length) {
    const c = w[i]
    const next = w[i + 1] ?? ''
    const nextNext = w[i + 2] ?? ''
    // digraphs first
    if (c === 'c' && next === 'h' && (nextNext === 'e' || nextNext === 'i')) {
      out += 'k' // che/chi → ke/ki
      i += 2
      continue
    }
    if (c === 'g' && next === 'h' && (nextNext === 'e' || nextNext === 'i')) {
      out += 'g' // ghe/ghi → hard g
      i += 2
      continue
    }
    if (c === 'c' && (next === 'e' || next === 'i')) {
      out += 'ch' // ce/ci → che/chi
      i += 1
      continue
    }
    if (c === 'g' && (next === 'e' || next === 'i')) {
      out += 'j' // ge/gi → je/ji
      i += 1
      continue
    }
    switch (c) {
      case 'ș':
        out += 'sh'
        break
      case 'ț':
        out += 'ts'
        break
      case 'ă':
        out += 'uh'
        break
      case 'â':
      case 'î':
        out += 'ih'
        break
      case 'j':
        out += 'zh'
        break
      case 'c':
        out += 'k'
        break
      case 'u':
        out += 'oo'
        break
      case 'i':
        // final unstressed i is barely voiced
        out += i === w.length - 1 && i > 0 && !'aeiou'.includes(w[i - 1]) ? '' : 'ee'
        break
      case 'e':
        out += 'e'
        break
      default:
        out += c
    }
    i += 1
  }
  return out
}
