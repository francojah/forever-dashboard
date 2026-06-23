'use client'

import { Tooltip } from './Tooltip'

interface InfoTooltipProps {
  text: string
  placement?: 'top' | 'bottom'
}

export function InfoTooltip({ text, placement }: InfoTooltipProps) {
  return (
    <Tooltip content={text} maxWidth={224} placement={placement}>
      <span className="inline-flex items-center cursor-help">
        <svg
          className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors flex-shrink-0"
          viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
        >
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
        </svg>
      </span>
    </Tooltip>
  )
}
