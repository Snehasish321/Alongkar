import prisma from '../src/lib/prisma.js';
import customersHandler from './_admin/customers.js';
import jewelleryRequestsHandler from './_admin/jewellery-requests.js';
import ordersHandler from './_admin/orders.js';
import { respond } from './_utils/auth.js';
import { getOrCreateRequestId } from './_utils/security.js';

// Re-export all underlying handler utilities and types for consumers and test suites
export * from './_admin/customers.js';
export * from './_admin/jewellery-requests.js';
export * from './_admin/orders.js';
export {
  customersHandler,
  jewelleryRequestsHandler,
  ordersHandler,
};

/**
 * Resolves the target admin resource and any subpath from either:
 * 1. Query parameters populated by Vercel rewrites (?resource=...&path=...)
 * 2. Original req.url pathname (used by local Vite dev server and direct callers)
 */
export function resolveAdminRoute(req: any): {
  resource: string | null;
  subpath: string | null;
} {
  // 1. Check req.query populated by Vercel rewrites (?resource=...)
  if (req.query && typeof req.query === 'object') {
    const resParam = typeof req.query.resource === 'string' ? req.query.resource.trim() : null;
    const pathParam = typeof req.query.path === 'string' ? req.query.path.trim() : null;
    if (resParam) {
      // Normalize if resource contains slash, e.g. "customers/analytics"
      const parts = resParam.split('/').filter(Boolean);
      return {
        resource: parts[0] || null,
        subpath: parts.slice(1).join('/') || pathParam || null,
      };
    }
  }

  // 2. Parse req.url (used in local Vite dev server and direct script invocations)
  if (typeof req.url === 'string') {
    try {
      const url = new URL(req.url, 'http://localhost');
      const segments = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
      const adminIdx = segments.indexOf('admin');
      if (adminIdx !== -1 && segments.length > adminIdx + 1) {
        const resource = decodeURIComponent(segments[adminIdx + 1]).trim();
        const subpath = segments.slice(adminIdx + 2).map(decodeURIComponent).join('/') || null;
        return { resource, subpath };
      }
    } catch {}
  }

  return { resource: null, subpath: null };
}

/**
 * Consolidated Admin Serverless Function Handler
 *
 * Routes incoming admin requests to:
 * - /api/admin/customers (including /analytics, /segments) -> customersHandler
 * - /api/admin/jewellery-requests -> jewelleryRequestsHandler
 * - /api/admin/orders -> ordersHandler
 *
 * Preserves the raw request stream without reading or mutating body payloads.
 */
export default async function handler(req: any, res?: any, dbClient: any = prisma) {
  const { resource, subpath } = resolveAdminRoute(req);

  // Normalize subpath into query parameters if needed without overriding explicit query params
  if (subpath) {
    if (!req.query) req.query = {};
    if (resource === 'orders' && !req.query.id && !req.query.orderNumber) {
      if (subpath.startsWith('ORD-')) {
        req.query.orderNumber = subpath;
      } else {
        req.query.id = subpath;
      }
    } else if (resource === 'jewellery-requests' && !req.query.id) {
      req.query.id = subpath;
    }
  }

  if (resource === 'customers') {
    return customersHandler(req, res, dbClient);
  }

  if (resource === 'jewellery-requests') {
    return jewelleryRequestsHandler(req, res);
  }

  if (resource === 'orders') {
    return ordersHandler(req, res);
  }

  // Unknown admin resource -> 404 Not Found
  const requestId = getOrCreateRequestId(req);
  return respond(
    res,
    404,
    { success: false, error: 'Not Found: Invalid admin endpoint route.' },
    { 'X-Request-ID': requestId }
  );
}
