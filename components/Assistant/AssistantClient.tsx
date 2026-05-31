'use client'

import { useState } from 'react'
import type { Snapshot, TNSnapshot } from '@/lib/supabase'
import ChatClient from '@/components/Chat/ChatClient'
import IdeasClient from '@/components/Ideas/IdeasClient'

type Tab = 'chat' | 'ideas'

interface Props {
  snapshot:   Snapshot | null
  tnSnapshot: TNSnapshot | null
}

export default function AssistantClient({ snapshot, tnSnapshot }: Props) {
  const [tab, setTab] = useState<Tab>('chat')

  // suppress tnSnapshot warning — available for future context injection
  void tnSnapshot

  return (
    <div className="max-w-4xl mx-auto">

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">AI Assistant</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">
          Chat con acceso a tus métricas · Ideas de creativos basadas en performance
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-zinc-800 mb-0">
        {([
          ['chat',  'Asistente',         '💬'],
          ['ideas', 'Ideas de Creativos','💡'],
        ] as [Tab, string, string][]).map(([t, label, emoji]) => (
          <button key={t} onClick={() => setTab(t)}
            className={'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ' + (
              tab === t
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
            )}>
            <span>{emoji}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={tab === 'chat' ? '' : 'hidden'}>
        <ChatClient />
      </div>

      <div className={tab === 'ideas' ? 'pt-6' : 'hidden'}>
        <IdeasClient snapshot={snapshot} />
      </div>

    </div>
  )
}
