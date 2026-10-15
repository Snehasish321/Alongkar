import crypto from 'crypto';

export interface UnsubscribeTokenPayload {
  sid: string; // Subscriber ID
  emh: string; // First 16 hex chars of SHA-256(normalized email)
  act: 'newsletter_unsubscribe';
  iat: number; // Unix timestamp in seconds
  exp: number; // Expiry timestamp in seconds
}

export interface VerifyTokenResult {
  valid: boolean;
  subscriberId?: string;
  emailHash?: string;
  error?: string;
}

const TOKEN_ALGORITHM = 'aes-256-gcm';
const TOKEN_AAD = Buffer.from('alongkar:unsub:v1');
const DEFAULT_EXPIRY_SECONDS = 180 * 24 * 60 * 60; // 180 days

/**
 * Derives a deterministic 32-byte (256-bit) encryption key from server environment secrets.
 * In production (NODE_ENV === 'production'), strictly requires a dedicated UNSUBSCRIBE_SECRET
 * of sufficient entropy (>= 32 characters) and fails closed if missing or invalid.
 * In development and test environments, allows fallback to preserve DX without weakening production.
 */
export function getDerivedKey(customSecret?: string): Buffer {
  const isProduction = process.env.NODE_ENV === 'production';
  const secret = (customSecret !== undefined ? customSecret : process.env.UNSUBSCRIBE_SECRET)?.trim();

  if (isProduction) {
    if (!secret) {
      throw new Error(
        'Cryptographic configuration error: UNSUBSCRIBE_SECRET environment variable is missing in production.'
      );
    }
    if (secret.length < 32) {
      throw new Error(
        'Cryptographic configuration error: UNSUBSCRIBE_SECRET must be at least 32 characters in production.'
      );
    }
    return crypto.createHash('sha256').update(secret).digest();
  }

  // Non-production (development / test) safe fallback
  const fallbackSeed =
    secret ||
    process.env.CLERK_SECRET_KEY ||
    process.env.DATABASE_URL ||
    'alongkar_fallback_secure_token_secret_seed_2026';

  return crypto.createHash('sha256').update(fallbackSeed).digest();
}

/**
 * Computes a 16-hex-character email hash for identity binding.
 */
export function hashEmail(email: string): string {
  return crypto
    .createHash('sha256')
    .update(email.trim().toLowerCase())
    .digest('hex')
    .slice(0, 16);
}

/**
 * Generates an opaque, authenticated, tamper-proof unsubscribe token using AES-256-GCM.
 * Neither subscriber ID nor email address is exposed in plaintext.
 */
export function generateUnsubscribeToken(
  subscriber: { id: string; email: string },
  customExpirySeconds = DEFAULT_EXPIRY_SECONDS,
  customKey?: Buffer
): string {
  const key = customKey || getDerivedKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM
  const now = Math.floor(Date.now() / 1000);

  const payload: UnsubscribeTokenPayload = {
    sid: subscriber.id,
    emh: hashEmail(subscriber.email),
    act: 'newsletter_unsubscribe',
    iat: now,
    exp: now + customExpirySeconds,
  };

  const cipher = crypto.createCipheriv(TOKEN_ALGORITHM, key, iv);
  cipher.setAAD(TOKEN_AAD);

  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // 16-byte GCM authentication tag

  // Format: [12 bytes IV][16 bytes AuthTag][Ciphertext] -> base64url
  const combined = Buffer.concat([iv, authTag, ciphertext]);
  return combined.toString('base64url');
}

/**
 * Verifies and decrypts an unsubscribe token.
 * Returns valid: true and subscriberId only if the authentication tag matches,
 * token scope is verified, and the token has not expired.
 */
export function verifyUnsubscribeToken(
  token: string,
  customKey?: Buffer
): VerifyTokenResult {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token is missing or invalid' };
  }

  try {
    const combined = Buffer.from(token.trim(), 'base64url');

    // Minimum length check: 12 bytes IV + 16 bytes AuthTag + at least 1 byte ciphertext
    if (combined.length < 29) {
      return { valid: false, error: 'Token format is invalid' };
    }

    const iv = combined.subarray(0, 12);
    const authTag = combined.subarray(12, 28);
    const ciphertext = combined.subarray(28);

    const key = customKey || getDerivedKey();
    const decipher = crypto.createDecipheriv(TOKEN_ALGORITHM, key, iv);
    decipher.setAAD(TOKEN_AAD);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    const payload: UnsubscribeTokenPayload = JSON.parse(decrypted.toString('utf8'));

    if (payload.act !== 'newsletter_unsubscribe') {
      return { valid: false, error: 'Token scope is invalid' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) {
      return { valid: false, error: 'Token has expired' };
    }

    if (!payload.sid || !payload.emh) {
      return { valid: false, error: 'Token payload is incomplete' };
    }

    return {
      valid: true,
      subscriberId: payload.sid,
      emailHash: payload.emh,
    };
  } catch (err: any) {
    if (err?.message?.includes('Cryptographic configuration error')) {
      return { valid: false, error: 'Cryptographic configuration error' };
    }
    return { valid: false, error: 'Token authentication failed' };
  }
}

export interface UnsubscribeUrlPair {
  token: string;
  pageUrl: string;
  apiUrl: string;
}

/**
 * Generates both the human-facing landing page URL and RFC 8058 API endpoint URL,
 * sharing the exact same securely generated token.
 */
export function generateUnsubscribeUrls(
  subscriber: { id: string; email: string },
  baseUrl?: string
): UnsubscribeUrlPair {
  const token = generateUnsubscribeToken(subscriber);
  const base =
    baseUrl ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://alongkar.in');
  const cleanBase = base.replace(/\/+$/, '');
  const encodedToken = encodeURIComponent(token);

  return {
    token,
    pageUrl: `${cleanBase}/unsubscribe?token=${encodedToken}`,
    apiUrl: `${cleanBase}/api/unsubscribe?token=${encodedToken}`,
  };
}

/**
 * Generates a full customer-facing unsubscribe page URL for email links.
 */
export function generateUnsubscribeUrl(
  subscriber: { id: string; email: string },
  baseUrl?: string
): string {
  return generateUnsubscribeUrls(subscriber, baseUrl).pageUrl;
}
