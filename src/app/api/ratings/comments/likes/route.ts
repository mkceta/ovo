import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || '0.0.0.0'
    const { ratingId, fingerprint } = await req.json()

    if (!ratingId || !fingerprint) {
      return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 })
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

    // Check if like exists
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('comment_likes')
      .select('id')
      .eq('rating_id', ratingId)
      .eq('client_fingerprint', fingerprint)
      .maybeSingle()

    if (existingError) {
      console.error('Error checking existing like:', existingError)
      return NextResponse.json({ error: 'db_error' }, { status: 500 })
    }

    let liked: boolean

    if (existing?.id) {
      // Unlike (delete)
      const { error: delError } = await supabaseAdmin
        .from('comment_likes')
        .delete()
        .eq('id', existing.id)
      if (delError) {
        console.error('Error deleting like:', delError)
        return NextResponse.json({ error: 'db_error' }, { status: 500 })
      }
      liked = false
    } else {
      // Like (insert)
      const { error: insError } = await supabaseAdmin
        .from('comment_likes')
        .insert({ rating_id: ratingId, client_fingerprint: fingerprint, ip_hash: ip })
      if (insError) {
        console.error('Error inserting like:', insError)
        return NextResponse.json({ error: 'db_error' }, { status: 500 })
      }
      liked = true
    }

    // Return current likes count
    const { count } = await supabaseAdmin
      .from('comment_likes')
      .select('*', { head: true, count: 'exact' })
      .eq('rating_id', ratingId)

    return NextResponse.json({ liked, likesCount: count || 0 })
  } catch (error) {
    console.error('Error in like toggle endpoint:', error)
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 })
  }
}
