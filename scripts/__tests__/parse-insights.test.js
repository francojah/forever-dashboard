import { describe, it, expect } from 'vitest'
import { parseInsights, findAction, formatNumber } from '../lib/parse-insights.js'

// Simula la forma real de la respuesta de Meta Ads API
function entity(insights) {
  return { insights: { data: [insights] } }
}

describe('parseInsights', () => {
  it('parsea un adset de conversión completo', () => {
    const r = parseInsights(
      entity({
        spend: '45000.50',
        impressions: '120000',
        clicks: '3000',
        ctr: '2.5',
        frequency: '1.8',
        actions: [
          { action_type: 'omni_purchase', value: '15' },
          { action_type: 'link_click', value: '3000' },
        ],
        purchase_roas: [{ action_type: 'omni_purchase', value: '4.2' }],
        video_play_actions: [{ action_type: 'video_view', value: '60000' }],
        video_p50_watched_actions: [{ action_type: 'video_view', value: '24000' }],
      })
    )
    expect(r.spend).toBe(45000.5)
    expect(r.results).toBe(15)
    expect(r.roas).toBe(4.2)
    expect(r.impressions).toBe(120000)
    expect(r.clicks).toBe(3000)
    // CPA = 45000.50 / 15 = 3000.03
    expect(r.cost_per_result).toBeCloseTo(3000.03, 2)
    // hook rate = 60000 / 120000 * 100 = 50.0
    expect(r.hook_rate).toBe(50)
    // view rate = 24000 / 120000 * 100 = 20.0
    expect(r.view_rate).toBe(20)
  })

  it('devuelve null en métricas sin datos (entidad sin insights)', () => {
    const r = parseInsights({})
    expect(r.spend).toBeNull()
    expect(r.results).toBeNull()
    expect(r.roas).toBeNull()
    expect(r.cost_per_result).toBeNull()
    expect(r.impressions).toBe(0)
    expect(r.hook_rate).toBeNull()
  })

  it('no calcula CPA si no hay compras', () => {
    const r = parseInsights(entity({ spend: '10000', impressions: '5000', actions: [] }))
    expect(r.cost_per_result).toBeNull()
    expect(r.results).toBeNull()
  })

  it('reconoce distintos action_types de compra', () => {
    for (const t of ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']) {
      const r = parseInsights(entity({ spend: '1000', actions: [{ action_type: t, value: '2' }] }))
      expect(r.results).toBe(2)
    }
  })

  it('ignora action_types desconocidos (protege ante cambios de Meta)', () => {
    const r = parseInsights(entity({ spend: '1000', actions: [{ action_type: 'some_new_type', value: '99' }] }))
    expect(r.results).toBeNull()
  })

  it('no divide por cero en hook/view rate sin impresiones', () => {
    const r = parseInsights(entity({ video_play_actions: [{ action_type: 'video_view', value: '100' }] }))
    expect(r.hook_rate).toBeNull()
  })
})

describe('helpers', () => {
  it('formatNumber convierte strings y maneja NaN', () => {
    expect(formatNumber('12.5')).toBe(12.5)
    expect(formatNumber('abc')).toBeNull()
    expect(formatNumber(undefined)).toBeNull()
  })

  it('findAction encuentra el primer match', () => {
    const arr = [{ action_type: 'a', value: '1' }, { action_type: 'b', value: '2' }]
    expect(findAction(arr, ['b'])).toBe(2)
    expect(findAction(arr, ['z'])).toBeNull()
    expect(findAction(null, ['a'])).toBeNull()
  })
})
