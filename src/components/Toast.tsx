import { useEffect, useState } from 'react'

interface Props {
  message: string
  onUndo: () => void
  onDismiss: () => void
  duration?: number
}

export default function Toast({ message, onUndo, onDismiss, duration = 10000 }: Props) {
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)
      if (remaining === 0) {
        clearInterval(interval)
        onDismiss()
      }
    }, 100)
    return () => clearInterval(interval)
  }, [duration, onDismiss])

  return (
    <div
      className="fixed bottom-6 left-1/2"
      style={{
        transform: 'translateX(-50%)',
        zIndex: 9999,
        minWidth: 360,
        maxWidth: 480,
        borderRadius: 8,
        backgroundColor: 'var(--color-navy)',
        color: 'var(--color-parchment)',
        boxShadow: '0 4px 20px rgba(26,41,66,0.35)',
        overflow: 'hidden',
      }}
    >
      {/* Progress bar */}
      <div style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.15)' }}>
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            backgroundColor: 'var(--color-gold)',
            transition: 'width 0.1s linear',
          }}
        />
      </div>

      {/* Content */}
      <div className="flex items-center justify-between gap-4" style={{ padding: '14px 18px' }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 16 }}>{message}</span>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onUndo}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--color-gold)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 2px',
            }}
          >
            Undo
          </button>
          <button
            onClick={onDismiss}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 18,
              lineHeight: 1,
              color: 'rgba(244,237,224,0.5)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0 2px',
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}
