import { useEffect, useState } from 'react'
import type { Strings } from '../i18n'
import { loadMemory, updateMemory, type Memory } from '../lib/memory'

/** Settings: see and fix what Ana remembers — her name and the facts. */
export default function MemoryPanel({ s }: { s: Strings }) {
  const [memory, setMemory] = useState<Memory | null>(null)
  const [name, setName] = useState('')
  const [newFact, setNewFact] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void loadMemory().then((m) => {
      setMemory(m)
      setName(m.name)
    })
  }, [])

  const change = async (fn: (m: Memory) => Memory) => {
    setBusy(true)
    const next = await updateMemory(fn)
    setMemory(next)
    setBusy(false)
    return next
  }

  if (!memory) return null

  return (
    <section className="settings-section memory-panel">
      <h3>🧠 {s.memoryTitle}</h3>
      <label className="settings-help" htmlFor="memory-name">
        {s.memoryName}
      </label>
      <div className="memory-row">
        <input
          id="memory-name"
          className="settings-input"
          value={name}
          maxLength={40}
          placeholder={s.memoryNamePlaceholder}
          onChange={(e) => {
            setName(e.target.value)
            setSaved(false)
          }}
        />
        <button
          className="btn listen"
          disabled={busy || name.trim() === memory.name}
          onClick={async () => {
            const n = name.trim()
            await change((m) => ({ ...m, name: n }))
            setSaved(true)
          }}
        >
          {s.memorySave}
        </button>
      </div>
      {saved && <p className="done-note">{s.memorySaved}</p>}

      <p className="settings-help">{s.memoryFactsHelp}</p>
      {memory.facts.length === 0 ? (
        <p className="settings-help">{s.memoryEmpty}</p>
      ) : (
        <ul className="memory-facts">
          {memory.facts.map((f) => (
            <li key={f} dir="ltr">
              <span>{f}</span>
              <button
                className="memory-delete"
                aria-label={s.memoryDelete}
                title={s.memoryDelete}
                disabled={busy}
                onClick={() => void change((m) => ({ ...m, facts: m.facts.filter((x) => x !== f) }))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="memory-row">
        <input
          className="settings-input"
          dir="ltr"
          value={newFact}
          maxLength={200}
          placeholder={s.memoryAddPlaceholder}
          onChange={(e) => setNewFact(e.target.value)}
        />
        <button
          className="btn subtle"
          disabled={busy || !newFact.trim()}
          onClick={async () => {
            const f = newFact.trim()
            await change((m) => (m.facts.includes(f) ? m : { ...m, facts: [...m.facts, f] }))
            setNewFact('')
          }}
        >
          {s.memoryAdd}
        </button>
      </div>
    </section>
  )
}
