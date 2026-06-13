import { useEffect, useState } from 'react'
import { getDisplay } from './lib/streak/engine'
import { closeWindow, minimizeWindow } from './lib/platform/window'
import { useSubStreakStore } from './state/useSubStreakStore'
import { useTwitchStore } from './state/useTwitchStore'
import { useTwitchAuth } from './hooks/useTwitchAuth'
import { useEventSub } from './hooks/useEventSub'
import { useOverlaySync } from './hooks/useOverlaySync'
import { GoalView } from './views/GoalView'
import { OverlayView } from './views/OverlayView'

type View = 'goal' | 'overlay'

export function App() {
  const config = useSubStreakStore((s) => s.config)
  const streak = useSubStreakStore((s) => s.streak)
  const tick = useSubStreakStore((s) => s.tick)

  const auth = useTwitchAuth()
  useEventSub()
  const { overlayUrl } = useOverlaySync()
  const twitchConnected = useTwitchStore((s) => s.status === 'connected')

  const [activeView, setActiveView] = useState<View>('goal')

  useEffect(() => {
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [tick])

  const view = getDisplay(streak, config)

  return (
    <div className="app">
      <header className="titlebar" data-tauri-drag-region>
        <div className="titlebar__brand" data-tauri-drag-region>
          <span className="titlebar__name">SUBSTREAK</span>
        </div>
        <nav className="tabs">
          <button className={activeView === 'goal' ? 'on' : ''} onClick={() => setActiveView('goal')}>Goal</button>
          <button className={activeView === 'overlay' ? 'on' : ''} onClick={() => setActiveView('overlay')}>Overlay</button>
        </nav>
        <div className="titlebar__status" data-tauri-drag-region>
          <span className={`pip ${view.liveToday ? 'pip--live' : twitchConnected ? 'pip--idle' : ''}`} />
          {view.liveToday ? 'LIVE' : twitchConnected ? 'READY' : 'OFFLINE'}
        </div>
        <div className="titlebar__controls">
          <button className="wbtn" aria-label="Minimize" onClick={() => void minimizeWindow()}>
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0" y="4.5" width="10" height="1" fill="currentColor" /></svg>
          </button>
          <button className="wbtn wbtn--close" aria-label="Close" onClick={() => void closeWindow()}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" strokeWidth="1" /></svg>
          </button>
        </div>
      </header>

      <main className="content">
        {activeView === 'goal' ? <GoalView auth={auth} /> : <OverlayView overlayUrl={overlayUrl} />}
      </main>

      <footer className="statusbar">
        <span>v{__APP_VERSION__}</span>
        <span>Runs in the system tray</span>
      </footer>
    </div>
  )
}
