import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { batchId, fingerprint } = await req.json()
  const { data: batch } = await supabaseAdmin.from('batches').select('*').eq('id', batchId).single()
  if (!batch) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (batch.pending_until && new Date(batch.pending_until).getTime() < Date.now()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 })
  }
  // inserta voto (idempotente por unique index)
  await supabaseAdmin.from('batch_votes').insert({ batch_id: batchId, client_fingerprint: fingerprint }).catch(()=>{})
  const { count } = await supabaseAdmin.from('batch_votes').select('*', { count: 'exact', head: true }).eq('batch_id', batchId)
  const confirmed = count! >= batch.confirmations_needed
  if (confirmed) {
    await supabaseAdmin.from('batches').update({ confirmations_needed: 0, confirmed_count: count, pending_until: null }).eq('id', batchId)
  } else {
    await supabaseAdmin.from('batches').update({ confirmed_count: count }).eq('id', batchId)
  }
  return NextResponse.json({ confirmed, votes: count })
}