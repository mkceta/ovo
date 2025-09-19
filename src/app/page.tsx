'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import lazaroImg from './lazaro.png'

interface Batch {
  id: string
  status: 'active' | 'completed'
  confirmed_count: number
  confirmations_needed: number
  pending_until: string | null
  started_at: string
  created_at: string
}

interface TodayStatus {
  batches: {
    active: number
    completed: number
    total: number
  }
  outageVotes: {
    outage: number
    working: number
    total: number
  }
  ratings: {
    count: number
    average: number | null
    sabor: number | null
    jugosidad: number | null
    cuajada: number | null
    temperatura: number | null
  }
  recentBatches: Batch[]
}

interface Rating {
  sabor: number
  jugosidad: number
  cuajada: number
  temperatura: number
  comment?: string
}

interface Comment {
  id: string
  comment: string
  overallScore: number
  scores: {
    sabor: number
    jugosidad: number
    cuajada: number
    temperatura: number
  }
  createdAt: string
  imageUrl?: string | null
  likesCount?: number
  userHasLiked?: boolean
}

export default function Home() {
  const [fingerprint, setFingerprint] = useState<string>('')
  const [todayStatus, setTodayStatus] = useState<TodayStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [showRatingForm, setShowRatingForm] = useState(false)
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null)
  const [rating, setRating] = useState<Rating>({
    sabor: 5,
    jugosidad: 5,
    cuajada: 5,
    temperatura: 5,
    comment: ''
  })
  const [availabilityState, setAvailabilityState] = useState({
    isAvailable: false,
    availableVotes: 0,
    unavailableVotes: 0
  })
  const [availabilityLoading, setAvailabilityLoading] = useState(true)
  const [comments, setComments] = useState<Comment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const firstCommentsLoad = useRef(true)
  const [newCommentIds, setNewCommentIds] = useState<Set<string>>(new Set())
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  // Initialize a persistent fingerprint (once)
  useEffect(() => {
    let fp = ''
    try {
      fp = localStorage.getItem('ovo_fp') || ''
    } catch {}
    if (!fp) {
      fp = Math.random().toString(36).substring(2) + Date.now().toString(36)
      try { localStorage.setItem('ovo_fp', fp) } catch {}
    }
    setFingerprint(fp)
  }, [])

  // Start polling only after fingerprint is ready, so requests include it
  useEffect(() => {
    if (!fingerprint) return
    // Initial load
    loadTodayStatus()
    // Refresh data every 2.5 seconds
    const interval = setInterval(() => {
      loadTodayStatus()
    }, 2500)
    return () => clearInterval(interval)
  }, [fingerprint])

  // Auto-hide message toast after 3 seconds
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(''), 2500)
    return () => clearTimeout(t)
  }, [message])

  // Load today's status
  const loadTodayStatus = async () => {
    try {
      const [statusResponse, availabilityResponse] = await Promise.all([
        fetch('/api/today/status'),
        fetch('/api/availability')
      ])
      
      if (statusResponse.ok) {
        const data = await statusResponse.json()
        // Only update if something actually changed to avoid flashing
        setTodayStatus(prev => {
          const prevStr = prev ? JSON.stringify(prev) : ''
          const nextStr = JSON.stringify(data)
          return prevStr !== nextStr ? data : prev
        })
      }
      
      if (availabilityResponse.ok) {
        const availabilityData = await availabilityResponse.json()
        setAvailabilityState(prev => {
          const next = {
            isAvailable: availabilityData.isAvailable,
            availableVotes: availabilityData.availableVotes,
            unavailableVotes: availabilityData.unavailableVotes
          }
          return (prev.isAvailable !== next.isAvailable ||
                  prev.availableVotes !== next.availableVotes ||
                  prev.unavailableVotes !== next.unavailableVotes) ? next : prev
        })
        // First load completed
        setAvailabilityLoading(false)
        
        // Load comments only if tortilla is available
        if (availabilityData.isAvailable) {
          loadComments()
        }
      }
    } catch (error) {
      console.error('Error loading status:', error)
    }
  }

  // Toggle like on a comment
  const toggleLike = async (ratingId: string) => {
    try {
      const response = await fetch('/api/ratings/comments/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratingId, fingerprint })
      })
      const data = await response.json()
      if (response.ok) {
        setComments(prev => prev.map(c => {
          if (c.id !== ratingId) return c
          const nextCount = typeof data.likesCount === 'number' ? data.likesCount : (c.likesCount || 0)
          return { ...c, likesCount: nextCount, userHasLiked: data.liked }
        }))
      } else {
        setMessage(`Error: ${data.error}`)
      }
    } catch (e) {
      setMessage('Error al dar like')
    }
  }

  // Load comments
  const loadComments = async () => {
    // Only show the loader on the very first fetch
    if (firstCommentsLoad.current) setLoadingComments(true)
    try {
      const params = new URLSearchParams()
      if (fingerprint) params.set('fingerprint', fingerprint)
      const response = await fetch(`/api/ratings/comments?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        const incoming: Comment[] = data.comments || []

        // Diff merge to avoid re-render flicker and preserve existing items' identity
        setComments(prev => {
          const prevById = new Map(prev.map(c => [c.id, c]))
          const next: Comment[] = []
          const newlyAddedIds: string[] = []
          for (const inc of incoming) {
            const existing = prevById.get(inc.id)
            if (existing) {
              // Preserve object identity when unchanged to reduce repaint
              const merged = { ...existing, ...inc }
              next.push(merged)
            } else {
              next.push(inc)
              newlyAddedIds.push(inc.id)
            }
          }

          // Mark new ids for a brief entrance animation
          if (newlyAddedIds.length) {
            setNewCommentIds(current => {
              const copy = new Set(current)
              newlyAddedIds.forEach(id => copy.add(id))
              return copy
            })
            // Remove the marker after animation ends
            setTimeout(() => {
              setNewCommentIds(current => {
                const copy = new Set(current)
                newlyAddedIds.forEach(id => copy.delete(id))
                return copy
              })
            }, 500)
          }

          return next
        })
      }
    } catch (error) {
      console.error('Error loading comments:', error)
    }
    if (firstCommentsLoad.current) {
      setLoadingComments(false)
      firstCommentsLoad.current = false
    }
  }


  // Vote outage
  const voteOutage = async (voteType: 'outage' | 'working') => {
    setLoading(true)
    try {
      const response = await fetch('/api/outages/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fingerprint,
          voteType
        })
      })
      
      const data = await response.json()
      if (response.ok) {
        setMessage(`Aviso registrado. (${data.votes.working} persona dice que hay tortilla)`)
        loadTodayStatus()
      } else {
        setMessage(`Error: ${data.error}`)
      }
    } catch (error) {
      setMessage('Error al votar')
    }
    setLoading(false)
  }

  // End tortilla availability
  const endTortillaAvailability = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/availability/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint })
      })
      
      const data = await response.json()
      if (response.ok) {
        if (data.finished) {
          setMessage('Tortilla marcada como agotada (2 votos) - Estado reseteado')
        } else {
          setMessage(data.message)
        }
        loadTodayStatus()
      } else {
        setMessage(`Error: ${data.error}`)
      }
    } catch (error) {
      setMessage('Error al marcar tortilla como agotada')
    }
    setLoading(false)
  }


  // Calculate current ratings without decay
  const getCurrentRatings = () => {
    if (!todayStatus?.ratings || todayStatus.ratings.count === 0) return null
    
    return {
      average: todayStatus.ratings.average || null,
      sabor: todayStatus.ratings.sabor || null,
      jugosidad: todayStatus.ratings.jugosidad || null,
      cuajada: todayStatus.ratings.cuajada || null,
      temperatura: todayStatus.ratings.temperatura || null
    }
  }

  const currentRatings = getCurrentRatings()

  // Format time for comments
  const formatCommentTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return 'Ahora mismo'
    if (diffInMinutes < 60) return `Hace ${diffInMinutes} min`
    
    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) return `Hace ${diffInHours}h`
    
    return date.toLocaleDateString('es-ES', { 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Submit rating
  const submitRating = async () => {
    setLoading(true)
    try {
      let response: Response
      if (imageFile) {
        const form = new FormData()
        form.append('sabor', String(rating.sabor))
        form.append('jugosidad', String(rating.jugosidad))
        form.append('cuajada', String(rating.cuajada))
        form.append('temperatura', String(rating.temperatura))
        if (rating.comment) form.append('comment', rating.comment)
        form.append('fingerprint', fingerprint)
        form.append('image', imageFile)
        response = await fetch('/api/ratings', {
          method: 'POST',
          body: form
        })
      } else {
        response = await fetch('/api/ratings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchId: null, // No longer needed
            sabor: rating.sabor,
            jugosidad: rating.jugosidad,
            cuajada: rating.cuajada,
            temperatura: rating.temperatura,
            comment: rating.comment || null,
            fingerprint
          })
        })
      }
      
      const data = await response.json()
      if (response.ok) {
        setMessage('¡Valoración enviada correctamente!')
        setShowRatingForm(false)
        setSelectedBatch(null)
        setRating({ sabor: 5, jugosidad: 5, cuajada: 5, temperatura: 5, comment: '' })
        if (imagePreview) URL.revokeObjectURL(imagePreview)
        setImageFile(null)
        setImagePreview(null)
        loadTodayStatus()
        // Reload comments if tortilla is available
        if (availabilityState.isAvailable) {
          loadComments()
        }
      } else {
        setMessage(`Error: ${data.error}`)
      }
    } catch (error) {
      setMessage('Error al enviar valoración')
    }
    setLoading(false)
  }


  return (
    <div className="app">
      <div className="header">
        <h2>, , ,</h2>
        <h1>OvO</h1>
        <p>Valora la tortilla de la FIC!</p>
      </div>

      <div className="main-content">
        {/* Tortilla Status */}
        {availabilityLoading ? (
          <div className="tortilla-status">
            <div className="status-indicator">
              <div className="status-dot available"></div>
              <h2>Hablando con Lázaro...</h2>
            </div>
            <div className="status-skeleton">
              <div className="skeleton-bar" style={{ width: '60%' }}></div>
              <div className="skeleton-bar" style={{ width: '40%' }}></div>
            </div>
          </div>
        ) : (
          <div className={`tortilla-status ${availabilityState.isAvailable ? 'available' : 'unavailable'}`}>
            <div className="status-indicator">
              <div className={`status-dot ${availabilityState.isAvailable ? 'available' : 'unavailable'}`}></div>
              <h2>{availabilityState.isAvailable ? 'HAY TORTILLA' : 'NO HAY TORTILLA'}</h2>
            </div>
            
            <div className="vote-counts">
              {!availabilityState.isAvailable && (
                // When no tortilla, show only available votes if > 0
                availabilityState.availableVotes > 0 ? (
                  <div className="vote-item">
                    <span className="vote-number available">{availabilityState.availableVotes}</span>
                    <span className="vote-label">persona{availabilityState.availableVotes > 1 ? 's' : ''} dice{availabilityState.availableVotes > 1 ? 'n' : ''} que hay tortilla...</span>
                  </div>
                ) : (
                  <div className="no-votes">
                    <span className="no-votes-text">Si ves tortilla haz click en el botón de abajo.</span>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Current Ratings Display */}
        {availabilityState.isAvailable && currentRatings && (
          <div className="ratings-display">
            <h3>Puntuación Media</h3>
            <div className="overall-rating">
              <div className="rating-value">{currentRatings.average?.toFixed(1) || 'N/A'}</div>
              {todayStatus?.ratings.count && (
                <div className="rating-count">
                  Basada en {todayStatus.ratings.count} valoración{todayStatus.ratings.count > 1 ? 'es' : ''}
                </div>
              )}
            </div>
            
            <div className="ratings-chart">
              <div className="chart-item">
                <div className="chart-label">Sabor</div>
                <div className="chart-bar">
                  <div 
                    className="chart-fill" 
                    style={{ width: `${((currentRatings.sabor || 0) / 10) * 100}%` }}
                  ></div>
                </div>
                <div className="chart-value">{currentRatings.sabor?.toFixed(1) || 'N/A'}</div>
              </div>
              
              <div className="chart-item">
                <div className="chart-label">Lázaro</div>
                <div className="chart-bar">
                  <div 
                    className="chart-fill" 
                    style={{ width: `${((currentRatings.cuajada || 0) / 10) * 100}%` }}
                  ></div>
                </div>
                <div className="chart-value">{currentRatings.cuajada?.toFixed(1) || 'N/A'}</div>
              </div>
              
              <div className="chart-item">
                <div className="chart-label">Jugosidad</div>
                <div className="chart-bar">
                  <div 
                    className="chart-fill" 
                    style={{ width: `${((currentRatings.jugosidad || 0) / 10) * 100}%` }}
                  ></div>
                </div>
                <div className="chart-value">{currentRatings.jugosidad?.toFixed(1) || 'N/A'}</div>
              </div>
              
              <div className="chart-item">
                <div className="chart-label">Temperatura</div>
                <div className="chart-bar">
                  <div 
                    className="chart-fill" 
                    style={{ width: `${((currentRatings.temperatura || 0) / 10) * 100}%` }}
                  ></div>
                </div>
                <div className="chart-value">{currentRatings.temperatura?.toFixed(1) || 'N/A'}</div>
              </div>
            </div>
          </div>
        )}

        {/* Comments Section */}
        {availabilityState.isAvailable && (
          <div className="comments-section">
            <h3>Comentarios</h3>
            {loadingComments ? (
              <div className="no-comments">Cargando comentarios...</div>
            ) : comments.length > 0 ? (
              <>
                <div className="comments-count">
                  {comments.length} comentario{comments.length > 1 ? 's' : ''}
                </div>
                <div className="comments-list">
                  {comments.map((comment) => (
                    <div key={comment.id} className={`comment-item ${newCommentIds.has(comment.id) ? 'new' : ''}`}>
                      <div className="comment-header">
                        <div className="comment-score">
                          <span className="comment-overall-score">
                            {comment.overallScore}/10
                          </span>
                        </div>
                        <span className="comment-time">
                          {formatCommentTime(comment.createdAt)}
                        </span>
                      </div>
                      
                      <div className="comment-text">
                        {comment.comment}
                      </div>
                      {comment.imageUrl && (
                        <div className="comment-image" style={{ marginTop: 8 }}>
                          <img src={comment.imageUrl} alt="Foto de la reseña" style={{ maxWidth: '100%', borderRadius: 8 }} />
                        </div>
                      )}
                      
                      <div className="comment-details">
                        <div className="comment-detail-item">
                          <span className="comment-detail-label">Sabor</span>
                          <span className="comment-detail-value">{comment.scores.sabor}</span>
                        </div>
                        <div className="comment-detail-item">
                          <span className="comment-detail-label">Lázaro</span>
                          <span className="comment-detail-value">{comment.scores.cuajada}</span>
                        </div>
                        <div className="comment-detail-item">
                          <span className="comment-detail-label">Jugosidad</span>
                          <span className="comment-detail-value">{comment.scores.jugosidad}</span>
                        </div>
                        <div className="comment-detail-item">
                          <span className="comment-detail-label">Temperatura</span>
                          <span className="comment-detail-value">{comment.scores.temperatura}</span>
                        </div>
                        <div className="comment-detail-item">
                          <button
                            className={`like-btn ${comment.userHasLiked ? 'liked' : ''}`}
                            onClick={() => toggleLike(comment.id)}
                            title={comment.userHasLiked ? 'Quitar like' : 'Dar like'}
                            aria-pressed={comment.userHasLiked ? 'true' : 'false'}
                            aria-label={comment.userHasLiked ? 'Quitar like' : 'Dar like'}
                          >
                            <svg className="like-icon" viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M12.1 8.64l-.1.1-.11-.11C10.14 6.83 7.1 7.24 5.6 9.09c-1.5 1.85-1.23 4.6.62 6.1l5.78 4.66c.01.01.03.02.05.03.05.03.11.05.17.07.06.02.12.03.18.03s.12-.01.18-.03c.06-.02.12-.04.17-.07.02-.01.04-.02.05-.03l5.78-4.66c1.85-1.5 2.12-4.25.62-6.1-1.5-1.85-4.54-2.26-6.29-.45z"/>
                            </svg>
                            <span className="like-count">{comment.likesCount ?? 0}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="no-comments">
                Nadie ha hablado de esta tortilla.<br/>¡Sé el primero en comentar!
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {!availabilityState.isAvailable && (
          <div className="action-section">
            <div className="action-grid single-button">
              <button
                onClick={() => voteOutage('working')}
                disabled={loading}
                className="action-btn success"
              >
                <span>HAY TORTILLA!</span>
              </button>
            </div>
          </div>
        )}

        {/* Rating Available */}
        {availabilityState.isAvailable && (
          <div className="rating-available">
            <h3>¡LÁZARO TE ESPERA!</h3>
            <p>¡Pídete un pinchito de tortilla y valóralo!</p>
            <div className="rating-actions">
              <button
                onClick={() => setShowRatingForm(true)}
                className="rate-now-btn"
                disabled={loading}
              >
                Valorar tortilla
              </button>
              <button
                onClick={endTortillaAvailability}
                className="end-tortilla-btn"
                disabled={loading}
              >
                Se acabó la tortilla
              </button>
            </div>
          </div>
        )}


        {/* Rating Form */}
        {showRatingForm && (
          <div 
            className="rating-modal"
            onClick={() => {
              setShowRatingForm(false)
              setRating({ sabor: 5, jugosidad: 5, cuajada: 5, temperatura: 5, comment: '' })
            }}
          >
            <div 
              className="rating-content"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rating-header">
                <h3>Valorar Tortilla</h3>
                <button 
                  className="close-btn"
                  onClick={() => {
                    setShowRatingForm(false)
                    setRating({ sabor: 5, jugosidad: 5, cuajada: 5, temperatura: 5, comment: '' })
                  }}
                >
                  ×
                </button>
              </div>
              
              <div className="rating-criteria">
                {[
                  { key: 'sabor', label: 'Sabor' },
                  { key: 'cuajada', label: 'Lázaro' },
                  { key: 'jugosidad', label: 'Jugosidad' },
                  { key: 'temperatura', label: 'Temperatura' }
                ].map(({ key, label }) => (
                  <div key={key} className="criterion">
                    <div className="criterion-header">
                      <span className="criterion-label">{label}</span>
                      <span className="criterion-value">{rating[key as keyof Rating]}/10</span>
                    </div>
                    <div className="slider-container">
                      <input
                        type="range"
                        min={0}
                        max="10"
                        step={1}
                        value={rating[key as keyof Rating]}
                        onChange={(e) => {
                          const next = parseInt(e.target.value)
                          const safe = key === 'cuajada' ? Math.max(5, next) : Math.max(1, next)
                          setRating(prev => ({ ...prev, [key]: safe }))
                        }}
                        className="slider"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="comment-section">
                <textarea
                  value={rating.comment}
                  onChange={(e) => setRating(prev => ({ ...prev, comment: e.target.value }))}
                  maxLength={120}
                  placeholder="Comentario opcional..."
                  className="comment-input"
                />
                <div className="char-count">
                  {rating.comment?.length || 0}/120
                </div>
              </div>

              <div className="image-upload-section">
                <label className="image-upload-label">Añadir foto (opcional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    if (imagePreview) URL.revokeObjectURL(imagePreview)
                    if (file) {
                      setImageFile(file)
                      const preview = URL.createObjectURL(file)
                      setImagePreview(preview)
                    } else {
                      setImageFile(null)
                      setImagePreview(null)
                    }
                  }}
                />
                {imagePreview && (
                  <div className="image-preview">
                    <img src={imagePreview} alt="Previsualización" style={{ maxWidth: '100%', borderRadius: 8 }} />
                  </div>
                )}
              </div>

              <div className="rating-actions">
                <button
                  onClick={submitRating}
                  disabled={loading}
                  className="submit-rating-btn"
                >
                  {loading ? 'Enviando...' : 'Enviar Valoración'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Message */}
        {message && (
          <div className="message-toast">
            {message}
          </div>
        )}
      </div>

      {/* Lázaro mascot image */}
      <Image
        src={lazaroImg}
        alt="Lázaro"
        className="lazaro-image"
        priority
      />
    </div>
  )
}

