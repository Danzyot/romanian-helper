import { useEffect, useState } from 'react'
import { isAdmin, loadConfig, saveConfig, type ConfigKey } from '../lib/admin'

/**
 * Model switcher, rendered only for accounts listed in app_admins.
 * English-only on purpose: this panel is for the app's maintainer.
 */

const CUSTOM = '__custom__'

const FIELDS: {
  key: ConfigKey
  label: string
  help: string
  options: { value: string; label: string }[]
}[] = [
  {
    key: 'realtime_model',
    label: 'Live call model',
    help: 'Used by "Call Ana". Mini costs about a third of the full model.',
    options: [
      { value: '', label: 'Default (gpt-realtime-mini)' },
      { value: 'gpt-realtime-mini', label: 'gpt-realtime-mini: cheaper, ~$0.02–0.05/min' },
      { value: 'gpt-realtime', label: 'gpt-realtime: best voice, ~$0.06–0.11/min' },
    ],
  },
  {
    key: 'realtime_voice',
    label: 'Live call voice',
    help: 'Ana’s voice on calls. marin and cedar are the most natural.',
    options: [
      { value: '', label: 'Default (marin)' },
      ...['marin', 'cedar', 'coral', 'sage', 'shimmer', 'alloy', 'ash', 'ballad', 'echo', 'verse'].map(
        (v) => ({ value: v, label: v }),
      ),
    ],
  },
  {
    key: 'gemini_model',
    label: 'Chat & grading model (Gemini)',
    help: 'Used by pronunciation grading and the typed/recorded chat. Falls back automatically if the chosen model fails.',
    options: [
      { value: '', label: 'Default (gemini-flash-latest)' },
      { value: 'gemini-flash-latest', label: 'gemini-flash-latest: fast, cheap' },
      { value: 'gemini-flash-lite-latest', label: 'gemini-flash-lite-latest: fastest, cheapest' },
      { value: 'gemini-pro-latest', label: 'gemini-pro-latest: smartest, slower, pricier' },
    ],
  },
]

export default function AdminPanel() {
  const [admin, setAdmin] = useState(false)
  const [values, setValues] = useState<Partial<Record<ConfigKey, string>>>({})
  const [custom, setCustom] = useState<Partial<Record<ConfigKey, boolean>>>({})
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      if (!(await isAdmin())) return
      const cfg = await loadConfig()
      setValues(cfg)
      const c: Partial<Record<ConfigKey, boolean>> = {}
      for (const f of FIELDS) {
        const v = cfg[f.key]
        if (v && !f.options.some((o) => o.value === v)) c[f.key] = true
      }
      setCustom(c)
      setAdmin(true)
    })()
  }, [])

  if (!admin) return null

  const save = async (key: ConfigKey, value: string) => {
    setValues((v) => ({ ...v, [key]: value }))
    setStatus('Saving…')
    const err = await saveConfig(key, value)
    setStatus(err ? `Could not save: ${err}` : 'Saved ✓ (applies to the next call or turn)')
  }

  return (
    <section className="settings-section admin-section">
      <h3>🔧 Admin: AI models</h3>
      <p className="settings-help">Only your account sees this. Changes apply to everyone immediately, with no redeploy.</p>
      {FIELDS.map((f) => {
        const current = values[f.key] ?? ''
        const isCustom = custom[f.key]
        return (
          <label key={f.key} className="admin-field">
            <span>{f.label}</span>
            <select
              dir="ltr"
              value={isCustom ? CUSTOM : current}
              onChange={(e) => {
                if (e.target.value === CUSTOM) {
                  setCustom((c) => ({ ...c, [f.key]: true }))
                  return
                }
                setCustom((c) => ({ ...c, [f.key]: false }))
                void save(f.key, e.target.value)
              }}
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              <option value={CUSTOM}>Custom model name…</option>
            </select>
            {isCustom && (
              <input
                className="settings-input"
                dir="ltr"
                defaultValue={current}
                placeholder="exact model id, e.g. gpt-realtime-2"
                onBlur={(e) => {
                  if (e.target.value.trim() !== current) void save(f.key, e.target.value)
                }}
              />
            )}
            <small>{f.help}</small>
          </label>
        )
      })}
      {status && <p className="settings-help">{status}</p>}
    </section>
  )
}
