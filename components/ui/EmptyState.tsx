import type { ReactNode } from 'react'

/**
 * EmptyState — Estado vacío que guía al usuario en vez de mostrar "sin datos".
 * Clave para la primera experiencia de un cliente nuevo.
 */
interface Props {
  icon?: ReactNode
  title: string
  description?: string
  action?: { label: string; href: string }
  tone?: 'neutral' | 'success' | 'warn'
}

export default function EmptyState({ icon, title, description, action, tone = 'neutral' }: Props) {
  const toneCls = {
    neutral: 'text-gray-400 dark:text-zinc-500',
    success: 'text-emerald-500',
    warn: 'text-amber-500',
  }[tone]

  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6">
      <div className={'mb-3 ' + toneCls}>
        {icon || (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" />
            <path d="M18.7 8l-5.1 5.2-2.8-2.8L7 14" />
          </svg>
        )}
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-zinc-200">{title}</p>
      {description && <p className="text-mini text-gray-400 dark:text-zinc-500 mt-1 max-w-xs">{description}</p>}
      {action && (
        <a
          href={action.href}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-xs font-semibold transition"
        >
          {action.label}
        </a>
      )}
    </div>
  )
}
