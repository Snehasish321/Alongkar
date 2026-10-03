import prisma from '../src/lib/prisma.js';
import { getAuthenticatedUser, getRequestBody, respond, isPayloadTooLarge, isMalformedJson } from './_utils/auth.js';
import {
  isValidIdentifier,
  getSafeErrorMessage,
  logServerError,
  withTimeout,
  getOrCreateRequestId,
  logSlowRequest,
  logSecurityEvent,
} from './_utils/security.js';

/**
 * Atomically gets or creates the user's wishlist using upsert to eliminate race conditions.
 */
export async function getOrCreateWishlist(userId: string) {
  try {
    return await prisma.wishlist.upsert({
      where: { userId },
      update: {},
      create: { userId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      const existing = await prisma.wishlist.findUnique({
        where: { userId },
        include: {
          items: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (existing) return existing;
    }
    throw err;
  }
}

export default async function handler(req: any, res?: any) {
  const method = (req.method || 'GET').toUpperCase();
  const requestId = getOrCreateRequestId(req);
  if (res) res._requestId = requestId;
  const startTime = Date.now();

  try {
    const body = await getRequestBody(req);

    if (isPayloadTooLarge(body)) {
      logSecurityEvent({
        event: 'payload_too_large',
        endpoint: '/api/wishlist',
        method,
        requestId,
        statusCode: 413,
      });
      return respond(res, 413, { error: 'Payload too large: maximum allowed JSON body size is 1MB' });
    }
    if (isMalformedJson(body)) {
      logSecurityEvent({
        event: 'malformed_json',
        endpoint: '/api/wishlist',
        method,
        requestId,
        statusCode: 400,
      });
      return respond(res, 400, { error: 'Invalid JSON payload format' });
    }

    const user = await getAuthenticatedUser(req, body);

    if (!user) {
      logSecurityEvent({
        event: 'unauthorized_access',
        endpoint: '/api/wishlist',
        method,
        requestId,
        statusCode: 401,
      });
      return respond(res, 401, { error: 'Unauthorized: Valid Clerk session required' });
    }

    if (method === 'GET') {
      const wishlist = await withTimeout(
        getOrCreateWishlist(user.id),
        8000,
        'Fetch user wishlist'
      );
      return respond(res, 200, {
        id: wishlist.id,
        items: wishlist.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          createdAt: item.createdAt,
        })),
      });
    }

    if (method === 'POST') {
      const { productId } = body;

      if (!productId || typeof productId !== 'string' || !productId.trim()) {
        return respond(res, 400, { error: 'Invalid or missing productId' });
      }

      const trimmedProductId = productId.trim();

      if (!isValidIdentifier(trimmedProductId)) {
        return respond(res, 400, { error: 'Invalid productId format' });
      }

      // Verify product exists in database
      const product = await withTimeout(
        prisma.product.findUnique({
          where: { id: trimmedProductId },
          select: { id: true },
        }),
        8000,
        'Verify wishlist product existence'
      );

      if (!product) {
        return respond(res, 404, { error: 'Product not found' });
      }

      const wishlist = await getOrCreateWishlist(user.id);

      await withTimeout(
        prisma.wishlistItem.upsert({
          where: {
            wishlistId_productId: {
              wishlistId: wishlist.id,
              productId: trimmedProductId,
            },
          },
          update: {},
          create: {
            wishlistId: wishlist.id,
            productId: trimmedProductId,
          },
        }),
        8000,
        'Upsert wishlist item'
      );

      const updatedWishlist = await getOrCreateWishlist(user.id);
      return respond(res, 200, {
        id: updatedWishlist.id,
        items: updatedWishlist.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          createdAt: item.createdAt,
        })),
      });
    }

    if (method === 'DELETE') {
      const rawProductId =
        body?.productId ||
        (req.query && req.query.productId) ||
        (req.url ? new URL(req.url, 'http://localhost').searchParams.get('productId') : null);

      if (!rawProductId || typeof rawProductId !== 'string' || !rawProductId.trim()) {
        return respond(res, 400, { error: 'Invalid or missing productId' });
      }

      const trimmedProductId = rawProductId.trim();

      if (!isValidIdentifier(trimmedProductId)) {
        return respond(res, 400, { error: 'Invalid productId format' });
      }

      const wishlist = await getOrCreateWishlist(user.id);
      await withTimeout(
        prisma.wishlistItem.deleteMany({
          where: {
            wishlistId: wishlist.id,
            productId: trimmedProductId,
          },
        }),
        8000,
        'Delete wishlist item'
      );

      const updatedWishlist = await getOrCreateWishlist(user.id);
      return respond(res, 200, {
        id: updatedWishlist.id,
        items: updatedWishlist.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          createdAt: item.createdAt,
        })),
      });
    }

    const durationMs = Date.now() - startTime;
    logSlowRequest({ endpoint: '/api/wishlist', method, durationMs, requestId });
    return respond(res, 405, { error: `Method ${method} Not Allowed` });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logServerError({
      endpoint: '/api/wishlist',
      method,
      operation: 'wishlist_handler',
      requestId,
      durationMs,
      statusCode: 500,
      error,
    });
    return respond(res, 500, { error: getSafeErrorMessage(error, 'Internal Server Error') });
  }
}
