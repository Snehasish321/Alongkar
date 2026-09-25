import prisma from '../src/lib/prisma';
import { getAuthenticatedUser, getRequestBody, respond } from './_utils/auth';

export default async function handler(req: any, res?: any) {
  const method = (req.method || 'GET').toUpperCase();

  try {
    const body = await getRequestBody(req);
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

      if (!productId || typeof productId !== 'string') {
        return respond(res, 400, { error: 'Invalid or missing productId' });
      }

      const wishlist = await getOrCreateWishlist();

      await prisma.wishlistItem.upsert({
        where: {
          wishlistId_productId: {
            wishlistId: wishlist.id,
            productId,
          },
        },
        update: {},
        create: {
          wishlistId: wishlist.id,
          productId,
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
      const productId =
        body.productId ||
        (req.query && req.query.productId) ||
        (req.url ? new URL(req.url, 'http://localhost').searchParams.get('productId') : null);

      if (!productId || typeof productId !== 'string') {
        return respond(res, 400, { error: 'Invalid or missing productId' });
      }

      const wishlist = await getOrCreateWishlist();
      await prisma.wishlistItem.deleteMany({
        where: {
          wishlistId: wishlist.id,
          productId,
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
    return respond(res, 500, { error: 'Internal Server Error' });
  }
}
