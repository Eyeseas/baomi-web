# AutoBaomiGuan Next.js 重写实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把保密观（baomi.org.cn）自动刷课/答题的 Python CLI 重写为 Next.js Web 应用，对等移植登录（扫码/账密）、看目录、看进度、自动刷课、自动考试。

**Architecture:** 无状态代理。浏览器只与 Next.js 通信，Next.js 的 Route Handler 从 httpOnly cookie 取 baomi token 注入请求头后转发/编排 baomi 接口；刷课、考试为耗时任务，用 SSE（`text/event-stream`）边执行边推进度日志。零数据库。

**Tech Stack:** Next.js 15 (App Router) · TypeScript · shadcn/ui + Tailwind CSS · Node `crypto`（RSA PKCS1 v1.5）· Vitest + MSW（测试）

**可测性约定（贯穿全计划）：**
- `lib/baomi/crypto.ts`、`qr.ts`、`client.ts`、`course.ts`、`lib/cookies.ts` 均为纯函数 / async generator，不依赖 `next/headers`。
- Route Handler 用标准 Web `Request`/`Response`：读 cookie 靠手工解析 `Cookie` 头，写 cookie 靠 `Set-Cookie` 头。测试时直接 `import { GET, POST }` 并传入 `new Request(...)`。
- 所有对 baomi 的外呼用 MSW 拦截，测试绝不触达真实接口。

---

## 文件结构

```
app/
  layout.tsx                   根布局（含 Toaster）
  page.tsx                     入口：客户端组件，按登录态渲染 LoginCard 或 CoursePanel
  globals.css                  Tailwind 入口
  api/
    auth/
      login/route.ts           POST 账密登录
      qr/route.ts              POST 取二维码 / GET 轮询登录状态
      check/route.ts           GET 校验 cookie token，返回昵称
      logout/route.ts          POST 清 cookie
    course/
      info/route.ts            GET 课程信息
      directory/route.ts       GET 课程目录
      progress/route.ts        GET 学习进度
    study/route.ts             GET SSE 自动刷课
    exam/route.ts              GET SSE 自动考试
lib/
  cookies.ts                   token cookie 读写（纯函数）
  baomi/
    constants.ts               URL 常量 + env 配置 + 通用头
    errors.ts                  BaomiError
    crypto.ts                  RSA 加密
    qr.ts                      qrToken 解析
    client.ts                  带 token 头的 fetch 封装
    course.ts                  runStudy / runExam async generator（编排）
components/
  ui/                          shadcn 组件（生成）
  LogConsole.tsx               SSE 滚动日志区
  LoginCard.tsx                扫码 Tab + 账密 Tab
  CoursePanel.tsx              四操作按钮 + 目录/进度展示 + 日志
test/
  msw/handlers.ts              MSW 默认 handler
  msw/server.ts                MSW node server
vitest.config.ts
vitest.setup.ts
.env.local.example
```

---

## Task 1: 项目脚手架与测试基建

**Files:**
- Create: 整个 Next.js 项目骨架（在仓库根目录初始化）
- Create: `vitest.config.ts`, `vitest.setup.ts`, `test/msw/server.ts`, `test/msw/handlers.ts`, `.env.local.example`

> 现有仓库根有 Python 文件，Next.js 项目就初始化在同一根目录（`package.json` 与 `main.py` 共存，互不影响）。

- [ ] **Step 1: 初始化 Next.js**

Run（在仓库根 `/Users/eyeseas/Documents/AutoBaomiGuan`，注意末尾的 `.` 表示当前目录）：
```bash
npx create-next-app@latest . --ts --app --tailwind --eslint --src-dir=false --import-alias "@/*" --no-turbopack --use-npm
```
若提示目录非空，选择继续（保留现有文件）。预期生成 `app/`、`package.json`、`tsconfig.json`、`next.config.ts`、`tailwind` 配置。

- [ ] **Step 2: 安装测试与运行依赖**

```bash
npm install -D vitest @vitejs/plugin-react jsdom msw@latest
npm install
```

- [ ] **Step 3: 初始化 shadcn/ui 并添加组件**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button card input label tabs sonner badge
```
预期：生成 `components/ui/*` 与 `components.json`，`lib/utils.ts`（`cn` 工具）。

- [ ] **Step 4: 写 `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
})
```

- [ ] **Step 5: 写 `test/msw/handlers.ts` 与 `test/msw/server.ts`**

`test/msw/handlers.ts`:
```typescript
import { http, HttpResponse } from 'msw'

// 各测试用例会用 server.use(...) 覆盖；默认空数组
export const handlers = []
```

`test/msw/server.ts`:
```typescript
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
```

- [ ] **Step 6: 写 `vitest.setup.ts`**

```typescript
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './test/msw/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

- [ ] **Step 7: 在 `package.json` 的 `scripts` 加入 test**

把 `scripts` 中加：
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 8: 写 `.env.local.example`**

```bash
# 当年课程包标识，每年更换
COURSE_PACKET_ID=312bc914-8e11-421b-b9bc-e900fe1a4e50
# 刷课时每个资源之间的延时（毫秒）
STUDY_DELAY_MS=2000
# baomi 域名
BAOMI_BASE_URL=https://www.baomi.org.cn
```
然后 `cp .env.local.example .env.local`。

- [ ] **Step 9: 冒烟测试基建**

新建临时文件 `test/smoke.test.ts`:
```typescript
import { expect, test } from 'vitest'
test('vitest works', () => { expect(1 + 1).toBe(2) })
```
Run: `npm test`
Expected: PASS（1 passed）。通过后删除该文件：`rm test/smoke.test.ts`

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with vitest + msw + shadcn"
```

---

## Task 2: 常量、配置与错误类型

**Files:**
- Create: `lib/baomi/constants.ts`
- Create: `lib/baomi/errors.ts`

- [ ] **Step 1: 写 `lib/baomi/errors.ts`**

```typescript
export class BaomiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BaomiError'
  }
}
```

- [ ] **Step 2: 写 `lib/baomi/constants.ts`**

```typescript
export const BAOMI_BASE_URL =
  process.env.BAOMI_BASE_URL ?? 'https://www.baomi.org.cn'

export const COURSE_PACKET_ID =
  process.env.COURSE_PACKET_ID ?? '312bc914-8e11-421b-b9bc-e900fe1a4e50'

export const STUDY_DELAY_MS = Number(process.env.STUDY_DELAY_MS ?? '2000')

export const SITE_ID = '95'

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36'

// baomi 接口路径（相对 BAOMI_BASE_URL）
export const PATHS = {
  publishKey: '/portal/main-api/getPublishKey.do',
  login: '/portal/main-api/loginInNew.do',
  checkToken: '/portal/main-api/checkToken.do',
  qrToken: '/portal/main-api/v2/spc/getQrToken.do',
  checkQrToken: '/portal/api/v2/spc/checkQrToken.do',
  courseInfo: '/portal/main-api/v2/coursePacket/getCoursePacket',
  courseDirectory: '/portal/main-api/v2/coursePacket/getCourseDirectoryList',
  courseResources: '/portal/main-api/v2/coursePacket/getCourseResourceList',
  courseProgress: '/portal/main-api/v2/coursePacket/getCourseUserStatistic',
  saveStudy: '/portal/main-api/v2/studyTime/saveCoursePackage.do',
  relateExam: '/portal/main-api/v2/coursePacket/getCourseRelateExam',
  examContent: '/portal/main-api/v2/activity/exam/getExamContentData.do',
  saveExam: '/portal/main-api/v2/activity/exam/saveExamResultJc.do',
  examResult: '/portal/main-api/v2/activity/exam/getExamResultMaxScore.do',
  updateExamInfo: '/portal/main-api/v2/studyTime/updateCoursePackageExamInfo.do',
} as const
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错。

- [ ] **Step 4: Commit**

```bash
git add lib/baomi/constants.ts lib/baomi/errors.ts
git commit -m "feat: add baomi constants and error type"
```

---

## Task 3: RSA 加密（移植 login.py）

**Files:**
- Create: `lib/baomi/crypto.ts`
- Test: `lib/baomi/crypto.test.ts`

baomi 的 `getPublishKey.do` 返回裸 base64（SPKI DER），需补 PEM 头后用 PKCS1 v1.5 加密，输出 base64。测试用 Node 自生成的密钥对做 round-trip，不依赖 baomi。

- [ ] **Step 1: 写失败测试 `lib/baomi/crypto.test.ts`**

```typescript
import { describe, expect, it } from 'vitest'
import {
  generateKeyPairSync,
  privateDecrypt,
  constants as cryptoConstants,
} from 'node:crypto'
import { rsaEncryptPkcs1v15 } from './crypto'

describe('rsaEncryptPkcs1v15', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  // 取出裸 base64（去掉 PEM 头尾），模拟 baomi 返回格式
  const rawBase64 = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s/g, '')

  it('加密结果可被对应私钥解密还原（裸 base64 公钥）', () => {
    const plaintext = 'za123456'
    const encrypted = rsaEncryptPkcs1v15(plaintext, rawBase64)
    const decrypted = privateDecrypt(
      { key: privateKey, padding: cryptoConstants.RSA_PKCS1_PADDING },
      Buffer.from(encrypted, 'base64'),
    )
    expect(decrypted.toString('utf8')).toBe(plaintext)
  })

  it('也接受完整 PEM 格式公钥', () => {
    const encrypted = rsaEncryptPkcs1v15('hello', publicKey)
    const decrypted = privateDecrypt(
      { key: privateKey, padding: cryptoConstants.RSA_PKCS1_PADDING },
      Buffer.from(encrypted, 'base64'),
    )
    expect(decrypted.toString('utf8')).toBe('hello')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/baomi/crypto.test.ts`
Expected: FAIL（`rsaEncryptPkcs1v15` is not a function / 模块不存在）。

- [ ] **Step 3: 写实现 `lib/baomi/crypto.ts`**

```typescript
import { publicEncrypt, constants as cryptoConstants } from 'node:crypto'

/**
 * RSA 加密（PKCS#1 v1.5）。
 * @param data 明文
 * @param publicKey 裸 base64（自动补 PEM 头尾）或完整 PEM
 * @returns base64 编码的密文
 */
export function rsaEncryptPkcs1v15(data: string, publicKey: string): string {
  const pem = publicKey.trim().startsWith('-----BEGIN')
    ? publicKey
    : `-----BEGIN PUBLIC KEY-----\n${publicKey.trim()}\n-----END PUBLIC KEY-----`

  const encrypted = publicEncrypt(
    { key: pem, padding: cryptoConstants.RSA_PKCS1_PADDING },
    Buffer.from(data, 'utf8'),
  )
  return encrypted.toString('base64')
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/baomi/crypto.test.ts`
Expected: PASS（2 passed）。

- [ ] **Step 5: Commit**

```bash
git add lib/baomi/crypto.ts lib/baomi/crypto.test.ts
git commit -m "feat: add RSA PKCS1 v1.5 encryption"
```

---

## Task 4: qrToken 解析（移植 login.py）

**Files:**
- Create: `lib/baomi/qr.ts`
- Test: `lib/baomi/qr.test.ts`

- [ ] **Step 1: 写失败测试 `lib/baomi/qr.test.ts`**

```typescript
import { describe, expect, it } from 'vitest'
import { parseQrToken } from './qr'

describe('parseQrToken', () => {
  it('从二维码 JSON 中提取 qrToken', () => {
    const payload = JSON.stringify({ params: { qrToken: 'abc123' } })
    expect(parseQrToken(payload)).toBe('abc123')
  })

  it('缺少 qrToken 时抛错', () => {
    const payload = JSON.stringify({ params: {} })
    expect(() => parseQrToken(payload)).toThrow('二维码内容缺少 qrToken')
  })

  it('非法 JSON 时抛错', () => {
    expect(() => parseQrToken('not-json')).toThrow('二维码内容缺少 qrToken')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/baomi/qr.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写实现 `lib/baomi/qr.ts`**

```typescript
import { BaomiError } from './errors'

/**
 * 从二维码内容（JSON 字符串）中解析 qrToken。
 */
export function parseQrToken(qrPayload: string): string {
  try {
    const payload = JSON.parse(qrPayload)
    const qrToken = payload?.params?.qrToken
    if (!qrToken || typeof qrToken !== 'string') {
      throw new BaomiError('二维码内容缺少 qrToken')
    }
    return qrToken
  } catch (e) {
    if (e instanceof BaomiError) throw e
    throw new BaomiError('二维码内容缺少 qrToken')
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/baomi/qr.test.ts`
Expected: PASS（3 passed）。

- [ ] **Step 5: Commit**

```bash
git add lib/baomi/qr.ts lib/baomi/qr.test.ts
git commit -m "feat: add qrToken parser"
```

---

## Task 5: token cookie 读写（纯函数）

**Files:**
- Create: `lib/cookies.ts`
- Test: `lib/cookies.test.ts`

- [ ] **Step 1: 写失败测试 `lib/cookies.test.ts`**

```typescript
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/cookies.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写实现 `lib/cookies.ts`**

```typescript
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/cookies.test.ts`
Expected: PASS（4 passed）。

- [ ] **Step 5: Commit**

```bash
git add lib/cookies.ts lib/cookies.test.ts
git commit -m "feat: add token cookie helpers"
```

---

## Task 6: baomi client（带 token 头的 fetch）

**Files:**
- Create: `lib/baomi/client.ts`
- Test: `lib/baomi/client.test.ts`

- [ ] **Step 1: 写失败测试 `lib/baomi/client.test.ts`**

```typescript
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
      http.get('https://www.baomi.org.cn/portal/fail', () =>
        new HttpResponse(null, { status: 500 }),
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/baomi/client.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写实现 `lib/baomi/client.ts`**

```typescript
import { BAOMI_BASE_URL, SITE_ID, USER_AGENT } from './constants'
import { BaomiError } from './errors'

function headers(token: string): HeadersInit {
  return {
    'User-Agent': USER_AGENT,
    token,
    authToken: token,
    siteId: SITE_ID,
    'Content-Type': 'application/json',
  }
}

function buildUrl(path: string, params?: Record<string, string | number>): string {
  const url = new URL(path, BAOMI_BASE_URL)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v))
    }
  }
  return url.toString()
}

export async function baomiGet<T = any>(
  path: string,
  token: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const res = await fetch(buildUrl(path, params), { headers: headers(token) })
  if (!res.ok) throw new BaomiError(`请求失败，状态码: ${res.status}`)
  return res.json() as Promise<T>
}

export async function baomiPost<T = any>(
  path: string,
  token: string,
  body: unknown,
  params?: Record<string, string | number>,
): Promise<T> {
  const res = await fetch(buildUrl(path, params), {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new BaomiError(`请求失败，状态码: ${res.status}`)
  return res.json() as Promise<T>
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/baomi/client.test.ts`
Expected: PASS（3 passed）。

- [ ] **Step 5: Commit**

```bash
git add lib/baomi/client.ts lib/baomi/client.test.ts
git commit -m "feat: add baomi http client"
```

---

## Task 7: 账密登录 Route（移植 login.py 的 login）

**Files:**
- Create: `app/api/auth/login/route.ts`
- Test: `app/api/auth/login/route.test.ts`

流程：取公钥 → RSA 加密 loginName/passWord → POST `loginInNew.do` → 取 `token` → 设 cookie。

- [ ] **Step 1: 写失败测试 `app/api/auth/login/route.test.ts`**

```typescript
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
      http.get('https://www.baomi.org.cn/portal/main-api/getPublishKey.do', () =>
        HttpResponse.json({ data: rawPub }),
      ),
      http.post('https://www.baomi.org.cn/portal/main-api/loginInNew.do', async ({ request }) => {
        sentPayload = await request.json()
        return HttpResponse.json({ token: 'TOK123' })
      }),
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
      http.get('https://www.baomi.org.cn/portal/main-api/getPublishKey.do', () =>
        HttpResponse.json({ data: rawPub }),
      ),
      http.post('https://www.baomi.org.cn/portal/main-api/loginInNew.do', () =>
        HttpResponse.json({ message: '用户名或密码错误' }),
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run app/api/auth/login/route.test.ts`
Expected: FAIL（`./route` 不存在）。

- [ ] **Step 3: 写实现 `app/api/auth/login/route.ts`**

```typescript
import { PATHS, BAOMI_BASE_URL, SITE_ID } from '@/lib/baomi/constants'
import { rsaEncryptPkcs1v15 } from '@/lib/baomi/crypto'
import { tokenCookie } from '@/lib/cookies'

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
}

async function getPublicKey(): Promise<string> {
  const res = await fetch(`${BAOMI_BASE_URL}${PATHS.publishKey}`)
  if (!res.ok) throw new Error(`获取公钥失败，状态码: ${res.status}`)
  const data = await res.json()
  return data.data
}

export async function POST(req: Request) {
  let body: { loginName?: string; passWord?: string }
  try {
    body = await req.json()
  } catch {
    return json({ message: '请求体格式错误' }, { status: 400 })
  }
  const { loginName, passWord } = body
  if (!loginName || !passWord) {
    return json({ message: '用户名和密码不能为空' }, { status: 400 })
  }

  let publicKey: string
  try {
    publicKey = await getPublicKey()
  } catch (e) {
    return json({ message: `加密准备失败: ${(e as Error).message}` }, { status: 502 })
  }

  const payload = {
    loginName: rsaEncryptPkcs1v15(loginName, publicKey),
    passWord: rsaEncryptPkcs1v15(passWord, publicKey),
    deviceId: 1711,
    deviceOs: 'pc',
    lon: 40,
    lat: 30,
    siteId: SITE_ID,
    sinopec: 'false',
  }

  const res = await fetch(`${BAOMI_BASE_URL}${PATHS.login}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', siteId: SITE_ID },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    return json({ message: `登录请求失败，状态码: ${res.status}` }, { status: 502 })
  }
  const data = await res.json()
  if (!data.token) {
    return json({ message: data.message ?? '登录失败' }, { status: 401 })
  }

  return json(
    { ok: true },
    { headers: { 'Set-Cookie': tokenCookie(data.token) } },
  )
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run app/api/auth/login/route.test.ts`
Expected: PASS（3 passed）。

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/login/route.ts app/api/auth/login/route.test.ts
git commit -m "feat: add username/password login route"
```

---

## Task 8: 扫码登录 Route（移植 login.py 的 qr_login）

**Files:**
- Create: `app/api/auth/qr/route.ts`
- Test: `app/api/auth/qr/route.test.ts`

`POST` 取二维码内容与 qrToken；`GET ?qrToken=` 轮询：返回 `{status}`，`status===1` 时把 qrToken 作为 token 设 cookie。

- [ ] **Step 1: 写失败测试 `app/api/auth/qr/route.test.ts`**

```typescript
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { GET, POST } from './route'

describe('POST /api/auth/qr', () => {
  it('返回二维码内容与 qrToken', async () => {
    const qrContent = JSON.stringify({ params: { qrToken: 'QR1' } })
    server.use(
      http.post('https://www.baomi.org.cn/portal/main-api/v2/spc/getQrToken.do', () =>
        HttpResponse.json({ data: { data: qrContent } }),
      ),
    )
    const res = await POST(new Request('http://localhost/api/auth/qr', { method: 'POST' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.qrToken).toBe('QR1')
    expect(json.qrContent).toBe(qrContent)
  })
})

describe('GET /api/auth/qr', () => {
  it('status=1 时设 cookie 并返回 status', async () => {
    server.use(
      http.post('https://www.baomi.org.cn/portal/api/v2/spc/checkQrToken.do', () =>
        HttpResponse.json({ data: { data: '1' } }),
      ),
    )
    const res = await GET(new Request('http://localhost/api/auth/qr?qrToken=QR1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 1 })
    expect(res.headers.get('set-cookie')).toContain('baomi_token=QR1')
  })

  it('status=-1（失效）不设 cookie', async () => {
    server.use(
      http.post('https://www.baomi.org.cn/portal/api/v2/spc/checkQrToken.do', () =>
        HttpResponse.json({ data: { data: '-1' } }),
      ),
    )
    const res = await GET(new Request('http://localhost/api/auth/qr?qrToken=QR1'))
    expect(await res.json()).toEqual({ status: -1 })
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('缺 qrToken 返回 400', async () => {
    const res = await GET(new Request('http://localhost/api/auth/qr'))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run app/api/auth/qr/route.test.ts`
Expected: FAIL（`./route` 不存在）。

- [ ] **Step 3: 写实现 `app/api/auth/qr/route.ts`**

```typescript
import { BAOMI_BASE_URL, PATHS, SITE_ID } from '@/lib/baomi/constants'
import { parseQrToken } from '@/lib/baomi/qr'
import { tokenCookie } from '@/lib/cookies'

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
}

export async function POST() {
  const res = await fetch(`${BAOMI_BASE_URL}${PATHS.qrToken}`, {
    method: 'POST',
    headers: { siteId: SITE_ID },
  })
  if (!res.ok) {
    return json({ message: `获取二维码失败，状态码: ${res.status}` }, { status: 502 })
  }
  const data = await res.json()
  const qrContent: string | undefined = data?.data?.data
  if (!qrContent) {
    return json({ message: '二维码接口返回格式异常' }, { status: 502 })
  }
  try {
    const qrToken = parseQrToken(qrContent)
    return json({ qrContent, qrToken })
  } catch (e) {
    return json({ message: (e as Error).message }, { status: 502 })
  }
}

export async function GET(req: Request) {
  const qrToken = new URL(req.url).searchParams.get('qrToken')
  if (!qrToken) {
    return json({ message: '缺少 qrToken' }, { status: 400 })
  }
  const res = await fetch(`${BAOMI_BASE_URL}${PATHS.checkQrToken}?qrToken=${encodeURIComponent(qrToken)}`, {
    method: 'POST',
  })
  if (!res.ok) {
    return json({ message: `检查二维码状态失败，状态码: ${res.status}` }, { status: 502 })
  }
  const data = await res.json()
  const status = Number(data?.data?.data)
  if (status === 1) {
    return json({ status: 1 }, { headers: { 'Set-Cookie': tokenCookie(qrToken) } })
  }
  return json({ status })
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run app/api/auth/qr/route.test.ts`
Expected: PASS（4 passed）。

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/qr/route.ts app/api/auth/qr/route.test.ts
git commit -m "feat: add QR login route"
```

---

## Task 9: check 与 logout Route（移植 main.py 的 check_login）

**Files:**
- Create: `app/api/auth/check/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Test: `app/api/auth/check/route.test.ts`

`check`：读 cookie token → `checkToken.do` → 返回昵称（空名回 `未设定姓名`）；无效返回 401。`logout`：清 cookie。

- [ ] **Step 1: 写失败测试 `app/api/auth/check/route.test.ts`**

```typescript
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
      http.get('https://www.baomi.org.cn/portal/main-api/checkToken.do', () =>
        HttpResponse.json({ result: true, data: { nickName: '张三' } }),
      ),
    )
    const res = await GET(reqWithToken('TOK'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ nickname: '张三' })
  })

  it('昵称为空返回「未设定姓名」', async () => {
    server.use(
      http.get('https://www.baomi.org.cn/portal/main-api/checkToken.do', () =>
        HttpResponse.json({ result: true, data: { nickName: '' } }),
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
      http.get('https://www.baomi.org.cn/portal/main-api/checkToken.do', () =>
        HttpResponse.json({ result: false }),
      ),
    )
    const res = await GET(reqWithToken('BAD'))
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run app/api/auth/check/route.test.ts`
Expected: FAIL（`./route` 不存在）。

- [ ] **Step 3: 写实现 `app/api/auth/check/route.ts`**

```typescript
import { baomiGet } from '@/lib/baomi/client'
import { PATHS } from '@/lib/baomi/constants'
import { getToken } from '@/lib/cookies'

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
}

export async function GET(req: Request) {
  const token = getToken(req)
  if (!token) return json({ message: '未登录' }, { status: 401 })
  try {
    const data = await baomiGet(PATHS.checkToken, token)
    if (data?.result) {
      const nickname = data.data?.nickName || '未设定姓名'
      return json({ nickname })
    }
  } catch {
    // 落到 401
  }
  return json({ message: '凭证已过期，请重新登录' }, { status: 401 })
}
```

- [ ] **Step 4: 写实现 `app/api/auth/logout/route.ts`**

```typescript
import { clearCookie } from '@/lib/cookies'

export async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearCookie() },
  })
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run app/api/auth/check/route.test.ts`
Expected: PASS（4 passed）。

- [ ] **Step 6: Commit**

```bash
git add app/api/auth/check/route.ts app/api/auth/logout/route.ts app/api/auth/check/route.test.ts
git commit -m "feat: add check and logout routes"
```

---

## Task 10: 读类 course Route（info / directory / progress）

**Files:**
- Create: `app/api/course/info/route.ts`
- Create: `app/api/course/directory/route.ts`
- Create: `app/api/course/progress/route.ts`
- Create: `lib/baomi/route-helpers.ts`
- Test: `app/api/course/progress/route.test.ts`

三个 route 模式相同：取 cookie token → 调对应 baomi 接口（带 `COURSE_PACKET_ID`）→ 透传 JSON。抽到一个 helper，避免重复（DRY）。

- [ ] **Step 1: 写失败测试 `app/api/course/progress/route.test.ts`**

```typescript
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run app/api/course/progress/route.test.ts`
Expected: FAIL（`./route` 不存在）。

- [ ] **Step 3: 写 helper `lib/baomi/route-helpers.ts`**

```typescript
import { baomiGet } from './client'
import { COURSE_PACKET_ID } from './constants'
import { getToken } from '@/lib/cookies'

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
}

/** 取 cookie token，调用某个带 coursePacketId 的 GET 接口并透传结果。 */
export async function proxyCourseGet(
  req: Request,
  path: string,
  extraParams: Record<string, string | number> = {},
): Promise<Response> {
  const token = getToken(req)
  if (!token) return json({ message: '未登录' }, { status: 401 })
  try {
    const data = await baomiGet(path, token, {
      coursePacketId: COURSE_PACKET_ID,
      token,
      ...extraParams,
    })
    return json(data)
  } catch (e) {
    return json({ message: (e as Error).message }, { status: 502 })
  }
}
```

> 说明：原 Python 对 info 接口只传 `coursePacketId`，对 directory 传 `scale`+`coursePacketId`，对 progress 传 `coursePacketId`+`token`。统一带上 `token` query 与 `coursePacketId` 不影响这些接口（baomi 容忍多余参数；directory 额外补 `scale`）。

- [ ] **Step 4: 写三个 route**

`app/api/course/info/route.ts`:
```typescript
import { PATHS } from '@/lib/baomi/constants'
import { proxyCourseGet } from '@/lib/baomi/route-helpers'

export function GET(req: Request) {
  return proxyCourseGet(req, PATHS.courseInfo)
}
```

`app/api/course/directory/route.ts`:
```typescript
import { PATHS } from '@/lib/baomi/constants'
import { proxyCourseGet } from '@/lib/baomi/route-helpers'

export function GET(req: Request) {
  return proxyCourseGet(req, PATHS.courseDirectory, { scale: 1 })
}
```

`app/api/course/progress/route.ts`:
```typescript
import { PATHS } from '@/lib/baomi/constants'
import { proxyCourseGet } from '@/lib/baomi/route-helpers'

export function GET(req: Request) {
  return proxyCourseGet(req, PATHS.courseProgress)
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run app/api/course/progress/route.test.ts`
Expected: PASS（2 passed）。

- [ ] **Step 6: Commit**

```bash
git add app/api/course/info/route.ts app/api/course/directory/route.ts app/api/course/progress/route.ts lib/baomi/route-helpers.ts app/api/course/progress/route.test.ts
git commit -m "feat: add read-only course routes"
```

---

## Task 11: 刷课编排 runStudy（移植 course.py 的 study_course）

**Files:**
- Create: `lib/baomi/course.ts`（本任务先写 `runStudy` 及辅助）
- Test: `lib/baomi/course.study.test.ts`

`runStudy` 是 async generator，逐资源 yield 进度事件。延时通过参数注入（测试传 0）。

事件类型定义（本任务一并定义，后续考试任务复用）：
```typescript
export type ProgressEvent =
  | { type: 'log'; message: string }
  | { type: 'progress'; name: string; ok: boolean }
  | { type: 'result'; data: Record<string, unknown> }
  | { type: 'error'; message: string }
  | { type: 'done' }
```

- [ ] **Step 1: 写失败测试 `lib/baomi/course.study.test.ts`**

```typescript
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { runStudy, type ProgressEvent } from './course'

const BASE = 'https://www.baomi.org.cn'

async function collect(gen: AsyncGenerator<ProgressEvent>) {
  const events: ProgressEvent[] = []
  for await (const e of gen) events.push(e)
  return events
}

describe('runStudy', () => {
  it('遍历目录与资源，逐个保存学习记录并 yield 进度', async () => {
    const saved: string[] = []
    server.use(
      http.get(`${BASE}/portal/main-api/v2/coursePacket/getCourseDirectoryList`, () =>
        HttpResponse.json({
          data: [
            { name: '章节1', subDirectory: [{ name: '小节A', SYS_UUID: 'dir-a' }] },
          ],
        }),
      ),
      http.get(`${BASE}/portal/main-api/v2/coursePacket/getCourseResourceList`, () =>
        HttpResponse.json({
          data: {
            listdata: [
              { resourceID: 'r1', SYS_UUID: 'u1', name: '视频1', timeLength: '00:01:30' },
            ],
          },
        }),
      ),
      http.get(`${BASE}/portal/main-api/v2/studyTime/saveCoursePackage.do`, ({ request }) => {
        const u = new URL(request.url)
        saved.push(u.searchParams.get('resourceId') ?? '')
        // 验证时长换算：00:01:30 = 90 秒
        expect(u.searchParams.get('resourceLength')).toBe('90')
        expect(u.searchParams.get('studyLength')).toBe('90')
        return HttpResponse.json({ status: 0 })
      }),
    )

    const events = await collect(runStudy('TOK', 'CP', { delayMs: 0 }))
    expect(saved).toEqual(['r1'])
    expect(events).toContainEqual({ type: 'progress', name: '视频1', ok: true })
    expect(events.at(-1)).toEqual({ type: 'done' })
  })

  it('保存失败时 yield ok=false', async () => {
    server.use(
      http.get(`${BASE}/portal/main-api/v2/coursePacket/getCourseDirectoryList`, () =>
        HttpResponse.json({
          data: [{ name: 'S', subDirectory: [{ name: 'sub', SYS_UUID: 'd' }] }],
        }),
      ),
      http.get(`${BASE}/portal/main-api/v2/coursePacket/getCourseResourceList`, () =>
        HttpResponse.json({
          data: { listdata: [{ resourceID: 'r1', SYS_UUID: 'u1', name: 'V', timeLength: '00:00:10' }] },
        }),
      ),
      http.get(`${BASE}/portal/main-api/v2/studyTime/saveCoursePackage.do`, () =>
        HttpResponse.json({ status: 1, message: 'fail' }),
      ),
    )
    const events = await collect(runStudy('TOK', 'CP', { delayMs: 0 }))
    expect(events).toContainEqual({ type: 'progress', name: 'V', ok: false })
  })

  it('目录为空时 yield error', async () => {
    server.use(
      http.get(`${BASE}/portal/main-api/v2/coursePacket/getCourseDirectoryList`, () =>
        HttpResponse.json({ data: null }),
      ),
    )
    const events = await collect(runStudy('TOK', 'CP', { delayMs: 0 }))
    expect(events.some((e) => e.type === 'error')).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/baomi/course.study.test.ts`
Expected: FAIL（`./course` 不存在）。

- [ ] **Step 3: 写实现 `lib/baomi/course.ts`**

```typescript
import { baomiGet } from './client'
import { PATHS, STUDY_DELAY_MS } from './constants'

export type ProgressEvent =
  | { type: 'log'; message: string }
  | { type: 'progress'; name: string; ok: boolean }
  | { type: 'result'; data: Record<string, unknown> }
  | { type: 'error'; message: string }
  | { type: 'done' }

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** "HH:MM:SS" → 秒 */
export function timeToSeconds(s: string): number {
  const parts = s.split(':').map((n) => parseInt(n, 10))
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0
  const [h, m, sec] = parts
  return h * 3600 + m * 60 + sec
}

interface StudyOptions {
  delayMs?: number
}

export async function* runStudy(
  token: string,
  coursePacketId: string,
  options: StudyOptions = {},
): AsyncGenerator<ProgressEvent> {
  const delayMs = options.delayMs ?? STUDY_DELAY_MS

  let directory: any
  try {
    directory = await baomiGet(PATHS.courseDirectory, token, {
      scale: 1,
      coursePacketId,
    })
  } catch (e) {
    yield { type: 'error', message: `获取课程目录失败: ${(e as Error).message}` }
    return
  }
  if (!directory?.data) {
    yield { type: 'error', message: '获取课程目录失败' }
    return
  }

  for (const section of directory.data) {
    yield { type: 'log', message: `开始学习章节: ${section.name}` }
    for (const sub of section.subDirectory ?? []) {
      yield { type: 'log', message: `正在学习: ${sub.name}` }
      let resources: any
      try {
        resources = await baomiGet(PATHS.courseResources, token, {
          coursePacketId,
          directoryId: sub.SYS_UUID,
          token,
        })
      } catch (e) {
        yield { type: 'error', message: `获取资源列表失败: ${(e as Error).message}` }
        continue
      }
      const list = resources?.data?.listdata
      if (!list) {
        yield { type: 'error', message: `获取资源列表失败: ${sub.name}` }
        continue
      }
      for (const resource of list) {
        const seconds = timeToSeconds(resource.timeLength)
        const now = Date.now()
        let ok = false
        try {
          const result = await baomiGet(PATHS.saveStudy, token, {
            courseId: coursePacketId,
            resourceId: resource.resourceID,
            resourceDirectoryId: resource.SYS_UUID,
            resourceLength: seconds,
            studyLength: seconds,
            studyTime: seconds,
            startTime: now,
            resourceName: encodeURIComponent(resource.name),
            resourceType: '1',
            resourceLibId: '3',
            token,
          })
          ok = result?.status === 0
        } catch {
          ok = false
        }
        yield { type: 'progress', name: resource.name, ok }
        if (delayMs > 0) await sleep(delayMs)
      }
    }
  }
  yield { type: 'done' }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/baomi/course.study.test.ts`
Expected: PASS（3 passed）。

- [ ] **Step 5: Commit**

```bash
git add lib/baomi/course.ts lib/baomi/course.study.test.ts
git commit -m "feat: add runStudy orchestration generator"
```

---

## Task 12: 刷课 SSE Route

**Files:**
- Create: `app/api/study/route.ts`
- Create: `lib/baomi/sse.ts`
- Test: `app/api/study/route.test.ts`

把 `ProgressEvent` 流写成 SSE。`lib/baomi/sse.ts` 提供把 async generator 转成 `ReadableStream` 的工具（考试 route 复用）。

- [ ] **Step 1: 写失败测试 `app/api/study/route.test.ts`**

```typescript
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
      http.get(`${BASE}/portal/main-api/v2/coursePacket/getCourseDirectoryList`, () =>
        HttpResponse.json({
          data: [{ name: 'S', subDirectory: [{ name: 'sub', SYS_UUID: 'd' }] }],
        }),
      ),
      http.get(`${BASE}/portal/main-api/v2/coursePacket/getCourseResourceList`, () =>
        HttpResponse.json({
          data: { listdata: [{ resourceID: 'r1', SYS_UUID: 'u1', name: 'V', timeLength: '00:00:05' }] },
        }),
      ),
      http.get(`${BASE}/portal/main-api/v2/studyTime/saveCoursePackage.do`, () =>
        HttpResponse.json({ status: 0 }),
      ),
    )
    const res = await GET(reqWithToken('TOK'))
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const text = await readAll(res)
    expect(text).toContain('"type":"progress"')
    expect(text).toContain('"type":"done"')
    // SSE 帧格式
    expect(text).toContain('data: ')
  })
})
```

> 注：测试里 route 内部用默认 `STUDY_DELAY_MS`（2000ms）会拖慢。实现需让 route 给 `runStudy` 传 `delayMs: 0` 当处于测试，或读取 env。最简单：route 始终传 `delayMs: STUDY_DELAY_MS`，并在该测试运行前设 `process.env.STUDY_DELAY_MS = '0'`。在测试文件顶部加：`process.env.STUDY_DELAY_MS = '0'`（见下方 Step 实现说明）。

- [ ] **Step 2: 在测试文件顶部加一行**

在 `app/api/study/route.test.ts` 第一行 import 之前加：
```typescript
process.env.STUDY_DELAY_MS = '0'
```
> 由于 `constants.ts` 在模块加载时读取 env，需确保它在 import 链之前被设置。把这行放到文件最顶端即可（Vitest 每个测试文件独立模块图）。

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run app/api/study/route.test.ts`
Expected: FAIL（`./route` 不存在）。

- [ ] **Step 4: 写 `lib/baomi/sse.ts`**

```typescript
import type { ProgressEvent } from './course'

/** 把 ProgressEvent async generator 转成 SSE ReadableStream。 */
export function eventStream(
  gen: AsyncGenerator<ProgressEvent>,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of gen) {
          if (signal?.aborted) break
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        }
      } catch (e) {
        const err = { type: 'error', message: (e as Error).message }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(err)}\n\n`))
      } finally {
        controller.close()
      }
    },
  })
}

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
}
```

- [ ] **Step 5: 写 `app/api/study/route.ts`**

```typescript
import { runStudy } from '@/lib/baomi/course'
import { COURSE_PACKET_ID } from '@/lib/baomi/constants'
import { eventStream, SSE_HEADERS } from '@/lib/baomi/sse'
import { getToken } from '@/lib/cookies'

export async function GET(req: Request) {
  const token = getToken(req)
  if (!token) {
    return new Response(JSON.stringify({ message: '未登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const stream = eventStream(runStudy(token, COURSE_PACKET_ID), req.signal)
  return new Response(stream, { headers: SSE_HEADERS })
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run app/api/study/route.test.ts`
Expected: PASS（2 passed）。

- [ ] **Step 7: Commit**

```bash
git add app/api/study/route.ts lib/baomi/sse.ts app/api/study/route.test.ts
git commit -m "feat: add study SSE route"
```

---

## Task 13: 考试编排 runExam（移植 course.py 的 complete_exam，改为动态取 examId）

**Files:**
- Modify: `lib/baomi/course.ts`（追加 `runExam` 与 `generateRandomId`、`buildExamAnswers`）
- Test: `lib/baomi/course.exam.test.ts`

关键改动（对齐 spec）：**第一步用 `getCourseRelateExam` 动态取 examId**，不再硬编码。

- [ ] **Step 1: 写失败测试 `lib/baomi/course.exam.test.ts`**

```typescript
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { runExam, buildExamAnswers, type ProgressEvent } from './course'

const BASE = 'https://www.baomi.org.cn'

async function collect(gen: AsyncGenerator<ProgressEvent>) {
  const events: ProgressEvent[] = []
  for await (const e of gen) events.push(e)
  return events
}

describe('buildExamAnswers', () => {
  it('以每题正确答案构造提交数据，得分率 100%', () => {
    const paper = {
      typeList: [
        {
          type: 1,
          questionList: [{ id: 'q1', tqId: 't1', answer: 'A' }],
        },
      ],
    }
    const answers = buildExamAnswers(paper)
    expect(answers).toEqual([
      {
        parentId: '0',
        qstId: 'q1',
        resultFlag: 0,
        standardAnswer: 'A',
        subCount: 0,
        tqId: 't1',
        userAnswer: 'A',
        userScoreRate: '100%',
        viewTypeId: 1,
      },
    ])
  })
})

describe('runExam', () => {
  it('动态取 examId → 取卷 → 提交 → 查分 → 更新状态', async () => {
    let usedExamId = ''
    let submitted: any = null
    server.use(
      http.get(`${BASE}/portal/main-api/v2/coursePacket/getCourseRelateExam`, () =>
        HttpResponse.json({ status: 0, data: { examId: 'EX1' } }),
      ),
      http.get(`${BASE}/portal/main-api/v2/activity/exam/getExamContentData.do`, ({ request }) => {
        usedExamId = new URL(request.url).searchParams.get('examId') ?? ''
        return HttpResponse.json({
          data: {
            randomId: 'RID2',
            typeList: [{ type: 1, questionList: [{ id: 'q1', tqId: 't1', answer: 'A' }] }],
          },
        })
      }),
      http.post(`${BASE}/portal/main-api/v2/activity/exam/saveExamResultJc.do`, async ({ request }) => {
        submitted = await request.json()
        return HttpResponse.json({ status: 0 })
      }),
      http.get(`${BASE}/portal/main-api/v2/activity/exam/getExamResultMaxScore.do`, () =>
        HttpResponse.json({ status: 0, data: { exam_name: '保密考试', score: 100, answerCount: 1 } }),
      ),
      http.get(`${BASE}/portal/main-api/v2/studyTime/updateCoursePackageExamInfo.do`, () =>
        HttpResponse.json({ status: 0 }),
      ),
    )

    const events = await collect(runExam('TOK', 'CP'))
    expect(usedExamId).toBe('EX1')
    // 提交用的是卷子返回的新 randomId
    expect(submitted.randomId).toBe('RID2')
    expect(JSON.parse(submitted.examResult)[0].userAnswer).toBe('A')
    expect(events.some((e) => e.type === 'result')).toBe(true)
    expect(events.at(-1)).toEqual({ type: 'done' })
  })

  it('取不到 examId 时 yield error', async () => {
    server.use(
      http.get(`${BASE}/portal/main-api/v2/coursePacket/getCourseRelateExam`, () =>
        HttpResponse.json({ status: 0, data: {} }),
      ),
    )
    const events = await collect(runExam('TOK', 'CP'))
    expect(events.some((e) => e.type === 'error')).toBe(true)
    expect(events.at(-1)).toEqual({ type: 'done' })
  })
})
```

> **待真机验证点（来自 spec 第 10 节）：** `getCourseRelateExam` 返回体中 examId 的确切字段名未知。本实现假设为 `data.examId`，并兼容 `data.id`、`data.exam_id`。真机联调时若字段不同，改 `extractExamId` 一处即可。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/baomi/course.exam.test.ts`
Expected: FAIL（`runExam`/`buildExamAnswers` 未导出）。

- [ ] **Step 3: 在 `lib/baomi/course.ts` 末尾追加实现**

```typescript
import { createHash } from 'node:crypto'
import { baomiPost } from './client'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}
/** 当前时间格式化为 "YYYY-MM-DD HH:mm:ss"（本地时区，对齐 Python strftime） */
function formatNow(): string {
  const d = new Date()
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  )
}

/** 生成自定义随机 id：md5("founder" + 1..500) */
export function generateRandomId(): string {
  const e = Math.floor(Math.random() * 500) + 1
  return createHash('md5').update(`founder${e}`).digest('hex')
}

function extractExamId(relate: any): string | undefined {
  return relate?.data?.examId ?? relate?.data?.id ?? relate?.data?.exam_id
}

/** 把试卷的每题正确答案构造成提交数据。 */
export function buildExamAnswers(paper: any): Array<Record<string, unknown>> {
  const answers: Array<Record<string, unknown>> = []
  for (const typeItem of paper?.typeList ?? []) {
    for (const q of typeItem.questionList ?? []) {
      answers.push({
        parentId: '0',
        qstId: q.id,
        resultFlag: 0,
        standardAnswer: q.answer,
        subCount: 0,
        tqId: q.tqId,
        userAnswer: q.answer,
        userScoreRate: '100%',
        viewTypeId: typeItem.type ?? 1,
      })
    }
  }
  return answers
}

export async function* runExam(
  token: string,
  coursePacketId: string,
): AsyncGenerator<ProgressEvent> {
  try {
    // 1. 动态取 examId
    yield { type: 'log', message: '获取考试信息...' }
    const relate = await baomiGet(PATHS.relateExam, token, { coursePacketId, token })
    const examId = extractExamId(relate)
    if (!examId) {
      yield { type: 'error', message: '未找到考试ID' }
      yield { type: 'done' }
      return
    }

    // 2. 取试卷答案
    const paper = await baomiGet(PATHS.examContent, token, {
      examId,
      randomId: generateRandomId(),
    })
    if (!paper?.data) {
      yield { type: 'error', message: '获取试卷答案失败' }
      yield { type: 'done' }
      return
    }
    yield { type: 'log', message: '获取试卷答案成功' }
    const randomId = paper.data.randomId
    if (!randomId) {
      yield { type: 'error', message: '获取 randomId 失败' }
      yield { type: 'done' }
      return
    }

    // 3. 构造并提交
    const answers = buildExamAnswers(paper.data)
    const submit = await baomiPost(PATHS.saveExam, token, {
      examId,
      examResult: JSON.stringify(answers),
      randomId,
      startDate: formatNow(),
    })
    if (submit?.status !== 0) {
      yield { type: 'error', message: `答案提交失败: ${submit?.message ?? ''}` }
      yield { type: 'done' }
      return
    }
    yield { type: 'log', message: '答案提交成功！' }

    // 4. 查成绩
    const result = await baomiGet(PATHS.examResult, token, { examId, token })
    let score = 100
    if (result?.status === 0 && result.data) {
      score = result.data.score ?? 100
      yield { type: 'result', data: result.data }
    } else {
      yield { type: 'log', message: '成绩查询失败或暂未生成，使用默认分数' }
    }

    // 5. 更新完成状态
    await baomiGet(PATHS.updateExamInfo, token, {
      courseId: coursePacketId,
      orgId: '',
      isExam: 1,
      isCertificate: 0,
      examResult: score,
      token,
    })
    yield { type: 'log', message: '考试状态更新成功！' }
  } catch (e) {
    yield { type: 'error', message: `考试过程出错: ${(e as Error).message}` }
  }
  yield { type: 'done' }
}
```

> 注意：`baomiGet` 已在文件顶部 import；本段新增的 `baomiPost`、`createHash` 需补到文件顶部的 import 区（把 `import { createHash } from 'node:crypto'` 和 `baomiPost` 合并进已有 `import { baomiGet } from './client'`）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/baomi/course.exam.test.ts`
Expected: PASS（3 passed）。

- [ ] **Step 5: 跑全量单测确保未回归**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add lib/baomi/course.ts lib/baomi/course.exam.test.ts
git commit -m "feat: add runExam orchestration with dynamic examId"
```

---

## Task 14: 考试 SSE Route

**Files:**
- Create: `app/api/exam/route.ts`
- Test: `app/api/exam/route.test.ts`

- [ ] **Step 1: 写失败测试 `app/api/exam/route.test.ts`**

```typescript
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
      http.get(`${BASE}/portal/main-api/v2/coursePacket/getCourseRelateExam`, () =>
        HttpResponse.json({ status: 0, data: { examId: 'EX1' } }),
      ),
      http.get(`${BASE}/portal/main-api/v2/activity/exam/getExamContentData.do`, () =>
        HttpResponse.json({
          data: { randomId: 'RID', typeList: [{ type: 1, questionList: [{ id: 'q', tqId: 't', answer: 'A' }] }] },
        }),
      ),
      http.post(`${BASE}/portal/main-api/v2/activity/exam/saveExamResultJc.do`, () =>
        HttpResponse.json({ status: 0 }),
      ),
      http.get(`${BASE}/portal/main-api/v2/activity/exam/getExamResultMaxScore.do`, () =>
        HttpResponse.json({ status: 0, data: { score: 100 } }),
      ),
      http.get(`${BASE}/portal/main-api/v2/studyTime/updateCoursePackageExamInfo.do`, () =>
        HttpResponse.json({ status: 0 }),
      ),
    )
    const res = await GET(reqWithToken('TOK'))
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const text = await readAll(res)
    expect(text).toContain('"type":"done"')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run app/api/exam/route.test.ts`
Expected: FAIL（`./route` 不存在）。

- [ ] **Step 3: 写实现 `app/api/exam/route.ts`**

```typescript
import { runExam } from '@/lib/baomi/course'
import { COURSE_PACKET_ID } from '@/lib/baomi/constants'
import { eventStream, SSE_HEADERS } from '@/lib/baomi/sse'
import { getToken } from '@/lib/cookies'

export async function GET(req: Request) {
  const token = getToken(req)
  if (!token) {
    return new Response(JSON.stringify({ message: '未登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const stream = eventStream(runExam(token, COURSE_PACKET_ID), req.signal)
  return new Response(stream, { headers: SSE_HEADERS })
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run app/api/exam/route.test.ts`
Expected: PASS（2 passed）。

- [ ] **Step 5: Commit**

```bash
git add app/api/exam/route.ts app/api/exam/route.test.ts
git commit -m "feat: add exam SSE route"
```

---

## Task 15: LogConsole 组件（SSE 滚动日志）

**Files:**
- Create: `components/LogConsole.tsx`
- Test: `components/LogConsole.test.tsx`

展示一组日志行，按类型着色，自动滚到底部。纯展示组件，由父组件喂入 `lines`。

- [ ] **Step 1: 写失败测试 `components/LogConsole.test.tsx`**

```typescript
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LogConsole, type LogLine } from './LogConsole'

describe('LogConsole', () => {
  it('渲染各类型日志行', () => {
    const lines: LogLine[] = [
      { kind: 'log', text: '开始' },
      { kind: 'success', text: '完成 V' },
      { kind: 'error', text: '出错了' },
    ]
    render(<LogConsole lines={lines} />)
    expect(screen.getByText('开始')).toBeTruthy()
    expect(screen.getByText('完成 V')).toBeTruthy()
    expect(screen.getByText('出错了')).toBeTruthy()
  })

  it('为空时显示占位提示', () => {
    render(<LogConsole lines={[]} />)
    expect(screen.getByText(/暂无日志/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: 安装 testing-library（若 Task 1 未装）**

```bash
npm install -D @testing-library/react @testing-library/jest-dom
```
在 `vitest.setup.ts` 末尾追加：
```typescript
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run components/LogConsole.test.tsx`
Expected: FAIL（组件不存在）。

- [ ] **Step 4: 写实现 `components/LogConsole.tsx`**

```tsx
'use client'

import { useEffect, useRef } from 'react'

export type LogLine = {
  kind: 'log' | 'success' | 'error'
  text: string
}

const COLOR: Record<LogLine['kind'], string> = {
  log: 'text-foreground',
  success: 'text-green-600',
  error: 'text-red-600',
}

export function LogConsole({ lines }: { lines: LogLine[] }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  return (
    <div className="h-72 overflow-y-auto rounded-md border bg-muted/30 p-3 font-mono text-sm">
      {lines.length === 0 ? (
        <p className="text-muted-foreground">暂无日志</p>
      ) : (
        lines.map((line, i) => (
          <div key={i} className={COLOR[line.kind]}>
            {line.text}
          </div>
        ))
      )}
      <div ref={endRef} />
    </div>
  )
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run components/LogConsole.test.tsx`
Expected: PASS（2 passed）。

- [ ] **Step 6: Commit**

```bash
git add components/LogConsole.tsx components/LogConsole.test.tsx vitest.setup.ts
git commit -m "feat: add LogConsole component"
```

---

## Task 16: LoginCard 组件（扫码 Tab + 账密 Tab）

**Files:**
- Create: `components/LoginCard.tsx`
- 依赖：`qrcode`（生成二维码 data URL）

登录成功后调用 `onSuccess()` 回调（由父组件刷新登录态）。

- [ ] **Step 1: 安装 qrcode**

```bash
npm install qrcode
npm install -D @types/qrcode
```

- [ ] **Step 2: 写实现 `components/LoginCard.tsx`**

> 本组件以交互为主，验证放在 Task 18 的手动清单与 Playwright 冒烟。此处直接写完整实现。

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function LoginCard({ onSuccess }: { onSuccess: () => void }) {
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>保密观自动助手 · 登录</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="qr">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="qr">扫码登录</TabsTrigger>
            <TabsTrigger value="password">账号密码</TabsTrigger>
          </TabsList>
          <TabsContent value="qr">
            <QrLogin onSuccess={onSuccess} />
          </TabsContent>
          <TabsContent value="password">
            <PasswordLogin onSuccess={onSuccess} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function QrLogin({ onSuccess }: { onSuccess: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [hint, setHint] = useState('正在获取二维码...')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function loadQr() {
    setHint('正在获取二维码...')
    const res = await fetch('/api/auth/qr', { method: 'POST' })
    if (!res.ok) {
      setHint('获取二维码失败，请刷新重试')
      return
    }
    const { qrContent, qrToken } = await res.json()
    setQrDataUrl(await QRCode.toDataURL(qrContent))
    setHint('请使用保密观 APP 扫码登录')
    startPolling(qrToken)
  }

  function startPolling(qrToken: string) {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/auth/qr?qrToken=${encodeURIComponent(qrToken)}`)
      const { status } = await res.json()
      if (status === 1) {
        clearInterval(pollRef.current!)
        toast.success('扫码登录成功')
        onSuccess()
      } else if (status === -1) {
        clearInterval(pollRef.current!)
        setHint('二维码已失效，正在刷新...')
        loadQr()
      }
    }, 3000)
  }

  useEffect(() => {
    loadQr()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      {qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt="登录二维码" className="h-48 w-48" />
      ) : (
        <div className="h-48 w-48 animate-pulse rounded bg-muted" />
      )}
      <p className="text-sm text-muted-foreground">{hint}</p>
      <Button variant="outline" size="sm" onClick={loadQr}>
        刷新二维码
      </Button>
    </div>
  )
}

function PasswordLogin({ onSuccess }: { onSuccess: () => void }) {
  const [loginName, setLoginName] = useState('')
  const [passWord, setPassWord] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginName, passWord }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('登录成功')
        onSuccess()
      } else {
        toast.error(data.message ?? '登录失败')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="loginName">用户名</Label>
        <Input id="loginName" value={loginName} onChange={(e) => setLoginName(e.target.value)} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="passWord">密码</Label>
        <Input
          id="passWord"
          type="password"
          value={passWord}
          onChange={(e) => setPassWord(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? '登录中...' : '登录'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错。

- [ ] **Step 4: Commit**

```bash
git add components/LoginCard.tsx package.json package-lock.json
git commit -m "feat: add LoginCard with QR and password tabs"
```

---

## Task 17: CoursePanel 组件（四操作 + 展示 + SSE 消费）

**Files:**
- Create: `components/CoursePanel.tsx`
- Test: `components/CoursePanel.test.tsx`

提供「看目录 / 看进度 / 自动刷课 / 自动考试 / 退出登录」。刷课、考试用 `EventSource` 消费 SSE 写入 `LogConsole`。

- [ ] **Step 1: 写失败测试 `components/CoursePanel.test.tsx`**

> 仅验证按钮渲染与「看进度」的 fetch 路径（EventSource 在 jsdom 无原生支持，留待手动/Playwright 验证）。

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CoursePanel } from './CoursePanel'

describe('CoursePanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('渲染昵称与四个操作按钮', () => {
    render(<CoursePanel nickname="张三" onLogout={() => {}} />)
    expect(screen.getByText(/张三/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '查看课程目录' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '查看学习进度' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '开始自动刷课' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '自动完成考试' })).toBeTruthy()
  })

  it('点击「查看学习进度」调用 /api/course/progress', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { courseName: '保密', progressRate: 0.5, studyResourceNum: 1, resourceSum: 2, totalStudyTime: 10, isFinish: false, isCertificate: false } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<CoursePanel nickname="张三" onLogout={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '查看学习进度' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/course/progress')
    })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run components/CoursePanel.test.tsx`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 写实现 `components/CoursePanel.tsx`**

```tsx
'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LogConsole, type LogLine } from './LogConsole'

export function CoursePanel({
  nickname,
  onLogout,
}: {
  nickname: string
  onLogout: () => void
}) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [running, setRunning] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  function append(line: LogLine) {
    setLines((prev) => [...prev, line])
  }

  async function showDirectory() {
    setLines([])
    const res = await fetch('/api/course/directory')
    const data = await res.json()
    if (!res.ok || !data.data) {
      append({ kind: 'error', text: '获取课程目录失败' })
      return
    }
    for (const section of data.data) {
      append({ kind: 'log', text: `【${section.name}】` })
      for (const sub of section.subDirectory ?? []) {
        append({ kind: 'log', text: `  - ${sub.name}` })
      }
    }
  }

  async function showProgress() {
    setLines([])
    const res = await fetch('/api/course/progress')
    const data = await res.json()
    if (!res.ok || !data.data) {
      append({ kind: 'error', text: '获取课程进度失败' })
      return
    }
    const d = data.data
    append({ kind: 'log', text: `课程名称: ${d.courseName}` })
    append({ kind: 'log', text: `学习进度: ${(d.progressRate * 100).toFixed(1)}%` })
    append({ kind: 'log', text: `已学课程数: ${d.studyResourceNum}/${d.resourceSum}` })
    append({ kind: 'log', text: `总学习时长: ${d.totalStudyTime}秒` })
    append({ kind: 'log', text: `是否完成: ${d.isFinish ? '是' : '否'}` })
    append({ kind: 'log', text: `是否获得证书: ${d.isCertificate ? '是' : '否'}` })
  }

  function runSse(path: string, startMsg: string) {
    if (running) return
    setLines([])
    setRunning(true)
    append({ kind: 'log', text: startMsg })
    const es = new EventSource(path)
    esRef.current = es
    es.onmessage = (ev) => {
      const event = JSON.parse(ev.data)
      switch (event.type) {
        case 'log':
          append({ kind: 'log', text: event.message })
          break
        case 'progress':
          append({ kind: event.ok ? 'success' : 'error', text: `${event.ok ? '✓ 完成' : '✗ 失败'}: ${event.name}` })
          break
        case 'result':
          append({ kind: 'success', text: `成绩: ${event.data.score ?? '未知'} 分` })
          break
        case 'error':
          append({ kind: 'error', text: event.message })
          break
        case 'done':
          append({ kind: 'success', text: '— 完成 —' })
          es.close()
          setRunning(false)
          break
      }
    }
    es.onerror = () => {
      append({ kind: 'error', text: '连接中断' })
      es.close()
      setRunning(false)
    }
  }

  async function logout() {
    esRef.current?.close()
    await fetch('/api/auth/logout', { method: 'POST' })
    toast.success('已退出登录')
    onLogout()
  }

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>欢迎，{nickname}</CardTitle>
        <Button variant="ghost" size="sm" onClick={logout}>
          退出登录
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button variant="outline" onClick={showDirectory} disabled={running}>
            查看课程目录
          </Button>
          <Button variant="outline" onClick={showProgress} disabled={running}>
            查看学习进度
          </Button>
          <Button onClick={() => runSse('/api/study', '开始自动刷课...')} disabled={running}>
            开始自动刷课
          </Button>
          <Button onClick={() => runSse('/api/exam', '开始自动完成考试...')} disabled={running}>
            自动完成考试
          </Button>
        </div>
        <LogConsole lines={lines} />
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run components/CoursePanel.test.tsx`
Expected: PASS（2 passed）。

- [ ] **Step 5: Commit**

```bash
git add components/CoursePanel.tsx components/CoursePanel.test.tsx
git commit -m "feat: add CoursePanel with SSE consumption"
```

---

## Task 18: 页面组装与登录态切换

**Files:**
- Modify: `app/page.tsx`（替换 create-next-app 默认内容）
- Modify: `app/layout.tsx`（加 `<Toaster />`）

- [ ] **Step 1: 写 `app/page.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { LoginCard } from '@/components/LoginCard'
import { CoursePanel } from '@/components/CoursePanel'

export default function Home() {
  const [nickname, setNickname] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/check')
      if (res.ok) {
        const { nickname } = await res.json()
        setNickname(nickname)
      } else {
        setNickname(null)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      {loading ? (
        <p className="text-muted-foreground">加载中...</p>
      ) : nickname ? (
        <CoursePanel nickname={nickname} onLogout={() => setNickname(null)} />
      ) : (
        <LoginCard onSuccess={refresh} />
      )}
    </main>
  )
}
```

- [ ] **Step 2: 在 `app/layout.tsx` 加 Toaster**

在 `app/layout.tsx` 的 `<body>` 内、`{children}` 之后插入：
```tsx
import { Toaster } from '@/components/ui/sonner'
// ... 在 <body> 中：
//   {children}
//   <Toaster />
```
（具体：把 `{children}` 一行改为 `{children}\n        <Toaster />`，并在文件顶部补 import。）

- [ ] **Step 3: 全量单测 + 类型检查 + 构建**

```bash
npm test
npx tsc --noEmit
npm run build
```
Expected: 测试全绿；类型无错；`npm run build` 成功（无 SSR/类型错误）。

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/layout.tsx
git commit -m "feat: assemble home page with auth state"
```

---

## Task 19: 文档与手动验证清单

**Files:**
- Create: `README.nextjs.md`
- Modify: `.gitignore`（确保忽略 `.env.local`、`node_modules`、`.next`）

- [ ] **Step 1: 确认 `.gitignore` 含 Next.js 条目**

检查 `.gitignore` 是否包含以下（缺则补）：
```
node_modules
.next
.env.local
```

- [ ] **Step 2: 写 `README.nextjs.md`**

```markdown
# AutoBaomiGuan · Next.js Web 版

保密观自动刷课/答题工具的 Web 版（对等移植自 Python CLI）。自托管多用户、无状态代理、SSE 实时日志。

## 快速开始

\`\`\`bash
npm install
cp .env.local.example .env.local   # 按需修改 COURSE_PACKET_ID
npm run dev                         # http://localhost:3000
\`\`\`

## 配置（.env.local）

| 变量 | 默认 | 说明 |
|---|---|---|
| COURSE_PACKET_ID | 312bc914-... | 当年课程包，每年更换 |
| STUDY_DELAY_MS | 2000 | 刷课每个资源间延时 |
| BAOMI_BASE_URL | https://www.baomi.org.cn | baomi 域名 |

## 测试

\`\`\`bash
npm test
\`\`\`

## 手动验证清单（需真实保密观账号）

1. 账密登录：输入用户名密码 → 成功后看到「欢迎，<昵称>」。
2. 扫码登录：APP 扫码 → 自动进入面板；二维码失效自动刷新。
3. 查看课程目录 / 学习进度：日志区正确显示。
4. 自动刷课：日志区实时滚动「✓ 完成: …」直到「— 完成 —」。
5. 自动考试：实时显示提交、成绩、状态更新。
6. 退出登录：回到登录页，刷新页面仍为未登录。
7. 凭证过期：手动改坏 cookie 后操作 → 提示重新登录。

## 待真机确认

- \`getCourseRelateExam\` 返回的 examId 字段名（实现兼容 examId/id/exam_id，见 lib/baomi/course.ts 的 extractExamId）。
- 扫码 qrToken 是否可直接作为后续接口 token。

## 合规

仅供个人学习自动化使用，迁移自公开开源项目 NB-XX/AutoBaomiGuan。
\`\`\`

- [ ] **Step 3: Commit**

```bash
git add README.nextjs.md .gitignore
git commit -m "docs: add Next.js usage and manual verification checklist"
```

---

## 自检结论（Self-Review）

- **Spec 覆盖**：登录扫码(Task 8)/账密(Task 7)、看目录(Task 10/17)、看进度(Task 10/17)、刷课(Task 11/12)、考试动态 examId(Task 13/14)、httpOnly cookie(Task 5)、SSE(Task 12/14)、错误处理(各 route + CoursePanel)、安全(Task 5 cookie 属性、不存明文)、配置(Task 2)、测试(Vitest+MSW 贯穿)、待验证点(Task 13/19) —— 全部有对应任务。
- **占位符**：无 TBD/TODO；每个代码步骤含完整代码。
- **类型一致**：`ProgressEvent`（Task 11 定义，12/13/14/17 复用）、`LogLine`（Task 15 定义，17 复用）、`getToken`/`tokenCookie`（Task 5 → 各 route）、`baomiGet`/`baomiPost`（Task 6 → course/route）、`runStudy`/`runExam`（Task 11/13 → 12/14）签名一致。
```
