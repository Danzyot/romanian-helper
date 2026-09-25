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

/** Bump on every change so the app can tell when this deploy is outdated. */
const FUNCTION_VERSION = '2026-09-25.1'

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

type TutorRequest =
  | GradeRequest
  | ConverseRequest
  | RealtimeRequest
  | TranslateRequest
  | ReviewRequest
  | { action: 'version'; feedbackLang?: 'en' | 'he' }

interface ReviewRequest {
  action: 'call-review'
  /** base64 WAV of one utterance */
  audio: string
  mimeType?: string
  /** what Ana said just before, for context */
  anaSaid?: string
  feedbackLang: 'en' | 'he'
}

interface ReviewResult {
  heard: string | null
  lang: 'ro' | 'en' | 'he' | null
  note: { kind: 'pronunciation' | 'grammar'; word: string; tip: string } | null
}

function reviewPrompt(req: ReviewRequest): string {
  const tipLang = req.feedbackLang === 'he' ? 'Hebrew' : 'English'
  return `You check one short utterance from an adult beginner learning Romanian, recorded during a casual conversation practice call. She speaks mostly Romanian, sometimes English or Hebrew, never any other language.
${req.anaSaid ? `The tutor had just said: "${req.anaSaid}"\n` : ''}
1. "heard": write exactly what she said, in the language she spoke, in normal spelling (Romanian with ș ț ă â î; Hebrew in Hebrew letters). Use the tutor's line as context to resolve unclear words. If the audio has no speech, use null.
2. "note": ONLY if she spoke Romanian and CLEARLY got something wrong that a native speaker would notice, describe the single most important error:
   - pronunciation: a wrong sound (ș said as s, ț as t, ă/â/î wrong, ce/ci vs che/chi, ge/gi vs ghe/ghi), wrong stress, or a missing syllable;
   - grammar: a clear grammar or word-choice mistake.
   A foreign accent alone is NOT an error. If unsure, or if she spoke English/Hebrew, use null. Most utterances should get null.

Respond with ONLY this JSON:
{"heard": <string or null>, "lang": <"ro"|"en"|"he"|null>, "note": null or {"kind": "pronunciation"|"grammar", "word": "<the word or short phrase, written correctly in Romanian>", "tip": "<how to say it right, in ${tipLang}, max 15 words>"}}`
}

function parseReview(parsed: Record<string, unknown>): ReviewResult {
  const lang = parsed.lang === 'ro' || parsed.lang === 'en' || parsed.lang === 'he' ? parsed.lang : null
  const n = parsed.note as Record<string, unknown> | null | undefined
  const note =
    n && n.word && n.tip && lang !== 'en' && lang !== 'he'
      ? {
          kind: n.kind === 'grammar' ? ('grammar' as const) : ('pronunciation' as const),
          word: String(n.word),
          tip: String(n.tip),
        }
      : null
  return { heard: parsed.heard ? String(parsed.heard) : null, lang, note }
}

/** OpenAI audio chat call returning parsed JSON (tries models in order). */
async function openaiAudioJson(
  prompt: string,
  audio: string | undefined,
  format: 'wav' | 'mp3' | null,
  key: string,
  models: string[],
): Promise<Record<string, unknown>> {
  const content: unknown[] = [{ type: 'text', text: prompt }]
  if (audio && format) content.push({ type: 'input_audio', input_audio: { data: audio, format } })
  const errors: string[] = []
  for (const model of models) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)
    let res: Response
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, modalities: ['text'], messages: [{ role: 'user', content }] }),
      })
    } catch (e) {
      errors.push(`${model}: ${String((e as Error).message).slice(0, 80)}`)
      continue
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      errors.push(`${model} ${res.status}: ${(await res.text()).slice(0, 160)}`)
      if (res.status === 401 || res.status === 429) break
      continue
    }
    const data = await res.json()
    const text: string = data.choices?.[0]?.message?.content ?? ''
    const s = text.indexOf('{')
    const e = text.lastIndexOf('}')
    if (s === -1 || e <= s) {
      errors.push(`${model}: no JSON in reply`)
      continue
    }
    try {
      return JSON.parse(text.slice(s, e + 1))
    } catch {
      errors.push(`${model}: invalid JSON`)
    }
  }
  throw new Error(`openai failed [${errors.join(' | ')}]`)
}

interface TranslateRequest {
  action: 'translate'
  texts: string[]
  feedbackLang: 'en' | 'he'
}

/** Hebrew translations for Romanian lines; non-Romanian lines map to null. */
async function translateToHebrew(
  texts: string[],
  key: string,
  preferred?: string,
): Promise<(string | null)[]> {
  const lines = texts.slice(0, 10).map((t) => String(t).slice(0, 600))
  const prompt = `Translate each Romanian line into natural Hebrew. If a line is not Romanian (for example it is already Hebrew or English), return null for it.

Lines (JSON array):
${JSON.stringify(lines)}

Respond with ONLY this JSON: {"translations": [<Hebrew string or null, one per line, same order>]}`
  const parsed = await geminiJson([{ text: prompt }], 0.2, key, preferred ?? 'gemini-flash-lite-latest')
  const out = Array.isArray(parsed.translations) ? parsed.translations : []
  return lines.map((_, i) => (out[i] ? String(out[i]) : null))
}

/** Admin-set overrides from the app_config table (see supabase/schema.sql). */
type AppConfig = Partial<
  Record<'realtime_model' | 'realtime_voice' | 'gemini_model' | 'chat_provider' | 'chat_openai_model', string>
>

/** Read app_config with the caller's own credentials; any failure → defaults. */
async function loadAppConfig(req: Request): Promise<AppConfig> {
  const base = Deno.env.get('SUPABASE_URL')
  const apikey = req.headers.get('apikey')
  const auth = req.headers.get('Authorization')
  if (!base || !apikey || !auth) return {}
  try {
    const res = await fetch(`${base}/rest/v1/app_config?select=key,value`, {
      headers: { apikey, Authorization: auth },
    })
    if (!res.ok) return {}
    const rows: { key: string; value: string }[] = await res.json()
    const cfg: Record<string, string> = {}
    for (const r of rows) if (r.value?.trim()) cfg[r.key] = r.value.trim()
    return cfg as AppConfig
  } catch {
    return {}
  }
}

interface RealtimeRequest {
  action: 'realtime-session'
  facts?: string[]
  feedbackLang: 'en' | 'he'
  level?: string
}

function realtimeInstructions(
  facts: string[],
  feedbackLang: 'en' | 'he',
  level: string,
): string {
  const tipLang = feedbackLang === 'he' ? 'Hebrew' : 'English'
  const known = facts.length ? facts.map((f) => `- ${f}`).join('\n') : '- (nothing yet)'
  return `# Role
You are Ana, a warm, patient Romanian conversation partner on a live voice call with an adult beginner (level ${level}). Her other languages are English and Hebrew.

# What you know about her
${known}

# Your only job: a pleasant, flowing conversation
- Start by greeting her warmly in simple Romanian${facts.length ? ', using what you know about her' : ''}, and ask one easy question.
- Speak simple Romanian at her level: short sentences, slowly and clearly. Ask ONE question at a time.
- Keep your turns brief (1-2 sentences) so she does most of the talking.
- React to what she MEANS, even if her Romanian is imperfect. Beginners pause while thinking; be patient.

# Corrections: NEVER out loud
- NEVER correct her pronunciation, grammar, or word choice. NEVER repeat her words back "the right way". NEVER ask her to repeat a word.
- A separate checker shows her corrections on screen. Correcting her yourself interrupts the conversation and discourages her.
- The only exception: if she explicitly ASKS how to say or pronounce something, answer that question.

# Languages
- If she speaks Hebrew, reply in Hebrew; if English, reply in English. Keep it brief, then invite her back into Romanian.
- If she seems lost, help briefly in ${tipLang}, then return to Romanian.

# Memory
- When she shares a lasting personal fact (names, pets, family, interests, plans), call remember_fact with a short English sentence and keep talking naturally. Never mention that you are saving it.`
}

/** Mint a short-lived client key for an OpenAI Realtime WebRTC session. */
async function realtimeSession(
  req: RealtimeRequest,
  key: string,
  cfg: AppConfig,
): Promise<{ value: string; model: string; version: string }> {
  const instructions = realtimeInstructions(
    (req.facts ?? []).slice(-40),
    req.feedbackLang === 'he' ? 'he' : 'en',
    req.level || 'A1',
  )
  const configured = cfg.realtime_model || Deno.env.get('OPENAI_REALTIME_MODEL')
  const models = [configured, 'gpt-realtime-mini', 'gpt-realtime'].filter(
    (m, i, all): m is string => !!m && all.indexOf(m) === i,
  )
  const errors: string[] = []
  for (const model of models) {
    const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model,
          instructions,
          audio: {
            input: {
              transcription: {
                model: 'gpt-4o-transcribe',
                prompt:
                  'Romanian language practice. A beginner speaking mostly Romanian, sometimes English or Hebrew.',
              },
              // low eagerness: wait longer before deciding she has finished,
              // so Ana does not cut in while a beginner pauses to think
              turn_detection: { type: 'semantic_vad', eagerness: 'low' },
            },
            output: { voice: cfg.realtime_voice || Deno.env.get('OPENAI_REALTIME_VOICE') || 'marin' },
          },
          tools: [
            {
              type: 'function',
              name: 'remember_fact',
              description:
                'Save one lasting personal fact the learner shared (a name, pet, family member, interest, or plan) so you remember it in future lessons.',
              parameters: {
                type: 'object',
                properties: {
                  fact: { type: 'string', description: 'A short English sentence.' },
                },
                required: ['fact'],
              },
            },
          ],
          tool_choice: 'auto',
        },
      }),
    })
    if (res.ok) {
      const data = await res.json()
      const value = data.value ?? data.client_secret?.value
      if (value) return { value, model, version: FUNCTION_VERSION }
      errors.push(`${model}: no client secret in reply`)
      continue
    }
    errors.push(`${model} ${res.status}: ${(await res.text()).slice(0, 200)}`)
    if (res.status === 401 || res.status === 429) break // key or quota: another model won't help
  }
  throw new Error(`realtime session failed [${errors.join(' | ')}]`)
}

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
  preferred?: string,
): Promise<Record<string, unknown>> {
  // "-latest" aliases always point at a live model; dated names get retired.
  // flash-lite has a separate quota pool — a real fallback when 429s hit.
  const models = [preferred, 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest'].filter(
    (m, i, all): m is string => !!m && all.indexOf(m) === i,
  )
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
  preferred?: string,
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
    preferred,
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
  heardTranslation: string | null
  reply: string
  replyLang: 'ro' | 'en' | 'he'
  translation: string | null
  correction: string | null
  remember: string | null
}

function conversePrompt(req: ConverseRequest): string {
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
- When she asks a question or asks for help (e.g. how to pronounce or say something, what a word means, a grammar question), answer as a helpful tutor in the SAME language she asked in (Hebrew question → Hebrew answer, English → English; if she asked in Romanian, use ${tipLang}): give the Romanian word(s), a "sounds like" hint for readers of that language, a short example, then invite her back into Romanian.
- Use her personal facts naturally when relevant (her name, pets, family, interests).
- EVERY TURN with audio, also check her Romanian pronunciation carefully: if any word was clearly mispronounced (wrong sound, wrong stress, missing syllable), name it in "correction" with how to say it right; if her pronunciation was good, "correction" is null — do not invent problems. Also flag grammar or word-choice errors there.
- "heard" must be written in the language she actually spoke, in its normal spelling (Romanian in Romanian orthography, Hebrew in Hebrew letters, English in English). She only ever speaks Romanian, English, or Hebrew — never another language.

Respond with ONLY this JSON (no markdown):
{"heard": ${req.audio ? '"<exactly what she said, written in the language she spoke>"' : 'null'}, "reply": "<your reply>", "replyLang": "<ro|en|he — the main language of your reply>", "translation": <if your reply is Romanian, its Hebrew translation, else null>, "heardTranslation": <if what she said was Romanian, its Hebrew translation, else null>, "correction": <short friendly note in ${tipLang}, else null>, "remember": <ONE new lasting personal fact she shared this turn (a name, pet, family member, preference), phrased as a short English sentence, else null>}`

  return prompt
}

function parseConverse(parsed: Record<string, unknown>): ConverseReply {
  const replyLang = parsed.replyLang === 'en' || parsed.replyLang === 'he' ? parsed.replyLang : 'ro'
  return {
    heard: parsed.heard ? String(parsed.heard) : null,
    heardTranslation: parsed.heardTranslation ? String(parsed.heardTranslation) : null,
    reply: String(parsed.reply ?? ''),
    replyLang,
    translation: parsed.translation ? String(parsed.translation) : null,
    correction: parsed.correction ? String(parsed.correction) : null,
    remember: parsed.remember ? String(parsed.remember) : null,
  }
}

async function converseGemini(
  req: ConverseRequest,
  key: string,
  preferred?: string,
): Promise<ConverseReply> {
  const parts: unknown[] = [{ text: conversePrompt(req) }]
  if (req.audio) {
    parts.push({
      inline_data: { mime_type: req.mimeType || 'audio/webm', data: req.audio },
    })
  }
  return parseConverse(await geminiJson(parts, 0.7, key, preferred))
}

/** OpenAI's audio chat models accept only these recording formats. */
function openaiAudioFormat(mimeType?: string): 'wav' | 'mp3' | null {
  const m = (mimeType ?? '').toLowerCase()
  if (m.includes('wav')) return 'wav'
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3'
  return null
}

async function converseOpenAI(
  req: ConverseRequest,
  key: string,
  preferred?: string,
): Promise<ConverseReply> {
  const format = req.audio ? openaiAudioFormat(req.mimeType) : null
  if (req.audio && !format) {
    throw new Error(`openai: unsupported audio ${req.mimeType ?? 'unknown'}`)
  }
  const models = [preferred, 'gpt-audio-mini', 'gpt-audio', 'gpt-4o-audio-preview'].filter(
    (m, i, all): m is string => !!m && all.indexOf(m) === i,
  )
  return parseConverse(await openaiAudioJson(conversePrompt(req), req.audio, format, key, models))
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
  const cfg = await loadAppConfig(req)

  // ——— which code is deployed (the app warns when it is outdated) ———
  if (body.action === 'version') {
    return json({ version: FUNCTION_VERSION })
  }

  // ——— live call: check one utterance (caption + at most one note) ———
  if (body.action === 'call-review') {
    if (!body.audio) return json({ error: 'bad-request' }, 400)
    const prompt = reviewPrompt(body)
    const errors: string[] = []
    try {
      const parsed = await geminiJson(
        [{ text: prompt }, { inline_data: { mime_type: body.mimeType || 'audio/wav', data: body.audio } }],
        0.1,
        geminiKey,
        cfg.gemini_model,
      )
      return json({ ...parseReview(parsed), checker: 'gemini' })
    } catch (e) {
      errors.push(String((e as Error).message))
    }
    try {
      const format = openaiAudioFormat(body.mimeType || 'audio/wav')
      const parsed = await openaiAudioJson(prompt, body.audio, format, openaiKey, [
        cfg.chat_openai_model || 'gpt-audio-mini',
        'gpt-audio',
      ])
      return json({ ...parseReview(parsed), checker: 'openai' })
    } catch (e) {
      errors.push(String((e as Error).message))
    }
    return json({ error: 'review-failed', detail: errors.join(' || ') }, 502)
  }

  // ——— Hebrew translations for live-call captions ———
  if (body.action === 'translate') {
    if (!Array.isArray(body.texts) || body.texts.length === 0) {
      return json({ error: 'bad-request' }, 400)
    }
    try {
      return json({ translations: await translateToHebrew(body.texts, geminiKey) })
    } catch (e) {
      return json({ error: 'translate-failed', detail: String((e as Error).message) }, 502)
    }
  }

  // ——— live voice call: hand the browser a short-lived session key ———
  if (body.action === 'realtime-session') {
    try {
      return json(await realtimeSession(body, openaiKey, cfg))
    } catch (e) {
      return json(
        { error: 'realtime-failed', detail: String((e as Error).message) },
        502,
      )
    }
  }

  // ——— conversation turn ———
  if (body.action === 'converse') {
    if (!body.audio && !body.text) return json({ error: 'bad-request' }, 400)
    // One call: Ana listens to the audio herself and reports what she heard.
    // (A separate speech-to-text pass added latency and, without a language
    // pin, misread accented Romanian as other languages.)
    // Default provider is OpenAI (same Ana as the live call); the other one
    // is the automatic fallback.
    const primary = cfg.chat_provider === 'gemini' ? 'gemini' : 'openai'
    const order = primary === 'openai' ? (['openai', 'gemini'] as const) : (['gemini', 'openai'] as const)
    const errors: string[] = []
    for (const provider of order) {
      try {
        const reply =
          provider === 'openai'
            ? await converseOpenAI(body, openaiKey, cfg.chat_openai_model)
            : await converseGemini(body, geminiKey, cfg.gemini_model)
        return json({ transcript: reply.heard, provider, ...reply })
      } catch (e) {
        errors.push(String((e as Error).message))
      }
    }
    return json({ error: 'converse-failed', detail: errors.join(' || ') }, 502)
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
    coach(body.audio, mimeType, body.target, feedbackLang, geminiKey, cfg.gemini_model),
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
