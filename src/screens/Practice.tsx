import { useMemo, useRef, useState } from 'react'
import { categories, dictionary, type Entry } from '../data/dictionary'
import type { Lang, Strings } from '../i18n'
import { search, looksRomanian } from '../lib/search'
import { pickWords, recordPractice, unlockedTier } from '../lib/progress'
import { roHint } from '../lib/roHint'
import { getSettings } from '../lib/settings'
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

const CATEGORY_LABELS: Record<string, { en: string; he: string }> = {
  greetings: { en: 'Greetings', he: 'ברכות' },
  basics: { en: 'Basics', he: 'בסיס' },
  phrases: { en: 'Phrases', he: 'ביטויים' },
  numbers: { en: 'Numbers', he: 'מספרים' },
  time: { en: 'Time', he: 'זמן' },
  family: { en: 'Family', he: 'משפחה' },
  food: { en: 'Food', he: 'אוכל' },
  kitchen: { en: 'Kitchen', he: 'מטבח' },
  home: { en: 'Home', he: 'בית' },
  body: { en: 'Body', he: 'גוף' },
  health: { en: 'Health', he: 'בריאות' },
  clothes: { en: 'Clothes', he: 'בגדים' },
  colors: { en: 'Colors', he: 'צבעים' },
  animals: { en: 'Animals', he: 'חיות' },
  places: { en: 'Places', he: 'מקומות' },
  transport: { en: 'Transport', he: 'תחבורה' },
  travel: { en: 'Travel', he: 'נסיעות' },
  verbs: { en: 'Verbs', he: 'פעלים' },
  adjectives: { en: 'Adjectives', he: 'תארים' },
  emotions: { en: 'Feelings', he: 'רגשות' },
  work: { en: 'Work', he: 'עבודה' },
  school: { en: 'School', he: 'לימודים' },
  tech: { en: 'Technology', he: 'טכנולוגיה' },
  hobbies: { en: 'Hobbies', he: 'תחביבים' },
  nature: { en: 'Nature', he: 'טבע' },
  weather: { en: 'Weather', he: 'מזג אוויר' },
  shopping: { en: 'Shopping', he: 'קניות' },
}

export default function Practice({ lang, s, voiceMissing }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Entry | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const [practiced, setPracticed] = useState(false)
  const recorder = useRecorder()
  const playbackRef = useRef<HTMLAudioElement>(null)

  const results = useMemo(() => search(query), [query])
  const suggestions = useMemo(() => pickWords(6), [])
  const categoryWords = useMemo(() => {
    if (!category) return []
    const maxTier = unlockedTier()
    const words = dictionary.filter((w) => w.cat === category)
    // unlocked-tier words first, the rest still browsable below
    return [...words.filter((w) => w.tier <= maxTier), ...words.filter((w) => w.tier > maxTier)]
  }, [category])

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

  const translation = (w: Entry) => [w.en, w.he].filter(Boolean).join(' · ')
  const catLabel = (c: string) => CATEGORY_LABELS[c]?.[lang] ?? c

  const wordList = (words: Entry[]) =>
    words.map((w) => (
      <button key={w.id} className="result-row" onClick={() => choose(w)}>
        <b lang="ro">{w.ro}</b>
        <span>{lang === 'he' ? w.he : w.en}</span>
      </button>
    ))

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
          <p className="hint">
            {s.soundsLike}:{' '}
            <span dir="ltr">{selected.hint ?? roHint(selected.ro)}</span>
          </p>

          <div className="listen-row">
            <button className="btn listen" onClick={() => speakRomanian(selected.ro)}>
              🔊 {s.listen}
            </button>
            <button
              className="btn listen"
              onClick={() => speakRomanian(selected.ro, getSettings().slowRate)}
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
      ) : category ? (
        <div className="suggestions">
          <div className="chips-row">
            <button className="chip on" onClick={() => setCategory(null)}>
              ← {catLabel(category)}
            </button>
          </div>
          {wordList(categoryWords)}
        </div>
      ) : (
        <div className="suggestions">
          <h2>{s.suggestedToday}</h2>
          {wordList(suggestions)}
          <h2>{s.browseAll}</h2>
          <div className="chips-row wrap">
            {categories.map((c) => (
              <button key={c} className="chip" onClick={() => setCategory(c)}>
                {catLabel(c)}
              </button>
            ))}
          </div>
        </div>
      )}

      {voiceMissing && <p className="notice">{s.noVoice}</p>}
    </div>
  )
}
