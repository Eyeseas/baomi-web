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
