import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - 7)

    const { data: commentsLive, error: commentsErr } = await supabaseAdmin
      .from('ratings')
      .select('id, comment, created_at, score_overall')
      .not('comment', 'is', null)
      .neq('comment', '')
      .gte('created_at', weekStart.toISOString())

    if (commentsErr) throw commentsErr

    const { data: commentsArchived, error: commentsArchErr } = await supabaseAdmin
      .from('archive_ratings')
      .select('id, comment, created_at, score_overall, deleted_at')
      .not('comment', 'is', null)
      .neq('comment', '')
      .gte('created_at', weekStart.toISOString())

    if (commentsArchErr) throw commentsArchErr

    const allComments = [...(commentsLive || []), ...(commentsArchived || [])]

    const liveIds = (commentsLive || []).map(c => c.id)
    const archIds = (commentsArchived || []).map(c => c.id)

    let reactionCounts: Record<string, number> = {}
    if (liveIds.length) {
      const { data: reacts } = await supabaseAdmin
        .from('comment_reactions')
        .select('rating_id')
        .in('rating_id', liveIds)
      reactionCounts = (reacts || []).reduce((acc: Record<string, number>, row: any) => {
        acc[row.rating_id] = (acc[row.rating_id] || 0) + 1
        return acc
      }, reactionCounts)
    }
    if (archIds.length) {
      const { data: archReacts } = await supabaseAdmin
        .from('archive_comment_reactions')
        .select('rating_id')
        .in('rating_id', archIds)
      reactionCounts = (archReacts || []).reduce((acc: Record<string, number>, row: any) => {
        acc[row.rating_id] = (acc[row.rating_id] || 0) + 1
        return acc
      }, reactionCounts)
    }

    const top = allComments
      .map(c => ({
        id: c.id as string,
        comment: c.comment as string,
        createdAt: c.created_at as string,
        average: typeof c.score_overall === 'number' ? c.score_overall : null,
        reactions: reactionCounts[c.id as string] || 0
      }))
      .sort((a, b) => b.reactions - a.reactions)
      .slice(0, 10)

    return new NextResponse(JSON.stringify({ top }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      }
    })
  } catch (e) {
    console.error('Error fetching weekly top comments:', e)
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 })
  }
}


