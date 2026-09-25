import { supabase } from './sync'
import { TutorError, toTutorError } from './tutor'

/**
 * Live voice call with Ana over OpenAI Realtime (WebRTC). The edge function
 * mints a short-lived key; audio then flows directly between the phone and
 * OpenAI, and events (captions, speaking state, tool calls) arrive on a
 * data channel.
 */

export type CallStatus = 'connecting' | 'live' | 'ended' | 'error'

export interface CallHandlers {
  onStatus: (status: CallStatus, detail?: string) => void
  /** create-or-update a caption; `append` adds to existing text */
  onCaption: (id: string, role: 'user' | 'tutor', text: string, append: boolean) => void
  /** a caption is final; good moment to translate it */
  onCaptionDone: (id: string, role: 'user' | 'tutor', text: string) => void
  onSpeaking: (who: 'user' | 'tutor' | null) => void
  onRemember: (fact: string) => void
  /** Ana flagged a clear mistake without interrupting the conversation */
  onNote: (note: CallNote) => void
}

export interface CallNote {
  kind: 'pronunciation' | 'grammar'
  word: string
  tip: string
}

export interface LiveCall {
  hangUp: () => void
  setMuted: (muted: boolean) => void
  model: string
}

// She speaks only Romanian, English, or Hebrew; captions in other scripts
// are recognition noise and are hidden rather than shown as gibberish.
const UNEXPECTED_SCRIPT =
  /[Ѐ-ӿ؀-ۿݐ-ݿ぀-ヿ一-鿿가-힯]/

export function cleanUserCaption(text: string): string | null {
  const t = text.trim()
  if (!t || UNEXPECTED_SCRIPT.test(t)) return null
  return t
}

async function postSdp(sdp: string, key: string, model: string): Promise<string> {
  const urls = [
    'https://api.openai.com/v1/realtime/calls',
    `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
  ]
  let last = ''
  for (const url of urls) {
    const res = await fetch(url, {
      method: 'POST',
      body: sdp,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/sdp' },
    })
    if (res.ok) return await res.text()
    last = `${res.status}: ${(await res.text()).slice(0, 160)}`
    if (res.status !== 404) break
  }
  throw new TutorError('failed', `realtime connect ${last}`)
}

export async function startLiveCall(
  opts: { facts: string[]; feedbackLang: 'en' | 'he'; level: string },
  h: CallHandlers,
): Promise<LiveCall> {
  const { data: s } = await supabase.auth.getSession()
  if (!s.session) throw new TutorError('auth', 'not signed in')
  h.onStatus('connecting')

  const { data, error } = await supabase.functions.invoke('tutor', {
    body: { action: 'realtime-session', ...opts },
  })
  if (error) throw await toTutorError(error)
  if (data?.error) throw new TutorError('failed', `${data.error}: ${data.detail ?? ''}`)
  const key: string = data.value
  const model: string = data.model

  const mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  const pc = new RTCPeerConnection()
  const audioEl = new Audio()
  audioEl.autoplay = true
  pc.ontrack = (e) => {
    audioEl.srcObject = e.streams[0]
    void audioEl.play().catch(() => {})
  }
  mic.getTracks().forEach((t) => pc.addTrack(t, mic))
  const dc = pc.createDataChannel('oai-events')

  let ended = false
  const teardown = () => {
    ended = true
    try {
      dc.close()
    } catch {
      /* already closed */
    }
    mic.getTracks().forEach((t) => t.stop())
    pc.close()
    audioEl.srcObject = null
    h.onSpeaking(null)
  }
  const hangUp = () => {
    if (ended) return
    teardown()
    h.onStatus('ended')
  }

  const send = (ev: object) => {
    if (dc.readyState === 'open') dc.send(JSON.stringify(ev))
  }

  dc.onopen = () => {
    h.onStatus('live')
    send({ type: 'response.create' }) // Ana greets first
  }

  dc.onmessage = (msg) => {
    let ev: Record<string, any>
    try {
      ev = JSON.parse(msg.data)
    } catch {
      return
    }
    switch (ev.type) {
      case 'input_audio_buffer.speech_started':
        h.onSpeaking('user')
        if (ev.item_id) h.onCaption(ev.item_id, 'user', '🎤 …', false)
        break
      case 'input_audio_buffer.speech_stopped':
        h.onSpeaking(null)
        break
      case 'conversation.item.input_audio_transcription.completed': {
        const text = cleanUserCaption(ev.transcript ?? '')
        h.onCaption(ev.item_id, 'user', text ?? '🎤', false)
        if (text) h.onCaptionDone(ev.item_id, 'user', text)
        break
      }
      case 'output_audio_buffer.started':
        h.onSpeaking('tutor')
        break
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        h.onSpeaking(null)
        break
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
        if (ev.item_id && ev.delta) h.onCaption(ev.item_id, 'tutor', ev.delta, true)
        break
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
        if (ev.item_id && ev.transcript) h.onCaptionDone(ev.item_id, 'tutor', ev.transcript)
        break
      case 'response.function_call_arguments.done':
        try {
          const args = JSON.parse(ev.arguments ?? '{}')
          if (ev.name === 'remember_fact' && args.fact) h.onRemember(String(args.fact))
          if (ev.name === 'note_mistake' && args.word && args.tip) {
            h.onNote({
              kind: args.kind === 'grammar' ? 'grammar' : 'pronunciation',
              word: String(args.word),
              tip: String(args.tip),
            })
          }
        } catch {
          /* malformed arguments — skip */
        }
        send({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: ev.call_id,
            output: JSON.stringify({ ok: true }),
          },
        })
        break
      case 'response.done': {
        // a response that was only a tool call leaves Ana silent — nudge her on
        const out: { type?: string }[] = ev.response?.output ?? []
        if (out.length > 0 && out.every((o) => o.type === 'function_call')) {
          send({ type: 'response.create' })
        }
        break
      }
      case 'error':
        console.warn('realtime error', ev.error)
        break
    }
  }

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' && !ended) {
      teardown()
      h.onStatus('error', 'connection lost')
    }
  }

  try {
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    const answer = await postSdp(offer.sdp ?? '', key, model)
    await pc.setRemoteDescription({ type: 'answer', sdp: answer })
  } catch (e) {
    teardown()
    throw e
  }

  return {
    hangUp,
    setMuted: (muted) => mic.getAudioTracks().forEach((t) => (t.enabled = !muted)),
    model,
  }
}
