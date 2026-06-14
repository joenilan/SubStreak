import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { copyText } from '../lib/platform/open'

/** Icon copy button with brief "copied" feedback. */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    if (await copyText(text)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    }
  }
  return (
    <button
      className="iconbtn"
      onClick={() => void onCopy()}
      aria-label={label ?? 'Copy'}
      title={copied ? 'Copied' : (label ?? 'Copy')}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  )
}
