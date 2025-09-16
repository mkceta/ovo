import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { fingerprint } = await req.json()
  const ip = req.headers.get('x-forwarded-for') ?? '0.0.0.0'

  // crea batch "pendiente" con necesidad de 2 confirmaciones
  const pendingUntil = new Date(Date.now() + 3 * 60 * 1000).toISOString()
  const { data: batch, error } = await supabaseAdmin
    .from('batches')
    .insert({ started_at: new Date().toISOString(), status: 'active',
              created_by_fingerprint: fingerprint, confirmations_needed: 2, confirmed_count: 1, pending_until: pendingUntil })
    .select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('batch_votes').insert({ batch_id: batch.id, client_fingerprint: fingerprint })

  return NextResponse.json({ batchId: batch.id })
}