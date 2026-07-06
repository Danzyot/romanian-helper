import { supabase } from './sync'
import { fold } from './search'

export interface GradedWord {
  word: string
  ok: boolean
  issue?: string
}

export interface GradeResult {
  /** what the speech recognizer heard (Romanian), if available */
  transcript: string | null
  /** whether the transcript matches the target text */
  understood: boolean | null
  /** 0-100 */
  score: number
  words: GradedWord[]
  tip: string
}

export class TutorError extends Error {
  kind: 'auth' | 'unavailable' | 'failed'
  constructor(kind: 'auth' | 'unavailable' | 'failed', message: string) {
    super(message)
    this.kind = kind
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function transcriptMatches(transcript: string, target: string): boolean {
  const clean = (s: string) => fold(s).replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim()
  return clean(transcript) === clean(target) && clean(target).length > 0
}

/** Word-level fallback marking when the coach verdict is missing. */
function markWordsFromTranscript(target: string, transcript: string | null): GradedWord[] {
  const targetWords = target.split(/\s+/).filter(Boolean)
  const heard = new Set(
    (transcript ?? '').split(/\s+/).map((w) => fold(w).replace(/[^a-z0-9]+/g, '')),
  )
  return targetWords.map((word) => ({
    word,
    ok: heard.has(fold(word).replace(/[^a-z0-9]+/g, '')),
  }))
}

export async function gradePronunciation(
  audio: Blob,
  target: string,
  feedbackLang: 'en' | 'he',
): Promise<GradeResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) {
    throw new TutorError('auth', 'not signed in')
  }

  const body = {
    action: 'grade',
    audio: await blobToBase64(audio),
    mimeType: audio.type || 'audio/webm',
    target,
    feedbackLang,
  }

  const { data, error } = await supabase.functions.invoke('tutor', { body })
  if (error) {
    const msg = error.message ?? String(error)
    // FunctionsFetchError → not deployed / offline; FunctionsHttpError → server error
    const kind = /fetch/i.test(error.name ?? '') ? 'unavailable' : 'failed'
    throw new TutorError(kind, msg)
  }
  if (data?.error) {
    throw new TutorError('failed', `${data.error}: ${data.detail ?? ''}`)
  }

  const transcript: string | null = data.transcript ?? null
  const verdict = data.verdict as
    | { score: number; words: GradedWord[]; tip: string }
    | null

  const understood = transcript !== null ? transcriptMatches(transcript, target) : null

  let score = verdict?.score ?? (understood ? 78 : 40)
  // If the recognizer clearly understood her, don't let the coach be too harsh.
  if (understood === true) score = Math.max(score, 72)
  // If it heard something else entirely and the coach was generous, temper it.
  if (understood === false && score > 85) score = 85

  const words =
    verdict?.words?.length ? verdict.words : markWordsFromTranscript(target, transcript)

  return {
    transcript,
    understood,
    score: Math.round(score),
    words,
    tip: verdict?.tip ?? '',
  }
}
