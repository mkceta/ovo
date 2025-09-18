import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const fingerprint = searchParams.get('fingerprint') || null
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

    // Prepare likes aggregates
    const ratingIds = (ratings || []).map(r => r.id)
    let likesByRating: Record<string, number> = {}
    let likedSet: Set<string> = new Set()

    if (ratingIds.length > 0) {
      // Total likes per rating
      const { data: likesAgg, error: likesAggError } = await supabaseAdmin
        .from('comment_likes')
        .select('rating_id')
        .in('rating_id', ratingIds)

      if (likesAggError) {
        console.error('Error fetching likes aggregate:', likesAggError)
      } else if (likesAgg) {
        // Supabase doesn't support group by with this client easily; do manual count
        likesByRating = likesAgg.reduce((acc: Record<string, number>, row: any) => {
          const id = row.rating_id
          acc[id] = (acc[id] || 0) + 1
          return acc
        }, {})
      }

      // If fingerprint provided, fetch which ones the user liked
      if (fingerprint) {
        const { data: userLikes, error: userLikesError } = await supabaseAdmin
          .from('comment_likes')
          .select('rating_id')
          .eq('client_fingerprint', fingerprint)
          .in('rating_id', ratingIds)

        if (userLikesError) {
          console.error('Error fetching user likes:', userLikesError)
        } else if (userLikes) {
          likedSet = new Set(userLikes.map((u: any) => u.rating_id))
        }
      }
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
      imageUrl: rating.image_url || null,
      likesCount: likesByRating[rating.id] || 0,
      userHasLiked: likedSet.has(rating.id)
    })) || []

    return NextResponse.json({ comments, total: comments.length })
  } catch (error) {
    console.error('Error in comments endpoint:', error)
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 })
  }
}
