import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes, ReactNode } from 'react'

/** Responsive table shell — horizontal scroll on narrow screens, ringed surface. */
export function Table({
  caption,
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLTableElement> & { caption?: string }) {
  return (
    <div className="w-full overflow-x-auto rounded-xl ring-1 ring-line">
      <table className={`w-full border-collapse text-sm ${className}`} {...rest}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  )
}

export function THead({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <thead className={`bg-brand-50/60 ${className}`}>{children}</thead>
}

export function TBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <tbody className={`divide-y divide-line ${className}`}>{children}</tbody>
}

export function Tr({ children, className = '', ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`transition-colors hover:bg-brand-50/40 ${className}`} {...rest}>
      {children}
    </tr>
  )
}

export function Th({ children, className = '', ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap px-4 py-2.5 text-left font-mono text-[11px] font-medium uppercase tracking-wider text-muted ${className}`}
      {...rest}
    >
      {children}
    </th>
  )
}

export function Td({ children, className = '', ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-4 py-2.5 align-middle text-ink ${className}`} {...rest}>
      {children}
    </td>
  )
}
