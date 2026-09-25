import { supabase } from './sync'

/** App-wide settings stored in app_config; any signed-in user can change them. */

export type ConfigKey = 'realtime_model' | 'realtime_voice' | 'gemini_model'

export async function isSignedIn(): Promise<boolean> {
  const { data: s } = await supabase.auth.getSession()
  return !!s.session
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
