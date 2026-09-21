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

/**
 * When the function replies with an error status, supabase-js hides the
 * response body inside error.context — dig the {error, detail} out of it
 * so failures are diagnosable from the UI.
 */
async function toTutorError(error: {
  name?: string
  message?: string
  context?: unknown
}): Promise<TutorError> {
  const kind = /fetch/i.test(error.name ?? '') ? 'unavailable' : 'failed'
  let detail = error.message ?? String(error)
  const ctx = error.context
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json()
      if (body?.error) detail = `${body.error}: ${body.detail ?? ''}`
    } catch {
      /* body not JSON — keep the generic message */
    }
  }
  return new TutorError(kind, detail)
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

export interface ChatTurn {
  role: 'user' | 'tutor'
  text: string
  /** translation of a tutor turn, or correction note on a user turn */
  note?: string
  /** language of a tutor turn, for choosing the speech voice */
  replyLang?: 'ro' | 'en' | 'he'
}

export interface ConverseResult {
  transcript: string | null
  reply: string
  replyLang: 'ro' | 'en' | 'he'
  translation: string | null
  correction: string | null
  remember: string | null
}

export async function converseTurn(
  input: { audio: Blob } | { text: string },
  history: ChatTurn[],
  facts: string[],
  feedbackLang: 'en' | 'he',
): Promise<ConverseResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) throw new TutorError('auth', 'not signed in')

  const body: Record<string, unknown> = {
    action: 'converse',
    history: history.slice(-12).map(({ role, text }) => ({ role, text })),
    facts: facts.slice(-40),
    feedbackLang,
  }
  if ('audio' in input) {
    body.audio = await blobToBase64(input.audio)
    body.mimeType = input.audio.type || 'audio/webm'
  } else {
    body.text = input.text
  }

  const { data, error } = await supabase.functions.invoke('tutor', { body })
  if (error) {
    throw await toTutorError(error)
  }
  if (data?.error) {
    throw new TutorError('failed', `${data.error}: ${data.detail ?? ''}`)
  }
  const replyLang =
    data.replyLang === 'en' || data.replyLang === 'he' ? data.replyLang : 'ro'
  return {
    // Whisper transcript when it worked; otherwise what Ana herself heard
    transcript: data.transcript ?? data.heard ?? null,
    reply: String(data.reply ?? ''),
    replyLang,
    translation: data.translation ? String(data.translation) : null,
    correction: data.correction ? String(data.correction) : null,
    remember: data.remember ? String(data.remember) : null,
  }
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
    throw await toTutorError(error)
  }
  if (data?.error) {
    throw new TutorError('failed', `${data.error}: ${data.detail ?? ''}`)
  }

  const whisper: string | null = data.transcript ?? null
  const verdict = data.verdict as
    | { score: number; words: GradedWord[]; tip: string; heard?: string }
    | null
  // Whisper is the objective check; Ana's own hearing fills in for display.
  const transcript = whisper ?? verdict?.heard ?? null

  const understood = whisper !== null ? transcriptMatches(whisper, target) : null

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
