export const TOKEN_COOKIE = 'baomi_token'

export function getToken(req: Request): string | null {
  const cookie = req.headers.get('cookie')
  if (!cookie) return null
  const part = cookie
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${TOKEN_COOKIE}=`))
  if (!part) return null
  return decodeURIComponent(part.slice(TOKEN_COOKIE.length + 1))
}

export function tokenCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return (
    `${TOKEN_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; ` +
    `Path=/; Max-Age=604800${secure}`
  )
}

export function clearCookie(): string {
  return `${TOKEN_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
}
