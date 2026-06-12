import { describe, expect, it } from 'vitest'
import { getToken, tokenCookie, clearCookie, TOKEN_COOKIE } from './cookies'

describe('cookies', () => {
  it('从 Cookie 头解析 token', () => {
    const req = new Request('http://x/', {
      headers: { cookie: `other=1; ${TOKEN_COOKIE}=abc%20123; foo=2` },
    })
    expect(getToken(req)).toBe('abc 123')
  })

  it('无 cookie 时返回 null', () => {
    expect(getToken(new Request('http://x/'))).toBeNull()
  })

  it('tokenCookie 生成 httpOnly Set-Cookie 串', () => {
    const c = tokenCookie('tok')
    expect(c).toContain(`${TOKEN_COOKIE}=tok`)
    expect(c).toContain('HttpOnly')
    expect(c).toContain('SameSite=Lax')
    expect(c).toContain('Path=/')
  })

  it('clearCookie 生成 Max-Age=0 串', () => {
    expect(clearCookie()).toContain('Max-Age=0')
  })
})
