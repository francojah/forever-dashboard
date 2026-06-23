'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  content: string
  children: React.ReactNode
  maxWidth?: number
  /** 'top' (default) | 'bottom' — preferred side */
  placement?: 'top' | 'bottom'
}

/**
 * Tooltip que se renderiza en document.body via portal, usando position:fixed.
 * Nunca se corta por overflow:hidden de los contenedores padres.
 */
export function Tooltip({ content, children, maxWidth = 240, placement = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords]   = useState({ x: 0, y: 0, flip: false })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const show = useCallback(() => {
    if (!triggerRef.current) return
    const r    = triggerRef.current.getBoundingClientRect()
    const mid  = r.left + r.width / 2
    // Flip to bottom if not enough space above (need ~80px)
    const flip = placement === 'top' && r.top < 90
    setCoords({ x: mid, y: flip ? r.bottom : r.top, flip })
    setVisible(true)
  }, [placement])

  const hide = useCallback(() => setVisible(false), [])

  return (
    <>
      <span ref={triggerRef} onMouseEnter={show} onMouseLeave={hide} className="inline-flex">
        {children}
      </span>

      {mounted && visible && content && createPortal(
        <div
          role="tooltip"
          style={{
            position:   'fixed',
            left:       coords.x,
            top:        coords.flip ? coords.y + 8 : coords.y - 8,
            transform:  coords.flip
              ? 'translate(-50%, 0)'
              : 'translate(-50%, -100%)',
            maxWidth,
            zIndex: 9999,
            pointerEvents: 'none',
          }}
          className="bg-gray-900 dark:bg-zinc-700 text-white text-[11px] leading-snug rounded-lg px-3 py-2 shadow-xl border border-zinc-700 dark:border-zinc-600"
        >
          {content}
          {/* Arrow */}
          <span
            style={{ left: '50%', transform: 'translateX(-50%)' }}
            className={`absolute border-4 border-transparent ${
              coords.flip
                ? 'bottom-full border-b-gray-900 dark:border-b-zinc-700'
                : 'top-full border-t-gray-900 dark:border-t-zinc-700'
            }`}
          />
        </div>,
        document.body,
      )}
    </>
  )
}
