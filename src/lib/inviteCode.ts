// Short, human-friendly invite codes. Alphabet excludes easily-confused
// characters (0/O, 1/I/L) so codes are safe to read aloud, text, and type.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** Generate an 8-char code, e.g. "K7QMR3TX". */
export function generateInviteCode(len = 8): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

/** Strip spaces/dashes and uppercase, so "abcd 2345" == "ABCD2345". */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Display an 8-char code grouped as "ABCD 2345"; other lengths returned as-is. */
export function formatInviteCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code
}
