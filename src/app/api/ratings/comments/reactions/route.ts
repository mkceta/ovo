import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || '0.0.0.0'
    const { ratingId, fingerprint, reaction } = await req.json()

    if (!ratingId || !fingerprint || !reaction) {
      return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 })
    }

    if (!['🔥','😂','🐐'].includes(reaction)) {
      return NextResponse.json({ error: 'invalid_reaction' }, { status: 400 })
    }

    // Verify rating exists
    const { data: rating, error: ratingError } = await supabaseAdmin
      .from('ratings')
      .select('id')
      .eq('id', ratingId)
      .single()

    if (ratingError || !rating) {
      return NextResponse.json({ error: 'rating_not_found' }, { status: 404 })
    }

    // Check if reaction exists
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('comment_reactions')
      .select('id')
      .eq('rating_id', ratingId)
      .eq('client_fingerprint', fingerprint)
      .eq('reaction', reaction)
      .maybeSingle()

    if (existingError) {
      console.error('Error checking existing reaction:', existingError)
      return NextResponse.json({ error: 'db_error' }, { status: 500 })
    }

    let active: boolean

    if (existing?.id) {
      // Remove reaction
      const { error: delError } = await supabaseAdmin
        .from('comment_reactions')
        .delete()
        .eq('id', existing.id)
      if (delError) {
        console.error('Error deleting reaction:', delError)
        return NextResponse.json({ error: 'db_error' }, { status: 500 })
      }
      active = false
    } else {
      // Add reaction
      const { error: insError } = await supabaseAdmin
        .from('comment_reactions')
        .insert({ rating_id: ratingId, client_fingerprint: fingerprint, reaction, ip_hash: ip })
      if (insError) {
        console.error('Error inserting reaction:', insError)
        return NextResponse.json({ error: 'db_error' }, { status: 500 })
      }
      active = true
    }

    // Return current reaction counts for this rating
    const { data: rows, error: aggErr } = await supabaseAdmin
      .from('comment_reactions')
      .select('reaction')
      .eq('rating_id', ratingId)

    if (aggErr) {
      console.error('Error aggregating reactions:', aggErr)
      return NextResponse.json({ error: 'db_error' }, { status: 500 })
    }

    const counts: Record<string, number> = { '🔥': 0, '😂': 0, '🐐': 0 }
    for (const row of rows || []) {
      counts[row.reaction] = (counts[row.reaction] || 0) + 1
    }

    return NextResponse.json({ active, counts })
  } catch (error) {
    console.error('Error in reaction toggle endpoint:', error)
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 })
  }
}


