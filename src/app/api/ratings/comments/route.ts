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
    // Prepare reactions aggregates
    let reactionsByRating: Record<string, Record<string, number>> = {}
    let userReactionsByRating: Record<string, Set<string>> = {}

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

      // Fetch reactions aggregate (rating_id, reaction)
      const { data: reactionRows, error: reactionsError } = await supabaseAdmin
        .from('comment_reactions')
        .select('rating_id, reaction')
        .in('rating_id', ratingIds)

      if (reactionsError) {
        console.error('Error fetching reactions:', reactionsError)
      } else if (reactionRows) {
        reactionsByRating = reactionRows.reduce((acc: Record<string, Record<string, number>>, row: any) => {
          const rid = row.rating_id
          const emoji = row.reaction
          acc[rid] = acc[rid] || {}
          acc[rid][emoji] = (acc[rid][emoji] || 0) + 1
          return acc
        }, {})
      }

      // Fetch user reactions if fingerprint provided
      if (fingerprint) {
        const { data: userReactionRows, error: userReactionErr } = await supabaseAdmin
          .from('comment_reactions')
          .select('rating_id, reaction')
          .eq('client_fingerprint', fingerprint)
          .in('rating_id', ratingIds)

        if (userReactionErr) {
          console.error('Error fetching user reactions:', userReactionErr)
        } else if (userReactionRows) {
          userReactionsByRating = userReactionRows.reduce((acc: Record<string, Set<string>>, row: any) => {
            const rid = row.rating_id
            if (!acc[rid]) acc[rid] = new Set()
            acc[rid].add(row.reaction)
            return acc
          }, {})
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
      userHasLiked: likedSet.has(rating.id),
      reactions: reactionsByRating[rating.id] || {},
      userReactions: Array.from(userReactionsByRating[rating.id] || [])
    })) || []

    return NextResponse.json({ comments, total: comments.length })
  } catch (error) {
    console.error('Error in comments endpoint:', error)
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 })
  }
}
