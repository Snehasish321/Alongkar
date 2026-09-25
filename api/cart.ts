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

    // Helper to get or create the user's cart
    const getOrCreateCart = async () => {
      let cart = await prisma.cart.findUnique({
        where: { userId: user.id },
        include: {
          items: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!cart) {
        cart = await prisma.cart.create({
          data: { userId: user.id },
          include: {
            items: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      }
      return cart;
    };

    if (method === 'GET') {
      const cart = await getOrCreateCart();
      return respond(res, 200, {
        id: cart.id,
        items: cart.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })),
      });
    }

    if (method === 'POST') {
      const { productId, quantity } = body;

      if (!productId || typeof productId !== 'string') {
        return respond(res, 400, { error: 'Invalid or missing productId' });
      }

      const qty = typeof quantity === 'number' && quantity > 0 ? Math.floor(quantity) : 1;
      const cart = await getOrCreateCart();

      const existingItem = await prisma.cartItem.findUnique({
        where: {
          cartId_productId: {
            cartId: cart.id,
            productId,
          },
        },
      });

      if (existingItem) {
        await prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: existingItem.quantity + qty },
        });
      } else {
        await prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId,
            quantity: qty,
          },
        });
      }

      const updatedCart = await getOrCreateCart();
      return respond(res, 200, {
        id: updatedCart.id,
        items: updatedCart.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })),
      });
    }

    if (method === 'PATCH') {
      const { productId, quantity } = body;

      if (!productId || typeof productId !== 'string') {
        return respond(res, 400, { error: 'Invalid or missing productId' });
      }

      if (typeof quantity !== 'number') {
        return respond(res, 400, { error: 'Invalid quantity: must be a number' });
      }

      const cart = await getOrCreateCart();
      const qty = Math.floor(quantity);

      if (qty <= 0) {
        await prisma.cartItem.deleteMany({
          where: {
            cartId: cart.id,
            productId,
          },
        });
      } else {
        const existingItem = await prisma.cartItem.findUnique({
          where: {
            cartId_productId: {
              cartId: cart.id,
              productId,
            },
          },
        });

        if (existingItem) {
          await prisma.cartItem.update({
            where: { id: existingItem.id },
            data: { quantity: qty },
          });
        } else {
          await prisma.cartItem.create({
            data: {
              cartId: cart.id,
              productId,
              quantity: qty,
            },
          });
        }
      }

      const updatedCart = await getOrCreateCart();
      return respond(res, 200, {
        id: updatedCart.id,
        items: updatedCart.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
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

      const cart = await getOrCreateCart();
      await prisma.cartItem.deleteMany({
        where: {
          cartId: cart.id,
          productId,
        },
      });

      const updatedCart = await getOrCreateCart();
      return respond(res, 200, {
        id: updatedCart.id,
        items: updatedCart.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })),
      });
    }

    return respond(res, 405, { error: `Method ${method} Not Allowed` });
  } catch (error) {
    console.error('Cart API error:', error);
    return respond(res, 500, { error: 'Internal Server Error' });
  }
}
