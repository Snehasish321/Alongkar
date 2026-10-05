import crypto from 'crypto';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

export const DEFAULT_SLOW_REQUEST_THRESHOLD_MS = 1000;

/**
 * Returns configured slow request threshold in milliseconds.
 */
export function getSlowRequestThresholdMs(): number {
  if (process.env.SLOW_REQUEST_THRESHOLD_MS) {
    const parsed = parseInt(process.env.SLOW_REQUEST_THRESHOLD_MS, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_SLOW_REQUEST_THRESHOLD_MS;
}

/**
 * Returns configured minimum log level.
 */
export function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();
  if (envLevel && envLevel in LOG_LEVEL_SEVERITY) {
    return envLevel as LogLevel;
  }
  return 'INFO';
}

/**
 * Validates and sanitizes incoming or generates a new correlation request ID.
 * Bounded to 100 chars, alphanumeric with dashes/underscores/dots.
 */
export function getOrCreateRequestId(req: any): string {
  if (req) {
    if (req._requestId && typeof req._requestId === 'string') {
      return req._requestId;
    }

    const incomingHeader =
      req.headers?.['x-request-id'] ||
      req.headers?.['X-Request-ID'] ||
      req.headers?.['x-correlation-id'] ||
      req.headers?.['X-Correlation-ID'];

    if (
      typeof incomingHeader === 'string' &&
      incomingHeader.trim().length > 0 &&
      incomingHeader.trim().length <= 100
    ) {
      const trimmed = incomingHeader.trim();
      // Allow only safe characters without whitespace, quotes, or sensitive token patterns
      if (
        /^[a-zA-Z0-9_\-.:]+$/.test(trimmed) &&
        !trimmed.toLowerCase().includes('bearer') &&
        !trimmed.toLowerCase().includes('eyj')
      ) {
        req._requestId = trimmed;
        return trimmed;
      }
    }
  }

  const randomPart =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : Date.now().toString(36) + Math.random().toString(36).substring(2, 10);

  const generated = `req_${randomPart}`;
  if (req) {
    req._requestId = generated;
  }
  return generated;
}

/**
 * Sanitizes and redacts sensitive credentials, tokens, DB URLs, and secrets from arbitrary strings.
 */
export function maskSensitiveString(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/postgresql:\/\/[^@\s]+@/gi, 'postgresql://[REDACTED]@')
    .replace(/postgres:\/\/[^@\s]+@/gi, 'postgres://[REDACTED]@')
    .replace(/Bearer\s+([A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*)/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/eyJ[A-Za-z0-9-_=]{10,}/g, '[REDACTED_JWT]')
    .replace(/CLERK_SECRET_KEY=[^\s&]+/gi, 'CLERK_SECRET_KEY=[REDACTED]')
    .replace(/CLOUDINARY_API_SECRET=[^\s&]+/gi, 'CLOUDINARY_API_SECRET=[REDACTED]')
    .replace(/RAZORPAY_KEY_SECRET=[^\s&]+/gi, 'RAZORPAY_KEY_SECRET=[REDACTED]')
    .replace(/key_secret[:=][^\s&,]+/gi, 'key_secret=[REDACTED]')
    .replace(/password[:=][^\s&,]+/gi, 'password=[REDACTED]');
}

export interface LogContext {
  level?: LogLevel;
  endpoint: string;
  method?: string;
  operation?: string;
  requestId?: string;
  statusCode?: number;
  durationMs?: number;
  category?: string;
  message?: string;
  error?: unknown;
  userId?: string;
  extra?: Record<string, any>;
  context?: Record<string, any>;
}

/**
 * Standardized structured log emitter.
 */
export function logEvent(level: LogLevel, ctx: LogContext): void {
  const currentLevel = getLogLevel();
  if (LOG_LEVEL_SEVERITY[level] < LOG_LEVEL_SEVERITY[currentLevel]) {
    return;
  }

  const timestamp = new Date().toISOString();
  const method = ctx.method?.toUpperCase() || 'HTTP';
  const endpoint = ctx.endpoint || 'UNKNOWN';
  const operation = ctx.operation || 'OPERATION';
  const reqIdStr = ctx.requestId ? ` [req:${ctx.requestId}]` : '';
  const statusStr = ctx.statusCode ? ` [status:${ctx.statusCode}]` : '';
  const durationStr = ctx.durationMs !== undefined ? ` [${ctx.durationMs}ms]` : '';
  const categoryStr = ctx.category ? ` [cat:${ctx.category}]` : '';
  const userStr = ctx.userId ? ` [user:${ctx.userId}]` : '';

  let message = ctx.message || '';
  if (ctx.error) {
    const rawError = ctx.error instanceof Error ? ctx.error.message : String(ctx.error);
    message = message ? `${message}: ${rawError}` : rawError;
  }
  const sanitizedMessage = maskSensitiveString(message);

  const extraObj = ctx.extra || ctx.context;
  const extraStr = extraObj ? ` | extra: ${maskSensitiveString(JSON.stringify(extraObj))}` : '';

  const serverErrorTag = level === 'ERROR' ? ' [SERVER_ERROR]' : '';
  const logLine = `[${timestamp}] [${level}]${serverErrorTag} [${method} ${endpoint}] [${operation}]${reqIdStr}${statusStr}${durationStr}${categoryStr}${userStr}${
    sanitizedMessage ? `: ${sanitizedMessage}` : ''
  }${extraStr}`;

  switch (level) {
    case 'ERROR':
      console.error(logLine);
      break;
    case 'WARN':
      console.warn(logLine);
      break;
    case 'INFO':
      console.info(logLine);
      break;
    case 'DEBUG':
      console.debug(logLine);
      break;
  }
}

export interface ServerErrorContext extends LogContext {}

/**
 * Structured server-side error logging with automatic redaction of sensitive credentials.
 * Preserves full backward compatibility with existing callers.
 */
export function logServerError(
  firstArg: ServerErrorContext | unknown,
  secondArg?: {
    endpoint?: string;
    method?: string;
    operation?: string;
    userId?: string;
    requestId?: string;
    statusCode?: number;
    durationMs?: number;
    context?: any;
    extra?: any;
  }
) {
  let endpoint = 'UNKNOWN';
  let method = 'UNKNOWN';
  let operation = 'OPERATION';
  let error: unknown = firstArg;
  let userId: string | undefined;
  let requestId: string | undefined;
  let statusCode = 500;
  let durationMs: number | undefined;
  let extra: any;

  if (firstArg && typeof firstArg === 'object' && 'endpoint' in (firstArg as any)) {
    const ctx = firstArg as ServerErrorContext;
    endpoint = ctx.endpoint;
    method = ctx.method || 'UNKNOWN';
    operation = ctx.operation || 'OPERATION';
    error = ctx.error;
    userId = ctx.userId;
    requestId = ctx.requestId;
    statusCode = ctx.statusCode || 500;
    durationMs = ctx.durationMs;
    extra = ctx.extra || ctx.context;
  } else if (secondArg) {
    endpoint = secondArg.endpoint || 'UNKNOWN';
    method = secondArg.method || 'UNKNOWN';
    operation = secondArg.operation || 'OPERATION';
    userId = secondArg.userId;
    requestId = secondArg.requestId;
    statusCode = secondArg.statusCode || 500;
    durationMs = secondArg.durationMs;
    extra = secondArg.extra || secondArg.context;
  }

  logEvent('ERROR', {
    endpoint,
    method,
    operation,
    error,
    userId,
    requestId,
    statusCode,
    durationMs,
    category: 'server_error',
    extra,
  });
}

/**
 * Measures API duration and emits a WARN log if execution time exceeds threshold.
 */
export function logSlowRequest(ctx: {
  endpoint: string;
  method?: string;
  durationMs: number;
  thresholdMs?: number;
  requestId?: string;
  statusCode?: number;
  operation?: string;
}): boolean {
  const threshold = ctx.thresholdMs || getSlowRequestThresholdMs();
  if (ctx.durationMs >= threshold) {
    logEvent('WARN', {
      endpoint: ctx.endpoint,
      method: ctx.method,
      operation: ctx.operation || 'slow_request',
      requestId: ctx.requestId,
      statusCode: ctx.statusCode,
      durationMs: ctx.durationMs,
      category: 'performance',
      message: `Slow request detected (${ctx.durationMs}ms >= ${threshold}ms threshold)`,
    });
    return true;
  }
  return false;
}

/**
 * Structured security event logging (401/403/429/413/malformed/spoofing).
 */
export function logSecurityEvent(ctx: {
  event: string;
  endpoint: string;
  method?: string;
  requestId?: string;
  statusCode?: number;
  userId?: string;
  details?: string;
  extra?: Record<string, any>;
}) {
  logEvent('WARN', {
    endpoint: ctx.endpoint,
    method: ctx.method,
    operation: ctx.event,
    requestId: ctx.requestId,
    statusCode: ctx.statusCode || 400,
    userId: ctx.userId,
    category: 'security',
    message: ctx.details || `Security event: ${ctx.event}`,
    extra: ctx.extra,
  });
}

/**
 * Tracks dependency failures (Redis degradation, PostgreSQL timeout, Cloudinary failure, Clerk auth errors).
 */
export function logDependencyFailure(
  dependency: 'redis' | 'database' | 'cloudinary' | 'clerk' | string,
  operation: string,
  error: unknown,
  ctx?: {
    endpoint?: string;
    method?: string;
    requestId?: string;
    isFatal?: boolean;
    extra?: Record<string, any>;
  }
) {
  const level: LogLevel = ctx?.isFatal ? 'ERROR' : 'WARN';
  logEvent(level, {
    endpoint: ctx?.endpoint || 'SYSTEM',
    method: ctx?.method,
    operation,
    requestId: ctx?.requestId,
    category: dependency,
    error,
    message: `Dependency failure on [${dependency}:${operation}]${ctx?.isFatal ? ' (FATAL)' : ' (DEGRADED)'}`,
    extra: ctx?.extra,
  });
}
