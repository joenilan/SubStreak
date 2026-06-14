import { useEffect, useState } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { getDisplay } from './lib/streak/engine'
import { closeWindow, minimizeWindow, toggleMaximizeWindow } from './lib/platform/window'
import { useViewWindowSize } from './hooks/useViewWindowSize'
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
  useViewWindowSize(activeView)

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
            <Minus size={15} />
          </button>
          <button className="wbtn" aria-label="Maximize" onClick={() => void toggleMaximizeWindow()}>
            <Square size={12} />
          </button>
          <button className="wbtn wbtn--close" aria-label="Close" onClick={() => void closeWindow()}>
            <X size={15} />
          </button>
        </div>
      </header>

      <main className="content">
        <div className="view">
          {activeView === 'goal' ? <GoalView auth={auth} /> : <OverlayView overlayUrl={overlayUrl} />}
        </div>
      </main>

      <footer className="statusbar">
        <span>v{__APP_VERSION__}</span>
        <span>Runs in the system tray</span>
      </footer>
    </div>
  )
}
