import { describe, it, expect } from 'vitest'
import { classifyZone, shippingAmount, checkEligibility } from '../lib/cambios/logic'
import type { TNOrder } from '../lib/cambios/tiendanube'

const base = (o: Partial<TNOrder>): TNOrder => ({
  id: 1, number: 1351, status: 'open', payment_status: 'paid', shipping_status: 'shipped',
  shipped_at: new Date(Date.now() - 3 * 86400000).toISOString(), created_at: new Date().toISOString(),
  contact_email: 'a@b.com', contact_name: 'Ana', contact_phone: null, shipping_option: null,
  shipping_cost_customer: '0', shipping_cost_owner: '0', shipping_address: { province: 'Capital Federal' }, products: [],
  ...o,
})

describe('zona y monto del envío (nombres reales de envío de la tienda)', () => {
  it('Moto CABA → caba $5000', () => {
    const o = base({ shipping_option: 'Moto Express a domicilio CABA', shipping_address: { province: 'Capital Federal' } })
    expect(classifyZone(o)).toBe('caba'); expect(shippingAmount('caba', o)).toBe(5000)
  })
  it('Moto en provincia de Buenos Aires → moto_gba con lo que pagó en la compra', () => {
    const o = base({ shipping_option: 'Moto Express a domicilio', shipping_address: { province: 'Buenos Aires' }, shipping_cost_customer: '8500.00' })
    expect(classifyZone(o)).toBe('moto_gba'); expect(shippingAmount('moto_gba', o)).toBe(8500)
  })
  it('Correo → usa lo que cobró el correo (owner)', () => {
    const o = base({ shipping_option: 'Envío Nube - Correo Argentino Clásico a domicilio', shipping_address: { province: 'Córdoba' }, shipping_cost_owner: '9256.84', shipping_cost_customer: '0' })
    expect(classifyZone(o)).toBe('correo'); expect(shippingAmount('correo', o)).toBe(9257)
  })
  it('Correo con envío gratis y sin costo → a confirmar', () => {
    const o = base({ shipping_option: 'Envío Nube - Correo Argentino Clásico a domicilio', shipping_address: { province: 'Jujuy' } })
    expect(shippingAmount('correo', o)).toBeNull()
  })
  it('Punto de retiro → retiro sin costo', () => {
    const o = base({ shipping_option: 'Punto de retiro', shipping_pickup_type: 'pickup', shipping_cost_customer: '6200.00' })
    expect(classifyZone(o)).toBe('retiro'); expect(shippingAmount('retiro', o)).toBe(0)
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
