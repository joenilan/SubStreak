import { useEffect, useRef, useState } from 'react'
import { PartyPopper } from 'lucide-react'
import { useSubStreakStore } from '../state/useSubStreakStore'
import { playChime } from '../lib/sound'

/**
 * Brief in-app celebration when the goal is hit. Watches the store's transient
 * `celebration` signal (bumped whenever the streak grows) and plays a chime if
 * the sound setting is on.
 */
export function CelebrationBanner() {
  const celebration = useSubStreakStore((s) => s.celebration)
  const soundOn = useSubStreakStore((s) => s.config.celebrateSound ?? true)
  const [shown, setShown] = useState<{ streak: number } | null>(null)
  const lastAt = useRef<number | null>(null)
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn

  useEffect(() => {
    if (!celebration || celebration.at === lastAt.current) return
    lastAt.current = celebration.at
    setShown({ streak: celebration.streak })
    if (soundRef.current) playChime()
    const id = window.setTimeout(() => setShown(null), 4200)
    return () => window.clearTimeout(id)
  }, [celebration])

  if (!shown) return null
  return (
    <div className="celebrate-banner" role="status">
      <PartyPopper size={18} />
      <span>
        Goal hit! <strong>Streak {shown.streak}</strong>
      </span>
    </div>
  )
}
