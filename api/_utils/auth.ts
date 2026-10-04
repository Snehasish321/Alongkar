import 'dotenv/config';
import { createClerkClient } from '@clerk/backend';
import prisma from '../../src/lib/prisma.js';
import { getOrCreateRequestId, logSecurityEvent, logDependencyFailure } from './logger.js';

const publishableKey =
  process.env.CLERK_PUBLISHABLE_KEY ||
  process.env.VITE_CLERK_PUBLISHABLE_KEY ||
  '';

const secretKey = process.env.CLERK_SECRET_KEY || '';

export const clerkClient = createClerkClient({
  publishableKey,
  secretKey,
});

export const MAX_JSON_BODY_BYTES = 1024 * 1024; // 1 MB limit for JSON request bodies

export interface ParsedBodyResult {
  data?: any;
  error?: 'PAYLOAD_TOO_LARGE' | 'MALFORMED_JSON';
}

/**
 * Checks if the parsed request body exceeded size limits.
 */
export function isPayloadTooLarge(body: any): boolean {
  return body && typeof body === 'object' && body._error === 'PAYLOAD_TOO_LARGE';
}

/**
 * Checks if the request body contained malformed JSON.
 */
export function isMalformedJson(body: any): boolean {
  return body && typeof body === 'object' && body._error === 'MALFORMED_JSON';
}

/**
 * Extracts request body from various request shapes (Node stream, Vercel parsed body, Web Request)
 * while strictly enforcing maximum payload sizes (1MB) and catching malformed JSON.
 */
export async function getRequestBody(req: any): Promise<any> {
  // Check Content-Length header if present
  const contentLength = req.headers?.['content-length'] || req.headers?.['Content-Length'];
  if (contentLength && parseInt(String(contentLength), 10) > MAX_JSON_BODY_BYTES) {
    return { _error: 'PAYLOAD_TOO_LARGE' };
  }

  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body, 'utf8') > MAX_JSON_BODY_BYTES) {
        return { _error: 'PAYLOAD_TOO_LARGE' };
      }
      try {
        return JSON.parse(req.body);
      } catch {
        return { _error: 'MALFORMED_JSON' };
      }
    }
    return req.body;
  }

  // Handle Node.js IncomingMessage stream (e.g. Vite dev server)
  if (typeof req.on === 'function') {
    return new Promise((resolve) => {
      let data = '';
      let totalBytes = 0;
      let tooLarge = false;

      req.on('data', (chunk: any) => {
        const chunkBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += chunkBuf.length;
        if (totalBytes > MAX_JSON_BODY_BYTES) {
          tooLarge = true;
        } else {
          data += chunkBuf.toString('utf8');
        }
      });

      req.on('end', () => {
        if (tooLarge) {
          return resolve({ _error: 'PAYLOAD_TOO_LARGE' });
        }
        if (!data || data.trim().length === 0) {
          return resolve({});
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ _error: 'MALFORMED_JSON' });
        }
      });

      req.on('error', () => {
        resolve({ _error: 'MALFORMED_JSON' });
      });
    });
  }

  // Handle Web standard Request
  if (typeof req.json === 'function') {
    try {
      return await req.json();
    } catch {
      return { _error: 'MALFORMED_JSON' };
    }
  }

  return {};
}

/**
 * Converts incoming request to standard Web Request for Clerk SDK.
 */
export async function createWebRequest(req: any, bodyData?: any): Promise<Request> {
  if (req instanceof Request) {
    return req;
  }

  const protocol = req.headers?.['x-forwarded-proto'] || 'http';
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'localhost:5173';
  const url = `${protocol}://${host}${req.url || '/'}`;

  const headers = new Headers();
  if (req.headers) {
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        value.forEach((v) => headers.append(key, v));
      } else {
        headers.set(key, String(value));
      }
    }
  }

  let body: string | undefined = undefined;
  if (
    req.method &&
    !['GET', 'HEAD'].includes(req.method.toUpperCase()) &&
    bodyData !== undefined &&
    !isPayloadTooLarge(bodyData) &&
    !isMalformedJson(bodyData)
  ) {
    body = typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData);
  }

  return new Request(url, {
    method: req.method || 'GET',
    headers,
    body,
  });
}

const DEFAULT_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/**
 * Unified response sender supporting Vercel functions, Node HTTP (Vite dev server), and Web Response.
 * Automatically injects standard security headers to prevent MIME confusion, clickjacking, and referrer leakage,
 * as well as X-Request-ID correlation tracking headers.
 */
export function respond(res: any, status: number, data: any, headers?: Record<string, string>) {
  const mergedHeaders: Record<string, string> = {
    ...DEFAULT_SECURITY_HEADERS,
    ...(headers || {}),
  };

  const reqId =
    mergedHeaders['X-Request-ID'] ||
    mergedHeaders['x-request-id'] ||
    res?._requestId ||
    res?.req?._requestId ||
    res?._req?._requestId;

  if (reqId) {
    mergedHeaders['X-Request-ID'] = reqId;
  }

  if (res) {
    if (typeof res.setHeader === 'function') {
      for (const [k, v] of Object.entries(mergedHeaders)) {
        res.setHeader(k, v);
      }
    } else if (typeof res.set === 'function') {
      res.set(mergedHeaders);
    }

    if (typeof res.status === 'function' && typeof res.json === 'function') {
      return res.status(status).json(data);
    }
    if (typeof res.setHeader === 'function' && typeof res.end === 'function') {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
      return;
    }
  }
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...mergedHeaders },
  });
}

/**
 * Authenticates the incoming request using Clerk and retrieves or creates
 * the corresponding User record in the Neon PostgreSQL database via Prisma.
 */
export async function getAuthenticatedUser(req: any, bodyData?: any) {
  if (process.env.NODE_ENV === 'test' && req && req._testUser !== undefined) {
    return req._testUser;
  }
  try {
    const webRequest = await createWebRequest(req, bodyData);
    const requestState = await clerkClient.authenticateRequest(webRequest, {
      publishableKey,
      secretKey,
    });

    if (!requestState.isAuthenticated) {
      return null;
    }

    const auth = requestState.toAuth();
    const clerkUserId = auth.userId;

    if (!clerkUserId) {
      return null;
    }

    // Find or create the User record in PostgreSQL
    let user = await prisma.user.findUnique({
      where: { clerkUserId },
    });

    if (!user) {
      let email: string | null = null;
      try {
        const clerkUser = await clerkClient.users.getUser(clerkUserId);
        email = clerkUser.emailAddresses?.[0]?.emailAddress || null;
      } catch (err) {
        console.error('Error fetching Clerk user details:', err);
      }

      user = await prisma.user.upsert({
        where: { clerkUserId },
        update: {},
        create: {
          clerkUserId,
          email,
        },
      });
    }

    return user;
  } catch (error) {
    console.error('Authentication error in getAuthenticatedUser:', error);
    return null;
  }
}

export interface AdminAuthResult {
  authorized: boolean;
  status: number;
  error?: string;
  user?: any;
  clerkUserId?: string;
  email?: string | null;
}

/**
 * Validates that the incoming request is from an authenticated Clerk user
 * with explicit administrator privileges (role === 'admin' in Clerk public or private metadata).
 *
 * Returns:
 * - { authorized: false, status: 401, error: '...' } when not authenticated
 * - { authorized: false, status: 403, error: '...' } when authenticated but non-admin
 * - { authorized: true, status: 200, user, clerkUserId } when authorized as admin
 */
export async function requireAdmin(req: any, bodyData?: any): Promise<AdminAuthResult> {
  if (process.env.NODE_ENV === 'test' && req && req._testAdmin !== undefined) {
    return req._testAdmin;
  }
  try {
    const webRequest = await createWebRequest(req, bodyData);
    const requestState = await clerkClient.authenticateRequest(webRequest, {
      publishableKey,
      secretKey,
    });

    if (!requestState.isAuthenticated) {
      return {
        authorized: false,
        status: 401,
        error: 'Unauthorized: Valid authenticated session required',
      };
    }

    const auth = requestState.toAuth();
    const clerkUserId = auth.userId;

    if (!clerkUserId) {
      return {
        authorized: false,
        status: 401,
        error: 'Unauthorized: Missing user identifier in session',
      };
    }

    // Check role in sessionClaims if configured in JWT template
    const sessionClaims = auth.sessionClaims as any;
    let role =
      sessionClaims?.publicMetadata?.role ||
      sessionClaims?.metadata?.role ||
      sessionClaims?.role;

    let userEmail: string | null = null;

    // If role is not directly in claims, query Clerk API for the user
    if (role !== 'admin') {
      try {
        const clerkUser = await clerkClient.users.getUser(clerkUserId);
        role =
          (clerkUser.publicMetadata as any)?.role ||
          (clerkUser.privateMetadata as any)?.role;
        userEmail = clerkUser.emailAddresses?.[0]?.emailAddress || null;
      } catch (err) {
        console.error('Error fetching Clerk user details for admin verification:', err);
      }
    }

    if (role !== 'admin') {
      return {
        authorized: false,
        status: 403,
        error: 'Forbidden: Administrator privileges required to manage products',
        clerkUserId,
      };
    }

    // Ensure corresponding User record exists in PostgreSQL
    let user = await prisma.user.findUnique({
      where: { clerkUserId },
    });

    if (!user) {
      user = await prisma.user.upsert({
        where: { clerkUserId },
        update: {},
        create: {
          clerkUserId,
          email: userEmail,
        },
      });
    }

    return {
      authorized: true,
      status: 200,
      user,
      clerkUserId,
      email: user.email || userEmail,
    };
  } catch (error) {
    console.error('Admin authorization error in requireAdmin:', error);
    return {
      authorized: false,
      status: 500,
      error: 'Internal authorization error',
    };
  }
}

