import prisma from '../src/lib/prisma.js';
import { getAuthenticatedUser, getRequestBody, respond } from './_utils/auth.js';

export const MAX_CART_ITEM_QUANTITY = 99;

/**
 * Validates a cart item addition quantity.
 * Must be an integer between 1 and MAX_CART_ITEM_QUANTITY.
 */
export function isValidAddQuantity(qty: any): qty is number {
  return (
    typeof qty === 'number' &&
    Number.isInteger(qty) &&
    Number.isFinite(qty) &&
    !isNaN(qty) &&
    qty >= 1 &&
    qty <= MAX_CART_ITEM_QUANTITY
  );
}

/**
 * Validates a cart item update quantity.
 * Must be an integer between 0 and MAX_CART_ITEM_QUANTITY (0 removes the item).
 */
export function isValidUpdateQuantity(qty: any): qty is number {
  return (
    typeof qty === 'number' &&
    Number.isInteger(qty) &&
    Number.isFinite(qty) &&
    !isNaN(qty) &&
    qty >= 0 &&
    qty <= MAX_CART_ITEM_QUANTITY
  );
}

/**
 * Formats a Cart database model into a clean client response.
 */
export function formatCartResponse(cart: any) {
  if (!cart) {
    return { id: '', items: [] };
  }
  return {
    id: cart.id,
    items: (cart.items || []).map((item: any) => ({
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };
}

/**
 * Retrieves or creates a Cart record for the given user within a database transaction or standard client.
 */
export async function getOrCreateCart(userId: string, tx?: any) {
  const db = tx || prisma;
  let cart = await db.cart.findUnique({
    where: { userId },
    include: {
      items: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!cart) {
    cart = await db.cart.create({
      data: { userId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
  return cart;
}

export default async function handler(req: any, res?: any) {
  const method = (req.method || 'GET').toUpperCase();

  try {
    const body = await getRequestBody(req);
    const user = await getAuthenticatedUser(req, body);

    if (!user) {
      return respond(res, 401, { error: 'Unauthorized: Valid Clerk session required' });
    }

    // ─── GET /api/cart (Fetch authenticated user's persistent cart) ──────────────
    if (method === 'GET') {
      const cart = await getOrCreateCart(user.id);
      return respond(res, 200, formatCartResponse(cart));
    }

    // ─── POST /api/cart (Add item / Increment quantity atomically) ──────────────
    if (method === 'POST') {
      const { productId, quantity } = body;

      if (!productId || typeof productId !== 'string' || productId.trim().length === 0) {
        return respond(res, 400, { error: 'Invalid or missing productId' });
      }

      const trimmedProductId = productId.trim();

      // Quantity validation
      let qty = 1;
      if (quantity !== undefined && quantity !== null) {
        if (!isValidAddQuantity(quantity)) {
          return respond(res, 400, {
            error: `Invalid quantity: must be an integer between 1 and ${MAX_CART_ITEM_QUANTITY}`,
          });
        }
        qty = quantity;
      }

      // Verify product existence in database to prevent orphan cart items
      const product = await prisma.product.findUnique({
        where: { id: trimmedProductId },
        select: { id: true },
      });

      if (!product) {
        return respond(res, 404, { error: 'Product not found' });
      }

      const cart = await getOrCreateCart(user.id);

      // Atomic quantity increment within transaction with cap
      await prisma.$transaction(async (tx) => {
        const existingItem = await tx.cartItem.findUnique({
          where: {
            cartId_productId: {
              cartId: cart.id,
              productId: trimmedProductId,
            },
          },
        });

        if (existingItem) {
          const newQty = Math.min(MAX_CART_ITEM_QUANTITY, existingItem.quantity + qty);
          await tx.cartItem.update({
            where: { id: existingItem.id },
            data: { quantity: newQty },
          });
        } else {
          await tx.cartItem.create({
            data: {
              cartId: cart.id,
              productId: trimmedProductId,
              quantity: qty,
            },
          });
        }
      });

      const updatedCart = await getOrCreateCart(user.id);
      return respond(res, 200, formatCartResponse(updatedCart));
    }

    // ─── PATCH /api/cart (Set exact item quantity) ──────────────────────────────
    if (method === 'PATCH') {
      const { productId, quantity } = body;

      if (!productId || typeof productId !== 'string' || productId.trim().length === 0) {
        return respond(res, 400, { error: 'Invalid or missing productId' });
      }

      const trimmedProductId = productId.trim();

      if (!isValidUpdateQuantity(quantity)) {
        return respond(res, 400, {
          error: `Invalid quantity: must be an integer between 0 and ${MAX_CART_ITEM_QUANTITY}`,
        });
      }

      const cart = await getOrCreateCart(user.id);

      if (quantity === 0) {
        // Quantity 0 removes the item
        await prisma.cartItem.deleteMany({
          where: {
            cartId: cart.id,
            productId: trimmedProductId,
          },
        });
      } else {
        // Verify product exists before setting quantity
        const product = await prisma.product.findUnique({
          where: { id: trimmedProductId },
          select: { id: true },
        });

        if (!product) {
          return respond(res, 404, { error: 'Product not found' });
        }

        await prisma.cartItem.upsert({
          where: {
            cartId_productId: {
              cartId: cart.id,
              productId: trimmedProductId,
            },
          },
          update: { quantity },
          create: {
            cartId: cart.id,
            productId: trimmedProductId,
            quantity,
          },
        });
      }

      const updatedCart = await getOrCreateCart(user.id);
      return respond(res, 200, formatCartResponse(updatedCart));
    }

    // ─── DELETE /api/cart (Remove item or clear all items) ──────────────────────
    if (method === 'DELETE') {
      const isClearAll = body?.clearAll === true || req.query?.all === 'true';
      const cart = await getOrCreateCart(user.id);

      if (isClearAll) {
        await prisma.cartItem.deleteMany({
          where: {
            cartId: cart.id,
          },
        });
      } else {
        const productId =
          body?.productId ||
          (req.query && req.query.productId) ||
          (req.url ? new URL(req.url, 'http://localhost').searchParams.get('productId') : null);

        if (!productId || typeof productId !== 'string' || productId.trim().length === 0) {
          return respond(res, 400, { error: 'Invalid or missing productId' });
        }

        await prisma.cartItem.deleteMany({
          where: {
            cartId: cart.id,
            productId: productId.trim(),
          },
        });
      }

      const updatedCart = await getOrCreateCart(user.id);
      return respond(res, 200, formatCartResponse(updatedCart));
    }

    return respond(res, 405, { error: `Method ${method} Not Allowed` });
  } catch (error) {
    console.error('Cart API error:', error);
    return respond(res, 500, { error: 'Internal Server Error' });
  }
}
