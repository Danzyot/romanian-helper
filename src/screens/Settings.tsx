import { useEffect, useState } from 'react'
import type { Strings } from '../i18n'
import { LEVELS, resetProgress, type Level } from '../lib/progress'
import { getSettings, updateSettings, type Settings as S } from '../lib/settings'
import {
  currentUserEmail,
  fullSync,
  getSyncStatus,
  onSyncStatus,
  sendLoginLink,
  signOut,
  type SyncStatus,
} from '../lib/sync'

interface Props {
  s: Strings
  onClose: () => void
  onChanged: () => void
}

export default function Settings({ s, onClose, onChanged }: Props) {
  const [settings, setSettings] = useState<S>(getSettings)
  const [email, setEmail] = useState('')
  const [linkSent, setLinkSent] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [signedInAs, setSignedInAs] = useState<string | null>(currentUserEmail())
  const [sync, setSync] = useState<SyncStatus>(getSyncStatus())
  const [confirmReset, setConfirmReset] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    onSyncStatus((st) => {
      setSync(st)
      setSignedInAs(currentUserEmail())
    })
  }, [])

  const apply = (patch: Partial<S>) => {
    setSettings(updateSettings(patch))
    onChanged()
  }

  const syncLabel = {
    off: s.syncStateOff,
    syncing: s.syncStateSyncing,
    ok: s.syncStateOk,
    error: s.syncStateError,
  }[sync]

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true">
      <div className="settings-panel">
        <div className="settings-head">
          <h2>⚙️ {s.settings}</h2>
          <button className="btn subtle" onClick={onClose}>
            {s.close}
          </button>
        </div>

        {/* level */}
        <section className="settings-section">
          <h3>{s.settingsLevel}</h3>
          <div className="level-options">
            <button
              className={settings.levelMode === 'auto' ? 'chip on' : 'chip'}
              onClick={() => apply({ levelMode: 'auto' })}
            >
              {s.settingsLevelAuto}
            </button>
            {LEVELS.map((lvl: Level) => (
              <button
                key={lvl}
                className={settings.levelMode === lvl ? 'chip on' : 'chip'}
                onClick={() => apply({ levelMode: lvl })}
              >
                {lvl}
              </button>
            ))}
          </div>
          <p className="settings-help">{s.settingsLevelHelp}</p>
        </section>

        {/* quiz length */}
        <section className="settings-section">
          <h3>{s.settingsQuizLength}</h3>
          <div className="level-options">
            {[5, 10, 15, 20].map((n) => (
              <button
                key={n}
                className={settings.quizLength === n ? 'chip on' : 'chip'}
                onClick={() => apply({ quizLength: n })}
              >
                {n}
              </button>
            ))}
          </div>
        </section>

        {/* account & sync */}
        <section className="settings-section">
          <h3>{s.settingsAccount}</h3>
          {signedInAs ? (
            <>
              <p className="settings-help">{s.accountSignedIn(signedInAs)}</p>
              <p className={sync === 'error' ? 'error' : 'settings-help'}>{syncLabel}</p>
              <div className="write-buttons">
                <button
                  className="btn listen"
                  disabled={busy}
                  onClick={() => void fullSync()}
                >
                  {s.accountSyncNow}
                </button>
                <button
                  className="btn subtle"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    await signOut()
                    setSignedInAs(null)
                    setBusy(false)
                  }}
                >
                  {s.accountSignOut}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="settings-help">{s.accountSignedOut}</p>
              <input
                className="settings-input"
                type="email"
                dir="ltr"
                placeholder={s.accountEmail}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {authError && <p className="error">{authError}</p>}
              {linkSent && <p className="done-note">{s.accountLinkSent}</p>}
              <button
                className="btn listen"
                disabled={busy || !email.includes('@')}
                onClick={async () => {
                  setBusy(true)
                  setAuthError(null)
                  const err = await sendLoginLink(email.trim())
                  if (err) setAuthError(err)
                  else setLinkSent(true)
                  setBusy(false)
                }}
              >
                {s.accountSendCode}
              </button>
            </>
          )}
        </section>

        {/* reset */}
        <section className="settings-section">
          <h3>{s.dangerZone}</h3>
          {confirmReset ? (
            <>
              <p className="error">{s.resetConfirm}</p>
              <div className="write-buttons">
                <button
                  className="btn record"
                  onClick={() => {
                    resetProgress()
                    setConfirmReset(false)
                    onChanged()
                  }}
                >
                  {s.confirm}
                </button>
                <button className="btn subtle" onClick={() => setConfirmReset(false)}>
                  {s.cancel}
                </button>
              </div>
            </>
          ) : (
            <button className="btn subtle danger" onClick={() => setConfirmReset(true)}>
              {s.resetProgress}
            </button>
          )}
        </section>
      </div>
    </div>
  )
}
