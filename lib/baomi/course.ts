import { createHash } from 'node:crypto'
import { baomiGet, baomiPost } from './client'
import { PATHS } from './constants'

/** 调用时动态读取刷课延时（避免 ESM 模块加载时固化 env，便于测试覆盖）。 */
function resolveDelayMs(): number {
  return Number(process.env.STUDY_DELAY_MS ?? '2000')
}

/** 单个课程资源（来自 getCourseResourceList 的 listdata 项）。 */
export interface CourseResource {
  resourceID: string
  SYS_UUID: string
  name: string
  timeLength: string
  /** 部分资源自带类型；缺省时回退默认值。 */
  resourceType?: string | number
  resourceLibId?: string | number
}

export type ProgressEvent =
  | { type: 'log'; message: string }
  | { type: 'progress'; name: string; ok: boolean }
  | {
      type: 'check'
      directory: string
      name: string
      resourceID: string
      sysUuid: string
      timeLength: string
      finished: boolean
      stat: unknown
    }
  | { type: 'result'; data: Record<string, unknown> }
  | { type: 'error'; message: string }
  | { type: 'done' }

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** "HH:MM:SS" → 秒 */
export function timeToSeconds(s: string): number {
  const parts = s.split(':').map((n) => parseInt(n, 10))
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0
  const [h, m, sec] = parts
  return h * 3600 + m * 60 + sec
}

interface StudyOptions {
  delayMs?: number
}

/**
 * 为单个资源提交一条「已学完」的学习记录。
 * resourceType / resourceLibId 优先取资源自身字段，缺省回退 '1' / '3'。
 * 返回平台是否接受（status === 0）。
 */
export async function saveOne(
  token: string,
  coursePacketId: string,
  resource: CourseResource,
): Promise<boolean> {
  const seconds = timeToSeconds(resource.timeLength)
  const now = Date.now()
  try {
    const result = await baomiGet(PATHS.saveStudy, token, {
      courseId: coursePacketId,
      resourceId: resource.resourceID,
      resourceDirectoryId: resource.SYS_UUID,
      resourceLength: seconds,
      studyLength: seconds,
      studyTime: seconds,
      startTime: now,
      resourceName: encodeURIComponent(resource.name),
      resourceType: String(resource.resourceType ?? '1'),
      resourceLibId: String(resource.resourceLibId ?? '3'),
      token,
    })
    return result?.status === 0
  } catch {
    return false
  }
}

export async function* runStudy(
  token: string,
  coursePacketId: string,
  options: StudyOptions = {},
): AsyncGenerator<ProgressEvent> {
  const delayMs = options.delayMs ?? resolveDelayMs()

  let directory: any
  try {
    directory = await baomiGet(PATHS.courseDirectory, token, {
      scale: 1,
      coursePacketId,
    })
  } catch (e) {
    yield { type: 'error', message: `获取课程目录失败: ${(e as Error).message}` }
    return
  }
  if (!directory?.data) {
    yield { type: 'error', message: '获取课程目录失败' }
    return
  }

  for (const section of directory.data) {
    yield { type: 'log', message: `开始学习章节: ${section.name}` }
    for (const sub of section.subDirectory ?? []) {
      yield { type: 'log', message: `正在学习: ${sub.name}` }
      let resources: any
      try {
        resources = await baomiGet(PATHS.courseResources, token, {
          coursePacketId,
          directoryId: sub.SYS_UUID,
          token,
        })
      } catch (e) {
        yield {
          type: 'error',
          message: `获取资源列表失败: ${(e as Error).message}`,
        }
        continue
      }
      const list = resources?.data?.listdata
      if (!list) {
        yield { type: 'error', message: `获取资源列表失败: ${sub.name}` }
        continue
      }
      for (const resource of list) {
        const ok = await saveOne(token, coursePacketId, resource)
        yield { type: 'progress', name: resource.name, ok }
        if (delayMs > 0) await sleep(delayMs)
      }
    }
  }
  yield { type: 'done' }
}

/**
 * 依据 getResourceUserStatistic 的 data 判定某资源是否已学完。
 * 平台返回字段未在线上确认，故防御式判定：
 *  1) isFinish 真值；2) progressRate >= 1；3) 已学时长 >= 资源总时长。
 * 三者全不可用时按未完成处理（宁可多列出，便于人工核对）。
 */
export function isResourceFinished(statData: any): boolean {
  if (!statData) return false
  if (statData.isFinish === true || statData.isFinish === 1) return true
  const rate = Number(statData.progressRate)
  if (Number.isFinite(rate) && rate >= 1) return true
  const studied = Number(statData.studyLength ?? statData.studyTime)
  const total = Number(statData.resourceLength ?? statData.totalLength)
  if (Number.isFinite(studied) && Number.isFinite(total) && total > 0) {
    return studied >= total
  }
  return false
}

/**
 * 逐资源检查完成状态，定位「显示已学但未被计入完成」的缺漏项。
 * 遍历方式与 runStudy 一致，但用 getResourceUserStatistic 查每个资源的真实统计。
 */
export async function* runCheck(
  token: string,
  coursePacketId: string,
): AsyncGenerator<ProgressEvent> {
  let directory: any
  try {
    directory = await baomiGet(PATHS.courseDirectory, token, {
      scale: 1,
      coursePacketId,
    })
  } catch (e) {
    yield { type: 'error', message: `获取课程目录失败: ${(e as Error).message}` }
    return
  }
  if (!directory?.data) {
    yield { type: 'error', message: '获取课程目录失败' }
    return
  }

  let total = 0
  let missing = 0
  for (const section of directory.data) {
    for (const sub of section.subDirectory ?? []) {
      let resources: any
      try {
        resources = await baomiGet(PATHS.courseResources, token, {
          coursePacketId,
          directoryId: sub.SYS_UUID,
          token,
        })
      } catch (e) {
        yield {
          type: 'error',
          message: `获取资源列表失败: ${sub.name} (${(e as Error).message})`,
        }
        continue
      }
      const list = resources?.data?.listdata
      if (!list) {
        yield { type: 'error', message: `获取资源列表失败: ${sub.name}` }
        continue
      }
      for (const resource of list) {
        total++
        let stat: any
        try {
          stat = await baomiGet(PATHS.resourceStatistic, token, {
            coursePacketId,
            resourceDirectoryId: resource.SYS_UUID,
            token,
          })
        } catch (e) {
          stat = { error: (e as Error).message }
        }
        const finished = isResourceFinished(stat?.data)
        if (!finished) missing++
        yield {
          type: 'check',
          directory: sub.name,
          name: resource.name,
          resourceID: resource.resourceID,
          sysUuid: resource.SYS_UUID,
          timeLength: resource.timeLength,
          finished,
          stat: stat?.data ?? stat,
        }
      }
    }
  }
  yield {
    type: 'log',
    message: `检查完成：共 ${total} 个资源，未完成 ${missing} 个`,
  }
  yield { type: 'done' }
}

/** 单项重试：为一个资源重新提交学习记录。 */
export async function studyOne(
  token: string,
  coursePacketId: string,
  resource: CourseResource,
): Promise<{ ok: boolean }> {
  const ok = await saveOne(token, coursePacketId, resource)
  return { ok }
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}
/** 当前时间格式化为 "YYYY-MM-DD HH:mm:ss"（本地时区，对齐 Python strftime） */
function formatNow(): string {
  const d = new Date()
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  )
}

/** 生成自定义随机 id：md5("founder" + 1..500) */
export function generateRandomId(): string {
  const e = Math.floor(Math.random() * 500) + 1
  return createHash('md5').update(`founder${e}`).digest('hex')
}

/**
 * 从 getCourseRelateExam 返回中取 examId。
 * 实测 data 是数组：[{ coursePacketID, examId, examName, ... }]；
 * 优先匹配当前课程包，否则取第一条。兼容历史上的对象形态。
 */
function extractExamId(relate: any, coursePacketId?: string): string | undefined {
  const data = relate?.data
  if (Array.isArray(data)) {
    const matched =
      (coursePacketId &&
        data.find((d) => d?.coursePacketID === coursePacketId)) ||
      data[0]
    return matched?.examId ?? matched?.id ?? matched?.exam_id
  }
  return data?.examId ?? data?.id ?? data?.exam_id
}

/** 把试卷的每题正确答案构造成提交数据。 */
export function buildExamAnswers(paper: any): Array<Record<string, unknown>> {
  const answers: Array<Record<string, unknown>> = []
  for (const typeItem of paper?.typeList ?? []) {
    for (const q of typeItem.questionList ?? []) {
      answers.push({
        parentId: '0',
        qstId: q.id,
        resultFlag: 0,
        standardAnswer: q.answer,
        subCount: 0,
        tqId: q.tqId,
        userAnswer: q.answer,
        userScoreRate: '100%',
        viewTypeId: typeItem.type ?? 1,
      })
    }
  }
  return answers
}

export async function* runExam(
  token: string,
  coursePacketId: string,
): AsyncGenerator<ProgressEvent> {
  try {
    // 1. 动态取 examId
    yield { type: 'log', message: '获取考试信息...' }
    const relate = await baomiGet(PATHS.relateExam, token, {
      coursePacketId,
      token,
    })
    const examId = extractExamId(relate, coursePacketId)
    if (!examId) {
      yield { type: 'error', message: '未找到考试ID' }
      yield { type: 'done' }
      return
    }

    // 2. 取试卷答案
    const paper = await baomiGet(PATHS.examContent, token, {
      examId,
      randomId: generateRandomId(),
    })
    if (!paper?.data) {
      yield { type: 'error', message: '获取试卷答案失败' }
      yield { type: 'done' }
      return
    }
    yield { type: 'log', message: '获取试卷答案成功' }
    const randomId = paper.data.randomId
    if (!randomId) {
      yield { type: 'error', message: '获取 randomId 失败' }
      yield { type: 'done' }
      return
    }

    // 3. 构造并提交
    const answers = buildExamAnswers(paper.data)
    const submit = await baomiPost(PATHS.saveExam, token, {
      examId,
      examResult: JSON.stringify(answers),
      randomId,
      startDate: formatNow(),
    })
    if (submit?.status !== 0) {
      yield {
        type: 'error',
        message: `答案提交失败: ${submit?.message ?? ''}`,
      }
      yield { type: 'done' }
      return
    }
    yield { type: 'log', message: '答案提交成功！' }

    // 4. 查成绩
    const result = await baomiGet(PATHS.examResult, token, { examId, token })
    let score = 100
    if (result?.status === 0 && result.data) {
      score = result.data.score ?? 100
      yield { type: 'result', data: result.data }
    } else {
      yield { type: 'log', message: '成绩查询失败或暂未生成，使用默认分数' }
    }

    // 5. 更新完成状态
    await baomiGet(PATHS.updateExamInfo, token, {
      courseId: coursePacketId,
      orgId: '',
      isExam: 1,
      isCertificate: 0,
      examResult: score,
      token,
    })
    yield { type: 'log', message: '考试状态更新成功！' }
  } catch (e) {
    yield { type: 'error', message: `考试过程出错: ${(e as Error).message}` }
  }
  yield { type: 'done' }
}
