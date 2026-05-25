import type { Adset, Ad } from '@/lib/supabase'

interface Props {
  adsets: Adset[]
  adsByAdset: Record<string, Ad[]>
  campaignMap: Record<string, string>
  breakeven: number
}

function trophy(idx: number, roas: number | null) {
  if (idx === 0 && roas && roas >= 4) return '🏆'
  if (!roas || roas < 2) return '⚠️'
  return ''
}

export default function CreativeRanking({ adsets, adsByAdset, campaignMap, breakeven }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {adsets.map(adset => {
        const ads = (adsByAdset[adset.id] || [])
          .filter(a => a.spend && a.spend > 100)
          .sort((a, b) => (b.spend || 0) - (a.spend || 0))

        if (ads.length === 0) return null

        return (
          <div key={adset.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-800">{adset.name}</p>
              <p className="text-xs text-gray-400">{campaignMap[adset.campaign_id] || '—'} · {ads.length} creativos</p>
            </div>

            {/* Creative rows */}
            <div className="divide-y divide-gray-50">
              {ads.map((ad, idx) => {
                const trophyIcon = trophy(idx, ad.roas)
                const isWinner = idx === 0 && (ad.roas || 0) >= 4
                return (
                  <div
                    key={ad.id}
                    className={`px-4 py-2.5 flex items-center justify-between gap-3 ${
                      isWinner ? 'bg-green-50/50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-sm">{trophyIcon || <span className="w-4 inline-block"></span>}</span>
                      <div className="min-w-0">
                        <p className={`text-sm truncate ${isWinner ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                          {ad.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {ad.spend ? `$${Math.round(ad.spend).toLocaleString('es-AR')}` : '—'} gastado
                          {ad.ctr ? ` · CTR ${ad.ctr.toFixed(2)}%` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {ad.results !== null && ad.results !== undefined ? (
                        <>
                          <p className={`text-sm font-semibold ${
                            ad.roas && ad.roas >= 5 ? 'text-green-700' :
                            ad.roas && ad.roas >= 3 ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {ad.roas ? `${ad.roas}x` : '—'}
                          </p>
                          <p className="text-xs text-gray-400">{ad.results}c</p>
                        </>
                      ) : (
                        <p className="text-xs text-gray-400">sin conv.</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
