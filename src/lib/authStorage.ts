import { invoke } from '@tauri-apps/api/core'

/**
 * supabase-js storage adapter backed by a JSON file in the app-data dir
 * (NOT the webview localStorage), reusing the existing Rust read/write commands.
 * Holds the Supabase session + the PKCE code verifier between app launches.
 */

let cache: Record<string, string> | null = null
let filePath: string | null = null

async function path(): Promise<string> {
  if (filePath) return filePath
  const dir = await invoke<string>('get_app_data_dir')
  filePath = `${dir}/auth.json`
  return filePath
}

async function load(): Promise<Record<string, string>> {
  if (cache) return cache
  try {
    const raw = await invoke<string>('read_ledger', { path: await path() })
    cache = JSON.parse(raw) as Record<string, string>
  } catch {
    cache = {} // file doesn't exist yet
  }
  return cache
}

async function persist(): Promise<void> {
  await invoke('write_ledger', { path: await path(), content: JSON.stringify(cache ?? {}) })
}

export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    const m = await load()
    return key in m ? m[key] : null
  },
  async setItem(key: string, value: string): Promise<void> {
    const m = await load()
    m[key] = value
    await persist()
  },
  async removeItem(key: string): Promise<void> {
    const m = await load()
    delete m[key]
    await persist()
  },
}
