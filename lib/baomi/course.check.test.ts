import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import {
  isResourceFinished,
  runCheck,
  saveOne,
  studyOne,
  type ProgressEvent,
} from './course'

const BASE = 'https://www.baomi.org.cn'

async function collect(gen: AsyncGenerator<ProgressEvent>) {
  const events: ProgressEvent[] = []
  for await (const e of gen) events.push(e)
  return events
}

describe('isResourceFinished', () => {
  it('isFinish 为真 → 已完成', () => {
    expect(isResourceFinished({ isFinish: true })).toBe(true)
    expect(isResourceFinished({ isFinish: 1 })).toBe(true)
  })
  it('progressRate >= 1 → 已完成', () => {
    expect(isResourceFinished({ progressRate: 1 })).toBe(true)
  })
  it('已学时长 >= 总时长 → 已完成', () => {
    expect(isResourceFinished({ studyLength: 90, resourceLength: 90 })).toBe(true)
    expect(isResourceFinished({ studyLength: 30, resourceLength: 90 })).toBe(false)
  })
  it('无可用字段或空 → 未完成', () => {
    expect(isResourceFinished(null)).toBe(false)
    expect(isResourceFinished({})).toBe(false)
  })
})

describe('runCheck', () => {
  it('逐资源核对，未完成的资源 finished=false 并统计数量', async () => {
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
                { resourceID: 'r1', SYS_UUID: 'u1', name: '视频1', timeLength: '00:01:00' },
                { resourceID: 'r2', SYS_UUID: 'u2', name: '视频2', timeLength: '00:01:00' },
              ],
            },
          }),
      ),
      http.get(
        `${BASE}/portal/main-api/v2/coursePacket/getResourceUserStatistic`,
        ({ request }) => {
          const u = new URL(request.url)
          const id = u.searchParams.get('resourceDirectoryId')
          // u1 已学完，u2 没学完
          return HttpResponse.json({
            data: { isFinish: id === 'u1' },
          })
        },
      ),
    )

    const events = await collect(runCheck('TOK', 'CP'))
    const checks = events.filter((e) => e.type === 'check')
    expect(checks).toHaveLength(2)
    expect(checks.find((c: any) => c.sysUuid === 'u1')!).toMatchObject({
      finished: true,
    })
    expect(checks.find((c: any) => c.sysUuid === 'u2')!).toMatchObject({
      finished: false,
      name: '视频2',
    })
    expect(events).toContainEqual({
      type: 'log',
      message: '检查完成：共 2 个资源，未完成 1 个',
    })
    expect(events.at(-1)).toEqual({ type: 'done' })
  })

  it('目录获取失败 → yield error', async () => {
    server.use(
      http.get(
        `${BASE}/portal/main-api/v2/coursePacket/getCourseDirectoryList`,
        () => HttpResponse.json({ data: null }),
      ),
    )
    const events = await collect(runCheck('TOK', 'CP'))
    expect(events.some((e) => e.type === 'error')).toBe(true)
  })
})

describe('saveOne / studyOne', () => {
  const resource = {
    resourceID: 'r1',
    SYS_UUID: 'u1',
    name: '视频1',
    timeLength: '00:01:30',
  }

  it('保存成功（status 0）→ ok=true，且时长正确换算为 90 秒', async () => {
    server.use(
      http.get(
        `${BASE}/portal/main-api/v2/studyTime/saveCoursePackage.do`,
        ({ request }) => {
          const u = new URL(request.url)
          expect(u.searchParams.get('resourceLength')).toBe('90')
          expect(u.searchParams.get('resourceType')).toBe('1')
          return HttpResponse.json({ status: 0 })
        },
      ),
    )
    expect(await saveOne('TOK', 'CP', resource)).toBe(true)
    expect(await studyOne('TOK', 'CP', resource)).toEqual({ ok: true })
  })

  it('保存失败（status 1）→ ok=false', async () => {
    server.use(
      http.get(
        `${BASE}/portal/main-api/v2/studyTime/saveCoursePackage.do`,
        () => HttpResponse.json({ status: 1, message: 'fail' }),
      ),
    )
    expect(await saveOne('TOK', 'CP', resource)).toBe(false)
  })

  it('资源自带 resourceType → 透传而非硬编码 1', async () => {
    server.use(
      http.get(
        `${BASE}/portal/main-api/v2/studyTime/saveCoursePackage.do`,
        ({ request }) => {
          const u = new URL(request.url)
          expect(u.searchParams.get('resourceType')).toBe('2')
          return HttpResponse.json({ status: 0 })
        },
      ),
    )
    expect(
      await saveOne('TOK', 'CP', { ...resource, resourceType: 2 }),
    ).toBe(true)
  })
})
