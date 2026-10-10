import { redirect } from 'next/navigation'
import { getRequestContext, NeedsMigrationError } from '@/lib/faro/context'
import Shell from '@/components/faro/Shell'
import { metaHistoryDone } from '@/lib/faro/meta'
import type { SourceStatus } from '@/components/faro/SyncStatus'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let ctx
  try {
    ctx = await getRequestContext()
  } catch (e) {
    if (e instanceof NeedsMigrationError) {
      return (
        <div className="faro font-faro min-h-screen bg-bg text-ink grid place-items-center p-6">
          <div className="max-w-md">
            <h1 className="text-xl font-semibold mb-2">Falta preparar la base de datos</h1>
            <p className="text-mute">Corré el archivo <code>supabase/migrations/20261009_faro_v2.sql</code> en Supabase → SQL Editor y recargá esta página.</p>
          </div>
        </div>
      )
    }
    throw e
  }
  if (!ctx) redirect('/login')

  const sources: SourceStatus[] = [
    ...ctx.stores.filter((s) => s.active).map((s) => ({ kind: 'tiendanube' as const, name: s.name, lastSyncedAt: s.last_synced_at, error: s.last_sync_error, backfilling: !s.backfill_done })),
    ...ctx.adAccounts.filter((a) => a.active).map((a) => ({ kind: 'meta' as const, name: a.name, lastSyncedAt: a.last_synced_at, error: a.last_sync_error, backfilling: !metaHistoryDone(a) })),
  ]

  return (
    <Shell
      userEmail={ctx.user.email}
      workspace={{ id: ctx.workspace.id, name: ctx.workspace.name, modules: ctx.workspace.modules }}
      workspaces={ctx.workspaces}
      sources={sources}
      timezone={ctx.workspace.timezone}
      needsSetup={!ctx.workspace.settings.configured}
    >
      {children}
    </Shell>
  )
}
