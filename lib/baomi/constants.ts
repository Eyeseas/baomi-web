export const BAOMI_BASE_URL =
  process.env.BAOMI_BASE_URL ?? 'https://www.baomi.org.cn'

/**
 * 所有对 baomi 的出站请求实际连接的源。
 * 若设置了 BAOMI_PROXY_URL（一个透明反向代理的地址），则走代理，
 * 用于绕过 baomi 阿里云 WAF 对数据中心/CF IP 的封禁；否则直连 baomi。
 * 在调用时读取 env，便于运行时配置与测试覆盖。
 */
export function baomiOrigin(): string {
  return process.env.BAOMI_PROXY_URL || BAOMI_BASE_URL
}

export const COURSE_PACKET_ID =
  process.env.COURSE_PACKET_ID ?? '312bc914-8e11-421b-b9bc-e900fe1a4e50'

export const STUDY_DELAY_MS = Number(process.env.STUDY_DELAY_MS ?? '2000')

export const SITE_ID = '95'

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36'

// baomi 接口路径（相对 BAOMI_BASE_URL）
export const PATHS = {
  publishKey: '/portal/main-api/getPublishKey.do',
  login: '/portal/main-api/loginInNew.do',
  checkToken: '/portal/main-api/checkToken.do',
  qrToken: '/portal/main-api/v2/spc/getQrToken.do',
  checkQrToken: '/portal/api/v2/spc/checkQrToken.do',
  courseInfo: '/portal/main-api/v2/coursePacket/getCoursePacket',
  courseDirectory: '/portal/main-api/v2/coursePacket/getCourseDirectoryList',
  courseResources: '/portal/main-api/v2/coursePacket/getCourseResourceList',
  courseProgress: '/portal/main-api/v2/coursePacket/getCourseUserStatistic',
  saveStudy: '/portal/main-api/v2/studyTime/saveCoursePackage.do',
  relateExam: '/portal/main-api/v2/coursePacket/getCourseRelateExam',
  examContent: '/portal/main-api/v2/activity/exam/getExamContentData.do',
  saveExam: '/portal/main-api/v2/activity/exam/saveExamResultJc.do',
  examResult: '/portal/main-api/v2/activity/exam/getExamResultMaxScore.do',
  updateExamInfo: '/portal/main-api/v2/studyTime/updateCoursePackageExamInfo.do',
} as const
