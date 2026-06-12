import { baomiOrigin, SITE_ID, USER_AGENT } from './constants'
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

function buildUrl(
  path: string,
  params?: Record<string, string | number>,
): string {
  const url = new URL(path, baomiOrigin())
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
