import { useEffect, useState } from 'react'
import { t, type Lang } from './i18n'
import { hasRomanianVoice } from './speak'
import { summary } from './lib/progress'
import Practice from './screens/Practice'
import Quiz from './screens/Quiz'
import Progress from './screens/Progress'

type Tab = 'practice' | 'quiz' | 'progress'

export default function App() {
  const [lang, setLang] = useState<Lang>(
    () => (localStorage.getItem('romanian-helper:lang') as Lang) || 'en',
  )
  const [tab, setTab] = useState<Tab>('practice')
  const [voiceMissing, setVoiceMissing] = useState(false)

  const s = t(lang)

  useEffect(() => {
    localStorage.setItem('romanian-helper:lang', lang)
  }, [lang])

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

  // level chip refreshes whenever the visible tab changes
  const level = summary().level

  return (
    <div className="app" dir={lang === 'he' ? 'rtl' : 'ltr'}>
      <header className="topbar">
        <h1>{s.appName}</h1>
        <div className="topbar-side">
          <span className="level-chip">
            {s.level} {level}
          </span>
          <button
            className="lang-toggle"
            onClick={() => setLang(lang === 'en' ? 'he' : 'en')}
          >
            {s.switchLang}
          </button>
        </div>
      </header>

      <main className="content" key={tab}>
        {tab === 'practice' && (
          <Practice lang={lang} s={s} voiceMissing={voiceMissing} />
        )}
        {tab === 'quiz' && <Quiz lang={lang} s={s} />}
        {tab === 'progress' && <Progress s={s} />}
      </main>

      <nav className="tabs">
        <button
          className={tab === 'practice' ? 'tab on' : 'tab'}
          onClick={() => setTab('practice')}
        >
          <span aria-hidden>🗣</span>
          {s.tabPractice}
        </button>
        <button
          className={tab === 'quiz' ? 'tab on' : 'tab'}
          onClick={() => setTab('quiz')}
        >
          <span aria-hidden>✏️</span>
          {s.tabQuiz}
        </button>
        <button
          className={tab === 'progress' ? 'tab on' : 'tab'}
          onClick={() => setTab('progress')}
        >
          <span aria-hidden>📈</span>
          {s.tabProgress}
        </button>
      </nav>
    </div>
  )
}
