import { useEffect, useState } from 'react'
import { t, type Lang } from './i18n'
import { hasRomanianVoice } from './speak'
import { effectiveLevel } from './lib/progress'
import { getSettings } from './lib/settings'
import Practice from './screens/Practice'
import Quiz from './screens/Quiz'
import Progress from './screens/Progress'
import Settings from './screens/Settings'

type Tab = 'practice' | 'quiz' | 'progress'

export default function App() {
  const [lang, setLang] = useState<Lang>(
    () => (localStorage.getItem('romanian-helper:lang') as Lang) || 'en',
  )
  const [tab, setTab] = useState<Tab>('practice')
  const [showSettings, setShowSettings] = useState(false)
  const [voiceMissing, setVoiceMissing] = useState(false)
  // bump to re-render after settings/progress changes
  const [rev, setRev] = useState(0)

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

  const level = effectiveLevel()
  const manualLevel = getSettings().levelMode !== 'auto'

  return (
    <div className="app" dir={lang === 'he' ? 'rtl' : 'ltr'}>
      <header className="topbar">
        <h1>{s.appName}</h1>
        <div className="topbar-side">
          <span className="level-chip" title={manualLevel ? s.levelManual : undefined}>
            {s.level} {level}
            {manualLevel ? ' ✎' : ''}
          </span>
          <button
            className="lang-toggle"
            onClick={() => setLang(lang === 'en' ? 'he' : 'en')}
          >
            {s.switchLang}
          </button>
          <button
            className="lang-toggle gear"
            aria-label={s.settings}
            onClick={() => setShowSettings(true)}
          >
            ⚙️
          </button>
        </div>
      </header>

      <main className="content" key={`${tab}-${rev}-${lang}`}>
        {tab === 'practice' && (
          <Practice lang={lang} s={s} voiceMissing={voiceMissing} />
        )}
        {tab === 'quiz' && <Quiz lang={lang} s={s} />}
        {tab === 'progress' && <Progress s={s} />}
      </main>

      {showSettings && (
        <Settings
          s={s}
          onClose={() => setShowSettings(false)}
          onChanged={() => setRev((r) => r + 1)}
        />
      )}

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
