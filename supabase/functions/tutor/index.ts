// Supabase Edge Function: the pronunciation tutor.
//
// Holds the OpenAI and Gemini API keys server-side. The app sends a
// recording + the target text; this function returns what was heard
// (OpenAI transcription, Romanian) and a coach verdict (Gemini listens
// to the audio itself): score, per-word issues, and one tip in the
// learner's language.
//
// Deploy: Supabase dashboard → Edge Functions → new function `tutor`,
// paste this file, deploy. Then set secrets OPENAI_API_KEY and
// GEMINI_API_KEY under Edge Functions → Secrets.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface GradeRequest {
  action: 'grade'
  /** base64-encoded audio (no data: prefix) */
  audio: string
  mimeType: string
  /** the Romanian text the learner tried to say */
  target: string
  /** language for the tip: 'en' | 'he' */
  feedbackLang: 'en' | 'he'
}

interface ConverseRequest {
  action: 'converse'
  /** base64 audio of the learner's turn (or use text instead) */
  audio?: string
  mimeType?: string
  /** typed turn, when not speaking */
  text?: string
  /** prior turns, oldest first, capped by the client */
  history: { role: 'user' | 'tutor'; text: string }[]
  /** long-term facts about the learner, managed by the client */
  facts?: string[]
  feedbackLang: 'en' | 'he'
}

type TutorRequest = GradeRequest | ConverseRequest

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function transcribe(
  bytes: Uint8Array,
  mimeType: string,
  key: string,
  language?: string,
): Promise<string> {
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
  const form = new FormData()
  form.append('file', new File([bytes], `audio.${ext}`, { type: mimeType }))
  form.append('model', 'whisper-1')
  if (language) form.append('language', language)
  form.append('temperature', '0')
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  if (!res.ok) {
    throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const data = await res.json()
  return (data.text ?? '').trim()
}

interface CoachVerdict {
  score: number
  words: { word: string; ok: boolean; issue?: string }[]
  tip: string
  heard?: string
}

/**
 * Call Gemini with retries and a fallback model. The free tier rate-limits
 * briefly (429) under quick successive turns; 5xx happens occasionally.
 * Returns the parsed JSON object from the model's reply.
 */
async function geminiJson(
  parts: unknown[],
  temperature: number,
  key: string,
): Promise<Record<string, unknown>> {
  // "-latest" aliases always point at a live model; dated names get retired.
  // flash-lite has a separate quota pool — a real fallback when 429s hit.
  const models = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest']
  const errors: string[] = []

  const attempt = async (model: string, withThinkingOff: boolean): Promise<Record<string, unknown> | { retryable: boolean; thinkingRejected?: boolean }> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    let res: Response
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature,
              // skip the reasoning pass on models that support turning it off:
              // short structured replies do not need it and it costs seconds
              ...(withThinkingOff ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            },
          }),
        },
      )
    } catch (e) {
      errors.push(`${model}: ${String((e as Error).message).slice(0, 80)}`)
      return { retryable: true }
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      const bodyText = (await res.text()).slice(0, 160)
      errors.push(`${model} ${res.status}: ${bodyText}`)
      if (res.status === 400 && withThinkingOff && /think/i.test(bodyText)) {
        return { retryable: true, thinkingRejected: true }
      }
      return { retryable: res.status === 429 || res.status >= 500 }
    }
    const data = await res.json()
    const text: string =
      data.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? '')
        .join('') ?? ''
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) {
      errors.push(`${model}: no JSON in reply`)
      return { retryable: true }
    }
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
      errors.push(`${model}: invalid JSON`)
      return { retryable: true }
    }
  }

  for (const model of models) {
    let thinkingOff = true
    // at most two tries per model, bounded by the 15s per-attempt timeout
    for (let i = 0; i < 2; i++) {
      const result = await attempt(model, thinkingOff)
      if (!('retryable' in result)) return result
      if (result.thinkingRejected) {
        thinkingOff = false // model insists on thinking; try once without the flag
        continue
      }
      if (!result.retryable) break // hard 4xx: next model
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw new Error(`gemini failed [${errors.join(' | ')}]`)
}

async function coach(
  b64Audio: string,
  mimeType: string,
  target: string,
  feedbackLang: 'en' | 'he',
  key: string,
): Promise<CoachVerdict> {
  const tipLang = feedbackLang === 'he' ? 'Hebrew' : 'English'
  const prompt = `You are a warm, encouraging Romanian pronunciation tutor. Your student is a beginner adult learner.
Listen carefully to the attached recording. The student tried to say, in Romanian: "${target}".

Grade the pronunciation. Be lenient about a foreign accent, but attentive to genuinely wrong sounds (ș vs s, ț vs t, ă, â/î, ce/ci/che/chi, ge/gi/ghe/ghi), wrong stress, and missing or extra syllables. If the recording is silent, empty, or a different word entirely, score it low.

Scoring guide: 90-100 near-native; 70-89 clearly understandable with an accent; 50-69 partly understandable, one or more real errors; below 50 hard to recognize.

Respond with ONLY this JSON (no markdown, no extra text):
{"score": <0-100>, "words": [{"word": "<each word of the target>", "ok": <true|false>, "issue": "<if not ok: what went wrong, in ${tipLang}, max 8 words>"}], "tip": "<the single most useful, encouraging tip in ${tipLang}, max 25 words>", "heard": "<what the student actually said, in Romanian spelling>"}`

  const parsed = await geminiJson(
    [{ text: prompt }, { inline_data: { mime_type: mimeType, data: b64Audio } }],
    0.3,
    key,
  )
  return {
    score: Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0))),
    words: Array.isArray(parsed.words)
      ? parsed.words.map((w: { word?: string; ok?: boolean; issue?: string }) => ({
          word: String(w.word ?? ''),
          ok: Boolean(w.ok),
          issue: w.issue ? String(w.issue) : undefined,
        }))
      : [],
    tip: String(parsed.tip ?? ''),
    heard: parsed.heard ? String(parsed.heard) : undefined,
  }
}

interface ConverseReply {
  heard: string | null
  reply: string
  replyLang: 'ro' | 'en' | 'he'
  translation: string | null
  correction: string | null
  remember: string | null
}

async function converse(
  req: ConverseRequest,
  key: string,
): Promise<ConverseReply> {
  const tipLang = req.feedbackLang === 'he' ? 'Hebrew' : 'English'
  const historyText = req.history
    .slice(-12)
    .map((t) => `${t.role === 'user' ? 'Student' : 'You'}: ${t.text}`)
    .join('\n')
  const factsText = (req.facts ?? []).slice(-40).map((f) => `- ${f}`).join('\n')

  const prompt = `You are Ana, a warm private Romanian tutor for an adult beginner. Her other languages are English and Hebrew, and she may speak or type in any of the three.

What you know about her from earlier conversations (long-term memory):
${factsText || '(nothing yet)'}

Conversation so far:
${historyText || '(the conversation is just starting — greet her warmly, use what you know about her, and ask something easy)'}

Student's new turn: ${req.audio ? '(attached as audio — listen to it yourself)' : `"${req.text ?? ''}"`}

How to behave:
- When she is conversing in Romanian, reply in very simple A1-level Romanian, short (max 15 words), react warmly to what she said, and end with ONE simple question.
- When she asks a question or asks for help — in any language (e.g. how to pronounce or say something, what a word means, a grammar question) — answer as a helpful tutor in ${tipLang}: give the Romanian word(s), a "sounds like" hint written for ${tipLang} readers, a short example, then invite her back into Romanian.
- Use her personal facts naturally when relevant (her name, pets, family, interests).
- EVERY TURN with audio, also check her Romanian pronunciation carefully: if any word was clearly mispronounced (wrong sound, wrong stress, missing syllable), name it in "correction" with how to say it right; if her pronunciation was good, "correction" is null — do not invent problems. Also flag grammar or word-choice errors there.
- "heard" must be written in the language she actually spoke, in its normal spelling (Romanian in Romanian orthography, Hebrew in Hebrew letters, English in English). She only ever speaks Romanian, English, or Hebrew — never another language.

Respond with ONLY this JSON (no markdown):
{"heard": ${req.audio ? '"<exactly what she said, written in the language she spoke>"' : 'null'}, "reply": "<your reply>", "replyLang": "<ro|en|he — the main language of your reply>", "translation": <if the reply is Romanian, its ${tipLang} translation, else null>, "correction": <short friendly note in ${tipLang}, else null>, "remember": <ONE new lasting personal fact she shared this turn (a name, pet, family member, preference), phrased as a short English sentence, else null>}`

  const parts: unknown[] = [{ text: prompt }]
  if (req.audio) {
    parts.push({
      inline_data: { mime_type: req.mimeType || 'audio/webm', data: req.audio },
    })
  }

  const parsed = await geminiJson(parts, 0.7, key)
  const replyLang = parsed.replyLang === 'en' || parsed.replyLang === 'he' ? parsed.replyLang : 'ro'
  return {
    heard: parsed.heard ? String(parsed.heard) : null,
    reply: String(parsed.reply ?? ''),
    replyLang,
    translation: parsed.translation ? String(parsed.translation) : null,
    correction: parsed.correction ? String(parsed.correction) : null,
    remember: parsed.remember ? String(parsed.remember) : null,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405)
  }

  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!openaiKey || !geminiKey) {
    return json(
      {
        error: 'missing-secrets',
        detail: `set ${!openaiKey ? 'OPENAI_API_KEY ' : ''}${!geminiKey ? 'GEMINI_API_KEY' : ''} in Edge Function secrets`,
      },
      500,
    )
  }

  let body: TutorRequest
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad-json' }, 400)
  }

  if ('audio' in body && body.audio && body.audio.length > 4_000_000) {
    return json({ error: 'audio-too-long' }, 413)
  }
  const feedbackLang = body.feedbackLang === 'he' ? 'he' : 'en'

  // ——— conversation turn ———
  if (body.action === 'converse') {
    if (!body.audio && !body.text) return json({ error: 'bad-request' }, 400)
    // One call: Ana listens to the audio herself and reports what she heard.
    // (A separate speech-to-text pass added latency and, without a language
    // pin, misread accented Romanian as other languages.)
    try {
      const reply = await converse(body, geminiKey)
      return json({ transcript: reply.heard, ...reply })
    } catch (e) {
      return json(
        { error: 'converse-failed', detail: String((e as Error).message) },
        502,
      )
    }
  }

  // ——— pronunciation grading ———
  if (body.action !== 'grade' || !body.audio || !body.target) {
    return json({ error: 'bad-request' }, 400)
  }

  const mimeType = body.mimeType || 'audio/webm'

  // Run both AI calls in parallel; report partial results if one fails.
  const bytes = base64ToBytes(body.audio)
  const [tr, co] = await Promise.allSettled([
    transcribe(bytes, mimeType, openaiKey, 'ro'),
    coach(body.audio, mimeType, body.target, feedbackLang, geminiKey),
  ])

  if (tr.status === 'rejected' && co.status === 'rejected') {
    return json(
      { error: 'both-failed', detail: `${tr.reason?.message} | ${co.reason?.message}` },
      502,
    )
  }

  return json({
    transcript: tr.status === 'fulfilled' ? tr.value : null,
    transcriptError: tr.status === 'rejected' ? String(tr.reason?.message) : undefined,
    verdict: co.status === 'fulfilled' ? co.value : null,
    verdictError: co.status === 'rejected' ? String(co.reason?.message) : undefined,
  })
})
