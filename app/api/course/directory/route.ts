import { PATHS } from '@/lib/baomi/constants'
import { proxyCourseGet } from '@/lib/baomi/route-helpers'

export function GET(req: Request) {
  return proxyCourseGet(req, PATHS.courseDirectory, { scale: 1 })
}
