import prisma from '../src/lib/prisma.js';
import { getAuthenticatedUser, getRequestBody, respond, isPayloadTooLarge, isMalformedJson } from './_utils/auth.js';
import { isValidIdentifier, getSafeErrorMessage, logServerError, withTimeout } from './_utils/security.js';

export const MAX_CART_ITEM_QUANTITY = 99;
export const MAX_CART_UNIQUE_ITEMS = 50;

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
 * Retrieves or creates a Cart record for the given user atomically.
 * Uses upsert to eliminate race conditions during simultaneous initial user visits.
 */
export async function getOrCreateCart(userId: string, tx?: any) {
  const db = tx || prisma;
  try {
    return await db.cart.upsert({
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
      const existing = await db.cart.findUnique({
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

    // ─── GET /api/cart (Fetch authenticated user's persistent cart) ──────────────
    if (method === 'GET') {
      const cart = await withTimeout(
        getOrCreateCart(user.id),
        8000,
        'Fetch user cart'
      );
      return respond(res, 200, formatCartResponse(cart));
    }

    // ─── POST /api/cart (Add item / Increment quantity atomically) ──────────────
    if (method === 'POST') {
      const { productId, quantity } = body;

      if (!productId || typeof productId !== 'string' || productId.trim().length === 0) {
        return respond(res, 400, { error: 'Invalid or missing productId' });
      }

      const trimmedProductId = productId.trim();

      if (!isValidIdentifier(trimmedProductId)) {
        return respond(res, 400, { error: 'Invalid productId format' });
      }

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
      const product = await withTimeout(
        prisma.product.findUnique({
          where: { id: trimmedProductId },
          select: { id: true },
        }),
        8000,
        'Verify product existence'
      );

      if (!product) {
        return respond(res, 404, { error: 'Product not found' });
      }

      const cart = await getOrCreateCart(user.id);

      // Check unique cart items limit
      if (cart.items && cart.items.length >= MAX_CART_UNIQUE_ITEMS) {
        const itemExists = cart.items.some((it: any) => it.productId === trimmedProductId);
        if (!itemExists) {
          return respond(res, 400, {
            error: `Cart cannot contain more than ${MAX_CART_UNIQUE_ITEMS} unique items`,
          });
        }
      }

      // Atomic quantity increment within transaction with cap
      await withTimeout(
        prisma.$transaction(async (tx) => {
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
        }),
        8000,
        'Cart item addition transaction'
      );

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

      if (!isValidIdentifier(trimmedProductId)) {
        return respond(res, 400, { error: 'Invalid productId format' });
      }

      if (!isValidUpdateQuantity(quantity)) {
        return respond(res, 400, {
          error: `Invalid quantity: must be an integer between 0 and ${MAX_CART_ITEM_QUANTITY}`,
        });
      }

      const cart = await getOrCreateCart(user.id);

      if (quantity === 0) {
        // Quantity 0 removes the item
        await withTimeout(
          prisma.cartItem.deleteMany({
            where: {
              cartId: cart.id,
              productId: trimmedProductId,
            },
          }),
          8000,
          'Delete cart item on 0 quantity'
        );
      } else {
        // Verify product exists before setting quantity
        const product = await withTimeout(
          prisma.product.findUnique({
            where: { id: trimmedProductId },
            select: { id: true },
          }),
          8000,
          'Verify product existence'
        );

        if (!product) {
          return respond(res, 404, { error: 'Product not found' });
        }

        await withTimeout(
          prisma.cartItem.upsert({
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
          }),
          8000,
          'Upsert cart item quantity'
        );
      }

      const updatedCart = await getOrCreateCart(user.id);
      return respond(res, 200, formatCartResponse(updatedCart));
    }

    // ─── DELETE /api/cart (Remove item or clear all items) ──────────────────────
    if (method === 'DELETE') {
      const isClearAll = body?.clearAll === true || req.query?.all === 'true';
      const cart = await getOrCreateCart(user.id);

      if (isClearAll) {
        await withTimeout(
          prisma.cartItem.deleteMany({
            where: {
              cartId: cart.id,
            },
          }),
          8000,
          'Clear all cart items'
        );
      } else {
        const rawProductId =
          body?.productId ||
          (req.query && req.query.productId) ||
          (req.url ? new URL(req.url, 'http://localhost').searchParams.get('productId') : null);

        if (!rawProductId || typeof rawProductId !== 'string' || rawProductId.trim().length === 0) {
          return respond(res, 400, { error: 'Invalid or missing productId' });
        }

        const productId = rawProductId.trim();

        if (!isValidIdentifier(productId)) {
          return respond(res, 400, { error: 'Invalid productId format' });
        }

        await withTimeout(
          prisma.cartItem.deleteMany({
            where: {
              cartId: cart.id,
              productId,
            },
          }),
          8000,
          'Delete single cart item'
        );
      }

      const updatedCart = await getOrCreateCart(user.id);
      return respond(res, 200, formatCartResponse(updatedCart));
    }

    return respond(res, 405, { error: `Method ${method} Not Allowed` });
  } catch (error) {
    logServerError({
      endpoint: '/api/cart',
      method,
      operation: 'cart_handler',
      error,
    });
    return respond(res, 500, { error: getSafeErrorMessage(error, 'Internal Server Error') });
  }
}
