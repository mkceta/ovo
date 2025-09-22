import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // Get today's batches (no cafeteria filter needed)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const { data: batches, error: batchError } = await supabaseAdmin
      .from('batches')
      .select(`
        *,
        ratings (
          sabor,
          jugosidad,
          cuajada,
          temperatura,
          comment
        )
      `)
      .gte('started_at', today.toISOString())
      .lt('started_at', tomorrow.toISOString())
      .order('started_at', { ascending: false })

    if (batchError) {
      console.error('Error fetching batches:', batchError)
      return NextResponse.json({ error: batchError.message }, { status: 500 })
    }

    // Get recent outage votes (last 30 minutes)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: outageVotes, error: outageError } = await supabaseAdmin
      .from('outage_votes')
      .select('vote_type')
      .eq('is_active', true)
      .gt('created_at', thirtyMinAgo)

    if (outageError) {
      console.error('Error fetching outage votes:', outageError)
      return NextResponse.json({ error: outageError.message }, { status: 500 })
    }

    // Calculate statistics
    const activeBatches = batches?.filter(b => b.status === 'active') || []
    const completedBatches = batches?.filter(b => b.status === 'completed') || []
    
    const outageCount = outageVotes?.filter(v => v.vote_type === 'outage').length || 0
    const workingCount = outageVotes?.filter(v => v.vote_type === 'working').length || 0
    
    // Get all ratings from today (not just from batches)
    const { data: allRatings, error: ratingsError } = await supabaseAdmin
      .from('ratings')
      .select('sabor, jugosidad, cuajada, temperatura, created_at')
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString())

    if (ratingsError) {
      console.error('Error fetching ratings:', ratingsError)
      return NextResponse.json({ error: ratingsError.message }, { status: 500 })
    }

    // Calculate average ratings
    const avgRating = allRatings && allRatings.length > 0 
      ? allRatings.reduce((sum, r) => sum + (r.sabor + r.jugosidad + r.cuajada + r.temperatura) / 4, 0) / allRatings.length 
      : null

    // Calculate average ratings by attribute
    const avgSabor = allRatings && allRatings.length > 0 
      ? allRatings.reduce((sum, r) => sum + r.sabor, 0) / allRatings.length 
      : null
    const avgJugosidad = allRatings && allRatings.length > 0 
      ? allRatings.reduce((sum, r) => sum + r.jugosidad, 0) / allRatings.length 
      : null
    const avgCuajada = allRatings && allRatings.length > 0 
      ? allRatings.reduce((sum, r) => sum + r.cuajada, 0) / allRatings.length 
      : null
    const avgTemperatura = allRatings && allRatings.length > 0 
      ? allRatings.reduce((sum, r) => sum + r.temperatura, 0) / allRatings.length 
      : null

    return new NextResponse(JSON.stringify({
      today: today.toISOString().split('T')[0],
      batches: {
        active: activeBatches.length,
        completed: completedBatches.length,
        total: batches?.length || 0
      },
      outageVotes: {
        outage: outageCount,
        working: workingCount,
        total: outageCount + workingCount
      },
      ratings: {
        count: allRatings?.length || 0,
        average: avgRating,
        sabor: avgSabor,
        jugosidad: avgJugosidad,
        cuajada: avgCuajada,
        temperatura: avgTemperatura
      },
      recentBatches: batches || []
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      }
    })
  } catch (error) {
    console.error('Error in today status:', error)
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 })
  }
}