import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    build_time: new Date().toISOString(),
    commit: '252770a',
    version: '2026-09-20-v3',
  })
}
