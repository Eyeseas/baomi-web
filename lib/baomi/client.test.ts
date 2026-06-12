import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { baomiGet, baomiPost } from './client'
import { BaomiError } from './errors'

describe('baomiGet', () => {
  it('注入 token/authToken/siteId 头并带上 query 参数', async () => {
    let captured: Record<string, string> = {}
    let capturedUrl = ''
    server.use(
      http.get('https://www.baomi.org.cn/portal/test', ({ request }) => {
        capturedUrl = request.url
        captured = {
          token: request.headers.get('token') ?? '',
          authToken: request.headers.get('authToken') ?? '',
          siteId: request.headers.get('siteId') ?? '',
        }
        return HttpResponse.json({ status: 0, data: 'ok' })
      }),
    )
    const json = await baomiGet('/portal/test', 'TKN', { a: '1', b: 2 })
    expect(json).toEqual({ status: 0, data: 'ok' })
    expect(captured).toEqual({ token: 'TKN', authToken: 'TKN', siteId: '95' })
    expect(capturedUrl).toContain('a=1')
    expect(capturedUrl).toContain('b=2')
  })

  it('非 2xx 抛 BaomiError', async () => {
    server.use(
      http.get(
        'https://www.baomi.org.cn/portal/fail',
        () => new HttpResponse(null, { status: 500 }),
      ),
    )
    await expect(baomiGet('/portal/fail', 'TKN')).rejects.toBeInstanceOf(BaomiError)
  })
})

describe('baomiPost', () => {
  it('以 JSON body POST 并注入头', async () => {
    let body: unknown = null
    server.use(
      http.post('https://www.baomi.org.cn/portal/p', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ status: 0 })
      }),
    )
    await baomiPost('/portal/p', 'TKN', { x: 1 })
    expect(body).toEqual({ x: 1 })
  })
})
