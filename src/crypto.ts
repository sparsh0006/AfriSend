import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";

// Derive a 32-byte key from the master secret + a per-user salt
function deriveKey(salt: Buffer): Buffer {
  return scryptSync(process.env.ENCRYPTION_SECRET!, salt, 32) as Buffer;
}

export function encryptKey(privateKey: string): string {
  const salt  = randomBytes(16);
  const iv    = randomBytes(12);
  const key   = deriveKey(salt);
  const cipher = createCipheriv(ALGO, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(privateKey, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Pack everything into one base64 string: salt|iv|tag|ciphertext
  return Buffer.concat([salt, iv, tag, encrypted]).toString("base64");
}

export function decryptKey(stored: string): string {
  const buf       = Buffer.from(stored, "base64");
  const salt      = buf.subarray(0, 16);
  const iv        = buf.subarray(16, 28);
  const tag       = buf.subarray(28, 44);
  const encrypted = buf.subarray(44);
  const key       = deriveKey(salt);

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}