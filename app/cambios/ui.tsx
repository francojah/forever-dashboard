'use client'
/* Piezas visuales compartidas del portal público. Sin APIs modernas raras: compatible con navegadores in-app. */
import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`bg-white rounded-xl border border-zinc-200 p-4 sm:p-5 ${className}`}>{children}</section>
}

export function Btn({ children, onClick, disabled, variant = 'dark', type = 'button', className = '' }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: 'dark' | 'light'; type?: 'button' | 'submit'; className?: string
}) {
  const base = 'w-full h-12 rounded-lg text-[15px] font-medium transition disabled:opacity-40'
  const v = variant === 'dark' ? 'bg-zinc-900 text-white active:bg-zinc-700' : 'bg-white border border-zinc-300 text-zinc-900 active:bg-zinc-100'
  return <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${v} ${className}`}>{children}</button>
}

export const inputCls = 'w-full h-12 rounded-lg border border-zinc-300 bg-white px-3 text-[16px] outline-none focus:border-zinc-900'
export const selectCls = 'w-full h-11 rounded-lg border border-zinc-300 bg-white px-2 text-[15px] outline-none focus:border-zinc-900'

export function money(n: number | null | undefined) {
  if (n == null) return 'a confirmar'
  return '$' + Math.round(n).toLocaleString('es-AR')
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm p-3">{children}</div>
}

export function waLink(phone: string, text?: string) {
  return `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

/** Próximo lunes (estrictamente después de hoy) en formato "lunes 6/10". */
export function nextMondayLabel(from: Date = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const add = ((8 - d.getDay()) % 7) || 7
  d.setDate(d.getDate() + add)
  return `lunes ${d.getDate()}/${d.getMonth() + 1}`
}
