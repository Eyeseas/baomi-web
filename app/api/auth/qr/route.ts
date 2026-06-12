import { BAOMI_BASE_URL, PATHS, SITE_ID } from '@/lib/baomi/constants'
import { parseQrToken } from '@/lib/baomi/qr'
import { tokenCookie } from '@/lib/cookies'

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
}

export async function POST(_req?: Request) {
  const res = await fetch(`${BAOMI_BASE_URL}${PATHS.qrToken}`, {
    method: 'POST',
    headers: { siteId: SITE_ID },
  })
  if (!res.ok) {
    return json(
      { message: `获取二维码失败，状态码: ${res.status}` },
      { status: 502 },
    )
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
  const res = await fetch(
    `${BAOMI_BASE_URL}${PATHS.checkQrToken}?qrToken=${encodeURIComponent(qrToken)}`,
    { method: 'POST' },
  )
  if (!res.ok) {
    return json(
      { message: `检查二维码状态失败，状态码: ${res.status}` },
      { status: 502 },
    )
  }
  const data = await res.json()
  const status = Number(data?.data?.data)
  if (status === 1) {
    return json(
      { status: 1 },
      { headers: { 'Set-Cookie': tokenCookie(qrToken) } },
    )
  }
  return json({ status })
}
