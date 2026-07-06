let voices: SpeechSynthesisVoice[] = []

function refreshVoices() {
  voices = window.speechSynthesis?.getVoices() ?? []
}

if ('speechSynthesis' in window) {
  refreshVoices()
  window.speechSynthesis.addEventListener('voiceschanged', refreshVoices)
}

export function romanianVoice(): SpeechSynthesisVoice | undefined {
  if (voices.length === 0) refreshVoices()
  return voices.find((v) => v.lang.toLowerCase().startsWith('ro'))
}

export function hasRomanianVoice(): boolean {
  return romanianVoice() !== undefined
}

export function speakRomanian(text: string, rate = 1): void {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ro-RO'
  utterance.rate = rate
  const voice = romanianVoice()
  if (voice) utterance.voice = voice
  window.speechSynthesis.speak(utterance)
}
