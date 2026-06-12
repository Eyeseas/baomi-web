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
