import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT_ID.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY'
const adminFunctionName = (import.meta.env.VITE_SHARED_FINDS_ADMIN_FUNCTION as string | undefined)?.trim()
const hasSupabaseConfig =
  !supabaseUrl.includes('YOUR_PROJECT_ID') &&
  supabaseAnonKey !== 'YOUR_ANON_KEY'
const SHARED_FINDS_FETCH_TIMEOUT_MS = 30000

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

export async function getSharedFinds() {
  if (!hasSupabaseConfig) {
    throw new Error('Supabase is not configured. Showing the built-in demo dataset.')
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), SHARED_FINDS_FETCH_TIMEOUT_MS)

  try {
    const { data, error } = await supabase
      .from('shared_finds')
      .select('*')
      .not('is_deleted', 'eq', true)
      .order('shared_at', { ascending: false })
      .abortSignal(controller.signal)
    
    if (error) throw error
    return data ?? []
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The shared registry did not respond in time. Showing the demo dataset.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
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
