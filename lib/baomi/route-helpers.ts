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
