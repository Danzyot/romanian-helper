import { useCallback, useEffect, useRef, useState } from 'react'

export type RecorderStatus = 'idle' | 'recording' | 'recorded'
export type RecorderError = 'denied' | 'failed' | null

function pickMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return candidates.find((m) => MediaRecorder.isTypeSupported(m))
}

export function useRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [error, setError] = useState<RecorderError>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Revoke each object URL when it is replaced (or on unmount).
  useEffect(() => {
    if (!audioUrl) return
    return () => URL.revokeObjectURL(audioUrl)
  }, [audioUrl])

  useEffect(() => {
    return () => {
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const start = useCallback(async () => {
    setError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'denied'
          : 'failed',
      )
      return
    }
    try {
      const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() })
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        setStatus('recorded')
      }
      recorderRef.current = recorder
      recorder.start()
      setStatus('recording')
    } catch {
      stream.getTracks().forEach((t) => t.stop())
      setError('failed')
    }
  }, [])

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }
  }, [])

  const reset = useCallback(() => {
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop())
    setAudioUrl(null)
    setAudioBlob(null)
    setStatus('idle')
    setError(null)
  }, [])

  return { status, error, audioUrl, audioBlob, start, stop, reset }
}
