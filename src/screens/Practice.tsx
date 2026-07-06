import { useMemo, useRef, useState } from 'react'
import type { Entry } from '../data/dictionary'
import type { Lang, Strings } from '../i18n'
import { search, looksRomanian } from '../lib/search'
import { pickWords, recordPractice } from '../lib/progress'
import { speakRomanian } from '../speak'
import { useRecorder } from '../useRecorder'

interface Props {
  lang: Lang
  s: Strings
  voiceMissing: boolean
}

/** A free-typed word not present in the dictionary. */
function customEntry(text: string): Entry {
  return { id: `custom:${text}`, ro: text, en: '', he: '', cat: 'custom', tier: 1 }
}

export default function Practice({ lang, s, voiceMissing }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Entry | null>(null)
  const [practiced, setPracticed] = useState(false)
  const recorder = useRecorder()
  const playbackRef = useRef<HTMLAudioElement>(null)

  const results = useMemo(() => search(query), [query])
  const suggestions = useMemo(() => pickWords(6), [])

  const choose = (entry: Entry) => {
    setSelected(entry)
    setQuery('')
    setPracticed(false)
    recorder.reset()
    speakRomanian(entry.ro)
  }

  const stopAndLog = () => {
    recorder.stop()
    if (selected && !selected.id.startsWith('custom:')) {
      recordPractice(selected.id)
    }
    setPracticed(true)
  }

  const translation = (w: Entry) =>
    [w.en, w.he].filter(Boolean).join(' · ')

  return (
    <div className="practice">
      <div className="searchbox">
        <span aria-hidden>⌕</span>
        <input
          type="search"
          value={query}
          placeholder={s.searchPlaceholder}
          onChange={(e) => setQuery(e.target.value)}
          autoCorrect="off"
          autoCapitalize="none"
        />
      </div>

      {query ? (
        <div className="results">
          {results.map((w) => (
            <button key={w.id} className="result-row" onClick={() => choose(w)}>
              <b lang="ro">{w.ro}</b>
              <span>{translation(w)}</span>
            </button>
          ))}
          {results.length === 0 && (
            <div className="result-empty">
              <p>{s.noResults}</p>
              {looksRomanian(query) && (
                <button
                  className="btn subtle"
                  onClick={() => choose(customEntry(query.trim()))}
                >
                  {s.practiceAnyway(query.trim())}
                </button>
              )}
            </div>
          )}
        </div>
      ) : selected ? (
        <div className="card wordcard">
          <p className="word" lang="ro">
            {selected.ro}
          </p>
          {translation(selected) && (
            <p className="translation">{translation(selected)}</p>
          )}
          {selected.hint && (
            <p className="hint">
              {s.soundsLike}: <span dir="ltr">{selected.hint}</span>
            </p>
          )}

          <div className="listen-row">
            <button className="btn listen" onClick={() => speakRomanian(selected.ro)}>
              🔊 {s.listen}
            </button>
            <button
              className="btn listen"
              onClick={() => speakRomanian(selected.ro, 0.6)}
            >
              🐢 {s.listenSlow}
            </button>
          </div>

          {recorder.status !== 'recording' ? (
            <button className="btn record" onClick={recorder.start}>
              🎙️ {s.record}
            </button>
          ) : (
            <button className="btn record recording" onClick={stopAndLog}>
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
              {practiced && <p className="done-note">{s.practiceDone}</p>}
            </>
          )}

          {recorder.error && (
            <p className="error">
              {recorder.error === 'denied' ? s.micDenied : s.micError}
            </p>
          )}

          <button className="btn subtle" onClick={() => setSelected(null)}>
            {s.backToSearch}
          </button>
        </div>
      ) : (
        <div className="suggestions">
          <h2>{s.suggestedToday}</h2>
          {suggestions.map((w) => (
            <button key={w.id} className="result-row" onClick={() => choose(w)}>
              <b lang="ro">{w.ro}</b>
              <span>{lang === 'he' ? w.he : w.en}</span>
            </button>
          ))}
        </div>
      )}

      {voiceMissing && <p className="notice">{s.noVoice}</p>}
    </div>
  )
}
