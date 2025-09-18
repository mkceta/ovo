import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || '0.0.0.0'
    const contentType = req.headers.get('content-type') || ''

    // Parse body which can be JSON or multipart/form-data
    let sabor: number
    let jugosidad: number
    let cuajada: number
    let temperatura: number
    let comment: string | null = null
    let fingerprint: string
    let imageFile: File | null = null

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const getNum = (key: string) => parseInt(String(form.get(key) ?? ''))
      sabor = getNum('sabor')
      jugosidad = getNum('jugosidad')
      cuajada = getNum('cuajada')
      temperatura = getNum('temperatura')
      comment = (form.get('comment')?.toString() || '').trim() || null
      fingerprint = String(form.get('fingerprint') || '')
      const file = form.get('image')
      if (file && file instanceof File) {
        imageFile = file
      }
    } else {
      const body = await req.json()
      sabor = body.sabor
      jugosidad = body.jugosidad
      cuajada = body.cuajada
      temperatura = body.temperatura
      comment = (body.comment || '')?.trim() || null
      fingerprint = body.fingerprint
    }

    // Validate required fields (batchId can be null now)
    if (!fingerprint || !sabor || !jugosidad || !cuajada || !temperatura) {
      return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 })
    }

    // Validate rating values: sabor, jugosidad, temperatura in 1-10; cuajada in 5-10
    if (sabor < 1 || sabor > 10 || jugosidad < 1 || jugosidad > 10 || 
        cuajada < 5 || cuajada > 10 || temperatura < 1 || temperatura > 10) {
      return NextResponse.json({ error: 'rating_out_of_range' }, { status: 400 })
    }

    // Validate integer values and per-field ranges
    const ratings = [sabor, jugosidad, cuajada, temperatura]
    const inRange = (s: number, j: number, c: number, t: number) =>
      (s >= 1 && s <= 10) && (j >= 1 && j <= 10) && (c >= 5 && c <= 10) && (t >= 1 && t <= 10)
    if (!inRange(sabor, jugosidad, cuajada, temperatura) || ratings.some(r => !Number.isInteger(r))) {
      return NextResponse.json({ error: 'invalid_rating_values' }, { status: 400 })
    }

    // Validate comment length
    if (comment && comment.length > 120) {
      return NextResponse.json({ error: 'comment_too_long' }, { status: 400 })
    }

    // Check if tortilla is available (2+ working votes)
    const { data: availabilityState } = await supabaseAdmin
      .from('availability_state')
      .select('is_available, available_votes')
      .single()

    if (!availabilityState?.is_available) {
      return NextResponse.json({ error: 'tortilla_not_available' }, { status: 400 })
    }

    // Rate limit: máximo 1 rating por día por fingerprint
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const { count: existingRating } = await supabaseAdmin
      .from('ratings')
      .select('*', { head: true, count: 'exact' })
      .eq('client_fingerprint', fingerprint)
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString())

    if ((existingRating ?? 0) > 0) {
      return NextResponse.json({ error: 'already_rated_today' }, { status: 429 })
    }

    // Rate limit: máximo 1 rating / 5 min por fingerprint
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { count: recentRatings } = await supabaseAdmin
      .from('ratings')
      .select('*', { head: true, count: 'exact' })
      .gt('created_at', fiveMinAgo)
      .eq('client_fingerprint', fingerprint)

    if ((recentRatings ?? 0) > 0) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    // Calculate overall score
    const scoreOverall = Math.round((sabor + jugosidad + cuajada + temperatura) / 4)

    // Optional image upload to Supabase Storage
    let imageUrl: string | null = null
    if (imageFile) {
      // Basic validation: type and size (max 2MB)
      const MAX_SIZE = 2 * 1024 * 1024
      const allowed = new Set(['image/jpeg', 'image/png', 'image/webp'])
      if (!allowed.has(imageFile.type)) {
        return NextResponse.json({ error: 'invalid_image_type' }, { status: 400 })
      }
      if ((imageFile as any).size && (imageFile as any).size > MAX_SIZE) {
        return NextResponse.json({ error: 'image_too_large' }, { status: 400 })
      }

      const arrayBuffer = await imageFile.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      const ext = imageFile.type.split('/')[1] || 'jpg'
      const fileName = `${fingerprint}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabaseAdmin.storage
        .from('ratings')
        .upload(fileName, bytes, {
          contentType: imageFile.type,
          upsert: false
        })

      if (uploadError) {
        console.error('Error uploading image:', uploadError)
        return NextResponse.json({ error: 'image_upload_failed' }, { status: 500 })
      }

      const { data: pub } = supabaseAdmin.storage
        .from('ratings')
        .getPublicUrl(fileName)

      imageUrl = pub?.publicUrl || null
    }

    // Insert rating (without batch_id for now)
    const { error } = await supabaseAdmin.from('ratings').insert({
      batch_id: null, // We'll handle this differently
      sabor,
      jugosidad,
      cuajada,
      temperatura,
      score_overall: scoreOverall,
      comment: comment || null,
      client_fingerprint: fingerprint,
      ip_hash: ip,
      image_url: imageUrl
    })

    if (error) {
      console.error('Error inserting rating:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Reset outage votes when new rating is added
    await supabaseAdmin
      .from('outage_votes')
      .update({ is_active: false })
      .eq('vote_type', 'outage')
      .eq('is_active', true)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error in rating endpoint:', error)
    return NextResponse.json({ error: 'internal_server_error' }, { status: 500 })
  }
}