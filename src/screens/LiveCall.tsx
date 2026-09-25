import { useEffect, useRef, useState } from 'react'
import type { Lang, Strings } from '../i18n'
import { addFact, loadFacts, saveFacts } from '../lib/memory'
import { effectiveLevel } from '../lib/progress'
import {
  cleanUserCaption,
  startLiveCall,
  type CallNote,
  type CallStatus,
  type LiveCall,
} from '../lib/realtime'
import { logEvent } from '../lib/telemetry'
import {
  EXPECTED_FUNCTION_VERSION,
  reviewUtterance,
  translateToHebrew,
  TutorError,
} from '../lib/tutor'
import FeedbackPrompt from './FeedbackPrompt'

interface Props {
  lang: Lang
  s: Strings
  onActiveChange: (active: boolean) => void
}

interface Caption {
  id: string
  role: 'user' | 'tutor' | 'note'
  text: string
  /** Hebrew translation, filled in shortly after the line finishes */
  he?: string
  note?: CallNote
}

const HEBREW = /[\u0590-\u05FF]/

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
  const [callNotes, setCallNotes] = useState<CallNote[]>([])
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
      logEvent('call_end', {
        seconds: elapsedRef.current,
        model: callRef.current?.model,
        notes: notesCountRef.current,
      })
    }
  }, [status])

  const notesCountRef = useRef(0)

  const lastAnaLineRef = useRef('')
  // her lines the checker has already rewritten (the provisional caption must
  // not overwrite them if it arrives late) and the provisional text per line
  const reviewedRef = useRef(new Set<string>())
  const provisionalRef = useRef(new Map<string, string>())
  // lines the checker gave up on, still waiting for their provisional caption
  const translateOnArrivalRef = useRef(new Set<string>())

  const translateCaption = (id: string, text: string) => {
    if (HEBREW.test(text)) return // already Hebrew
    void translateToHebrew([text]).then(([he]) => {
      if (!he) return
      setCaptions((caps) => caps.map((c) => (c.id === id ? { ...c, he } : c)))
    })
  }

  /** Translate her line from the provisional caption (now, or when it arrives). */
  const translateProvisional = (id: string) => {
    const text = provisionalRef.current.get(id)
    if (text) translateCaption(id, text)
    else translateOnArrivalRef.current.add(id)
  }

  /** Show a note right under the line it belongs to (or her latest line). */
  const addNote = (n: CallNote, anchorId?: string) => {
    notesCountRef.current += 1
    setCallNotes((all) => [...all, n])
    setCaptions((caps) => {
      const item: Caption = { id: `note-${Date.now()}-${Math.random()}`, role: 'note', text: '', note: n }
      let at = anchorId ? caps.findIndex((c) => c.id === anchorId) : -1
      for (let i = caps.length - 1; at === -1 && i >= 0; i--) {
        if (caps[i].role === 'user') at = i
      }
      if (at === -1) return [...caps, item].slice(-30)
      let insert = at + 1
      while (insert < caps.length && caps[insert].role === 'note') insert++
      return [...caps.slice(0, insert), item, ...caps.slice(insert)].slice(-30)
    })
  }

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
    setCallNotes([])
    reviewedRef.current = new Set()
    provisionalRef.current = new Map()
    translateOnArrivalRef.current = new Set()
    lastAnaLineRef.current = ''
    // created during the tap so the phone lets it run
    const captureCtx = new AudioContext()
    notesCountRef.current = 0
    setMuted(false)
    setElapsed(0)
    elapsedRef.current = 0
    loggedEndRef.current = false
    setStatus('connecting')
    try {
      factsRef.current = await loadFacts()
      const call = await startLiveCall(
        { facts: factsRef.current, feedbackLang: lang, level: effectiveLevel(), captureCtx },
        {
          onStatus: (st, detail) => {
            setStatus(st)
            if (st === 'error') setNote(`${s.callFailed}${detail ? ` (${detail})` : ''}`)
          },
          onCaption: (id, role, text, append) => {
            if (role === 'user') {
              if (reviewedRef.current.has(id)) return
              if (!text.startsWith('🎤')) {
                provisionalRef.current.set(id, text)
                if (translateOnArrivalRef.current.delete(id)) translateCaption(id, text)
              }
            }
            upsertCaption(id, role, text, append)
          },
          onCaptionDone: (id, role, text) => {
            if (role === 'tutor') lastAnaLineRef.current = text
            translateCaption(id, text)
          },
          onSpeaking: setSpeaking,
          onUtterance: (id, audio) => {
            void reviewUtterance(audio, lastAnaLineRef.current, lang)
              .then((r) => {
                const heard = r.heard ? cleanUserCaption(r.heard) : null
                if (heard) {
                  reviewedRef.current.add(id)
                  upsertCaption(id, 'user', heard, false)
                }
                if (heard) translateCaption(id, heard)
                else translateProvisional(id)
                if (r.note) addNote(r.note, id)
              })
              // checker unavailable: keep the provisional caption
              .catch(() => translateProvisional(id))
          },
          onUtteranceSkipped: translateProvisional,
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
      logEvent('call_start', { model: call.model, version: call.version })
      if (call.version !== EXPECTED_FUNCTION_VERSION) setNote(s.callOutdated)
    } catch (err: unknown) {
      void captureCtx.close().catch(() => {})
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
        {status === 'ended' && callNotes.length > 0 && (
          <div className="call-summary">
            <p className="call-summary-title">{s.callNotesTitle}</p>
            {callNotes.map((n, i) => (
              <p key={i} className="call-summary-row">
                <b lang="ro" dir="ltr">
                  {n.word}
                </b>{' '}
                <span dir="auto">{n.tip}</span>
              </p>
            ))}
          </div>
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
        {captions.map((c) =>
          c.role === 'note' && c.note ? (
            <div key={c.id} className="cap note">
              <span aria-hidden>{c.note.kind === 'grammar' ? '✏️' : '🗣️'}</span>
              <p>
                <b lang="ro" dir="ltr">
                  {c.note.word}
                </b>{' '}
                <span dir="auto">{c.note.tip}</span>
              </p>
            </div>
          ) : (
          <div key={c.id} className={`cap ${c.role}`}>
            <p dir="auto">{c.text}</p>
            {c.he && (
              <p className="cap-he" dir="rtl" lang="he">
                {c.he}
              </p>
            )}
          </div>
          ),
        )}
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
