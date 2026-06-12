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
      http.get(
        `${BASE}/portal/main-api/v2/coursePacket/getCourseDirectoryList`,
        () =>
          HttpResponse.json({
            data: [
              {
                name: '章节1',
                subDirectory: [{ name: '小节A', SYS_UUID: 'dir-a' }],
              },
            ],
          }),
      ),
      http.get(
        `${BASE}/portal/main-api/v2/coursePacket/getCourseResourceList`,
        () =>
          HttpResponse.json({
            data: {
              listdata: [
                {
                  resourceID: 'r1',
                  SYS_UUID: 'u1',
                  name: '视频1',
                  timeLength: '00:01:30',
                },
              ],
            },
          }),
      ),
      http.get(
        `${BASE}/portal/main-api/v2/studyTime/saveCoursePackage.do`,
        ({ request }) => {
          const u = new URL(request.url)
          saved.push(u.searchParams.get('resourceId') ?? '')
          // 验证时长换算：00:01:30 = 90 秒
          expect(u.searchParams.get('resourceLength')).toBe('90')
          expect(u.searchParams.get('studyLength')).toBe('90')
          return HttpResponse.json({ status: 0 })
        },
      ),
    )

    const events = await collect(runStudy('TOK', 'CP', { delayMs: 0 }))
    expect(saved).toEqual(['r1'])
    expect(events).toContainEqual({ type: 'progress', name: '视频1', ok: true })
    expect(events.at(-1)).toEqual({ type: 'done' })
  })

  it('保存失败时 yield ok=false', async () => {
    server.use(
      http.get(
        `${BASE}/portal/main-api/v2/coursePacket/getCourseDirectoryList`,
        () =>
          HttpResponse.json({
            data: [{ name: 'S', subDirectory: [{ name: 'sub', SYS_UUID: 'd' }] }],
          }),
      ),
      http.get(
        `${BASE}/portal/main-api/v2/coursePacket/getCourseResourceList`,
        () =>
          HttpResponse.json({
            data: {
              listdata: [
                { resourceID: 'r1', SYS_UUID: 'u1', name: 'V', timeLength: '00:00:10' },
              ],
            },
          }),
      ),
      http.get(
        `${BASE}/portal/main-api/v2/studyTime/saveCoursePackage.do`,
        () => HttpResponse.json({ status: 1, message: 'fail' }),
      ),
    )
    const events = await collect(runStudy('TOK', 'CP', { delayMs: 0 }))
    expect(events).toContainEqual({ type: 'progress', name: 'V', ok: false })
  })

  it('目录为空时 yield error', async () => {
    server.use(
      http.get(
        `${BASE}/portal/main-api/v2/coursePacket/getCourseDirectoryList`,
        () => HttpResponse.json({ data: null }),
      ),
    )
    const events = await collect(runStudy('TOK', 'CP', { delayMs: 0 }))
    expect(events.some((e) => e.type === 'error')).toBe(true)
  })
})
