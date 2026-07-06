import { useMemo } from 'react'
import type { Strings } from '../i18n'
import { summary } from '../lib/progress'

interface Props {
  s: Strings
}

export default function Progress({ s }: Props) {
  const sum = useMemo(() => summary(), [])
  const empty = sum.practiced === 0

  return (
    <div className="progress">
      <div className="card">
        <h2>{s.progressTitle}</h2>
        <div className="level-badge">{sum.level}</div>
        <div className="level-bar">
          <div
            className="level-bar-fill"
            style={{ width: `${Math.round(sum.levelProgress * 100)}%` }}
          />
        </div>
        <p className="level-note">
          {Math.round(sum.levelProgress * 100)}% {s.toNextLevel}
        </p>

        {empty ? (
          <p className="quiz-intro">{s.progressEmpty}</p>
        ) : (
          <div className="stat-grid">
            <div className="stat">
              <b>{sum.practiced}</b>
              <span>{s.statPracticed}</span>
            </div>
            <div className="stat">
              <b>{sum.mastered}</b>
              <span>{s.statMastered}</span>
            </div>
            <div className="stat">
              <b>{sum.streak}</b>
              <span>{s.statStreak}</span>
            </div>
            <div className="stat">
              <b>{sum.accuracy === null ? '—' : `${Math.round(sum.accuracy * 100)}%`}</b>
              <span>{s.statAccuracy}</span>
            </div>
          </div>
        )}
        <p className="progress-hint">{s.progressHint}</p>
      </div>
    </div>
  )
}
