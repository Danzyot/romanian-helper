import { supabase } from './sync'
import { TutorError, toTutorError } from './tutor'
import { UtteranceCapture } from './capture'

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
  /** one finished utterance of hers, as WAV, for the pronunciation checker */
  onUtterance: (id: string, audio: Blob) => void
  /** the utterance was too short to check */
  onUtteranceSkipped: (id: string) => void
  /** Ana's reply with this caption id was cut off by Stop */
  onTutorStopped: (id: string) => void
  /** Ana was paused (Stop) or resumed */
  onPaused: (paused: boolean) => void
  /** the phone refused to play Ana's audio; the UI should offer a tap */
  onAudioBlocked: (blocked: boolean) => void
  /** an error event from OpenAI (logged for diagnosis) */
  onError: (code: string, message: string) => void
}

export interface CallNote {
  kind: 'pronunciation' | 'grammar'
  word: string
  tip: string
}

export interface LiveCall {
  hangUp: () => void
  /** cut Ana off mid-sentence and keep her silent until resumeAna */
  stopAna: () => void
  /** let Ana talk again and turn the microphone back on */
  resumeAna: () => void
  /** retry audio playback from a tap, when the phone blocked it */
  unblockAudio: () => void
  setMuted: (muted: boolean) => void
  model: string
  /** deployed tutor-function version, to detect a stale deploy */
  version: string | null
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
  opts: {
    facts: string[]
    feedbackLang: 'en' | 'he'
    level: string
    captureCtx: AudioContext
    /** created during the tap that starts the call, so the phone lets it play */
    audioEl: HTMLAudioElement
  },
  h: CallHandlers,
): Promise<LiveCall> {
  const { data: s } = await supabase.auth.getSession()
  if (!s.session) throw new TutorError('auth', 'not signed in')
  h.onStatus('connecting')

  const { data, error } = await supabase.functions.invoke('tutor', {
    body: {
      action: 'realtime-session',
      facts: opts.facts,
      feedbackLang: opts.feedbackLang,
      level: opts.level,
    },
  })
  if (error) throw await toTutorError(error)
  if (data?.error) throw new TutorError('failed', `${data.error}: ${data.detail ?? ''}`)
  const key: string = data.value
  const model: string = data.model
  const version: string | null = data.version ?? null
  const turnDetection: Record<string, unknown> = data.turnDetection ?? {
    type: 'semantic_vad',
    eagerness: 'low',
    interrupt_response: false,
  }

  const mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  const capture = new UtteranceCapture(opts.captureCtx)
  capture.attach(mic)
  let currentUserItem: string | null = null

  // Pause bookkeeping. Stop mutes Ana on the phone at once and switches off
  // her automatic replies on the server; while paused, any reply that starts
  // anyway is cancelled and its leftovers are ignored. Only resumeAna
  // unmutes her.
  let paused = false
  let currentResponseId: string | null = null
  let currentTutorItem: string | null = null
  let playingSince: number | null = null
  const stoppedResponses = new Set<string>()
  const stoppedItems = new Set<string>()

  const pc = new RTCPeerConnection()
  const audioEl = opts.audioEl
  audioEl.muted = false
  audioEl.volume = 1
  // Make sure Ana is audible. Phones may refuse playback that doesn't follow
  // a tap; that used to fail silently. Now the UI is told so it can offer a
  // "tap to hear Ana" button, and the reason is logged.
  const ensurePlaying = () => {
    audioEl.muted = paused
    if (!audioEl.srcObject || !audioEl.paused) return
    audioEl
      .play()
      .then(() => h.onAudioBlocked(false))
      .catch((err: unknown) => {
        h.onAudioBlocked(true)
        h.onError('audio_play', err instanceof Error ? `${err.name}: ${err.message}` : String(err))
      })
  }
  pc.ontrack = (e) => {
    audioEl.srcObject = e.streams[0]
    ensurePlaying()
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
    capture.close()
    pc.close()
    audioEl.srcObject = null
    audioEl.remove()
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
        capture.markStart()
        currentUserItem = ev.item_id ?? null
        if (ev.item_id) h.onCaption(ev.item_id, 'user', '🎤 …', false)
        break
      case 'input_audio_buffer.speech_stopped': {
        h.onSpeaking(null)
        const id = ev.item_id ?? currentUserItem
        if (id) {
          void capture.cut().then((wav) => {
            if (wav) h.onUtterance(id, wav)
            else h.onUtteranceSkipped(id)
          })
        }
        break
      }
      case 'conversation.item.input_audio_transcription.completed': {
        // provisional caption; the pronunciation checker replaces it
        const text = cleanUserCaption(ev.transcript ?? '')
        h.onCaption(ev.item_id, 'user', text ?? '🎤', false)
        break
      }
      case 'response.created':
        currentResponseId = ev.response?.id ?? null
        if (paused && currentResponseId) {
          // a reply started while paused: cancel it
          stoppedResponses.add(currentResponseId)
          send({ type: 'response.cancel', response_id: currentResponseId })
          send({ type: 'output_audio_buffer.clear' })
        }
        break
      case 'response.output_item.added':
        if (ev.item?.role !== 'assistant' || !ev.item?.id) break
        if (paused || stoppedResponses.has(ev.response_id)) stoppedItems.add(ev.item.id)
        else currentTutorItem = ev.item.id
        break
      case 'output_audio_buffer.started':
        if (!paused) {
          playingSince = Date.now()
          h.onSpeaking('tutor')
          ensurePlaying()
        }
        break
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        playingSince = null
        h.onSpeaking(null)
        break
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
        if (!ev.item_id || !ev.delta || stoppedItems.has(ev.item_id)) break
        if (paused || stoppedResponses.has(ev.response_id)) {
          stoppedItems.add(ev.item_id)
          break
        }
        currentTutorItem = ev.item_id
        h.onCaption(ev.item_id, 'tutor', ev.delta, true)
        break
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
        if (ev.item_id && ev.transcript && !stoppedItems.has(ev.item_id)) {
          h.onCaptionDone(ev.item_id, 'tutor', ev.transcript)
        }
        break
      case 'response.function_call_arguments.done':
        try {
          const args = JSON.parse(ev.arguments ?? '{}')
          if (ev.name === 'remember_fact' && args.fact) h.onRemember(String(args.fact))
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
        if (!paused && out.length > 0 && out.every((o) => o.type === 'function_call')) {
          send({ type: 'response.create' })
        }
        break
      }
      case 'error':
        console.warn('realtime error', ev.error)
        h.onError(String(ev.error?.code ?? ev.error?.type ?? 'unknown'), String(ev.error?.message ?? ''))
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

  const setAutoReply = (on: boolean) =>
    send({
      type: 'session.update',
      session: {
        type: 'realtime',
        audio: { input: { turn_detection: { ...turnDetection, create_response: on } } },
      },
    })

  // the Mute button's choice; Stop/Resume override it while paused
  let userMuted = false
  const applyMic = () =>
    mic.getAudioTracks().forEach((t) => (t.enabled = !userMuted && !paused))

  const stopAna = () => {
    if (paused) return
    // 1. silence her on the phone immediately, whatever the server does,
    //    and turn the microphone off too
    audioEl.muted = true
    paused = true
    applyMic()
    h.onPaused(true)
    // no new replies until Resume
    setAutoReply(false)
    if (currentResponseId) stoppedResponses.add(currentResponseId)
    // only a sentence she was actually in the middle of gets cut and marked
    const item = currentTutorItem && !stoppedItems.has(currentTutorItem) ? currentTutorItem : null
    currentTutorItem = null
    const playedMs = playingSince ? Date.now() - playingSince : null
    playingSince = null
    if (item) {
      stoppedItems.add(item)
      h.onTutorStopped(item)
    }
    h.onSpeaking(null)
    // 2. ask the server to stop generating and drop queued audio
    send(currentResponseId ? { type: 'response.cancel', response_id: currentResponseId } : { type: 'response.cancel' })
    send({ type: 'output_audio_buffer.clear' })
    // 3. tell the model where she was cut off, so it knows she didn't finish
    if (item && playedMs !== null) {
      send({ type: 'conversation.item.truncate', item_id: item, content_index: 0, audio_end_ms: playedMs })
    }
  }

  const resumeAna = () => {
    if (!paused) return
    paused = false
    applyMic()
    ensurePlaying()
    h.onPaused(false)
    // she stays quiet: auto-replies come back on, so she answers only once
    // the student speaks — no new message, no new topic
    setAutoReply(true)
  }

  return {
    hangUp,
    stopAna,
    resumeAna,
    setMuted: (muted) => {
      userMuted = muted
      applyMic()
    },
    unblockAudio: () => {
      audioEl.muted = paused
      void audioEl
        .play()
        .then(() => h.onAudioBlocked(false))
        .catch((err: unknown) =>
          h.onError('audio_play', err instanceof Error ? `${err.name}: ${err.message}` : String(err)),
        )
    },
    model,
    version,
  }
}
