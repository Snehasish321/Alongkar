import { Redis as UpstashRedis } from '@upstash/redis';
import IORedis from 'ioredis';

// ─── Centralized Cache TTLs (seconds) ─────────────────────────────────────────
export const TTL = {
  PRODUCTS_ALL: 60 * 5, // 5 minutes (distributed Redis cache)
  PRODUCT_ONE: 60 * 10, // 10 minutes (distributed Redis cache)
} as const;

// ─── Deterministic Cache Key Generators ───────────────────────────────────────
export const CacheKey = {
  /**
   * Generates a canonical, deterministic cache key for product listings.
   * Parameter order and casing are strictly normalized.
   */
  productsList: (category?: string | null, collectionId?: string | null): string => {
    const cat = category && category.trim().toLowerCase() !== 'all' ? category.trim().toLowerCase() : 'all';
    const col = collectionId && collectionId.trim().toLowerCase() !== 'all' ? collectionId.trim().toLowerCase() : 'all';
    return `products:list:${cat}:${col}`;
  },

  /**
   * Generates a canonical cache key for a product by its ID.
   */
  productId: (id: string): string => {
    return `products:id:${id.trim()}`;
  },

  /**
   * Generates a canonical cache key for a product by its slug.
   */
  productSlug: (slug: string): string => {
    return `products:slug:${slug.trim().toLowerCase()}`;
  },

  /**
   * Fallback identifier key.
   */
  productRaw: (raw: string): string => {
    return `products:raw:${raw.trim().toLowerCase()}`;
  },

  /**
   * Global version key to prevent stale GET race conditions.
   */
  version: (): string => 'products:cache_version',
} as const;

// ─── Redis Client & In-Memory Fallback Store ──────────────────────────────────
let _upstash: UpstashRedis | null = null;
let _ioredis: IORedis | null = null;
let _initialized = false;

interface MemoryStoreEntry {
  val: any;
  exp: number;
}
const _fallbackMemoryStore = new Map<string, MemoryStoreEntry>();
let _localMemoryVersion = 1;

export function getRedisClient(): { upstash?: UpstashRedis; io?: IORedis } | null {
  if (_initialized) {
    if (_upstash) return { upstash: _upstash };
    if (_ioredis) return { io: _ioredis };
    return null;
  }

  _initialized = true;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    try {
      _upstash = new UpstashRedis({
        url: upstashUrl,
        token: upstashToken,
      });
      return { upstash: _upstash };
    } catch (e) {
      console.warn('[Cache] Failed to initialize Upstash REST client:', e);
    }
  }

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      _ioredis = new IORedis(redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      _ioredis.on('error', () => {
        // Suppress connection errors to prevent breaking API requests
      });
      return { io: _ioredis };
    } catch (e) {
      console.warn('[Cache] Failed to initialize ioredis client:', e);
    }
  }

  return null;
}

export interface CacheResult<T> {
  data: T | null;
  hit: boolean;
  source: 'redis' | 'miss';
  version?: number;
}

/**
 * Retrieves the current cache generation/version counter from Redis (or fallback store).
 */
export async function getCacheVersion(): Promise<number> {
  const client = getRedisClient();
  if (!client) return _localMemoryVersion;

  try {
    if (client.upstash) {
      const v = await client.upstash.get<number>(CacheKey.version());
      if (typeof v === 'number') return v;
    } else if (client.io) {
      const raw = await client.io.get(CacheKey.version());
      if (raw) {
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed)) return parsed;
      }
    }
  } catch {
    // Return fallback version on error
  }

  return _localMemoryVersion;
}

/**
 * Retrieves data from the shared Redis cache (or fallback memory store).
 * Returns { data, hit: true, source: 'redis' } on hit, or { data: null, hit: false, source: 'miss' } on miss/error.
 */
export async function cacheGet<T = unknown>(key: string): Promise<CacheResult<T>> {
  const client = getRedisClient();

  // If Redis is not configured, check local fallback store
  if (!client) {
    const entry = _fallbackMemoryStore.get(key);
    if (entry) {
      if (Date.now() <= entry.exp) {
        return { data: entry.val as T, hit: true, source: 'redis' };
      }
      _fallbackMemoryStore.delete(key);
    }
    return { data: null, hit: false, source: 'miss' };
  }

  try {
    if (client.upstash) {
      const data = await client.upstash.get<T>(key);
      if (data !== null && data !== undefined) {
        return { data, hit: true, source: 'redis' };
      }
    } else if (client.io) {
      const raw = await client.io.get(key);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        return { data: parsed, hit: true, source: 'redis' };
      }
    }
  } catch (err) {
    // Graceful degradation: never crash on cache read error
  }

  return { data: null, hit: false, source: 'miss' };
}

/**
 * Stores data in Redis with a specified TTL.
 * Prevents Stale GET races: if expectedVersion is provided, the write is aborted
 * if a concurrent mutation incremented the cache version during the database query.
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
  expectedVersion?: number
): Promise<boolean> {
  // If version check requested, ensure no mutation occurred during GET query
  if (expectedVersion !== undefined) {
    const currentVersion = await getCacheVersion();
    if (currentVersion !== expectedVersion) {
      // Stale GET race detected: drop this write to preserve cache consistency
      return false;
    }
  }

  const client = getRedisClient();

  // If Redis is not configured, write to local fallback store
  if (!client) {
    _fallbackMemoryStore.set(key, {
      val: value,
      exp: Date.now() + ttlSeconds * 1000,
    });
    return true;
  }

  try {
    if (client.upstash) {
      await client.upstash.set(key, value, { ex: ttlSeconds });
      return true;
    } else if (client.io) {
      await client.io.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return true;
    }
  } catch (err) {
    // Graceful degradation: log warning without crashing caller
    console.warn('[Cache] Write error for key:', key, err);
  }

  return false;
}

/**
 * Deletes a single key from Redis (or fallback store).
 */
export async function cacheDel(key: string): Promise<void> {
  _fallbackMemoryStore.delete(key);

  const client = getRedisClient();
  if (!client) return;

  try {
    if (client.upstash) {
      await client.upstash.del(key);
    } else if (client.io) {
      await client.io.del(key);
    }
  } catch (err) {
    console.warn('[Cache] Error deleting key:', key, err);
  }
}

/**
 * Invalidates all product catalog caches across Redis and increments the cache version.
 * Call after any product creation, update, or deletion.
 */
export async function invalidateProducts(): Promise<void> {
  _localMemoryVersion++;
  _fallbackMemoryStore.clear();

  const client = getRedisClient();
  if (!client) return;

  try {
    if (client.upstash) {
      // 1. Increment cache version to immediately invalidate any in-flight GET queries
      await client.upstash.incr(CacheKey.version());

      // 2. Scan and delete all product cache keys
      const keys = await client.upstash.keys('products:*');
      const keysToDelete = (keys || []).filter((k) => k !== CacheKey.version());
      if (keysToDelete.length > 0) {
        await client.upstash.del(...keysToDelete);
      }
    } else if (client.io) {
      await client.io.incr(CacheKey.version());
      const keys = await scanIoRedisKeys(client.io, 'products:*');
      const keysToDelete = keys.filter((k) => k !== CacheKey.version());
      if (keysToDelete.length > 0) {
        await client.io.del(...keysToDelete);
      }
    }
  } catch (err) {
    console.warn('[Cache] Error during product cache invalidation:', err);
  }
}

/**
 * Invalidates specific product item keys (ID and slug).
 */
export async function invalidateProductKeys(id?: string, slug?: string): Promise<void> {
  if (id) {
    await cacheDel(CacheKey.productId(id));
  }
  if (slug) {
    await cacheDel(CacheKey.productSlug(slug));
  }
}

async function scanIoRedisKeys(client: IORedis, pattern: string): Promise<string[]> {
  const results: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    results.push(...keys);
  } while (cursor !== '0');
  return results;
}
