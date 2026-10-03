import prisma from '../src/lib/prisma.js';
import { getAuthenticatedUser, getRequestBody, respond, isPayloadTooLarge, isMalformedJson } from './_utils/auth.js';
import { isValidIdentifier, getSafeErrorMessage } from './_utils/security.js';

export default async function handler(req: any, res?: any) {
  const method = (req.method || 'GET').toUpperCase();

  try {
    const body = await getRequestBody(req);

    if (isPayloadTooLarge(body)) {
      return respond(res, 413, { error: 'Payload too large: maximum allowed JSON body size is 1MB' });
    }
    if (isMalformedJson(body)) {
      return respond(res, 400, { error: 'Invalid JSON payload format' });
    }

    const user = await getAuthenticatedUser(req, body);

    if (!user) {
      return respond(res, 401, { error: 'Unauthorized: Valid Clerk session required' });
    }

    // Helper to get or create the user's wishlist
    const getOrCreateWishlist = async () => {
      let wishlist = await prisma.wishlist.findUnique({
        where: { userId: user.id },
        include: {
          items: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!wishlist) {
        wishlist = await prisma.wishlist.create({
          data: { userId: user.id },
          include: {
            items: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      }
      return wishlist;
    };

    if (method === 'GET') {
      const wishlist = await getOrCreateWishlist();
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
      const product = await prisma.product.findUnique({
        where: { id: trimmedProductId },
        select: { id: true },
      });

      if (!product) {
        return respond(res, 404, { error: 'Product not found' });
      }

      const wishlist = await getOrCreateWishlist();

      await prisma.wishlistItem.upsert({
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
      });

      const updatedWishlist = await getOrCreateWishlist();
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

      const wishlist = await getOrCreateWishlist();
      await prisma.wishlistItem.deleteMany({
        where: {
          wishlistId: wishlist.id,
          productId: trimmedProductId,
        },
      });

      const updatedWishlist = await getOrCreateWishlist();
      return respond(res, 200, {
        id: updatedWishlist.id,
        items: updatedWishlist.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          createdAt: item.createdAt,
        })),
      });
    }

    return respond(res, 405, { error: `Method ${method} Not Allowed` });
  } catch (error) {
    console.error('Wishlist API error:', error);
    return respond(res, 500, { error: getSafeErrorMessage(error, 'Internal Server Error') });
  }
}
