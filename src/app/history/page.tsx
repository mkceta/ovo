import { supabaseAdmin } from '@/lib/supabase'
import Link from 'next/link'

type HistoryItem = {
  date: string
  average: number | null
  count: number
}

type TopComment = {
  id: string
  comment: string
  createdAt: string
  average: number | null
  reactions: number
}

async function getData() {
  // Last 30 days history of ratings grouped by day
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - 29)

  // Live ratings (not deleted)
  const { data: ratings, error } = await supabaseAdmin
    .from('ratings')
    .select('id, created_at, score_overall, comment')
    .gte('created_at', start.toISOString())
    .order('created_at', { ascending: true })

  if (error) throw error

  // Archived ratings (deleted) within range
  const { data: archivedRatings, error: archErr } = await supabaseAdmin
    .from('archive_ratings')
    .select('id, created_at, score_overall, comment, deleted_at')
    .gte('created_at', start.toISOString())
    .order('created_at', { ascending: true })

  if (archErr) throw archErr

  // Aggregate per day
  const byDay = new Map<string, { sum: number; count: number }>()
  ;(ratings || []).forEach(r => {
    const d = new Date(r.created_at)
    const key = d.toISOString().slice(0,10)
    if (!byDay.has(key)) byDay.set(key, { sum: 0, count: 0 })
    if (typeof r.score_overall === 'number') {
      const item = byDay.get(key)!
      item.sum += r.score_overall
      item.count += 1
    }
  })

  ;(archivedRatings || []).forEach(r => {
    const d = new Date(r.created_at)
    const key = d.toISOString().slice(0,10)
    if (!byDay.has(key)) byDay.set(key, { sum: 0, count: 0 })
    if (typeof r.score_overall === 'number') {
      const item = byDay.get(key)!
      item.sum += r.score_overall
      item.count += 1
    }
  })

  const history: HistoryItem[] = Array.from(byDay.entries())
    .map(([date, { sum, count }]) => ({
      date,
      average: count ? sum / count : null,
      count
    }))
    .sort((a, b) => a.date < b.date ? 1 : -1)
    .slice(0, 10)

  // Weekly top comments by reactions (🔥😂🐐)
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

  const topComments: TopComment[] = allComments
    .map(c => ({
      id: c.id,
      comment: c.comment as string,
      createdAt: c.created_at,
      average: typeof c.score_overall === 'number' ? c.score_overall : null,
      reactions: reactionCounts[c.id] || 0
    }))
    .sort((a, b) => b.reactions - a.reactions)
    .slice(0, 10)

  return { history, topComments }
}

export default async function HistoryPage() {
  const { history, topComments } = await getData()

  // No charts per user request

  return (
    <div className="history-page">
      <div className="history-header">
        <h1>Historial de Tortillas</h1>
        <Link href="/" className="back-link">← Volver</Link>
      </div>

      <div className="history-grid">
        <section className="history-card">
          <h2>Historial</h2>
          <div className="history-table">
            <div className="history-row header">
              <div>Fecha</div>
              <div>Media</div>
              <div>Reseñas</div>
            </div>
            {history.map(h => (
              <div key={h.date} className="history-row">
                <div>{h.date}</div>
                <div>{h.average ? h.average.toFixed(1) : '—'}</div>
                <div>{h.count}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="history-card">
          <h2>Top 10 comentarios de la semana</h2>
          <div className="top-list">
            {topComments.length === 0 && <div className="no-top">Sin comentarios esta semana</div>}
            {topComments.map((c, idx) => (
              <div key={c.id} className={`top-item ${idx===0?'gold':''} ${idx===1?'silver':''} ${idx===2?'bronze':''}`}>
                <div className="top-meta">
                  <span className="top-date">{new Date(c.createdAt).toLocaleDateString('es-ES')}</span>
                  {typeof c.average === 'number' && (
                    <span className="top-score">{c.average.toFixed(1)}/10</span>
                  )}
                </div>
                <div className="top-comment">{c.comment}</div>
                <div className="top-reactions">Reacciones: {c.reactions}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}


