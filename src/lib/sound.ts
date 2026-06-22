// Tiny Web Audio chime for the goal-hit celebration — no bundled audio asset.

let ctx: AudioContext | null = null

/** Play a short major-triad arpeggio. Safe to call from a user-driven event. */
export function playChime() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctx = ctx ?? new Ctor()
    void ctx.resume()
    const now = ctx.currentTime
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      const t = now + i * 0.1
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.22, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(t)
      osc.stop(t + 0.55)
    })
  } catch {
    /* audio not available — ignore */
  }
}
