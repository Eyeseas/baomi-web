import { describe, expect, it } from 'vitest'
import { parseQrToken } from './qr'

describe('parseQrToken', () => {
  it('从二维码 JSON 中提取 qrToken', () => {
    const payload = JSON.stringify({ params: { qrToken: 'abc123' } })
    expect(parseQrToken(payload)).toBe('abc123')
  })

  it('缺少 qrToken 时抛错', () => {
    const payload = JSON.stringify({ params: {} })
    expect(() => parseQrToken(payload)).toThrow('二维码内容缺少 qrToken')
  })

  it('非法 JSON 时抛错', () => {
    expect(() => parseQrToken('not-json')).toThrow('二维码内容缺少 qrToken')
  })
})
