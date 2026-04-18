import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Require a real HTTPS URL — prevents placeholder values like "your_supabase_project_url"
// from being treated as a configured client.
const isConfigured = url?.startsWith('https://') && key && key.length > 20

export const supabase = isConfigured ? createClient(url, key) : null
export const hasSupabase = Boolean(supabase)

if (hasSupabase) {
  console.log('[Supabase] Connected:', url)
} else {
  console.log('[Supabase] Not configured — using localStorage only')
}
