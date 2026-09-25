import { useEffect, useRef, useState } from 'react'
import type { Lang, Strings } from '../i18n'
import { addFact, loadFacts, saveFacts } from '../lib/memory'
import { effectiveLevel } from '../lib/progress'
import { startLiveCall, type CallStatus, type LiveCall } from '../lib/realtime'
import { logEvent } from '../lib/telemetry'
import { TutorError } from '../lib/tutor'
import FeedbackPrompt from './FeedbackPrompt'

interface Props {
  lang: Lang
  s: Strings
  onActiveChange: (active: boolean) => void
}

interface Caption {
  id: string
  role: 'user' | 'tutor'
  text: string
}

/** Calls cost per minute; end them automatically after this long. */
const MAX_CALL_SECONDS = 15 * 60

function mmss(sec: number): string {
  const m = Math.floor(sec / 60)
  const r = sec % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export default function LiveCallPanel({ lang, s, onActiveChange }: Props) {
  const [status, setStatus] = useState<CallStatus | 'idle'>('idle')
  const [captions, setCaptions] = useState<Caption[]>([])
  const [speaking, setSpeaking] = useState<'user' | 'tutor' | null>(null)
  const [muted, setMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const callRef = useRef<LiveCall | null>(null)
  const factsRef = useRef<string[]>([])
  const capsEndRef = useRef<HTMLDivElement>(null)
  const elapsedRef = useRef(0)

  const active = status === 'connecting' || status === 'live'

  useEffect(() => {
    onActiveChange(active)
  }, [active, onActiveChange])

  // hang up if she leaves the tab mid-call
  useEffect(() => () => callRef.current?.hangUp(), [])

  // call timer + automatic cutoff
  useEffect(() => {
    if (status !== 'live') return
    const timer = setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
      if (elapsedRef.current >= MAX_CALL_SECONDS) {
        setNote(s.callMaxReached)
        callRef.current?.hangUp()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [status, s.callMaxReached])

  useEffect(() => {
    capsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [captions])

  // log the call when it ends
  const loggedEndRef = useRef(false)
  useEffect(() => {
    if ((status === 'ended' || status === 'error') && !loggedEndRef.current && elapsedRef.current > 0) {
      loggedEndRef.current = true
      logEvent('call_end', { seconds: elapsedRef.current, model: callRef.current?.model })
    }
  }, [status])

  const upsertCaption = (id: string, role: 'user' | 'tutor', text: string, append: boolean) => {
    setCaptions((caps) => {
      const i = caps.findIndex((c) => c.id === id)
      if (i === -1) return [...caps, { id, role, text }].slice(-30)
      const copy = [...caps]
      copy[i] = { ...copy[i], text: append ? copy[i].text + text : text }
      return copy
    })
  }

  const start = async () => {
    setNote(null)
    setCaptions([])
    setMuted(false)
    setElapsed(0)
    elapsedRef.current = 0
    loggedEndRef.current = false
    setStatus('connecting')
    try {
      factsRef.current = await loadFacts()
      const call = await startLiveCall(
        { facts: factsRef.current, feedbackLang: lang, level: effectiveLevel() },
        {
          onStatus: (st, detail) => {
            setStatus(st)
            if (st === 'error') setNote(`${s.callFailed}${detail ? ` (${detail})` : ''}`)
          },
          onCaption: upsertCaption,
          onSpeaking: setSpeaking,
          onRemember: (fact) => {
            const next = addFact(factsRef.current, fact)
            if (next !== factsRef.current) {
              factsRef.current = next
              void saveFacts(next)
            }
          },
        },
      )
      callRef.current = call
      logEvent('call_start', { model: call.model })
    } catch (err: unknown) {
      setStatus('error')
      if (err instanceof TutorError && err.kind === 'auth') setNote(s.tutorSignIn)
      else if (err instanceof DOMException && err.name === 'NotAllowedError') setNote(s.micDenied)
      else {
        const detail = err instanceof Error && err.message ? ` (${err.message.slice(0, 160)})` : ''
        setNote(s.callFailed + detail)
      }
    }
  }

  const hangUp = () => callRef.current?.hangUp()

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    callRef.current?.setMuted(next)
  }

  if (!active) {
    return (
      <div className="card call-card">
        {status === 'ended' && elapsed > 0 && (
          <p className="call-ended">
            {s.callEnded} · {mmss(elapsed)}
          </p>
        )}
        {status === 'ended' && elapsed > 0 && <FeedbackPrompt context="call" s={s} />}
        <button className="btn call-start" onClick={() => void start()}>
          📞 {status === 'ended' ? s.callAgain : s.callAna}
        </button>
        <p className="call-sub">{s.callSub}</p>
        {note && <p className="notice">{note}</p>}
      </div>
    )
  }

  return (
    <div className="card call-card live">
      <div className={`call-avatar${speaking === 'tutor' ? ' speaking' : ''}`} aria-hidden>
        A
      </div>
      <p className="call-status">
        {status === 'connecting'
          ? s.callConnecting
          : speaking === 'tutor'
            ? s.callAnaSpeaking
            : speaking === 'user'
              ? s.callYouSpeaking
              : s.callListening}
      </p>
      {status === 'live' && <p className="call-timer">{mmss(elapsed)}</p>}

      <div className="call-captions">
        {captions.map((c) => (
          <p key={c.id} className={`cap ${c.role}`} dir="auto">
            {c.text}
          </p>
        ))}
        <div ref={capsEndRef} />
      </div>

      <div className="call-buttons">
        <button className="btn subtle" onClick={toggleMute} disabled={status !== 'live'}>
          {muted ? `🔇 ${s.callUnmute}` : `🎙️ ${s.callMute}`}
        </button>
        <button className="btn record" onClick={hangUp}>
          ⏹ {s.callHangUp}
        </button>
      </div>
      {note && <p className="notice">{note}</p>}
    </div>
  )
}
