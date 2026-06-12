import { PATHS, BAOMI_BASE_URL, SITE_ID, USER_AGENT } from '@/lib/baomi/constants'
import { rsaEncryptPkcs1v15 } from '@/lib/baomi/crypto'
import { tokenCookie } from '@/lib/cookies'

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
}

async function getPublicKey(): Promise<string> {
  const res = await fetch(`${BAOMI_BASE_URL}${PATHS.publishKey}`, {
    headers: { 'User-Agent': USER_AGENT, siteId: SITE_ID },
  })
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
    return json(
      { message: `加密准备失败: ${(e as Error).message}` },
      { status: 502 },
    )
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
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      siteId: SITE_ID,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    return json(
      { message: `登录请求失败，状态码: ${res.status}` },
      { status: 502 },
    )
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
