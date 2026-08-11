import { isTauri } from '@tauri-apps/api/core'

/**
 * Runtime platform detection. `@tauri-apps/*` modules are import-safe in a
 * browser (only their calls throw), so the whole app is one bundle and we branch
 * native touchpoints on these flags. isTauri() is the official Tauri 2 check.
 */
export const isDesktop: boolean = isTauri()
export const isWeb: boolean = !isDesktop
