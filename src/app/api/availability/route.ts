import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    // Get current availability state
    const { data: availabilityState, error } = await supabaseAdmin
      .from('availability_state')
      .select('*')
      .single()

    if (error) {
      console.error('Error fetching availability state:', error)
      return NextResponse.json({ error: 'database_error' }, { status: 500 })
    }

    return NextResponse.json({
      isAvailable: availabilityState.is_available,
      availableVotes: availabilityState.available_votes,
      unavailableVotes: availabilityState.unavailable_votes,
      lastUpdated: availabilityState.last_updated
    })
  } catch (error) {
    console.error('Error in availability status:', error)
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { availableVotes, unavailableVotes } = await req.json()
    
    // Determine availability based on vote counts
    const isAvailable = availableVotes >= 2 && unavailableVotes < 2

    // Update availability state
    const { error } = await supabaseAdmin
      .from('availability_state')
      .update({
        is_available: isAvailable,
        available_votes: availableVotes,
        unavailable_votes: unavailableVotes,
        last_updated: new Date().toISOString()
      })
      .eq('id', (await supabaseAdmin.from('availability_state').select('id').single()).data?.id)

    if (error) {
      console.error('Error updating availability state:', error)
      return NextResponse.json({ error: 'database_error' }, { status: 500 })
    }

    return NextResponse.json({
      isAvailable,
      availableVotes,
      unavailableVotes
    })
  } catch (error) {
    console.error('Error updating availability:', error)
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 })
  }
}
