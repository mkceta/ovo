'use client'

import { useEffect, useState } from 'react'

type TopComment = {
  id: string
  comment: string
  createdAt: string
  average: number | null
  reactions: number
}

export default function TopWeeklyClient({ initialTop }: { initialTop: TopComment[] }) {
  const [top, setTop] = useState<TopComment[]>(initialTop || [])

  useEffect(() => {
    let isMounted = true
    const load = async () => {
      try {
        const res = await fetch('/api/history/top-comments', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (isMounted && data && Array.isArray(data.top)) {
          setTop(data.top)
        }
      } catch {}
    }
    load()
    const interval = setInterval(load, 4000)
    return () => { isMounted = false; clearInterval(interval) }
  }, [])

  return (
    <div className="top-list">
      {(!top || top.length === 0) && (
        <div className="no-top">Sin comentarios esta semana</div>
      )}
      {top && top.map((c, idx) => (
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
  )
}


