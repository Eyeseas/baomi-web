import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import {
  generateKeyPairSync,
  privateDecrypt,
  constants as cc,
} from 'node:crypto'
import { server } from '@/test/msw/server'
import { POST } from './route'

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
const rawPub = publicKey.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')

function decrypt(b64: string) {
  return privateDecrypt(
    { key: privateKey, padding: cc.RSA_PKCS1_PADDING },
    Buffer.from(b64, 'base64'),
  ).toString('utf8')
}

function req(body: unknown) {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/login', () => {
  it('加密凭证、登录成功并设 cookie', async () => {
    let sentPayload: any = null
    server.use(
      http.get(
        'https://www.baomi.org.cn/portal/main-api/getPublishKey.do',
        () => HttpResponse.json({ data: rawPub }),
      ),
      http.post(
        'https://www.baomi.org.cn/portal/main-api/loginInNew.do',
        async ({ request }) => {
          sentPayload = await request.json()
          return HttpResponse.json({ token: 'TOK123' })
        },
      ),
    )
    const res = await POST(req({ loginName: 'alice', passWord: 'pw' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('baomi_token=TOK123')
    // 验证发出的是密文，且能解密回明文
    expect(decrypt(sentPayload.loginName)).toBe('alice')
    expect(decrypt(sentPayload.passWord)).toBe('pw')
    expect(sentPayload.siteId).toBe('95')
  })

  it('baomi 未返回 token 时返回 401 + message', async () => {
    server.use(
      http.get(
        'https://www.baomi.org.cn/portal/main-api/getPublishKey.do',
        () => HttpResponse.json({ data: rawPub }),
      ),
      http.post(
        'https://www.baomi.org.cn/portal/main-api/loginInNew.do',
        () => HttpResponse.json({ message: '用户名或密码错误' }),
      ),
    )
    const res = await POST(req({ loginName: 'alice', passWord: 'bad' }))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.message).toBe('用户名或密码错误')
  })

  it('缺少字段返回 400', async () => {
    const res = await POST(req({ loginName: 'alice' }))
    expect(res.status).toBe(400)
  })
})
