import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT_ID.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function getSharedFinds() {
  const { data, error } = await supabase
    .from('shared_finds')
    .select('*')
    .order('shared_at', { ascending: false })
  
  if (error) throw error
  return data
}

export async function shareToCommunity(payload: any) {
  const { data, error } = await supabase
    .from('shared_finds')
    .insert([payload])
    .select()
  
  if (error) throw error
  return data[0]
}
