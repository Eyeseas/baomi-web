process.env.STUDY_DELAY_MS = '0'

import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { GET } from './route'

const BASE = 'https://www.baomi.org.cn'

function reqWithToken(tok?: string) {
  return new Request('http://localhost/api/study', {
    headers: tok ? { cookie: `baomi_token=${tok}` } : {},
  })
}

async function readAll(res: Response): Promise<string> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out += decoder.decode(value)
  }
  return out
}

describe('GET /api/study (SSE)', () => {
  it('无 token 返回 401', async () => {
    const res = await GET(reqWithToken())
    expect(res.status).toBe(401)
  })

  it('以 SSE 推送进度事件直到 done', async () => {
    server.use(
      http.get(
        `${BASE}/portal/main-api/v2/coursePacket/getCourseDirectoryList`,
        () =>
          HttpResponse.json({
            data: [{ name: 'S', subDirectory: [{ name: 'sub', SYS_UUID: 'd' }] }],
          }),
      ),
      http.get(
        `${BASE}/portal/main-api/v2/coursePacket/getCourseResourceList`,
        () =>
          HttpResponse.json({
            data: {
              listdata: [
                { resourceID: 'r1', SYS_UUID: 'u1', name: 'V', timeLength: '00:00:05' },
              ],
            },
          }),
      ),
      http.get(
        `${BASE}/portal/main-api/v2/studyTime/saveCoursePackage.do`,
        () => HttpResponse.json({ status: 0 }),
      ),
    )
    const res = await GET(reqWithToken('TOK'))
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const text = await readAll(res)
    expect(text).toContain('"type":"progress"')
    expect(text).toContain('"type":"done"')
    expect(text).toContain('data: ')
  })
})
