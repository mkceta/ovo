import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || '0.0.0.0'
    const { batchId, sabor, jugosidad, cuajada, temperatura, comment, fingerprint } = await req.json()

    // Validate required fields (batchId can be null now)
    if (!fingerprint || !sabor || !jugosidad || !cuajada || !temperatura) {
      return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 })
    }

    // Validate rating values: sabor, jugosidad, temperatura in 1-10; cuajada in 5-10
    if (sabor < 1 || sabor > 10 || jugosidad < 1 || jugosidad > 10 || 
        cuajada < 5 || cuajada > 10 || temperatura < 1 || temperatura > 10) {
      return NextResponse.json({ error: 'rating_out_of_range' }, { status: 400 })
    }

    // Validate integer values and per-field ranges
    const ratings = [sabor, jugosidad, cuajada, temperatura]
    const inRange = (s: number, j: number, c: number, t: number) =>
      (s >= 1 && s <= 10) && (j >= 1 && j <= 10) && (c >= 5 && c <= 10) && (t >= 1 && t <= 10)
    if (!inRange(sabor, jugosidad, cuajada, temperatura) || ratings.some(r => !Number.isInteger(r))) {
      return NextResponse.json({ error: 'invalid_rating_values' }, { status: 400 })
    }

    // Validate comment length
    if (comment && comment.length > 120) {
      return NextResponse.json({ error: 'comment_too_long' }, { status: 400 })
    }

    // Check if tortilla is available (2+ working votes)
    const { data: availabilityState } = await supabaseAdmin
      .from('availability_state')
      .select('is_available, available_votes')
      .single()

    if (!availabilityState?.is_available) {
      return NextResponse.json({ error: 'tortilla_not_available' }, { status: 400 })
    }

    // Rate limit: máximo 1 rating por día por fingerprint
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const { count: existingRating } = await supabaseAdmin
      .from('ratings')
      .select('*', { head: true, count: 'exact' })
      .eq('client_fingerprint', fingerprint)
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString())

    if ((existingRating ?? 0) > 0) {
      return NextResponse.json({ error: 'already_rated_today' }, { status: 429 })
    }

    // Rate limit: máximo 1 rating / 5 min por fingerprint
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { count: recentRatings } = await supabaseAdmin
      .from('ratings')
      .select('*', { head: true, count: 'exact' })
      .gt('created_at', fiveMinAgo)
      .eq('client_fingerprint', fingerprint)

    if ((recentRatings ?? 0) > 0) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    // Calculate overall score
    const scoreOverall = Math.round((sabor + jugosidad + cuajada + temperatura) / 4)

    // Insert rating (without batch_id for now)
    const { error } = await supabaseAdmin.from('ratings').insert({
      batch_id: null, // We'll handle this differently
      sabor,
      jugosidad,
      cuajada,
      temperatura,
      score_overall: scoreOverall,
      comment: comment || null,
      client_fingerprint: fingerprint,
      ip_hash: ip
    })

    if (error) {
      console.error('Error inserting rating:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Reset outage votes when new rating is added
    await supabaseAdmin
      .from('outage_votes')
      .update({ is_active: false })
      .eq('vote_type', 'outage')
      .eq('is_active', true)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error in rating endpoint:', error)
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 })
  }
}