// Server-only AES-256-GCM encryption used to store Google OAuth refresh
// tokens at rest.
//
// Format on disk: "<iv-hex>:<auth-tag-hex>:<ciphertext-hex>".
// All three components hex-encoded and colon-separated so the column stays
// a plain text type. Decryption requires GOOGLE_TOKEN_ENCRYPTION_KEY — a
// 32-byte (64-hex-char) random key in .env.local and Vercel.
//
// Why GCM and not CBC: GCM is authenticated, so a tampered ciphertext fails
// the auth-tag check on decrypt instead of silently returning garbage. The
// 12-byte IV is random per encryption and stored alongside the ciphertext.

import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const KEY_LEN = 32;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const hex = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      'GOOGLE_TOKEN_ENCRYPTION_KEY is not set. ' +
        "Run: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
        'and add the result to .env.local AND Vercel env vars.'
    );
  }
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error(
      'GOOGLE_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
        `Got ${hex.length} chars.`
    );
  }
  cachedKey = Buffer.from(hex, 'hex');
  if (cachedKey.length !== KEY_LEN) {
    throw new Error(`Encryption key must be ${KEY_LEN} bytes after hex decode.`);
  }
  return cachedKey;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(packed: string): string {
  const key = getKey();
  const parts = packed.split(':');
  if (parts.length !== 3) {
    throw new Error('Encrypted blob is malformed (expected iv:tag:ciphertext).');
  }
  const [ivHex, tagHex, ctHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');
  if (iv.length !== IV_LEN) {
    throw new Error('Encrypted blob has wrong IV length.');
  }
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString('utf8');
}
