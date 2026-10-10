import { getRedisClient } from './cache.js';

// ─── Constants & Limits ───────────────────────────────────────────────────────
export const MAX_JSON_BODY_BYTES = 1024 * 1024; // 1 MB
export const MAX_SEARCH_LENGTH = 100;
export const MAX_CATEGORY_LENGTH = 50;
export const MAX_COLLECTION_LENGTH = 50;
export const MAX_STRING_FIELD_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_IMAGE_URL_LENGTH = 1000;
export const MAX_PRODUCT_PRICE = 100_000_000;
export const MAX_CART_QUANTITY = 99;
export const MAX_PAGE_LIMIT = 100;
export const MAX_PAGE_NUMBER = 10_000;
export const DEFAULT_DB_TIMEOUT_MS = 8000; // 8 seconds default timeout for database queries

// Explicit allowed sort values for product catalog queries
export const ALLOWED_SORT_VALUES = [
  'default',
  'featured',
  'newest',
  'price-asc',
  'price-low-to-high',
  'price-desc',
  'price-high-to-low',
  'rating',
  'bestseller',
  'popular',
] as const;

export type AllowedSortValue = (typeof ALLOWED_SORT_VALUES)[number];

// ─── Input Validation Helpers ─────────────────────────────────────────────────

/**
 * Validates that a value is a non-empty string within max length bounds.
 */
export function isValidString(val: unknown, minLength = 1, maxLength = MAX_STRING_FIELD_LENGTH): val is string {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  return trimmed.length >= minLength && trimmed.length <= maxLength;
}

/**
 * Validates that a value is a finite number within given [min, max] range.
 * Rejects NaN, Infinity, -Infinity, strings, null, undefined.
 */
export function isValidNumber(val: unknown, min = 0, max = MAX_PRODUCT_PRICE): val is number {
  if (typeof val !== 'number') return false;
  if (!Number.isFinite(val) || isNaN(val)) return false;
  return val >= min && val <= max;
}

/**
 * Validates that a value is a finite integer within given [min, max] range.
 */
export function isValidInteger(val: unknown, min = 0, max = 10_000_000): val is number {
  if (!isValidNumber(val, min, max)) return false;
  return Number.isInteger(val);
}

/**
 * Validates product and record slugs.
 * Strictly requires lowercase alphanumeric characters separated by single hyphens.
 */
export function isValidSlug(slug: unknown, maxLength = 150): slug is string {
  if (typeof slug !== 'string') return false;
  const trimmed = slug.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed);
}

/**
 * Validates database IDs (CUID, UUID, or safe alphanumeric identifier).
 */
export function isValidIdentifier(id: unknown, maxLength = 100): id is string {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return false;
  // Allow letters, numbers, underscores, hyphens, and dots
  return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

/**
 * Validates HTTP/HTTPS URLs.
 */
export function isValidHttpUrl(urlStr: unknown, maxLength = MAX_IMAGE_URL_LENGTH): urlStr is string {
  if (typeof urlStr !== 'string') return false;
  const trimmed = urlStr.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates 10-digit mobile phone numbers (standard Indian mobile format with optional prefix).
 */
export function isValidPhoneNumber(phoneStr: unknown): phoneStr is string {
  if (typeof phoneStr !== 'string') return false;
  const cleaned = phoneStr.replace(/[\s\-()]/g, '');
  return /^(?:\+?91|0)?[6-9]\d{9}$/.test(cleaned);
}

/**
 * Sanitizes search query string to prevent regular expression or query construction denial of service.
 */
export function sanitizeSearchQuery(query: unknown, maxLength = MAX_SEARCH_LENGTH): string | undefined {
  if (typeof query !== 'string') return undefined;
  const trimmed = query.trim().slice(0, maxLength);
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Validates sorting value against the strict allowlist.
 */
export function sanitizeSortBy(sortBy: unknown): AllowedSortValue | undefined {
  if (typeof sortBy !== 'string') return undefined;
  const normalized = sortBy.trim().toLowerCase() as AllowedSortValue;
  if ((ALLOWED_SORT_VALUES as readonly string[]).includes(normalized)) {
    return normalized;
  }
  return undefined;
}

// ─── Error Sanitization & Observability ───────────────────────────────────────

/**
 * Returns a safe, production-grade error message for client responses,
 * preventing leaks of Prisma queries, database URLs, Clerk tokens, Cloudinary secrets, or stack traces.
 */
export function getSafeErrorMessage(error: unknown, fallbackMessage = 'Internal Server Error'): string {
  if (!error) return fallbackMessage;

  if (typeof error === 'object' && error !== null) {
    const errObj = error as any;

    // Safe mappings for Prisma known request error codes
    if (errObj.code === 'P2002') {
      return 'A record with this value already exists (unique constraint violation).';
    }
    if (errObj.code === 'P2025') {
      return 'Requested record was not found or has been modified.';
    }
    if (errObj.code === 'P2003') {
      return 'Referenced record was not found (foreign key constraint).';
    }

    if ('message' in errObj) {
      const msg = String(errObj.message);
      // Redact database connection strings, credentials, and internal stack traces
      if (
        msg.includes('postgresql://') ||
        msg.includes('postgres://') ||
        msg.includes('prisma') ||
        msg.includes('PrismaClient') ||
        msg.includes('CLERK_') ||
        msg.includes('CLOUDINARY_') ||
        msg.includes('SECRET') ||
        msg.includes('apiKey') ||
        msg.includes('token') ||
        msg.includes('at ') // stack trace line
      ) {
        return fallbackMessage;
      }
      return msg;
    }
  }

  return fallbackMessage;
}

export * from './logger.js';
export * from './env.js';

// ─── Database Query Timeout Guard ─────────────────────────────────────────────

/**
 * Wraps a database or external operation with a deterministic timeout.
 * Rejects with a descriptive timeout error if the operation exceeds timeoutMs.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = DEFAULT_DB_TIMEOUT_MS,
  operationName = 'Database operation'
): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Lightweight Rate Limiter ─────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryRateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired in-memory rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryRateLimitStore.entries()) {
    if (now >= entry.resetAt) {
      memoryRateLimitStore.delete(key);
    }
  }
}, 60_000).unref?.();

export interface RateLimitOptions {
  keyPrefix: string;
  limit: number; // Maximum requests allowed
  windowSeconds: number; // Time window in seconds
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

/**
 * Performs sliding window rate limiting backed by Upstash Redis / ioredis with in-memory fallback.
 * Gracefully degrades: Never blocks legitimate requests if Redis is unreachable.
 */
export async function checkRateLimit(
  identifier: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { keyPrefix, limit, windowSeconds } = options;
  const rateLimitKey = `ratelimit:${keyPrefix}:${identifier.trim().toLowerCase()}`;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  const redisClient = getRedisClient();

  if (redisClient?.upstash) {
    try {
      const current = await redisClient.upstash.incr(rateLimitKey);
      if (current === 1) {
        await redisClient.upstash.expire(rateLimitKey, windowSeconds);
      }
      const ttl = await redisClient.upstash.ttl(rateLimitKey);
      const remaining = Math.max(0, limit - current);

      return {
        allowed: current <= limit,
        limit,
        remaining,
        resetSeconds: Math.max(1, ttl),
      };
    } catch (err) {
      // Degrade to memory limiter on Redis failure
      console.warn('[RateLimit] Upstash Redis check failed, falling back to memory:', err);
    }
  }

  // Memory fallback rate limiter
  const entry = memoryRateLimitStore.get(rateLimitKey);

  if (!entry || now >= entry.resetAt) {
    memoryRateLimitStore.set(rateLimitKey, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      resetSeconds: windowSeconds,
    };
  }

  entry.count++;
  const remaining = Math.max(0, limit - entry.count);
  const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

  return {
    allowed: entry.count <= limit,
    limit,
    remaining,
    resetSeconds,
  };
}
