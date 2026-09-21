import { useEffect, useRef, useState } from 'react'
import { dictionary, type Entry } from '../data/dictionary'
import { sentences } from '../data/sentences'
import { passages, type Passage } from '../data/texts'
import { verbs, PERSONS, PERSON_LABELS, type PersonIndex } from '../data/verbs'
import type { Lang, Strings } from '../i18n'
import {
  pickWords,
  recordQuiz,
  recordOutcome,
  unlockedTier,
} from '../lib/progress'
import { getSettings } from '../lib/settings'
import {
  acceptedRomanian,
  acceptedTranslations,
  checkWritten,
} from '../lib/answers'
import { gradePronunciation, TutorError } from '../lib/tutor'
import { speakRomanian } from '../speak'
import { useRecorder } from '../useRecorder'

interface Props {
  lang: Lang
  s: Strings
}

export type Mode =
  | 'mixed'
  | 'mcqMeaning'
  | 'mcqWord'
  | 'listen'
  | 'writeMeaning'
  | 'writeRo'
  | 'clozeMcq'
  | 'clozeWrite'
  | 'text'
  | 'conjMcq'
  | 'conjWrite'
  | 'conjSpeak'

interface McqQ {
  kind: 'mcq'
  prompt: string
  promptRo?: boolean
  promptSub?: string
  options: string[]
  optionsRo?: boolean
  answerIdx: number
  speakText?: string
  wordId?: string
  translation?: string
  passage?: Passage
}

interface WriteQ {
  kind: 'write'
  prompt: string
  promptRo?: boolean
  promptSub?: string
  accepted: string[]
  solution: string
  inputDir: 'ltr' | 'rtl'
  wordId?: string
  translation?: string
  passage?: Passage
}

interface SpeakQ {
  kind: 'speak'
  prompt: string
  promptRo?: boolean
  promptSub: string
  /** the full phrase she should say, e.g. "noi mergem" */
  target: string
  passage?: Passage
  wordId?: string
  translation?: string
}

type Q = McqQ | WriteQ | SpeakQ

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function distractors(target: Entry, n: number): Entry[] {
  const sameCat = dictionary.filter(
    (w) => w.id !== target.id && w.cat === target.cat,
  )
  const rest = dictionary.filter(
    (w) => w.id !== target.id && w.cat !== target.cat,
  )
  return shuffle([...shuffle(sameCat).slice(0, n), ...shuffle(rest)]).slice(0, n)
}

function buildQuestions(mode: Mode, lang: Lang, s: Strings): Q[] {
  const n = getSettings().quizLength
  const meaning = (w: Entry) => (lang === 'he' ? w.he : w.en)

  const wordQ = (kind: 'mcqMeaning' | 'mcqWord' | 'listen' | 'writeMeaning' | 'writeRo') =>
    (target: Entry): Q => {
      switch (kind) {
        case 'mcqMeaning': {
          const opts = shuffle([target, ...distractors(target, 3)])
          return {
            kind: 'mcq',
            prompt: s.quizWhatMeans(target.ro),
            options: opts.map(meaning),
            answerIdx: opts.indexOf(target),
            wordId: target.id,
          }
        }
        case 'mcqWord': {
          const opts = shuffle([target, ...distractors(target, 3)])
          return {
            kind: 'mcq',
            prompt: s.quizWhichWord(meaning(target)),
            options: opts.map((w) => w.ro),
            optionsRo: true,
            answerIdx: opts.indexOf(target),
            wordId: target.id,
          }
        }
        case 'listen': {
          const opts = shuffle([target, ...distractors(target, 3)])
          return {
            kind: 'mcq',
            prompt: s.quizListenPick,
            options: opts.map((w) => w.ro),
            optionsRo: true,
            answerIdx: opts.indexOf(target),
            speakText: target.ro,
            wordId: target.id,
          }
        }
        case 'writeMeaning':
          return {
            kind: 'write',
            prompt: s.quizWriteMeaning(target.ro),
            accepted: acceptedTranslations(target, lang),
            solution: meaning(target),
            inputDir: lang === 'he' ? 'rtl' : 'ltr',
            wordId: target.id,
          }
        case 'writeRo':
          return {
            kind: 'write',
            prompt: s.quizWriteRo(meaning(target)),
            accepted: acceptedRomanian(target),
            solution: target.ro,
            inputDir: 'ltr',
            wordId: target.id,
          }
      }
    }

  const clozeQs = (write: boolean): Q[] => {
    const tier = unlockedTier()
    let pool = sentences.filter((c) => c.tier <= tier)
    if (pool.length < n) pool = sentences
    return shuffle(pool)
      .slice(0, n)
      .map((c) => {
        const translation = lang === 'he' ? c.he : c.en
        if (write) {
          return {
            kind: 'write' as const,
            prompt: c.ro,
            promptRo: true,
            accepted: [c.answer],
            solution: c.answer,
            inputDir: 'ltr' as const,
            translation,
          }
        }
        const opts = shuffle([c.answer, ...c.distractors])
        return {
          kind: 'mcq' as const,
          prompt: c.ro,
          promptRo: true,
          options: opts,
          optionsRo: true,
          answerIdx: opts.indexOf(c.answer),
          translation,
        }
      })
  }

  const conjQs = (kind: 'mcq' | 'write' | 'speak'): Q[] => {
    const tier = unlockedTier()
    let pool = verbs.filter((v) => v.tier <= tier)
    if (pool.length < 8) pool = verbs
    return Array.from({ length: n }, (): Q => {
      const verb = pool[Math.floor(Math.random() * pool.length)]
      const p = Math.floor(Math.random() * 6) as PersonIndex
      const meaning = lang === 'he' ? verb.he : verb.en
      const personLabel = PERSON_LABELS[lang][p]
      const answer = verb.forms[p]
      const prompt = `${verb.inf} — ${meaning}`
      if (kind === 'speak') {
        const pronoun = PERSONS[p].split('/')[0]
        return {
          kind: 'speak',
          prompt,
          promptSub: `${PERSONS[p]} (${personLabel}) + ${verb.inf} = ?`,
          target: `${pronoun} ${answer}`,
        }
      }
      if (kind === 'write') {
        return {
          kind: 'write',
          prompt,
          promptSub: `${PERSONS[p]} (${personLabel}) ___`,
          accepted: [answer],
          solution: answer,
          inputDir: 'ltr',
        }
      }
      const others = [...new Set(verb.forms.filter((f) => f !== answer))]
      let distract = shuffle(others).slice(0, 3)
      while (distract.length < 3) {
        const other = verbs[Math.floor(Math.random() * verbs.length)]
        const f = other.forms[p]
        if (f !== answer && !distract.includes(f)) distract.push(f)
      }
      const opts = shuffle([answer, ...distract])
      return {
        kind: 'mcq',
        prompt,
        promptSub: `${PERSONS[p]} (${personLabel}) ___`,
        options: opts,
        optionsRo: true,
        answerIdx: opts.indexOf(answer),
      }
    })
  }

  const textQs = (): Q[] => {
    const tier = unlockedTier()
    let pool = passages.filter((p) => p.tier <= tier)
    if (pool.length === 0) pool = passages
    const passage = shuffle(pool)[0]
    return passage.questions.map((q): Q => {
      if (q.type === 'mcq') {
        return {
          kind: 'mcq',
          prompt: q.prompt[lang],
          options: q.options[lang],
          answerIdx: q.answerIdx,
          passage,
        }
      }
      return {
        kind: 'write',
        prompt: q.prompt[lang],
        accepted: q.accepted,
        solution: q.accepted[0],
        inputDir: 'ltr',
        passage,
      }
    })
  }

  switch (mode) {
    case 'mcqMeaning':
    case 'mcqWord':
    case 'listen':
    case 'writeMeaning':
    case 'writeRo':
      return pickWords(n).map(wordQ(mode))
    case 'clozeMcq':
      return clozeQs(false)
    case 'clozeWrite':
      return clozeQs(true)
    case 'text':
      return textQs()
    case 'conjMcq':
      return conjQs('mcq')
    case 'conjWrite':
      return conjQs('write')
    case 'conjSpeak':
      return conjQs('speak')
    case 'mixed': {
      const kinds = [
        'mcqMeaning',
        'mcqWord',
        'listen',
        'writeMeaning',
        'writeRo',
      ] as const
      const wordCount = Math.max(1, n - 2)
      const words = pickWords(wordCount).map((w, i) => wordQ(kinds[i % kinds.length])(w))
      return shuffle([...words, ...clozeQs(Math.random() < 0.5).slice(0, 2)])
    }
  }
}

const MODES: { mode: Mode; icon: string }[] = [
  { mode: 'mixed', icon: '🎲' },
  { mode: 'mcqMeaning', icon: '🔤' },
  { mode: 'mcqWord', icon: '🇷🇴' },
  { mode: 'listen', icon: '🔊' },
  { mode: 'writeMeaning', icon: '✍️' },
  { mode: 'writeRo', icon: '⌨️' },
  { mode: 'clozeMcq', icon: '🧩' },
  { mode: 'clozeWrite', icon: '📝' },
  { mode: 'text', icon: '📖' },
  { mode: 'conjMcq', icon: '👥' },
  { mode: 'conjWrite', icon: '🖊️' },
  { mode: 'conjSpeak', icon: '🗣️' },
]

export default function Quiz({ lang, s }: Props) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [questions, setQuestions] = useState<Q[]>([])
  const [index, setIndex] = useState(0)
  const [chosenIdx, setChosenIdx] = useState<number | null>(null)
  const [written, setWritten] = useState('')
  const [writtenResult, setWrittenResult] = useState<boolean | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [showTranslation, setShowTranslation] = useState(false)
  // spoken-conjugation questions
  const [speakResult, setSpeakResult] = useState<{
    ok: boolean
    score: number
    transcript: string | null
  } | null>(null)
  const [speakBusy, setSpeakBusy] = useState(false)
  const [speakNote, setSpeakNote] = useState<string | null>(null)
  const recorder = useRecorder()
  const gradedBlobRef = useRef<Blob | null>(null)

  // grade a spoken-conjugation recording when it lands
  useEffect(() => {
    const blob = recorder.audioBlob
    const current = questions[index]
    if (!blob || blob === gradedBlobRef.current) return
    if (!current || current.kind !== 'speak' || speakResult) return
    gradedBlobRef.current = blob
    setSpeakBusy(true)
    setSpeakNote(null)
    gradePronunciation(blob, current.target, lang)
      .then((res) => {
        const ok = res.score >= 60 || res.understood === true
        setSpeakResult({ ok, score: res.score, transcript: res.transcript })
        recordOutcome(ok)
        if (ok) setCorrectCount((c) => c + 1)
      })
      .catch((err: unknown) => {
        if (err instanceof TutorError && err.kind === 'auth') setSpeakNote(s.tutorSignIn)
        else if (err instanceof TutorError && err.kind === 'unavailable')
          setSpeakNote(s.tutorUnavailable)
        else setSpeakNote(s.tutorFailed)
      })
      .finally(() => setSpeakBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.audioBlob])

  const modeLabel = (m: Mode): [string, string] => {
    switch (m) {
      case 'mixed': return [s.modeMixed, s.modeMixedDesc]
      case 'mcqMeaning': return [s.modeMcqMeaning, s.modeMcqMeaningDesc]
      case 'mcqWord': return [s.modeMcqWord, s.modeMcqWordDesc]
      case 'listen': return [s.modeListen, s.modeListenDesc]
      case 'writeMeaning': return [s.modeWriteMeaning, s.modeWriteMeaningDesc]
      case 'writeRo': return [s.modeWriteRo, s.modeWriteRoDesc]
      case 'clozeMcq': return [s.modeClozeMcq, s.modeClozeMcqDesc]
      case 'clozeWrite': return [s.modeClozeWrite, s.modeClozeWriteDesc]
      case 'text': return [s.modeText, s.modeTextDesc]
      case 'conjMcq': return [s.modeConjMcq, s.modeConjMcqDesc]
      case 'conjWrite': return [s.modeConjWrite, s.modeConjWriteDesc]
      case 'conjSpeak': return [s.modeConjSpeak, s.modeConjSpeakDesc]
    }
  }

  const start = (m: Mode) => {
    setMode(m)
    setQuestions(buildQuestions(m, lang, s))
    setIndex(0)
    setChosenIdx(null)
    setWritten('')
    setWrittenResult(null)
    setCorrectCount(0)
    setShowTranslation(false)
    setSpeakResult(null)
    setSpeakNote(null)
    recorder.reset()
  }

  const backToModes = () => setMode(null)

  // ——— mode picker ———
  if (mode === null) {
    return (
      <div className="quiz">
        <div className="quiz-modes-head">
          <h2>{s.quizTitle}</h2>
          <p>{s.quizIntro}</p>
        </div>
        <div className="mode-grid">
          {MODES.map(({ mode: m, icon }) => {
            const [name, desc] = modeLabel(m)
            return (
              <button key={m} className="mode-card" onClick={() => start(m)}>
                <span className="mode-icon" aria-hidden>{icon}</span>
                <b>{name}</b>
                <small>{desc}</small>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const finished = index >= questions.length
  if (finished) {
    return (
      <div className="card quiz-cover">
        <h2>{s.quizDoneTitle}</h2>
        <p className="quiz-score">{s.quizScore(correctCount, questions.length)}</p>
        <button className="btn record" onClick={() => start(mode)}>
          {s.quizAgain}
        </button>
        <button className="btn subtle" onClick={backToModes}>
          {s.quizOtherMode}
        </button>
      </div>
    )
  }

  const q = questions[index]
  const answered =
    q.kind === 'mcq'
      ? chosenIdx !== null
      : q.kind === 'write'
        ? writtenResult !== null
        : speakResult !== null

  const record = (ok: boolean) => {
    if (q.wordId) recordQuiz(q.wordId, ok)
    else recordOutcome(ok)
    if (ok) setCorrectCount((c) => c + 1)
  }

  const pickOption = (i: number) => {
    if (answered || q.kind !== 'mcq') return
    setChosenIdx(i)
    record(i === q.answerIdx)
  }

  const checkWrittenAnswer = (skip = false) => {
    if (answered || q.kind !== 'write') return
    const ok = skip ? false : checkWritten(written, q.accepted)
    setWrittenResult(ok)
    record(ok)
  }

  const skipSpeak = () => {
    if (answered || q.kind !== 'speak') return
    setSpeakResult({ ok: false, score: 0, transcript: null })
    record(false)
  }

  const next = () => {
    setChosenIdx(null)
    setWritten('')
    setWrittenResult(null)
    setSpeakResult(null)
    setSpeakNote(null)
    setShowTranslation(false)
    recorder.reset()
    setIndex((i) => i + 1)
  }

  const wasCorrect =
    q.kind === 'mcq'
      ? chosenIdx === q.answerIdx
      : q.kind === 'write'
        ? writtenResult === true
        : speakResult?.ok === true
  const solutionText =
    q.kind === 'mcq' ? q.options[q.answerIdx] : q.kind === 'write' ? q.solution : q.target

  return (
    <div className="quiz">
      <p className="quiz-counter">
        {index + 1} / {questions.length}
      </p>

      {q.passage && (
        <div className="card passage">
          <p className="passage-label">{s.readText}</p>
          <p className="passage-ro" lang="ro" dir="ltr">
            {q.passage.ro}
          </p>
          <button
            className="btn subtle"
            onClick={() => setShowTranslation((v) => !v)}
          >
            {showTranslation ? s.hideTranslation : s.showTranslation}
          </button>
          {showTranslation && (
            <p className="passage-tr">{lang === 'he' ? q.passage.he : q.passage.en}</p>
          )}
        </div>
      )}

      <div className="card">
        <p
          className="quiz-prompt"
          lang={q.promptRo ? 'ro' : undefined}
          dir={q.promptRo ? 'ltr' : undefined}
        >
          {q.prompt}
        </p>

        {q.promptSub && (
          <p className="quiz-promptsub" lang="ro" dir="ltr">
            {q.promptSub}
          </p>
        )}

        {q.kind === 'mcq' && q.speakText && (
          <button
            className="btn listen quiz-play"
            onClick={() => speakRomanian(q.speakText!)}
          >
            🔊 {s.quizPlay}
          </button>
        )}

        {q.kind === 'mcq' ? (
          <div className="quiz-options">
            {q.options.map((opt, i) => {
              let cls = 'btn option'
              if (answered) {
                if (i === q.answerIdx) cls += ' right'
                else if (i === chosenIdx) cls += ' wrong'
                else cls += ' muted'
              }
              return (
                <button
                  key={i}
                  className={cls}
                  lang={q.optionsRo ? 'ro' : undefined}
                  onClick={() => pickOption(i)}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        ) : q.kind === 'write' ? (
          <div className="write-area">
            <input
              type="text"
              dir={q.inputDir}
              value={written}
              placeholder={s.quizTypeHere}
              disabled={answered}
              autoCorrect="off"
              autoCapitalize="none"
              onChange={(e) => setWritten(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') checkWrittenAnswer()
              }}
            />
            {!answered && (
              <div className="write-buttons">
                <button className="btn listen" onClick={() => checkWrittenAnswer()}>
                  {s.quizCheck}
                </button>
                <button className="btn subtle" onClick={() => checkWrittenAnswer(true)}>
                  {s.quizSkip}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="write-area">
            <p className="quiz-say-hint">{s.quizSayIt}</p>
            {!answered && !speakBusy && (
              <>
                {recorder.status !== 'recording' ? (
                  <button className="btn record" onClick={recorder.start}>
                    🎙️ {s.record}
                  </button>
                ) : (
                  <button className="btn record recording" onClick={recorder.stop}>
                    ⏹️ {s.stop}
                  </button>
                )}
                {recorder.status !== 'recording' && (
                  <button className="btn subtle" onClick={skipSpeak}>
                    {s.quizSkip}
                  </button>
                )}
              </>
            )}
            {speakBusy && <p className="grading-note">🎧 {s.grading}</p>}
            {speakNote && <p className="notice">{speakNote}</p>}
            {speakResult?.transcript != null && (
              <p className="heard">
                {s.heard}: “{speakResult.transcript}” · {speakResult.score}
              </p>
            )}
            {recorder.error && (
              <p className="error">
                {recorder.error === 'denied' ? s.micDenied : s.micError}
              </p>
            )}
          </div>
        )}

        {answered && (
          <>
            <p className={wasCorrect ? 'done-note' : 'error'}>
              {wasCorrect ? s.quizCorrect : s.quizWrong(solutionText)}
            </p>
            {q.translation && <p className="cloze-translation">{q.translation}</p>}
            <button className="btn record" onClick={next}>
              {s.quizNext}
            </button>
          </>
        )}
      </div>

      <button className="btn subtle quiz-quit" onClick={backToModes}>
        {s.quizOtherMode}
      </button>
    </div>
  )
}
