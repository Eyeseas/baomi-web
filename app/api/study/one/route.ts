import { studyOne, type CourseResource } from '@/lib/baomi/course'
import { COURSE_PACKET_ID } from '@/lib/baomi/constants'
import { getToken } from '@/lib/cookies'

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
}

/** 单项重试：重新提交某个资源的学习记录。 */
export async function POST(req: Request) {
  const token = getToken(req)
  if (!token) return json({ message: '未登录' }, { status: 401 })

  let body: Partial<CourseResource>
  try {
    body = await req.json()
  } catch {
    return json({ message: '请求体解析失败' }, { status: 400 })
  }
  if (!body?.resourceID || !body?.SYS_UUID) {
    return json({ message: '缺少 resourceID / SYS_UUID' }, { status: 400 })
  }

  try {
    const result = await studyOne(token, COURSE_PACKET_ID, {
      resourceID: body.resourceID,
      SYS_UUID: body.SYS_UUID,
      name: body.name ?? '',
      timeLength: body.timeLength ?? '00:00:00',
      resourceType: body.resourceType,
      resourceLibId: body.resourceLibId,
    })
    return json(result)
  } catch (e) {
    return json({ message: (e as Error).message }, { status: 502 })
  }
}
