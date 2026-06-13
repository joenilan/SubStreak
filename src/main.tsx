import React from 'react'
import ReactDOM from 'react-dom/client'
// Industrial screen typeface, bundled for offline use (not a system font).
import '@fontsource/saira/300.css'
import '@fontsource/saira/400.css'
import '@fontsource/saira/500.css'
import '@fontsource/saira/600.css'
import '@fontsource/saira-condensed/300.css'
import '@fontsource/saira-condensed/500.css'
import { App } from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
