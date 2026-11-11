import crypto from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(crypto.scrypt);

/**
 * Hash password with scrypt and random salt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

/**
 * Verify password against salt:hash
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const salt = parts[0];
  const hash = parts[1];
  if (!salt || !hash) return false;

  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const hashBuffer = Buffer.from(hash, "hex");
  if (derived.length !== hashBuffer.length) return false;
  return crypto.timingSafeEqual(derived, hashBuffer);
}

/**
 * SHA-256 hash helper for session & auth tokens
 */
export function sha256(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * HMAC-SHA256 signature for trip plan results
 */
export function signPlanToken(payload: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const b64Payload = Buffer.from(payload).toString("base64url");
  return `${b64Payload}.${hmac}`;
}

/**
 * Verify and decode HMAC-SHA256 plan token
 */
export function verifyPlanToken<T = unknown>(token: string, secret: string): { valid: boolean; data?: T } {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return { valid: false };
    const b64Payload = parts[0];
    const hmac = parts[1];
    if (!b64Payload || !hmac) return { valid: false };

    const payload = Buffer.from(b64Payload, "base64url").toString("utf8");
    const expectedHmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");

    const expectedBuf = Buffer.from(expectedHmac, "hex");
    const actualBuf = Buffer.from(hmac, "hex");
    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      return { valid: false };
    }

    const data = JSON.parse(payload) as T & { expiresAt?: number };
    if (data.expiresAt && Date.now() > data.expiresAt) {
      return { valid: false }; // expired
    }

    return { valid: true, data };
  } catch {
    return { valid: false };
  }
}
