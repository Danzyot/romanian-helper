import { useState } from 'react'
import { dictionary, type Entry } from '../data/dictionary'
import { sentences } from '../data/sentences'
import { passages, type Passage } from '../data/texts'
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
import { speakRomanian } from '../speak'

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

interface McqQ {
  kind: 'mcq'
  prompt: string
  promptRo?: boolean
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
  accepted: string[]
  solution: string
  inputDir: 'ltr' | 'rtl'
  wordId?: string
  translation?: string
  passage?: Passage
}

type Q = McqQ | WriteQ

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

  const wordQ = (kind: Exclude<Mode, 'mixed' | 'clozeMcq' | 'clozeWrite' | 'text'>) =>
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
  const answered = q.kind === 'mcq' ? chosenIdx !== null : writtenResult !== null

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

  const next = () => {
    setChosenIdx(null)
    setWritten('')
    setWrittenResult(null)
    setShowTranslation(false)
    setIndex((i) => i + 1)
  }

  const wasCorrect =
    q.kind === 'mcq' ? chosenIdx === q.answerIdx : writtenResult === true
  const solutionText = q.kind === 'mcq' ? q.options[q.answerIdx] : q.solution

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
        ) : (
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
