import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT_ID.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY'
const adminFunctionName = (import.meta.env.VITE_SHARED_FINDS_ADMIN_FUNCTION as string | undefined)?.trim()
const hasSupabaseConfig =
  !supabaseUrl.includes('YOUR_PROJECT_ID') &&
  supabaseAnonKey !== 'YOUR_ANON_KEY'
const SHARED_FINDS_FETCH_TIMEOUT_MS = 30000
const SHARED_FINDS_METADATA_SELECT = [
  'id',
  'fossilmap_id',
  'hrid',
  'collector_name',
  'collector_email',
  'taxon',
  'element',
  'period',
  'stage',
  'formation',
  'member',
  'bed',
  'location_name',
  'latitude',
  'longitude',
  'public_latitude',
  'public_longitude',
  'location_precision',
  'precision_locked',
  'coordinates_released',
  'date_collected',
  'measurements',
  'weight_g',
  'length_mm',
  'width_mm',
  'thickness_mm',
  'notes',
  'repository',
  'accession_id',
  'quality_score',
  'shared_at',
  'verification_status',
  'is_deleted',
].join(',')

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export function canModerateSharedFinds() {
  return Boolean(adminFunctionName)
}

type AdminActionCredentials = {
  adminPin?: string
}

async function invokeAdminAction(action: string, payload: Record<string, unknown>, credentials: AdminActionCredentials = {}) {
  if (!adminFunctionName) {
    throw new Error('Admin writes require a trusted Supabase Edge Function. Set VITE_SHARED_FINDS_ADMIN_FUNCTION before enabling moderation.')
  }

  const adminPin = credentials.adminPin?.trim()
  if (!adminPin) {
    throw new Error('Admin PIN is required for moderation writes.')
  }

  const { data, error } = await supabase.functions.invoke(adminFunctionName, {
    body: { action, ...payload },
    headers: {
      'x-admin-pin': adminPin,
    },
  })

  if (error) throw error
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as { error: unknown }).error))
  }
}

export async function getSharedFinds(): Promise<Record<string, unknown>[]> {
  if (!hasSupabaseConfig) {
    throw new Error('Supabase is not configured. Showing the built-in demo dataset.')
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), SHARED_FINDS_FETCH_TIMEOUT_MS)

  try {
    const { data, error } = await supabase
      .from('shared_finds')
      .select(SHARED_FINDS_METADATA_SELECT)
      .not('is_deleted', 'eq', true)
      .order('shared_at', { ascending: false })
      .abortSignal(controller.signal)
    
    if (error) throw error
    return (data ?? []) as unknown as Record<string, unknown>[]
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The shared registry did not respond in time. Showing the demo dataset.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function getSharedFindPhotos(recordId: string) {
  const cleanId = recordId.trim()
  if (!cleanId) return []

  const filters: Array<['hrid' | 'fossilmap_id' | 'id', string]> = [
    ['hrid', cleanId],
    ['fossilmap_id', cleanId],
  ]
  if (uuidPattern.test(cleanId)) filters.push(['id', cleanId])

  for (const [column, value] of filters) {
    const { data, error } = await supabase
      .from('shared_finds')
      .select('photos')
      .eq(column, value)
      .maybeSingle()

    if (error) throw error
    if (data) {
      return Array.isArray(data.photos)
        ? data.photos.filter((item): item is string => typeof item === 'string')
        : []
    }
  }

  return []
}

export async function promoteVerification(
  hrid: string,
  status: 'community' | 'verified' | 'research_grade',
  options: { coordinatesReleased?: boolean; adminPin?: string } = {},
) {
  const cleanHrid = hrid.trim()
  if (!cleanHrid) {
    throw new Error('Promotion failed: missing record HRID.')
  }

  const update: { verification_status: typeof status; coordinates_released?: boolean } = { verification_status: status }
  if (typeof options.coordinatesReleased === 'boolean') update.coordinates_released = options.coordinatesReleased

  await invokeAdminAction('promoteVerification', { hrid: cleanHrid, update }, { adminPin: options.adminPin })
}

export async function deleteSharedFind(hrid: string, options: { adminPin?: string } = {}) {
  const cleanHrid = hrid.trim()
  if (!cleanHrid) {
    throw new Error('Delete failed: missing record HRID.')
  }

  await invokeAdminAction('deleteSharedFind', { hrid: cleanHrid }, { adminPin: options.adminPin })
}

export async function shareToCommunity(payload: any) {
  const { data, error } = await supabase
    .from('shared_finds')
    .insert([payload])
    .select()
  
  if (error) throw error
  return data[0]
}
