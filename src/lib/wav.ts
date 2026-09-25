/**
 * Convert a recording (WebM/Opus on Android) to 16 kHz mono 16-bit WAV.
 * OpenAI's audio chat models only accept WAV or MP3; 16 kHz is plenty for
 * speech and keeps a 10-second turn around 320 KB.
 */
export async function toWav16k(blob: Blob): Promise<Blob> {
  const RATE = 16_000
  const ctx = new AudioContext()
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    const frames = Math.max(1, Math.ceil(decoded.duration * RATE))
    const offline = new OfflineAudioContext(1, frames, RATE)
    const src = offline.createBufferSource()
    src.buffer = decoded
    src.connect(offline.destination) // stereo is downmixed to mono here
    src.start()
    const pcm = (await offline.startRendering()).getChannelData(0)

    const view = new DataView(new ArrayBuffer(44 + pcm.length * 2))
    const ascii = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
    }
    ascii(0, 'RIFF')
    view.setUint32(4, 36 + pcm.length * 2, true)
    ascii(8, 'WAVE')
    ascii(12, 'fmt ')
    view.setUint32(16, 16, true) // PCM chunk size
    view.setUint16(20, 1, true) // PCM
    view.setUint16(22, 1, true) // mono
    view.setUint32(24, RATE, true)
    view.setUint32(28, RATE * 2, true) // byte rate
    view.setUint16(32, 2, true) // block align
    view.setUint16(34, 16, true) // bits per sample
    ascii(36, 'data')
    view.setUint32(40, pcm.length * 2, true)
    for (let i = 0; i < pcm.length; i++) {
      const v = Math.max(-1, Math.min(1, pcm[i]))
      view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true)
    }
    return new Blob([view], { type: 'audio/wav' })
  } finally {
    void ctx.close()
  }
}
