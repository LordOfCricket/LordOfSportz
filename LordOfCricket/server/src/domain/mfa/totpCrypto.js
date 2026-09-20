// Phase 6 — pure AES-256-GCM secret encryption, factored out of
// totp.service.js so it's independently unit-testable (same convention as
// domain/otpAuth/otp.js). The key is a parameter, never read from
// process.env here — totp.service.js's getEncryptionKey() owns that, so
// tests can exercise real encrypt/decrypt/tamper-detection behavior against
// a throwaway key without touching MFA_ENCRYPTION_KEY.

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

// iv:authTag:ciphertext, all hex — a flipped byte anywhere fails GCM's
// built-in authentication check (decipher.final() throws), never silently
// decrypts to garbage. This is why TOTP secrets are never "Base64-only".
export function encryptSecret(plaintext, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`
}

export function decryptSecret(encrypted, key) {
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()])
  return plaintext.toString('utf8')
}
