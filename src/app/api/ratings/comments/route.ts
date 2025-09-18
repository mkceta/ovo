import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    // Get today's date range
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // Fetch ratings with comments from today
    const { data: ratings, error } = await supabaseAdmin
      .from('ratings')
      .select(`
        id,
        sabor,
        jugosidad,
        cuajada,
        temperatura,
        score_overall,
        comment,
        image_url,
        created_at
      `)
      .not('comment', 'is', null)
      .neq('comment', '')
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching comments:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Format the comments data
    const comments = ratings?.map(rating => ({
      id: rating.id,
      comment: rating.comment,
      overallScore: rating.score_overall,
      scores: {
        sabor: rating.sabor,
        jugosidad: rating.jugosidad,
        cuajada: rating.cuajada,
        temperatura: rating.temperatura
      },
      createdAt: rating.created_at,
      imageUrl: rating.image_url || null
    })) || []

    return NextResponse.json({ 
      comments,
      total: comments.length 
    })
  } catch (error) {
    console.error('Error in comments endpoint:', error)
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 })
  }
}
