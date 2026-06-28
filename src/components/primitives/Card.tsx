import type { HTMLAttributes, ReactNode } from 'react'

/** Surface container using the shared `.card` token (radius, ring, shadow). */
export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className = '',
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-start justify-between gap-3 border-b border-line px-5 py-4 ${className}`}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold tracking-tight text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function CardBody({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`p-5 ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function CardFooter({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`border-t border-line px-5 py-3 ${className}`} {...rest}>
      {children}
    </div>
  )
}
