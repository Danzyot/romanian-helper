import { useMemo, useState } from 'react'
import { dictionary, type Entry } from '../data/dictionary'
import type { Lang, Strings } from '../i18n'
import { pickWords, recordQuiz } from '../lib/progress'
import { speakRomanian } from '../speak'

interface Props {
  lang: Lang
  s: Strings
}

type Kind = 'ro-to-meaning' | 'meaning-to-ro' | 'listen'

interface Question {
  kind: Kind
  target: Entry
  options: Entry[]
}

const QUESTIONS = 10

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

function makeQuiz(): Question[] {
  const kinds: Kind[] = ['ro-to-meaning', 'meaning-to-ro', 'listen']
  return shuffle(pickWords(QUESTIONS)).map((target, i) => ({
    kind: kinds[i % kinds.length],
    target,
    options: shuffle([target, ...distractors(target, 3)]),
  }))
}

export default function Quiz({ lang, s }: Props) {
  const [quiz, setQuiz] = useState<Question[] | null>(null)
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState<string | null>(null)
  const [correctCount, setCorrectCount] = useState(0)

  const meaning = (w: Entry) => (lang === 'he' ? w.he : w.en)

  const start = () => {
    setQuiz(makeQuiz())
    setIndex(0)
    setChosen(null)
    setCorrectCount(0)
  }

  const question = quiz?.[index]
  const finished = quiz !== null && index >= quiz.length

  const prompt = useMemo(() => {
    if (!question) return ''
    if (question.kind === 'ro-to-meaning') return s.quizWhatMeans(question.target.ro)
    if (question.kind === 'meaning-to-ro')
      return s.quizWhichWord(meaning(question.target))
    return s.quizListenPick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, lang])

  if (!quiz || finished) {
    return (
      <div className="card quiz-cover">
        {finished ? (
          <>
            <h2>{s.quizDoneTitle}</h2>
            <p className="quiz-score">{s.quizScore(correctCount, quiz!.length)}</p>
            <button className="btn record" onClick={start}>
              {s.quizAgain}
            </button>
          </>
        ) : (
          <>
            <h2>{s.quizTitle}</h2>
            <p className="quiz-intro">{s.quizIntro}</p>
            <button className="btn record" onClick={start}>
              ✏️ {s.quizStart}
            </button>
          </>
        )}
      </div>
    )
  }

  const q = question!
  const answered = chosen !== null

  const optionLabel = (w: Entry) =>
    q.kind === 'meaning-to-ro' || q.kind === 'listen' ? w.ro : meaning(w)

  const pick = (w: Entry) => {
    if (answered) return
    const ok = w.id === q.target.id
    setChosen(w.id)
    if (ok) setCorrectCount((c) => c + 1)
    recordQuiz(q.target.id, ok)
  }

  return (
    <div className="quiz">
      <p className="quiz-counter">
        {index + 1} / {quiz.length}
      </p>
      <div className="card">
        <p className="quiz-prompt" lang={q.kind === 'ro-to-meaning' ? 'ro' : undefined}>
          {prompt}
        </p>
        {q.kind === 'listen' && (
          <button
            className="btn listen quiz-play"
            onClick={() => speakRomanian(q.target.ro)}
          >
            🔊 {s.quizPlay}
          </button>
        )}
        <div className="quiz-options">
          {q.options.map((w) => {
            let cls = 'btn option'
            if (answered) {
              if (w.id === q.target.id) cls += ' right'
              else if (w.id === chosen) cls += ' wrong'
              else cls += ' muted'
            }
            return (
              <button key={w.id} className={cls} onClick={() => pick(w)}>
                {optionLabel(w)}
              </button>
            )
          })}
        </div>
        {answered && (
          <>
            <p className={chosen === q.target.id ? 'done-note' : 'error'}>
              {chosen === q.target.id
                ? s.quizCorrect
                : s.quizWrong(optionLabel(q.target))}
            </p>
            <button
              className="btn record"
              onClick={() => {
                setChosen(null)
                setIndex((i) => i + 1)
              }}
            >
              {s.quizNext}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
