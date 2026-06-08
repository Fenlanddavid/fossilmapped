import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT_ID.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY'
const hasSupabaseConfig =
  !supabaseUrl.includes('YOUR_PROJECT_ID') &&
  supabaseAnonKey !== 'YOUR_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function getSharedFinds() {
  if (!hasSupabaseConfig) {
    throw new Error('Supabase is not configured. Showing the built-in demo dataset.')
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 10000)

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
  options: { coordinatesReleased?: boolean } = {},
) {
  const cleanHrid = hrid.trim()
  if (!cleanHrid) {
    throw new Error('Promotion failed: missing record HRID.')
  }

  const update: { verification_status: typeof status; coordinates_released?: boolean } = { verification_status: status }
  if (typeof options.coordinatesReleased === 'boolean') update.coordinates_released = options.coordinatesReleased

  const { data, error } = await supabase
    .from('shared_finds')
    .update(update)
    .eq('hrid', cleanHrid)
    .select('hrid')

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error(`Promotion did not apply. No writable row matched HRID "${cleanHrid}" or direct client updates are blocked by RLS.`)
  }
  if (data.length > 1) {
    throw new Error(`Promotion matched ${data.length} rows for HRID "${cleanHrid}". Expected exactly one.`)
  }
}

export async function deleteSharedFind(hrid: string) {
  const cleanHrid = hrid.trim()
  if (!cleanHrid) {
    throw new Error('Delete failed: missing record HRID.')
  }

  const { data, error } = await supabase
    .from('shared_finds')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('hrid', cleanHrid)
    .select('hrid')

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error(`Delete did not apply. No writable row matched HRID "${cleanHrid}" or direct client updates are blocked by RLS.`)
  }
  if (data.length > 1) {
    throw new Error(`Delete matched ${data.length} rows for HRID "${cleanHrid}". Expected exactly one.`)
  }
}

export async function shareToCommunity(payload: any) {
  const { data, error } = await supabase
    .from('shared_finds')
    .insert([payload])
    .select()
  
  if (error) throw error
  return data[0]
}
