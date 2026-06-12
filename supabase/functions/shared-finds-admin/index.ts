import { createClient } from 'npm:@supabase/supabase-js@2.98.0'

type VerificationStatus = 'community' | 'verified' | 'research_grade'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-pin',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const allowedStatuses = new Set<VerificationStatus>(['community', 'verified', 'research_grade'])
const failedAttempts = new Map<string, { count: number; blockedUntil: number }>()
const maxFailedAttempts = 5
const blockDurationMs = 5 * 60 * 1000

function json(body: Record<string, unknown>, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  })
}

function getSecretKey() {
  const legacyKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (legacyKey) return legacyKey

  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (!secretKeys) return ''

  try {
    const parsed = JSON.parse(secretKeys) as Record<string, string>
    return parsed.default?.trim() || Object.values(parsed).find((value) => value?.trim())?.trim() || ''
  } catch {
    return ''
  }
}

function unauthorized() {
  return json({ error: 'Unauthorized' }, { status: 401 })
}

function rateLimitKey(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('cf-connecting-ip')?.trim()
    || 'unknown'
}

function isRateLimited(key: string) {
  const entry = failedAttempts.get(key)
  if (!entry) return false

  if (entry.blockedUntil > Date.now()) return true
  if (entry.blockedUntil) failedAttempts.delete(key)
  return false
}

function recordFailedPin(key: string) {
  const entry = failedAttempts.get(key) ?? { count: 0, blockedUntil: 0 }
  const count = entry.count + 1

  failedAttempts.set(key, {
    count,
    blockedUntil: count >= maxFailedAttempts ? Date.now() + blockDurationMs : 0,
  })
}

function cleanHrid(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanStatus(value: unknown): VerificationStatus | null {
  return typeof value === 'string' && allowedStatuses.has(value as VerificationStatus)
    ? value as VerificationStatus
    : null
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
const supabaseSecretKey = getSecretKey()

if (!supabaseUrl || !supabaseSecretKey) {
  console.error('Missing Supabase admin environment variables for shared-finds-admin.')
}

const supabase = createClient(supabaseUrl ?? '', supabaseSecretKey)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 })
  }

  const expectedPin = Deno.env.get('SHARED_FINDS_ADMIN_PIN')?.trim()
  const suppliedPin = req.headers.get('x-admin-pin')?.trim()
  const authKey = rateLimitKey(req)

  if (isRateLimited(authKey)) {
    return json({ error: 'Too many failed PIN attempts. Try again later.' }, { status: 429 })
  }

  if (!expectedPin || !suppliedPin || suppliedPin !== expectedPin) {
    recordFailedPin(authKey)
    return unauthorized()
  }

  failedAttempts.delete(authKey)

  try {
    const body = await req.json()
    const action = typeof body?.action === 'string' ? body.action : ''
    const hrid = cleanHrid(body?.hrid)

    if (!hrid) {
      return json({ error: 'Missing hrid' }, { status: 400 })
    }

    if (action === 'promoteVerification') {
      const update = body?.update && typeof body.update === 'object'
        ? body.update as Record<string, unknown>
        : {}
      const verificationStatus = cleanStatus(update.verification_status)

      if (!verificationStatus) {
        return json({ error: 'Invalid verification_status' }, { status: 400 })
      }

      const safeUpdate: {
        verification_status: VerificationStatus
        coordinates_released?: boolean
      } = {
        verification_status: verificationStatus,
      }

      if (typeof update.coordinates_released === 'boolean') {
        safeUpdate.coordinates_released = update.coordinates_released
      }

      const { data, error } = await supabase
        .from('shared_finds')
        .update(safeUpdate)
        .eq('hrid', hrid)
        .select('hrid')
        .maybeSingle()

      if (error) throw error
      if (!data) return json({ error: 'Record not found' }, { status: 404 })

      return json({ ok: true })
    }

    if (action === 'deleteSharedFind') {
      const { data, error } = await supabase
        .from('shared_finds')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq('hrid', hrid)
        .select('hrid')
        .maybeSingle()

      if (error) throw error
      if (!data) return json({ error: 'Record not found' }, { status: 404 })

      return json({ ok: true })
    }

    return json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
})
