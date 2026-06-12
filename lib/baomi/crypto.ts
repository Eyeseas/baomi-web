import { publicEncrypt, constants as cryptoConstants } from 'node:crypto'

/**
 * RSA 加密（PKCS#1 v1.5）。
 * @param data 明文
 * @param publicKey 裸 base64（自动补 PEM 头尾）或完整 PEM
 * @returns base64 编码的密文
 */
export function rsaEncryptPkcs1v15(data: string, publicKey: string): string {
  const pem = publicKey.trim().startsWith('-----BEGIN')
    ? publicKey
    : `-----BEGIN PUBLIC KEY-----\n${publicKey.trim()}\n-----END PUBLIC KEY-----`

  const encrypted = publicEncrypt(
    { key: pem, padding: cryptoConstants.RSA_PKCS1_PADDING },
    Buffer.from(data, 'utf8'),
  )
  return encrypted.toString('base64')
}
