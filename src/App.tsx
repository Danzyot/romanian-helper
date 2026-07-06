import { useEffect, useRef, useState } from 'react'
import { words } from './words'
import { t, type Lang } from './i18n'
import { hasRomanianVoice, speakRomanian } from './speak'
import { useRecorder } from './useRecorder'

export default function App() {
  const [lang, setLang] = useState<Lang>('en')
  const [index, setIndex] = useState(0)
  const [voiceMissing, setVoiceMissing] = useState(false)
  const recorder = useRecorder()
  const playbackRef = useRef<HTMLAudioElement>(null)

  const s = t(lang)
  const word = words[index]
  const [backArrow, nextArrow] = lang === 'he' ? ['→', '←'] : ['←', '→']

  // Voices load asynchronously; check once they had a chance to arrive.
  useEffect(() => {
    const check = () => setVoiceMissing(!hasRomanianVoice())
    const timer = setTimeout(check, 1500)
    window.speechSynthesis?.addEventListener('voiceschanged', check)
    return () => {
      clearTimeout(timer)
      window.speechSynthesis?.removeEventListener('voiceschanged', check)
    }
  }, [])

  const goTo = (nextIndex: number) => {
    setIndex((nextIndex + words.length) % words.length)
    recorder.reset()
  }

  return (
    <div className="app" dir={lang === 'he' ? 'rtl' : 'ltr'}>
      <header className="topbar">
        <h1>{s.appName}</h1>
        <button
          className="lang-toggle"
          onClick={() => setLang(lang === 'en' ? 'he' : 'en')}
        >
          {s.switchLang}
        </button>
      </header>

      <main className="card">
        <p className="counter">{s.wordOf(index + 1, words.length)}</p>
        <p className="word" lang="ro">
          {word.ro}
        </p>
        <p className="translation">{lang === 'he' ? word.he : word.en}</p>
        <p className="hint">
          {s.soundsLike}: <span dir="ltr">{word.hint}</span>
        </p>

        <div className="listen-row">
          <button className="btn listen" onClick={() => speakRomanian(word.ro)}>
            🔊 {s.listen}
          </button>
          <button
            className="btn listen"
            onClick={() => speakRomanian(word.ro, 0.6)}
          >
            🐢 {s.listenSlow}
          </button>
        </div>

        {recorder.status !== 'recording' ? (
          <button className="btn record" onClick={recorder.start}>
            🎙️ {s.record}
          </button>
        ) : (
          <button className="btn record recording" onClick={recorder.stop}>
            ⏹️ {s.stop}
          </button>
        )}
        {recorder.status === 'recording' && (
          <p className="recording-note">{s.recording}</p>
        )}

        {recorder.status === 'recorded' && recorder.audioUrl && (
          <>
            <button
              className="btn playback"
              onClick={() => playbackRef.current?.play()}
            >
              ▶️ {s.playBack}
            </button>
            <audio ref={playbackRef} src={recorder.audioUrl} />
          </>
        )}

        {recorder.error && (
          <p className="error">
            {recorder.error === 'denied' ? s.micDenied : s.micError}
          </p>
        )}
        {voiceMissing && <p className="notice">{s.noVoice}</p>}
      </main>

      <nav className="nav-row">
        <button className="btn nav" onClick={() => goTo(index - 1)}>
          {backArrow} {s.prev}
        </button>
        <button className="btn nav" onClick={() => goTo(index + 1)}>
          {s.next} {nextArrow}
        </button>
      </nav>
    </div>
  )
}
