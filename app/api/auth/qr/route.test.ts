import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { GET, POST } from './route'

describe('POST /api/auth/qr', () => {
  it('返回二维码内容与 qrToken', async () => {
    const qrContent = JSON.stringify({ params: { qrToken: 'QR1' } })
    server.use(
      http.post(
        'https://www.baomi.org.cn/portal/main-api/v2/spc/getQrToken.do',
        () => HttpResponse.json({ data: { data: qrContent } }),
      ),
    )
    const res = await POST(
      new Request('http://localhost/api/auth/qr', { method: 'POST' }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.qrToken).toBe('QR1')
    expect(json.qrContent).toBe(qrContent)
  })
})

describe('GET /api/auth/qr', () => {
  it('status=1 时设 cookie 并返回 status', async () => {
    server.use(
      http.post(
        'https://www.baomi.org.cn/portal/api/v2/spc/checkQrToken.do',
        () => HttpResponse.json({ data: { data: '1' } }),
      ),
    )
    const res = await GET(
      new Request('http://localhost/api/auth/qr?qrToken=QR1'),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 1 })
    expect(res.headers.get('set-cookie')).toContain('baomi_token=QR1')
  })

  it('status=-1（失效）不设 cookie', async () => {
    server.use(
      http.post(
        'https://www.baomi.org.cn/portal/api/v2/spc/checkQrToken.do',
        () => HttpResponse.json({ data: { data: '-1' } }),
      ),
    )
    const res = await GET(
      new Request('http://localhost/api/auth/qr?qrToken=QR1'),
    )
    expect(await res.json()).toEqual({ status: -1 })
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('缺 qrToken 返回 400', async () => {
    const res = await GET(new Request('http://localhost/api/auth/qr'))
    expect(res.status).toBe(400)
  })
})
