import { describe, it, expect } from 'vitest'
import { classifyZone, shippingAmount, checkEligibility, deliveryOptions, recommendedOption } from '../lib/cambios/logic'
import { partidoFromText, motoMatchFromAddress } from '../lib/cambios/motoZones'
import type { TNOrder } from '../lib/cambios/tiendanube'

const base = (o: Partial<TNOrder>): TNOrder => ({
  id: 1, number: 1351, status: 'open', payment_status: 'paid', shipping_status: 'shipped',
  shipped_at: new Date(Date.now() - 3 * 86400000).toISOString(), created_at: new Date().toISOString(),
  contact_email: 'a@b.com', contact_name: 'Ana', contact_phone: null, shipping_option: null,
  shipping_cost_customer: '0', shipping_cost_owner: '0', shipping_address: { province: 'Capital Federal' }, products: [],
  ...o,
})

describe('zona y monto del envío (nombres reales de envío de la tienda)', () => {
  it('Moto CABA → caba, precio moto + $500', () => {
    const o = base({ shipping_option: 'Moto Express a domicilio CABA', shipping_address: { province: 'Capital Federal' } })
    expect(classifyZone(o)).toBe('caba'); expect(shippingAmount('caba', o)).toBe(5490)
  })
  it('Moto GBA → precio de su zona + $500', () => {
    const o = base({ shipping_option: 'Moto Express a domicilio', shipping_address: { province: 'Gran Buenos Aires', city: 'Lanús' }, shipping_cost_customer: '8500.00' })
    expect(classifyZone(o)).toBe('moto_gba'); expect(shippingAmount('moto_gba', o)).toBe(9000)
  })
  it('Moto GBA con partido no reconocido → lo que pagó + $500', () => {
    const o = base({ shipping_option: 'Moto Express a domicilio', shipping_address: { province: 'Buenos Aires', city: 'XYZ' }, shipping_cost_customer: '9900.00' })
    expect(shippingAmount('moto_gba', o)).toBe(10400)
  })
  it('Correo → lo que pagó × 2', () => {
    const o = base({ shipping_option: 'Envío Nube - Correo Argentino Clásico a domicilio', shipping_address: { province: 'Córdoba' }, shipping_cost_owner: '9256.84', shipping_cost_customer: '7593.40' })
    expect(classifyZone(o)).toBe('correo'); expect(shippingAmount('correo', o)).toBe(15187)
  })
  it('Correo con envío gratis → lo que cobró el correo × 2', () => {
    const o = base({ shipping_option: 'Envío Nube - Correo Argentino Clásico a domicilio', shipping_cost_owner: '6000', shipping_cost_customer: '0' })
    expect(shippingAmount('correo', o)).toBe(12000)
  })
  it('Punto de retiro de Envío Nube → correo, lo que pagó × 2', () => {
    const o = base({ shipping_option: 'Punto de retiro', shipping_pickup_type: 'pickup', shipping_carrier_name: 'Envío Nube', shipping_cost_customer: '6200.00' })
    expect(classifyZone(o)).toBe('correo'); expect(shippingAmount('correo', o)).toBe(12400)
  })
})

describe('moto como alternativa al correo', () => {
  it('reconoce partidos y localidades', () => {
    expect(partidoFromText('Monte Grande')).toBe('Esteban Echeverría')
    expect(partidoFromText('Adrogué')).toBe('Almirante Brown')
    expect(partidoFromText('Brown')).toBe('Almirante Brown')
    expect(partidoFromText('Presidente Derqui')).toBe('Pilar')
    expect(partidoFromText('LOMAS DE ZAMORA')).toBe('Lomas de Zamora')
    expect(partidoFromText('Mar del Plata')).toBeNull()
    expect(motoMatchFromAddress({ province: 'Córdoba', city: 'San José' })).toBeNull()
  })
  it('compró por correo y vive en CABA → ofrece moto y es la recomendada', () => {
    const o = base({ shipping_option: 'Envío Nube - Correo Argentino Clásico a domicilio', shipping_address: { province: 'Capital Federal' }, shipping_cost_customer: '5200' })
    const d = deliveryOptions('correo', o)
    expect(d.options.map((x) => [x.kind, x.amount])).toEqual([['correo', 10400], ['moto', 5490]])
    expect(recommendedOption(d.options).kind).toBe('moto')
  })
  it('zona 2 (Lomas): moto $10.400 vs correo × 2', () => {
    const o = base({ shipping_option: 'Punto de retiro', shipping_address: { province: 'Gran Buenos Aires', city: 'Lomas De Zamora' }, shipping_cost_customer: '5600' })
    const d = deliveryOptions('correo', o)
    expect(d.options.find((x) => x.kind === 'moto')?.amount).toBe(10400)
    expect(recommendedOption(d.options).kind).toBe('moto')
  })
  it('zona 3 (La Plata): ofrece las dos, recomienda correo', () => {
    const o = base({ shipping_option: 'Envío Nube - Correo Argentino Clásico a domicilio', shipping_address: { province: 'Buenos Aires', city: 'La Plata' }, shipping_cost_customer: '6700' })
    const d = deliveryOptions('correo', o)
    expect(d.options.find((x) => x.kind === 'moto')?.amount).toBe(25500)
    expect(recommendedOption(d.options).kind).toBe('correo')
  })
  it('partido elegido por el cliente', () => {
    const o = base({ shipping_option: 'Punto de retiro', shipping_address: { province: 'Gran Buenos Aires', city: 'algo raro' }, shipping_cost_customer: '5600' })
    expect(deliveryOptions('correo', o).options).toHaveLength(1)
    expect(deliveryOptions('correo', o, 'San Isidro').options[1].amount).toBe(9000)
    expect(deliveryOptions('correo', o).canPickPartido).toBe(true)
  })
  it('interior → solo correo, sin selector', () => {
    const o = base({ shipping_option: 'Envío Nube - Correo Argentino Clásico a domicilio', shipping_address: { province: 'Córdoba', city: 'Córdoba' }, shipping_cost_customer: '8000' })
    const d = deliveryOptions('correo', o)
    expect(d.options).toHaveLength(1); expect(d.canPickPartido).toBe(false)
  })
})

describe('plazo', () => {
  it('dentro del plazo', () => { expect(checkEligibility(base({}), 'caba').ok).toBe(true) })
  it('fuera del plazo', () => {
    const o = base({ shipped_at: new Date(Date.now() - 20 * 86400000).toISOString() })
    expect(checkEligibility(o, 'caba').ok).toBe(false)
  })
  it('correo tiene margen de tránsito', () => {
    const o = base({ shipped_at: new Date(Date.now() - 15 * 86400000).toISOString() })
    expect(checkEligibility(o, 'correo').ok).toBe(true)
  })
  it('no despachada → no habilita', () => {
    expect(checkEligibility(base({ shipped_at: null, shipping_status: 'unpacked' }), 'caba').ok).toBe(false)
  })
})
