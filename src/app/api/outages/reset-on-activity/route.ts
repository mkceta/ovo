import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { fingerprint } = await req.json()
    
    if (!fingerprint) {
      return NextResponse.json({ error: 'fingerprint_required' }, { status: 400 })
    }

    // Reset any active outage votes for this fingerprint
    const { error } = await supabaseAdmin
      .from('outage_votes')
      .delete()
      .eq('client_fingerprint', fingerprint)
      .eq('is_active', true)

    if (error) {
      console.error('Error resetting outage votes:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message: 'Outage votes reset successfully' })
  } catch (error) {
    console.error('Error in reset-on-activity:', error)
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 })
  }
}