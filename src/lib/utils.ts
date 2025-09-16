export const T_HALF_MIN = 60; // vida media en minutos
export const LAMBDA = Math.log(2) / T_HALF_MIN;

export function minutesSince(dateIso: string | Date) {
  const t = typeof dateIso === 'string' ? new Date(dateIso) : dateIso
  return (Date.now() - t.getTime()) / 60000
}

export function decayed(score: number, minutes: number) {
  return score * Math.exp(-LAMBDA * minutes)
}

export function bayesianMean(values: number[], mu0 = 3.5, m = 5) {
  const sum = values.reduce((a, b) => a + b, 0)
  const n = values.length
  return (m * mu0 + sum) / (m + n)
}

export type Indicator = 'recién hecha' | 'decente' | 'justita' | 'no queda'

export function indicatorLabel(score: number, ageMin: number, noStock: boolean): Indicator {
  if (noStock) return 'no queda'
  if (ageMin <= 20 && score >= 4.0) return 'recién hecha'
  if (score >= 3.5 && ageMin <= 60) return 'decente'
  if (ageMin > 180) return 'no queda'
  return 'justita'
}

export function clamp(n: number, a: number, b: number) { return Math.min(Math.max(n, a), b) }

export function fp() {
  // fingerprint pobre pero suficiente para MVP
  if (typeof window === 'undefined') return 'server'
  const raw = `${navigator.userAgent}|${screen?.width}x${screen?.height}`
  return crypto.subtle ?
    // hash base64 corto
    'fp_' + btoa(String.fromCharCode(...new Uint8Array(24))).slice(0, 16) : raw
}