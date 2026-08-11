/**
 * Browser fallbacks for the desktop file dialogs. Used only on web (guarded by
 * isDesktop at each call site) — export/backup become a normal download, restore
 * becomes a file picker.
 */

export function downloadFile(name: string, data: BlobPart, mime: string): void {
  const blob = new Blob([data], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function pickTextFile(accept = 'application/json,.json'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => {
      const f = input.files?.[0]
      if (!f) { resolve(null); return }
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => resolve(null)
      r.readAsText(f)
    }
    input.click()
  })
}
