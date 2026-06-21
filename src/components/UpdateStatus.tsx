import { useCallback, useEffect, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'

type UpdateState = 'idle' | 'checking' | 'current' | 'available' | 'installing' | 'error'

function isNativeRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function UpdateStatus() {
  const [state, setState] = useState<UpdateState>('idle')
  const [update, setUpdate] = useState<Update | null>(null)
  const [message, setMessage] = useState('Check for updates')

  const checkForUpdate = useCallback(async () => {
    if (!isNativeRuntime()) {
      setState('idle')
      setMessage('Updates available in the desktop app')
      return
    }

    setState('checking')
    setMessage('Checking for updates')
    try {
      const nextUpdate = await check()
      setUpdate(nextUpdate)
      if (nextUpdate) {
        setState('available')
        setMessage(`Update ${nextUpdate.version} available`)
      } else {
        setState('current')
        setMessage('Up to date')
      }
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : 'Update check failed')
    }
  }, [])

  const installUpdate = useCallback(async () => {
    if (!update) {
      await checkForUpdate()
      return
    }

    setState('installing')
    setMessage(`Installing ${update.version}`)
    try {
      await update.downloadAndInstall()
      await relaunch()
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : 'Update install failed')
    }
  }, [checkForUpdate, update])

  useEffect(() => {
    if (!isNativeRuntime()) return
    void checkForUpdate()
  }, [checkForUpdate])

  const busy = state === 'checking' || state === 'installing'
  const buttonTitle = state === 'available' ? message : busy ? message : 'Check for updates'

  return (
    <div className={`update-status update-status--${state}`} title={message}>
      <span>v{__APP_VERSION__}</span>
      <button
        className="update-status__button"
        type="button"
        aria-label={buttonTitle}
        disabled={busy}
        onClick={() => void (state === 'available' ? installUpdate() : checkForUpdate())}
      >
        {state === 'available' ? <Download size={13} /> : <RefreshCw size={13} className={busy ? 'spin' : ''} />}
      </button>
    </div>
  )
}
