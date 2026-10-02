import { Redis as UpstashRedis } from '@upstash/redis';
import IORedis from 'ioredis';

// ─── Cache TTLs (seconds) ───────────────────────────────────────────────────
export const TTL = {
  PRODUCTS_ALL: 60 * 5,   // 5 minutes (distributed L2)
  PRODUCT_ONE: 60 * 10,   // 10 minutes (distributed L2)
  L1_MICRO: 30,           // 30 seconds (in-memory L1)
} as const;

// ─── Cache Keys ─────────────────────────────────────────────────────────────
export const CacheKey = {
  productsList: (category?: string, collectionId?: string) => {
    const cat = category ? category.toLowerCase().trim() : 'all';
    const col = collectionId ? collectionId.toLowerCase().trim() : 'all';
    return `products:list:${cat}:${col}`;
  },
  productId: (id: string) => `products:id:${id.trim()}`,
  productSlug: (slug: string) => `products:slug:${slug.toLowerCase().trim()}`,
  productRaw: (raw: string) => `products:raw:${raw.toLowerCase().trim()}`,
} as const;

// ─── L1 In-Memory Cache ─────────────────────────────────────────────────────
interface L1Entry {
  val: any;
  exp: number;
}
const l1Cache = new Map<string, L1Entry>();
const L1_MAX_SIZE = 500;

function l1Get<T>(key: string): T | null {
  const entry = l1Cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.exp) {
    l1Cache.delete(key);
    return null;
  }
  return entry.val as T;
}

function l1Set(key: string, val: any, ttlSec: number): void {
  if (l1Cache.size >= L1_MAX_SIZE) {
    // Evict oldest entries
    const firstKey = l1Cache.keys().next().value;
    if (firstKey) l1Cache.delete(firstKey);
  }
  l1Cache.set(key, { val, exp: Date.now() + ttlSec * 1000 });
}

function l1Del(key: string): void {
  l1Cache.delete(key);
}

function l1ClearPrefix(prefix: string): void {
  for (const k of l1Cache.keys()) {
    if (k.startsWith(prefix)) {
      l1Cache.delete(k);
    }
  }
}

// ─── L2 Distributed Redis Client (Upstash REST or ioredis TCP) ─────────────
let _upstash: UpstashRedis | null = null;
let _ioredis: IORedis | null = null;
let _initialized = false;

function getRedisClient(): { upstash?: UpstashRedis; io?: IORedis } | null {
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
      console.warn('[Cache] Failed to initialize Upstash client:', e);
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
        // Suppress connection errors to avoid breaking API
      });
      return { io: _ioredis };
    } catch (e) {
      console.warn('[Cache] Failed to initialize ioredis client:', e);
    }
  }

  return null;
}

// ─── Public Multi-Layer Cache Helpers ───────────────────────────────────────

export interface CacheResult<T> {
  data: T | null;
  hit: boolean;
  source: 'memory' | 'redis' | 'miss';
}

/**
 * Retrieves data from L1 in-memory cache first, then L2 Redis.
 * Populates L1 if found in L2. Returns null on miss or error.
 */
export async function cacheGet<T = unknown>(key: string): Promise<CacheResult<T>> {
  // 1. Check L1 Memory (0ms)
  const l1Val = l1Get<T>(key);
  if (l1Val !== null) {
    return { data: l1Val, hit: true, source: 'memory' };
  }

  // 2. Check L2 Redis
  const client = getRedisClient();
  if (!client) {
    return { data: null, hit: false, source: 'miss' };
  }

  try {
    if (client.upstash) {
      const data = await client.upstash.get<T>(key);
      if (data !== null && data !== undefined) {
        // Populate L1 micro-cache
        l1Set(key, data, TTL.L1_MICRO);
        return { data, hit: true, source: 'redis' };
      }
    } else if (client.io) {
      const raw = await client.io.get(key);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        l1Set(key, parsed, TTL.L1_MICRO);
        return { data: parsed, hit: true, source: 'redis' };
      }
    }
  } catch (err) {
    // Graceful degradation: never crash on cache read error
  }

  return { data: null, hit: false, source: 'miss' };
}

/**
 * Stores data in both L1 (micro-cache) and L2 (Redis with TTL).
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  // Populate L1
  l1Set(key, value, Math.min(ttlSeconds, TTL.L1_MICRO));

  // Populate L2 Redis
  const client = getRedisClient();
  if (!client) return;

  try {
    if (client.upstash) {
      await client.upstash.set(key, value, { ex: ttlSeconds });
    } else if (client.io) {
      await client.io.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    }
  } catch (err) {
    // Graceful degradation: never throw on cache write error
  }
}

/**
 * Deletes a key from both L1 and L2.
 */
export async function cacheDel(key: string): Promise<void> {
  l1Del(key);
  const client = getRedisClient();
  if (!client) return;

  try {
    if (client.upstash) {
      await client.upstash.del(key);
    } else if (client.io) {
      await client.io.del(key);
    }
  } catch {}
}

/**
 * Invalidates all product keys across L1 and L2 (call after any product creation/update/deletion).
 */
export async function invalidateProducts(): Promise<void> {
  l1ClearPrefix('products:');

  const client = getRedisClient();
  if (!client) return;

  try {
    if (client.upstash) {
      const keys = await client.upstash.keys('products:*');
      if (keys && keys.length > 0) {
        await client.upstash.del(...keys);
      }
    } else if (client.io) {
      const keys = await scanIoRedisKeys(client.io, 'products:*');
      if (keys.length > 0) {
        await client.io.del(...keys);
      }
    }
  } catch (err) {
    console.warn('[Cache] Error invalidating product cache:', err);
  }
}

/**
 * Invalidate specific product keys (id and slug).
 */
export async function invalidateProductKeys(id?: string, slug?: string): Promise<void> {
  if (id) {
    l1Del(CacheKey.productId(id));
    await cacheDel(CacheKey.productId(id));
  }
  if (slug) {
    l1Del(CacheKey.productSlug(slug));
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
