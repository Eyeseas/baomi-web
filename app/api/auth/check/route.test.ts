import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { GET } from './route'

function reqWithToken(tok?: string) {
  return new Request('http://localhost/api/auth/check', {
    headers: tok ? { cookie: `baomi_token=${tok}` } : {},
  })
}

describe('GET /api/auth/check', () => {
  it('有效 token 返回昵称', async () => {
    server.use(
      http.get(
        'https://www.baomi.org.cn/portal/main-api/checkToken.do',
        () => HttpResponse.json({ result: true, data: { nickName: '张三' } }),
      ),
    )
    const res = await GET(reqWithToken('TOK'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ nickname: '张三' })
  })

  it('昵称为空返回「未设定姓名」', async () => {
    server.use(
      http.get(
        'https://www.baomi.org.cn/portal/main-api/checkToken.do',
        () => HttpResponse.json({ result: true, data: { nickName: '' } }),
      ),
    )
    const res = await GET(reqWithToken('TOK'))
    expect(await res.json()).toEqual({ nickname: '未设定姓名' })
  })

  it('无 cookie 返回 401', async () => {
    const res = await GET(reqWithToken())
    expect(res.status).toBe(401)
  })

  it('token 无效（result 假）返回 401', async () => {
    server.use(
      http.get(
        'https://www.baomi.org.cn/portal/main-api/checkToken.do',
        () => HttpResponse.json({ result: false }),
      ),
    )
    const res = await GET(reqWithToken('BAD'))
    expect(res.status).toBe(401)
  })
})
