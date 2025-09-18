import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { fingerprint, voteType } = await req.json()
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || '0.0.0.0'

    // Verify required fields
    if (!fingerprint || !voteType) {
      return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 })
    }

    // Rate limit: max 1 vote per 5 minutes per fingerprint
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { count } = await supabaseAdmin
      .from('outage_votes')
      .select('*', { head: true, count: 'exact' })
      .gt('created_at', fiveMinAgo)
      .eq('fingerprint', fingerprint)

    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    // Additional protection: prevent same fingerprint from declaring 'outage' twice in a row
    if (voteType === 'outage') {
      const windowStartIso = new Date(Date.now() - 30 * 60 * 1000).toISOString()
      const { data: lastOutageVote, error: lastVoteError } = await supabaseAdmin
        .from('outage_votes')
        .select('fingerprint, created_at')
        .eq('is_active', true)
        .eq('vote_type', 'outage')
        .gt('created_at', windowStartIso)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!lastVoteError && lastOutageVote && lastOutageVote.fingerprint === fingerprint) {
        return NextResponse.json({ error: 'rate_limited_consecutive_outage', message: 'No puedes marcar "no hay tortilla" dos veces seguidas.' }, { status: 429 })
      }
    }

    // Insert outage vote
    const { error } = await supabaseAdmin.from('outage_votes').insert({
      fingerprint: fingerprint,
      ip_address: ip,
      vote_type: voteType, // 'outage' or 'working'
      is_active: true
    })

    if (error) {
      console.error('Error inserting outage vote:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Clean up old votes first (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    await supabaseAdmin
      .from('outage_votes')
      .update({ is_active: false })
      .eq('is_active', true)
      .lt('created_at', oneHourAgo)

    // Get current vote counts (last 30 minutes)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: votes } = await supabaseAdmin
      .from('outage_votes')
      .select('vote_type, created_at')
      .eq('is_active', true)
      .gt('created_at', thirtyMinAgo)

    const outageVotes = votes?.filter(v => v.vote_type === 'outage').length || 0
    const workingVotes = votes?.filter(v => v.vote_type === 'working').length || 0

    // Apply maximum limits to prevent excessive accumulation
    const maxVotes = 10 // Maximum votes per type
    const limitedOutageVotes = Math.min(outageVotes, maxVotes)
    const limitedWorkingVotes = Math.min(workingVotes, maxVotes)

    // Determine availability based on limited vote counts
    // Available only if working votes > outage votes (not equal)
    const isAvailable = limitedWorkingVotes > limitedOutageVotes && limitedWorkingVotes >= 2
    
    // Get the availability state record ID
    const { data: stateRecord } = await supabaseAdmin
      .from('availability_state')
      .select('id')
      .single()

    if (!stateRecord) {
      console.error('No availability state record found')
      return NextResponse.json({ error: 'no_state_record' }, { status: 500 })
    }
    
    // Update availability state directly with limited counts
    const { error: updateError } = await supabaseAdmin
      .from('availability_state')
      .update({
        is_available: isAvailable,
        available_votes: limitedWorkingVotes,
        unavailable_votes: limitedOutageVotes,
        last_updated: new Date().toISOString()
      })
      .eq('id', stateRecord.id)

    if (updateError) {
      console.error('Error updating availability state:', updateError)
      return NextResponse.json({ error: 'database_error' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      votes: {
        outage: limitedOutageVotes,
        working: limitedWorkingVotes,
        total: limitedOutageVotes + limitedWorkingVotes
      }
    })
  } catch (error) {
    console.error('Error in outage vote:', error)
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 })
  }
}