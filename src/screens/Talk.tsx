import { useEffect, useRef, useState } from 'react'
import type { Lang, Strings } from '../i18n'
import { recordOutcome } from '../lib/progress'
import { converseTurn, TutorError, type ChatTurn } from '../lib/tutor'
import { speakRomanian } from '../speak'
import { useRecorder } from '../useRecorder'

interface Props {
  lang: Lang
  s: Strings
}

export default function Talk({ lang, s }: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const recorder = useRecorder()
  const sentBlobRef = useRef<Blob | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns, busy])

  const send = async (input: { audio: Blob } | { text: string }) => {
    setBusy(true)
    setNote(null)
    const pendingText = 'text' in input ? input.text : '…'
    // optimistic user bubble; replaced with the transcript once known
    setTurns((t) => [...t, { role: 'user', text: pendingText }])
    try {
      const result = await converseTurn(input, turns, lang)
      setTurns((t) => {
        const copy = [...t]
        copy[copy.length - 1] = {
          role: 'user',
          text: result.transcript ?? pendingText,
          note: result.correction ?? undefined,
        }
        copy.push({ role: 'tutor', text: result.reply, note: result.translation })
        return copy
      })
      recordOutcome(true)
      speakRomanian(result.reply)
    } catch (err: unknown) {
      setTurns((t) => t.slice(0, -1))
      if (err instanceof TutorError && err.kind === 'auth') setNote(s.tutorSignIn)
      else if (err instanceof TutorError && err.kind === 'unavailable')
        setNote(s.tutorUnavailable)
      else {
        const detail = err instanceof Error && err.message ? ` (${err.message.slice(0, 160)})` : ''
        setNote(s.talkFailed + detail)
      }
    } finally {
      setBusy(false)
      recorder.reset()
    }
  }

  // a finished recording becomes a turn
  useEffect(() => {
    const blob = recorder.audioBlob
    if (!blob || busy || blob === sentBlobRef.current) return
    sentBlobRef.current = blob
    void send({ audio: blob })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.audioBlob])

  const sendTyped = () => {
    const text = typed.trim()
    if (!text || busy) return
    setTyped('')
    void send({ text })
  }

  return (
    <div className="talk">
      <div className="talk-thread">
        {turns.length === 0 && (
          <div className="card talk-empty">
            <p className="talk-hello">👋 {s.talkIntro}</p>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`bubble-row ${t.role}`}>
            <div className={`bubble ${t.role}`}>
              <p lang="ro" dir="ltr">
                {t.text}
              </p>
              {t.note && (
                <p className={t.role === 'user' ? 'bubble-correction' : 'bubble-translation'}>
                  {t.note}
                </p>
              )}
              {t.role === 'tutor' && (
                <button
                  className="bubble-replay"
                  aria-label={s.listen}
                  onClick={() => speakRomanian(t.text)}
                >
                  🔊
                </button>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="grading-note">🎧 {s.talkThinking}</p>}
        {note && <p className="notice">{note}</p>}
        <div ref={endRef} />
      </div>

      <div className="talk-controls">
        <div className="talk-typebox">
          <input
            type="text"
            dir="ltr"
            value={typed}
            placeholder={s.talkTypePlaceholder}
            disabled={busy}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendTyped()
            }}
          />
          <button className="btn listen talk-send" disabled={busy || !typed.trim()} onClick={sendTyped}>
            ➤
          </button>
        </div>
        {recorder.status !== 'recording' ? (
          <button className="btn record talk-mic" disabled={busy} onClick={recorder.start}>
            🎙️ {s.talkSpeak}
          </button>
        ) : (
          <button className="btn record recording talk-mic" onClick={recorder.stop}>
            ⏹️ {s.stop}
          </button>
        )}
        {recorder.error && (
          <p className="error">{recorder.error === 'denied' ? s.micDenied : s.micError}</p>
        )}
      </div>
    </div>
  )
}
