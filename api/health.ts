import prisma from '../src/lib/prisma.js';
import { getRedisClient } from './_utils/cache.js';
import { respond } from './_utils/auth.js';
import {
  getOrCreateRequestId,
  withTimeout,
  logDependencyFailure,
} from './_utils/security.js';

export default async function handler(req: any, res?: any) {
  const method = (req.method || 'GET').toUpperCase();
  const requestId = getOrCreateRequestId(req);
  if (res) res._requestId = requestId;

  if (method !== 'GET' && method !== 'HEAD') {
    return respond(
      res,
      405,
      { status: 'error', error: `Method ${method} Not Allowed` },
      { 'X-Request-ID': requestId }
    );
  }

  const startTime = Date.now();
  let dbStatus: 'healthy' | 'degraded' | 'unhealthy' = 'unhealthy';
  let cacheStatus: 'healthy' | 'degraded' | 'not_configured' = 'not_configured';

  // 1. Lightweight Database Ping (SELECT 1)
  try {
    await withTimeout(
      prisma.$queryRaw`SELECT 1`,
      3000,
      'Database health ping'
    );
    dbStatus = 'healthy';
  } catch (err) {
    dbStatus = 'unhealthy';
    logDependencyFailure('database', 'health_check_ping', err, {
      endpoint: '/api/health',
      method,
      requestId,
      isFatal: true,
    });
  }

  // 2. Non-Critical Redis Cache Ping
  try {
    const redisClient = getRedisClient();
    if (redisClient?.upstash) {
      const pingRes = await withTimeout(
        redisClient.upstash.ping(),
        2000,
        'Redis Upstash ping'
      );
      cacheStatus = pingRes ? 'healthy' : 'degraded';
    } else if (redisClient?.io) {
      const pingRes = await withTimeout(
        redisClient.io.ping(),
        2000,
        'Redis IORedis ping'
      );
      cacheStatus = pingRes === 'PONG' ? 'healthy' : 'degraded';
    } else {
      cacheStatus = 'not_configured';
    }
  } catch (err) {
    // Non-critical cache failure degrades cache status without bringing down the API
    cacheStatus = 'degraded';
    logDependencyFailure('redis', 'health_check_ping', err, {
      endpoint: '/api/health',
      method,
      requestId,
      isFatal: false,
    });
  }

  const durationMs = Date.now() - startTime;
  const isHealthy = dbStatus === 'healthy';
  const httpStatus = isHealthy ? 200 : 503;

  const healthPayload = {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks: {
      runtime: 'healthy',
      database: dbStatus,
      cache: cacheStatus,
    },
    latencyMs: durationMs,
  };

  return respond(res, httpStatus, healthPayload, {
    'X-Request-ID': requestId,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  });
}
