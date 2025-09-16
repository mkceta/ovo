import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { fingerprint } = await req.json()
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || '0.0.0.0'
    
    if (!fingerprint) {
      return NextResponse.json({ error: 'fingerprint_required' }, { status: 400 })
    }

    // Check if there are already votes for "outage" (tortilla finished)
    const { data: outageVotes } = await supabaseAdmin
      .from('outage_votes')
      .select('vote_type')
      .eq('is_active', true)
      .eq('vote_type', 'outage')
      .gt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()) // Last 30 minutes

    const outageCount = outageVotes?.length || 0

    // Add the current vote
    const { error: insertError } = await supabaseAdmin
      .from('outage_votes')
      .insert({
        fingerprint: fingerprint,
        ip_address: ip,
        vote_type: 'outage',
        is_active: true
      })

    if (insertError) {
      console.error('Error inserting outage vote:', insertError)
      return NextResponse.json({ error: 'database_error' }, { status: 500 })
    }

    // If this is the 2nd vote, reset everything
    if (outageCount >= 1) { // This vote makes it 2
      // Reset all votes to inactive
      const { error: resetError } = await supabaseAdmin
        .from('outage_votes')
        .update({ is_active: false })
        .eq('is_active', true)

      if (resetError) {
        console.error('Error resetting outage votes:', resetError)
        return NextResponse.json({ error: 'database_error' }, { status: 500 })
      }

      // Clear all ratings from today to reset statistics
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const { error: clearRatingsError } = await supabaseAdmin
        .from('ratings')
        .delete()
        .gte('created_at', today.toISOString())
        .lt('created_at', tomorrow.toISOString())

      if (clearRatingsError) {
        console.error('Error clearing ratings:', clearRatingsError)
        // Don't fail the request if ratings can't be cleared
      }

      // Update availability state to not available and reset votes
      const { error: updateError } = await supabaseAdmin
        .from('availability_state')
        .update({
          is_available: false,
          available_votes: 0,
          unavailable_votes: 0,
          last_updated: new Date().toISOString()
        })
        .eq('id', (await supabaseAdmin.from('availability_state').select('id').single()).data?.id)

      if (updateError) {
        console.error('Error updating availability state:', updateError)
        return NextResponse.json({ error: 'database_error' }, { status: 500 })
      }

      return NextResponse.json({ 
        success: true,
        message: 'Tortilla marcada como agotada (2 votos) - Estado reseteado',
        finished: true
      })
    } else {
      return NextResponse.json({ 
        success: true,
        message: `1 persona dice que se acabó la tortilla`,
        finished: false,
        votes: outageCount + 1
      })
    }
  } catch (error) {
    console.error('Error ending tortilla availability:', error)
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 })
  }
}
