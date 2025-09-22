'use client'

import { useEffect, useState } from 'react'

type Batch = {
  id: string
  status: 'active' | 'completed'
  confirmed_count: number
  confirmations_needed: number
  pending_until: string | null
  started_at: string
  created_at: string
}

type TodayStatus = {
  recentBatches: Batch[]
}

export default function HistoryBatchesClient() {
  const [batches, setBatches] = useState<Batch[]>([])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const res = await fetch('/api/today/status', { cache: 'no-store' })
        if (!res.ok) return
        const data: TodayStatus = await res.json()
        if (mounted && data && Array.isArray(data.recentBatches)) {
          setBatches(data.recentBatches)
        }
      } catch {}
    }
    load()
    const id = setInterval(load, 4000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  if (!batches || batches.length === 0) {
    return <div className="no-batches">Sin tortillas hoy</div>
  }

  // Put active batch first
  const sorted = [...batches].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1
    if (b.status === 'active' && a.status !== 'active') return 1
    return new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  })

  return (
    <div className="batches-list">
      {sorted.map(b => {
        const isActive = b.status === 'active'
        return (
          <div key={b.id} className={`batch-item ${isActive ? 'current' : ''}`}>
            <div className="batch-row">
              <div className="batch-left">
                <div className="batch-time">{new Date(b.started_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>
                <div className="batch-status">{isActive ? 'En curso' : 'Terminada'}</div>
              </div>
              <div className="batch-right">
                <div className="batch-confirms">{b.confirmed_count}/{Math.max(b.confirmed_count, b.confirmations_needed || 0)} votos</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}


