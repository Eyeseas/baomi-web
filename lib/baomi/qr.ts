import { BaomiError } from './errors'

/**
 * 从二维码内容（JSON 字符串）中解析 qrToken。
 */
export function parseQrToken(qrPayload: string): string {
  try {
    const payload = JSON.parse(qrPayload)
    const qrToken = payload?.params?.qrToken
    if (!qrToken || typeof qrToken !== 'string') {
      throw new BaomiError('二维码内容缺少 qrToken')
    }
    return qrToken
  } catch (e) {
    if (e instanceof BaomiError) throw e
    throw new BaomiError('二维码内容缺少 qrToken')
  }
}
