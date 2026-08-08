// Per-row server `updated_at`, keyed `table:id` (settings keyed by household_id).
// Seeded on load and updated on every local write (server-returned time) and
// every applied remote change. Enables Last-Write-Wins that converges: a client
// rejects an incoming change older than the version it already has for that row.

const versions = new Map<string, string>()

export function versionKey(table: string, id: string): string {
  return `${table}:${id}`
}
export function getVersion(key: string): string | undefined {
  return versions.get(key)
}
export function setVersion(key: string, updatedAt: string | null | undefined): void {
  if (updatedAt) versions.set(key, updatedAt)
}
export function clearVersions(): void {
  versions.clear()
}
