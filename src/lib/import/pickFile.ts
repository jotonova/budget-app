import { isDesktop } from '../platform'

/** Pick a statement file and return its text. Desktop uses the Tauri dialog +
 *  fs read; web uses a hidden <input type="file">. Returns null if cancelled.
 *  One call site, branched here so the parser layer is platform-agnostic. */
export async function pickStatementFile(): Promise<{ name: string; text: string } | null> {
  if (isDesktop) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Statements', extensions: ['csv'] }],
    })
    if (!selected || Array.isArray(selected)) return null
    const path = typeof selected === 'string' ? selected : (selected as { path: string }).path
    const text = await readTextFile(path)
    const name = path.split(/[\\/]/).pop() ?? 'statement.csv'
    return { name, text }
  }

  // Web: hidden file input.
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv,text/csv'
    input.style.display = 'none'
    input.onchange = async () => {
      const file = input.files?.[0]
      input.remove()
      if (!file) { resolve(null); return }
      resolve({ name: file.name, text: await file.text() })
    }
    // If the user cancels, onchange never fires; the promise simply stays pending
    // until the next pick — acceptable for a one-shot dialog.
    document.body.appendChild(input)
    input.click()
  })
}
