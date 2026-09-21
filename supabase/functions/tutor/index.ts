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
): Promise<string> {
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
  const form = new FormData()
  form.append('file', new File([bytes], `audio.${ext}`, { type: mimeType }))
  form.append('model', 'whisper-1')
  form.append('language', 'ro')
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
{"score": <0-100>, "words": [{"word": "<each word of the target>", "ok": <true|false>, "issue": "<if not ok: what went wrong, in ${tipLang}, max 8 words>"}], "tip": "<the single most useful, encouraging tip in ${tipLang}, max 25 words>"}`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: b64Audio } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      }),
    },
  )
  if (!res.ok) {
    throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const data = await res.json()
  const text: string =
    data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
  const parsed = JSON.parse(text)
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
  }
}

interface ConverseReply {
  reply: string
  translation: string
  correction: string | null
}

async function converse(
  req: ConverseRequest,
  transcript: string | null,
  key: string,
): Promise<ConverseReply> {
  const tipLang = req.feedbackLang === 'he' ? 'Hebrew' : 'English'
  const userTurn = transcript ?? req.text ?? ''
  const historyText = req.history
    .slice(-12)
    .map((t) => `${t.role === 'user' ? 'Student' : 'You'}: ${t.text}`)
    .join('\n')

  const prompt = `You are Ana, a warm Romanian tutor having a spoken conversation with an adult beginner (her other languages are English and Hebrew). Keep the conversation going naturally: react to what she said, then ask ONE simple follow-up question. Use very simple A1-level Romanian, short sentences (max 15 words total).

Conversation so far:
${historyText || '(the conversation is just starting — greet her and ask something easy)'}

Student's new turn${req.audio ? ' (audio attached — listen to it yourself; the transcript below may contain recognition errors)' : ''}: "${userTurn}"

Respond with ONLY this JSON (no markdown):
{"reply": "<your Romanian reply, simple, ending with a question>", "translation": "<translation of your reply in ${tipLang}>", "correction": <if her turn had a clear error (grammar, word choice${req.audio ? ', pronunciation you heard' : ''}), a SHORT friendly note in ${tipLang} showing the right way, else null>}`

  const parts: unknown[] = [{ text: prompt }]
  if (req.audio) {
    parts.push({
      inline_data: { mime_type: req.mimeType || 'audio/webm', data: req.audio },
    })
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
      }),
    },
  )
  if (!res.ok) {
    throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const data = await res.json()
  const text: string =
    data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
  const parsed = JSON.parse(text)
  return {
    reply: String(parsed.reply ?? ''),
    translation: String(parsed.translation ?? ''),
    correction: parsed.correction ? String(parsed.correction) : null,
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
    let transcript: string | null = null
    let transcriptError: string | undefined
    if (body.audio) {
      try {
        transcript = await transcribe(
          base64ToBytes(body.audio),
          body.mimeType || 'audio/webm',
          openaiKey,
        )
      } catch (e) {
        transcriptError = String((e as Error).message)
      }
    }
    try {
      const reply = await converse(body, transcript, geminiKey)
      return json({ transcript, transcriptError, ...reply })
    } catch (e) {
      return json({ error: 'converse-failed', detail: String((e as Error).message) }, 502)
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
    transcribe(bytes, mimeType, openaiKey),
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
