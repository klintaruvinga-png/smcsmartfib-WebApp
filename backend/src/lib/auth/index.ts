import { SignJWT, jwtVerify } from "jose";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

const ACCESS_TOKEN_EXPIRY = "15m";
export const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  // jose's JWTPayload requires an index signature; include it so JwtPayload
  // is assignable to the type SignJWT expects.
  [key: string]: unknown;
}

export async function createAccessToken(payload: JwtPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(getJwtSecret());
}

export async function verifyAccessToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return {
      sub: (payload.sub as string) ?? "",
      email: (payload.email as string) ?? "",
      role: (payload.role as string) ?? "",
    };
  } catch {
    return null;
  }
}

export async function createRefreshToken(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hash a password using PBKDF2 with Web Crypto API (edge-compatible).
 * Returns a string in the format: salt$iterations$hash
 * PBKDF2-SHA256 with 100,000 iterations is recommended by OWASP for password hashing.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const iterations = 100000;

  const passwordBuffer = new TextEncoder().encode(password);
  const importedKey = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: iterations,
      hash: "SHA-256",
    },
    importedKey,
    256
  );

  const saltHex = Array.from(salt, b => b.toString(16).padStart(2, "0")).join("");
  const hashHex = Array.from(new Uint8Array(derivedBits), b => b.toString(16).padStart(2, "0")).join("");

  return `${saltHex}$${iterations}$${hashHex}`;
}

/**
 * Verify a password against a hash created by hashPassword.
 * Also supports legacy bcrypt hashes for backwards compatibility during migration.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Check if this is a legacy bcrypt hash (starts with $2a$, $2b$, or $2y$)
  if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
    // For backwards compatibility with existing bcrypt hashes, dynamically import bcrypt
    const bcrypt = await import("bcryptjs");
    return bcrypt.default.compare(password, hash);
  }

  // Parse PBKDF2 hash format: salt$iterations$hash
  const parts = hash.split("$");
  if (parts.length !== 3) {
    return false;
  }

  const [saltHex, iterationsStr, expectedHashHex] = parts;
  const iterations = parseInt(iterationsStr, 10);

  if (isNaN(iterations)) {
    return false;
  }

  // Convert hex strings back to Uint8Arrays
  const salt = new Uint8Array(saltHex.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []);

  const passwordBuffer = new TextEncoder().encode(password);
  const importedKey = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: iterations,
      hash: "SHA-256",
    },
    importedKey,
    256
  );

  const actualBytes = new Uint8Array(derivedBits);
  const expectedBytes = new Uint8Array(
    expectedHashHex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );

  // Constant-time comparison so rejection timing does not reveal how many
  // leading bytes of the derived hash matched (side-channel hardening).
  return constantTimeEqual(actualBytes, expectedBytes);
}

/**
 * Constant-time comparison of two byte arrays. A length mismatch returns false
 * immediately (hash lengths are fixed and not secret); otherwise every byte is
 * compared so total time does not depend on the position of the first
 * difference. Edge/Web-Crypto compatible (no Node `crypto.timingSafeEqual`).
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
