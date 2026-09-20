// Phase 7 — safePublicIdSegment is the fix for file.originalname (fully
// attacker-controlled multipart filename) being interpolated unsanitized
// into a Cloudinary public_id, where '/' means folder nesting.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safePublicIdSegment } from './cloudinaryUpload.js'

test('safePublicIdSegment strips path-nesting characters that would escape the intended Cloudinary folder', () => {
  assert.ok(!safePublicIdSegment('../../other-folder/evil.png').includes('/'), 'no forward slash must survive sanitization')
  assert.equal(safePublicIdSegment('a/b/c.jpg'), 'a_b_c')
})

test('safePublicIdSegment strips the file extension and disallowed characters, keeping alphanumerics/-/_', () => {
  assert.equal(safePublicIdSegment('my photo (final).png'), 'my_photo__final_')
  assert.equal(safePublicIdSegment('normal-name_123.jpg'), 'normal-name_123')
})

test('safePublicIdSegment caps length so an absurdly long filename cannot build an oversized public_id', () => {
  const long = 'a'.repeat(500) + '.png'
  assert.equal(safePublicIdSegment(long).length, 100)
})
