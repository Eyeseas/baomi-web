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
      http.get(
        `${BASE}/portal/main-api/v2/coursePacket/getCourseRelateExam`,
        () =>
          HttpResponse.json({
            status: 0,
            data: [{ coursePacketID: 'CP', examId: 'EX1', examName: '考试' }],
          }),
      ),
      http.get(
        `${BASE}/portal/main-api/v2/activity/exam/getExamContentData.do`,
        ({ request }) => {
          usedExamId = new URL(request.url).searchParams.get('examId') ?? ''
          return HttpResponse.json({
            data: {
              randomId: 'RID2',
              typeList: [
                { type: 1, questionList: [{ id: 'q1', tqId: 't1', answer: 'A' }] },
              ],
            },
          })
        },
      ),
      http.post(
        `${BASE}/portal/main-api/v2/activity/exam/saveExamResultJc.do`,
        async ({ request }) => {
          submitted = await request.json()
          return HttpResponse.json({ status: 0 })
        },
      ),
      http.get(
        `${BASE}/portal/main-api/v2/activity/exam/getExamResultMaxScore.do`,
        () =>
          HttpResponse.json({
            status: 0,
            data: { exam_name: '保密考试', score: 100, answerCount: 1 },
          }),
      ),
      http.get(
        `${BASE}/portal/main-api/v2/studyTime/updateCoursePackageExamInfo.do`,
        () => HttpResponse.json({ status: 0 }),
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
      http.get(
        `${BASE}/portal/main-api/v2/coursePacket/getCourseRelateExam`,
        () => HttpResponse.json({ status: 0, data: [] }),
      ),
    )
    const events = await collect(runExam('TOK', 'CP'))
    expect(events.some((e) => e.type === 'error')).toBe(true)
    expect(events.at(-1)).toEqual({ type: 'done' })
  })
})
