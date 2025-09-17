'use client'

import { useState, useEffect } from 'react'

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
  const [comments, setComments] = useState<Comment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)

  // Generate a simple fingerprint
  useEffect(() => {
    const fp = Math.random().toString(36).substring(2) + Date.now().toString(36)
    setFingerprint(fp)
    loadTodayStatus()
    
    // Refresh data every 30 seconds
    const interval = setInterval(loadTodayStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  // Auto-hide message toast after 3 seconds
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(''), 3000)
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
        setTodayStatus(data)
      }
      
      if (availabilityResponse.ok) {
        const availabilityData = await availabilityResponse.json()
        setAvailabilityState({
          isAvailable: availabilityData.isAvailable,
          availableVotes: availabilityData.availableVotes,
          unavailableVotes: availabilityData.unavailableVotes
        })
        
        // Load comments only if tortilla is available
        if (availabilityData.isAvailable) {
          loadComments()
        }
      }
    } catch (error) {
      console.error('Error loading status:', error)
    }
  }

  // Load comments
  const loadComments = async () => {
    setLoadingComments(true)
    try {
      const response = await fetch('/api/ratings/comments')
      if (response.ok) {
        const data = await response.json()
        setComments(data.comments || [])
      }
    } catch (error) {
      console.error('Error loading comments:', error)
    }
    setLoadingComments(false)
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
        setMessage(`Voto registrado: ${data.votes.outage} sin tortillas, ${data.votes.working} disponibles`)
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
      const response = await fetch('/api/ratings', {
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
      
      const data = await response.json()
      if (response.ok) {
        setMessage('¡Valoración enviada correctamente!')
        setShowRatingForm(false)
        setSelectedBatch(null)
        setRating({ sabor: 5, jugosidad: 5, cuajada: 5, temperatura: 5, comment: '' })
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
                  <span className="vote-label">persona{availabilityState.availableVotes > 1 ? 's' : ''} dice{availabilityState.availableVotes > 1 ? 'n' : ''} que hay tortilla</span>
                </div>
              ) : (
                <div className="no-votes">
                  <span className="no-votes-text">Nadie ha votado aún</span>
                </div>
              )
            )}
          </div>
        </div>

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
                <div className="chart-label">Cuajada</div>
                <div className="chart-bar">
                  <div 
                    className="chart-fill" 
                    style={{ width: `${((currentRatings.cuajada || 0) / 10) * 100}%` }}
                  ></div>
                </div>
                <div className="chart-value">{currentRatings.cuajada?.toFixed(1) || 'N/A'}</div>
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
            <h3>Comentarios de hoy</h3>
            {loadingComments ? (
              <div className="no-comments">Cargando comentarios...</div>
            ) : comments.length > 0 ? (
              <>
                <div className="comments-count">
                  {comments.length} comentario{comments.length > 1 ? 's' : ''}
                </div>
                <div className="comments-list">
                  {comments.map((comment) => (
                    <div key={comment.id} className="comment-item">
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
                        "{comment.comment}"
                      </div>
                      
                      <div className="comment-details">
                        <div className="comment-detail-item">
                          <span className="comment-detail-label">Sabor</span>
                          <span className="comment-detail-value">{comment.scores.sabor}</span>
                        </div>
                        <div className="comment-detail-item">
                          <span className="comment-detail-label">Jugosidad</span>
                          <span className="comment-detail-value">{comment.scores.jugosidad}</span>
                        </div>
                        <div className="comment-detail-item">
                          <span className="comment-detail-label">Cuajada</span>
                          <span className="comment-detail-value">{comment.scores.cuajada}</span>
                        </div>
                        <div className="comment-detail-item">
                          <span className="comment-detail-label">Temperatura</span>
                          <span className="comment-detail-value">{comment.scores.temperatura}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="no-comments">
                Aún no hay comentarios para hoy. ¡Sé el primero en valorar!
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
                <span>Disponible</span>
              </button>
            </div>
          </div>
        )}

        {/* Rating Available */}
        {availabilityState.isAvailable && (
          <div className="rating-available">
            <h3>¡2+ personas confirman que hay tortillas!</h3>
            <p>Ahora puedes valorar la calidad</p>
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
          <div className="rating-modal">
            <div className="rating-content">
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
                  { key: 'jugosidad', label: 'Jugosidad' },
                  { key: 'cuajada', label: 'Cuajada' },
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
                        min="1"
                        max="10"
                        value={rating[key as keyof Rating]}
                        onChange={(e) => setRating(prev => ({ ...prev, [key]: parseInt(e.target.value) }))}
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
    </div>
  )
}

