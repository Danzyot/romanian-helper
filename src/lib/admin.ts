import { supabase } from './sync'

/** Admin-only app settings stored in app_config (RLS: admins write, users read). */

export type ConfigKey = 'realtime_model' | 'realtime_voice' | 'gemini_model'

export async function isAdmin(): Promise<boolean> {
  const { data: s } = await supabase.auth.getSession()
  if (!s.session) return false
  const { data } = await supabase
    .from('app_admins')
    .select('user_id')
    .eq('user_id', s.session.user.id)
    .maybeSingle()
  return !!data
}

export async function loadConfig(): Promise<Partial<Record<ConfigKey, string>>> {
  const { data } = await supabase.from('app_config').select('key,value')
  const cfg: Partial<Record<ConfigKey, string>> = {}
  for (const row of (data ?? []) as { key: ConfigKey; value: string }[]) cfg[row.key] = row.value
  return cfg
}

/** Save one setting; an empty value removes the override (back to default). */
export async function saveConfig(key: ConfigKey, value: string): Promise<string | null> {
  const v = value.trim()
  const { error } = v
    ? await supabase
        .from('app_config')
        .upsert({ key, value: v, updated_at: new Date().toISOString() })
    : await supabase.from('app_config').delete().eq('key', key)
  return error ? error.message : null
}
