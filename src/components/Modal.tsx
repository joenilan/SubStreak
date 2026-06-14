import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** Hide the close (X) button when the flow shouldn't be dismissed by the corner. */
  dismissible?: boolean
}

/** Lightweight metro modal: dimmed backdrop, centered card, Esc / backdrop to close. */
export function Modal({ title, onClose, children, dismissible = true }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, dismissible])

  return (
    <div className="modal-backdrop" onClick={() => dismissible && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <span className="modal__title">{title}</span>
          {dismissible && (
            <button className="modal__close" aria-label="Close" onClick={onClose}>
              <X size={15} />
            </button>
          )}
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  )
}
