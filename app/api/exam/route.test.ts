import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { GET } from './route'

const BASE = 'https://www.baomi.org.cn'

function reqWithToken(tok?: string) {
  return new Request('http://localhost/api/exam', {
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

describe('GET /api/exam (SSE)', () => {
  it('无 token 返回 401', async () => {
    const res = await GET(reqWithToken())
    expect(res.status).toBe(401)
  })

  it('完整考试流程以 SSE 推送并以 done 结束', async () => {
    server.use(
      http.get(
        `${BASE}/portal/main-api/v2/coursePacket/getCourseRelateExam`,
        () => HttpResponse.json({ status: 0, data: { examId: 'EX1' } }),
      ),
      http.get(
        `${BASE}/portal/main-api/v2/activity/exam/getExamContentData.do`,
        () =>
          HttpResponse.json({
            data: {
              randomId: 'RID',
              typeList: [
                { type: 1, questionList: [{ id: 'q', tqId: 't', answer: 'A' }] },
              ],
            },
          }),
      ),
      http.post(
        `${BASE}/portal/main-api/v2/activity/exam/saveExamResultJc.do`,
        () => HttpResponse.json({ status: 0 }),
      ),
      http.get(
        `${BASE}/portal/main-api/v2/activity/exam/getExamResultMaxScore.do`,
        () => HttpResponse.json({ status: 0, data: { score: 100 } }),
      ),
      http.get(
        `${BASE}/portal/main-api/v2/studyTime/updateCoursePackageExamInfo.do`,
        () => HttpResponse.json({ status: 0 }),
      ),
    )
    const res = await GET(reqWithToken('TOK'))
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const text = await readAll(res)
    expect(text).toContain('"type":"done"')
  })
})
