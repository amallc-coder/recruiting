import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

export type ToastTone = 'success' | 'error' | 'warning' | 'info'

export interface ToastOptions {
  tone?: ToastTone
  title: string
  description?: string
  /** Auto-dismiss after ms. Pass 0 to make it sticky. Default 4500. */
  duration?: number
}

interface ToastItem extends Required<Omit<ToastOptions, 'description'>> {
  id: string
  description?: string
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

// Dark token text on the light tint + a colored accent bar → AA-safe and on-brand.
const TONE: Record<ToastTone, { wrap: string; accent: string; icon: ReactNode }> = {
  success: { wrap: 'bg-sage-50 ring-sage-100', accent: 'border-sage-500', icon: <CheckCircle2 size={18} className="text-sage-600" /> },
  error: { wrap: 'bg-rust-50 ring-rust-100', accent: 'border-rust-500', icon: <XCircle size={18} className="text-rust-600" /> },
  warning: { wrap: 'bg-clay-50 ring-clay-100', accent: 'border-clay-500', icon: <AlertTriangle size={18} className="text-clay-700" /> },
  info: { wrap: 'bg-brand-50 ring-line', accent: 'border-brand-300', icon: <Info size={18} className="text-muted" /> },
}

let counter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    const timer = timers.current[id]
    if (timer) {
      clearTimeout(timer)
      delete timers.current[id]
    }
  }, [])

  const toast = useCallback(
    (opts: ToastOptions) => {
      const id = `toast-${++counter}`
      const item: ToastItem = { id, tone: opts.tone ?? 'info', title: opts.title, description: opts.description, duration: opts.duration ?? 4500 }
      setToasts((list) => [...list, item])
      if (item.duration > 0) {
        timers.current[id] = setTimeout(() => dismiss(id), item.duration)
      }
      return id
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => {
          const tone = TONE[t.tone]
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border-l-4 px-4 py-3 shadow-card ring-1 ${tone.wrap} ${tone.accent}`}
            >
              <span className="mt-0.5 shrink-0" aria-hidden>
                {tone.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{t.title}</p>
                {t.description && <p className="mt-0.5 text-xs text-muted">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="-mr-1 shrink-0 rounded p-0.5 text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
              >
                <X size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
