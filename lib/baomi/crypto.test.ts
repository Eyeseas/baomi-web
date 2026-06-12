import { describe, expect, it } from 'vitest'
import {
  generateKeyPairSync,
  privateDecrypt,
  constants as cryptoConstants,
} from 'node:crypto'
import { rsaEncryptPkcs1v15 } from './crypto'

describe('rsaEncryptPkcs1v15', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  // 取出裸 base64（去掉 PEM 头尾），模拟 baomi 返回格式
  const rawBase64 = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s/g, '')

  it('加密结果可被对应私钥解密还原（裸 base64 公钥）', () => {
    const plaintext = 'za123456'
    const encrypted = rsaEncryptPkcs1v15(plaintext, rawBase64)
    const decrypted = privateDecrypt(
      { key: privateKey, padding: cryptoConstants.RSA_PKCS1_PADDING },
      Buffer.from(encrypted, 'base64'),
    )
    expect(decrypted.toString('utf8')).toBe(plaintext)
  })

  it('也接受完整 PEM 格式公钥', () => {
    const encrypted = rsaEncryptPkcs1v15('hello', publicKey)
    const decrypted = privateDecrypt(
      { key: privateKey, padding: cryptoConstants.RSA_PKCS1_PADDING },
      Buffer.from(encrypted, 'base64'),
    )
    expect(decrypted.toString('utf8')).toBe('hello')
  })
})
