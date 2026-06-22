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
import { useStreakNudge } from './hooks/useStreakNudge'
import { GoalView } from './views/GoalView'
import { OverlayView } from './views/OverlayView'
import { SettingsView } from './views/SettingsView'
import { UpdateStatus } from './components/UpdateStatus'
import { CelebrationBanner } from './components/CelebrationBanner'

type View = 'goal' | 'overlay' | 'settings'

export function App() {
  const config = useSubStreakStore((s) => s.config)
  const streak = useSubStreakStore((s) => s.streak)
  const tick = useSubStreakStore((s) => s.tick)

  const auth = useTwitchAuth()
  useEventSub()
  const overlayUrls = useOverlaySync()
  useStreakNudge()
  const twitchConnected = useTwitchStore((s) => s.status === 'connected')

  const [activeView, setActiveView] = useState<View>('goal')
  // Remember where we came from so the gear can toggle back out of settings.
  const [prevView, setPrevView] = useState<'goal' | 'overlay'>('goal')
  useViewWindowSize(activeView)

  const openSettings = () => {
    if (activeView !== 'settings') setPrevView(activeView)
    setActiveView('settings')
  }
  const leaveSettings = () => setActiveView(prevView)
  const goToView = (v: 'goal' | 'overlay') => {
    setPrevView(v)
    setActiveView(v)
  }

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
          <button className={activeView === 'goal' ? 'on' : ''} onClick={() => goToView('goal')}>Goal</button>
          <button className={activeView === 'overlay' ? 'on' : ''} onClick={() => goToView('overlay')}>Overlay</button>
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
          {activeView === 'goal' ? (
            <GoalView auth={auth} onOpenSettings={openSettings} />
          ) : activeView === 'overlay' ? (
            <OverlayView {...overlayUrls} />
          ) : (
            <SettingsView onBack={leaveSettings} />
          )}
        </div>
      </main>

      <footer className="statusbar">
        <UpdateStatus />
        <span>Runs in the system tray</span>
      </footer>

      <CelebrationBanner />
    </div>
  )
}
