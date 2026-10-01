'use client'
/* Piezas visuales del portal de cambios. Sin APIs modernas raras: compatible con navegadores in-app. */
import type { ReactNode } from 'react'

export const GOLD = '#B8892B'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`bg-white rounded-2xl border border-[#E6E6E3] p-4 sm:p-5 ${className}`}>{children}</section>
}

export function Btn({ children, onClick, disabled, variant = 'dark', type = 'button', className = '' }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: 'dark' | 'light' | 'gold'; type?: 'button' | 'submit'; className?: string
}) {
  const base = 'w-full h-[52px] rounded-xl text-[15px] font-semibold tracking-wide transition-colors disabled:opacity-35 disabled:cursor-not-allowed'
  const v =
    variant === 'dark' ? 'bg-black text-white active:bg-neutral-800'
    : variant === 'gold' ? 'bg-[#B8892B] text-white active:bg-[#9C7322]'
    : 'bg-transparent border border-[#D9D9D6] text-black active:bg-neutral-100'
  return <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${v} ${className}`}>{children}</button>
}

export const inputCls =
  'w-full h-[52px] rounded-xl border border-[#D9D9D6] bg-white px-4 text-[16px] outline-none transition-colors focus:border-black placeholder:text-neutral-400'
export const selectCls =
  'w-full h-12 rounded-xl border border-[#D9D9D6] bg-white px-3 text-[15px] outline-none focus:border-black'

export function Chip({ children, selected, disabled, onClick, sub }: {
  children: ReactNode; selected?: boolean; disabled?: boolean; onClick?: () => void; sub?: string
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`min-w-[52px] px-3 py-2 rounded-xl border text-[14px] leading-tight text-center transition-colors
        ${selected ? 'bg-black text-white border-black' : 'bg-white text-black border-[#D9D9D6]'}
        ${disabled ? 'opacity-35 line-through cursor-not-allowed' : ''}`}>
      <span className="block font-medium">{children}</span>
      {sub && <span className={`block text-[11px] mt-0.5 ${selected ? 'text-[#E9C77A]' : 'text-[#8B6914]'}`}>{sub}</span>}
    </button>
  )
}

export function money(n: number | null | undefined) {
  if (n == null) return 'a confirmar'
  return '$' + Math.round(n).toLocaleString('es-AR')
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return <div role="alert" className="rounded-xl bg-[#FDF2F2] border border-[#F3C9C9] text-[#8A1C1C] text-sm p-3">{children}</div>
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

/** Separa "Negro / M" en color y talle (el orden varía según el producto). */
const SIZE_RE = /^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|\d{1,2}|U|Único|Unico)$/i
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL']
export function splitLabel(label: string): { color: string; size: string } {
  const parts = label.split('/').map((s) => s.trim()).filter(Boolean)
  const size = parts.find((p) => SIZE_RE.test(p)) || ''
  const color = parts.filter((p) => p !== size).join(' / ')
  return { color, size }
}
export function sortSizes(a: string, b: string) {
  const ia = SIZE_ORDER.indexOf(a.toUpperCase())
  const ib = SIZE_ORDER.indexOf(b.toUpperCase())
  if (ia === -1 && ib === -1) return a.localeCompare(b, 'es', { numeric: true })
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
}
