import type { RequestHandler } from 'msw'

// 各测试用例会用 server.use(...) 覆盖；默认空数组
export const handlers: RequestHandler[] = []
