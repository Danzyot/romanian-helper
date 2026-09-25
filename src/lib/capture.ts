import { encodeWav16k } from './wav'

/**
 * Keeps the last minute of microphone audio in memory so each thing the
 * learner says during a call can be cut out and sent to the pronunciation
 * checker. The call's speech events mark where an utterance starts and ends;
 * a short pre-roll covers the delay before the start is detected.
 */
export class UtteranceCapture {
  private ctx: AudioContext
  private node: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private chunks: Float32Array[] = []
  private chunkStart: number[] = []
  private total = 0
  private startMark: number | null = null
  private readonly keepSeconds = 60
  private readonly prerollSeconds = 0.6

  /** Create during the tap that starts the call, so audio is allowed to run. */
  constructor(ctx: AudioContext) {
    this.ctx = ctx
  }

  attach(stream: MediaStream): void {
    void this.ctx.resume().catch(() => {})
    this.source = this.ctx.createMediaStreamSource(stream)
    this.node = this.ctx.createScriptProcessor(4096, 1, 1)
    this.node.onaudioprocess = (e) => {
      const data = new Float32Array(e.inputBuffer.getChannelData(0))
      this.chunks.push(data)
      this.chunkStart.push(this.total)
      this.total += data.length
      const keep = this.keepSeconds * this.ctx.sampleRate
      while (this.chunks.length > 1 && this.total - this.chunkStart[1] > keep) {
        this.chunks.shift()
        this.chunkStart.shift()
      }
    }
    // a silent sink keeps the processor running without echoing the mic
    const mute = this.ctx.createGain()
    mute.gain.value = 0
    this.source.connect(this.node)
    this.node.connect(mute)
    mute.connect(this.ctx.destination)
  }

  markStart(): void {
    const preroll = Math.round(this.prerollSeconds * this.ctx.sampleRate)
    this.startMark = Math.max(0, this.total - preroll)
  }

  /** WAV of everything since markStart, or null if it was too short. */
  async cut(minSeconds = 0.5): Promise<Blob | null> {
    const from = this.startMark
    this.startMark = null
    if (from === null) return null
    const to = this.total
    if ((to - from) / this.ctx.sampleRate < minSeconds) return null
    const out = new Float32Array(to - from)
    let written = 0
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i]
      const cStart = this.chunkStart[i]
      const s = Math.max(from, cStart)
      const e = Math.min(to, cStart + c.length)
      if (e > s) {
        out.set(c.subarray(s - cStart, e - cStart), written)
        written += e - s
      }
    }
    if (written === 0) return null
    return encodeWav16k(out.subarray(0, written), this.ctx.sampleRate)
  }

  close(): void {
    this.node?.disconnect()
    this.source?.disconnect()
    void this.ctx.close().catch(() => {})
  }
}
