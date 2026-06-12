import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { GET } from './route'

function reqWithToken(tok?: string) {
  return new Request('http://localhost/api/course/progress', {
    headers: tok ? { cookie: `baomi_token=${tok}` } : {},
  })
}

describe('GET /api/course/progress', () => {
  it('带 token 调进度接口并透传 data', async () => {
    let gotToken = ''
    server.use(
      http.get(
        'https://www.baomi.org.cn/portal/main-api/v2/coursePacket/getCourseUserStatistic',
        ({ request }) => {
          gotToken = request.headers.get('token') ?? ''
          return HttpResponse.json({ status: 0, data: { progressRate: 0.5 } })
        },
      ),
    )
    const res = await GET(reqWithToken('TOK'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 0, data: { progressRate: 0.5 } })
    expect(gotToken).toBe('TOK')
  })

  it('无 token 返回 401', async () => {
    const res = await GET(reqWithToken())
    expect(res.status).toBe(401)
  })
})
