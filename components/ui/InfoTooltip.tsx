'use client'

interface InfoTooltipProps {
  text: string
}

export function InfoTooltip({ text }: InfoTooltipProps) {
  return (
    <span className="relative group inline-flex items-center cursor-help">
      {/* Info circle icon */}
      <svg
        className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 group-hover:text-gray-600 dark:group-hover:text-zinc-300 transition-colors flex-shrink-0"
        viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
      >
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
      </svg>

      {/* Tooltip bubble */}
      <span className="
        pointer-events-none
        absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2
        hidden group-hover:block
        w-56 bg-zinc-900 dark:bg-zinc-800 text-white text-xs leading-relaxed
        rounded-xl px-3 py-2.5 shadow-xl border border-zinc-700
      ">
        {text}
        {/* Arrow */}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900 dark:border-t-zinc-800" />
      </span>
    </span>
  )
}
