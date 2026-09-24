import { useEffect, useState } from 'react'
import type { Strings } from '../i18n'
import {
  markFeedbackPrompted,
  recordFeedback,
  shouldPromptFeedback,
} from '../lib/telemetry'

interface Props {
  context: string
  s: Strings
}

/**
 * A one-line "was this helpful? ✓/✗" card. Self-gating: shows at most one
 * prompt per day across the app, and repeats a context at most weekly.
 */
export default function FeedbackPrompt({ context, s }: Props) {
  const [visible] = useState(() => shouldPromptFeedback(context))
  const [answered, setAnswered] = useState(false)

  useEffect(() => {
    if (visible) markFeedbackPrompted(context)
  }, [visible, context])

  if (!visible) return null
  if (answered) return <p className="feedback-thanks">{s.fbThanks}</p>

  const answer = (helpful: boolean) => {
    recordFeedback(context, helpful)
    setAnswered(true)
  }

  return (
    <div className="feedback-box">
      <span>{s.fbQuestion}</span>
      <div className="feedback-buttons">
        <button aria-label="yes" onClick={() => answer(true)}>
          ✓
        </button>
        <button aria-label="no" className="fb-no" onClick={() => answer(false)}>
          ✗
        </button>
      </div>
    </div>
  )
}
