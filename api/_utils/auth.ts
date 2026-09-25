import 'dotenv/config';
import { createClerkClient } from '@clerk/backend';
import prisma from '../../src/lib/prisma';

const publishableKey =
  process.env.CLERK_PUBLISHABLE_KEY ||
  process.env.VITE_CLERK_PUBLISHABLE_KEY ||
  '';

const secretKey = process.env.CLERK_SECRET_KEY || '';

export const clerkClient = createClerkClient({
  publishableKey,
  secretKey,
});

/**
 * Extracts request body from various request shapes (Node stream, Vercel parsed body, Web Request).
 */
export async function getRequestBody(req: any): Promise<any> {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    return req.body;
  }

  // Handle Node.js IncomingMessage stream (e.g. Vite dev server)
  if (typeof req.on === 'function') {
    return new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk: any) => {
        data += chunk;
      });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
      req.on('error', () => {
        resolve({});
      });
    });
  }

  // Handle Web standard Request
  if (typeof req.json === 'function') {
    try {
      return await req.json();
    } catch {
      return {};
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
    bodyData !== undefined
  ) {
    body = typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData);
  }

  return new Request(url, {
    method: req.method || 'GET',
    headers,
    body,
  });
}

/**
 * Unified response sender supporting Vercel functions, Node HTTP (Vite dev server), and Web Response.
 */
export function respond(res: any, status: number, data: any) {
  if (res) {
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
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Authenticates the incoming request using Clerk and retrieves or creates
 * the corresponding User record in the Neon PostgreSQL database via Prisma.
 */
export async function getAuthenticatedUser(req: any, bodyData?: any) {
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
