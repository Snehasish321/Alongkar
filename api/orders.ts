import prisma from '../src/lib/prisma.js';
import { getAuthenticatedUser, getRequestBody, respond, isPayloadTooLarge, isMalformedJson } from './_utils/auth.js';
import {
  isValidString,
  isValidPhoneNumber,
  isValidIdentifier,
  getSafeErrorMessage,
  logServerError,
  withTimeout,
  DEFAULT_DB_TIMEOUT_MS,
  getOrCreateRequestId,
  logSlowRequest,
  logSecurityEvent,
} from './_utils/security.js';
import { Prisma } from '@prisma/client';

export interface OrderValidationError {
  field: string;
  message: string;
}

/**
 * Generates a human-readable unique order number.
 * Format: ORD-YYYYMMDD-XXXXX (e.g. ORD-20261004-9AB2K)
 */
export function generateOrderNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `ORD-${datePart}-${randomPart}`;
}

/**
 * Formats a Prisma Order model with Decimal fields into clean JSON for clients.
 */
export function formatOrderResponse(order: any) {
  if (!order) return null;
  const toNum = (val: any) => {
    if (val === null || val === undefined) return 0;
    return typeof val.toNumber === 'function' ? val.toNumber() : Number(val);
  };
  const toNullableNum = (val: any) => {
    if (val === null || val === undefined) return null;
    return typeof val.toNumber === 'function' ? val.toNumber() : Number(val);
  };

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    status: order.status,
    paymentStatus: order.paymentStatus,
    shippingStatus: order.shippingStatus,
    subtotal: toNum(order.subtotal),
    discountTotal: toNum(order.discountTotal),
    shippingFee: toNum(order.shippingFee),
    taxTotal: toNum(order.taxTotal),
    grandTotal: toNum(order.grandTotal),
    currency: order.currency || 'INR',
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    shippingAddress: {
      line1: order.shippingAddressLine1,
      line2: order.shippingAddressLine2 || null,
      city: order.shippingCity,
      state: order.shippingState,
      pincode: order.shippingPincode,
      country: order.shippingCountry || 'India',
    },
    billingAddress: order.billingAddressLine1
      ? {
          line1: order.billingAddressLine1,
          line2: order.billingAddressLine2 || null,
          city: order.billingCity || '',
          state: order.billingState || '',
          pincode: order.billingPincode || '',
          country: order.billingCountry || 'India',
        }
      : null,
    idempotencyKey: order.idempotencyKey || null,
    paymentProvider: order.paymentProvider || null,
    paymentSessionId: order.paymentSessionId || null,
    paymentOrderId: order.paymentOrderId || null,
    paymentTransactionId: order.paymentTransactionId || null,
    paidAt: order.paidAt || null,
    paymentFailureReason: order.paymentFailureReason || null,
    shipmentProvider: order.shipmentProvider || null,
    shipmentOrderId: order.shipmentOrderId || null,
    shipmentTrackingNumber: order.shipmentTrackingNumber || null,
    shipmentAwbCode: order.shipmentAwbCode || null,
    shippedAt: order.shippedAt || null,
    deliveredAt: order.deliveredAt || null,
    cancelReason: order.cancelReason || null,
    cancelledAt: order.cancelledAt || null,
    customerNotes: order.customerNotes || null,
    adminNotes: order.adminNotes || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: (order.items || []).map((item: any) => ({
      id: item.id,
      orderId: item.orderId,
      productId: item.productId || null,
      productName: item.productName,
      productSlug: item.productSlug,
      productImage: item.productImage,
      productSku: item.productSku || null,
      unitPrice: toNum(item.unitPrice),
      originalPrice: toNullableNum(item.originalPrice),
      discountPercent: item.discountPercent || 0,
      quantity: item.quantity,
      lineTotal: toNum(item.lineTotal),
      createdAt: item.createdAt,
    })),
  };
}

/**
 * Validates order creation payload from the customer checkout.
 */
export function validateCreateOrderPayload(body: any): {
  errors: OrderValidationError[];
  data?: {
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    shippingAddress: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      pincode: string;
      country?: string;
    };
    billingAddress?: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      pincode: string;
      country?: string;
    };
    customerNotes?: string;
    idempotencyKey?: string;
    items?: { productId: string; quantity: number }[];
  };
} {
  const errors: OrderValidationError[] = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: [{ field: 'body', message: 'Request body must be a valid JSON object' }] };
  }

  // 1. Customer Name (required, 1 - 100 characters)
  if (!isValidString(body.customerName, 1, 100)) {
    errors.push({ field: 'customerName', message: 'Customer name is required (maximum 100 characters)' });
  }

  // 2. Customer Phone (required, valid Indian mobile format)
  if (typeof body.customerPhone !== 'string' || !isValidPhoneNumber(body.customerPhone)) {
    errors.push({ field: 'customerPhone', message: 'Valid 10-digit mobile phone number is required' });
  }

  // 3. Customer Email (optional or valid email string)
  let customerEmail: string | undefined = undefined;
  if (body.customerEmail !== undefined && body.customerEmail !== null && body.customerEmail !== '') {
    if (typeof body.customerEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customerEmail.trim())) {
      errors.push({ field: 'customerEmail', message: 'Customer email must be a valid email address' });
    } else {
      customerEmail = body.customerEmail.trim().slice(0, 200);
    }
  }

  // 4. Shipping Address (required)
  const ship = body.shippingAddress;
  if (!ship || typeof ship !== 'object' || Array.isArray(ship)) {
    errors.push({ field: 'shippingAddress', message: 'Shipping address object is required' });
  } else {
    if (!isValidString(ship.line1, 1, 200)) {
      errors.push({ field: 'shippingAddress.line1', message: 'Shipping address line 1 is required (max 200 characters)' });
    }
    if (ship.line2 !== undefined && ship.line2 !== null && typeof ship.line2 === 'string' && ship.line2.length > 200) {
      errors.push({ field: 'shippingAddress.line2', message: 'Shipping address line 2 must not exceed 200 characters' });
    }
    if (!isValidString(ship.city, 1, 100)) {
      errors.push({ field: 'shippingAddress.city', message: 'Shipping city is required (max 100 characters)' });
    }
    if (!isValidString(ship.state, 1, 100)) {
      errors.push({ field: 'shippingAddress.state', message: 'Shipping state is required (max 100 characters)' });
    }
    const pinStr = typeof ship.pincode === 'string' || typeof ship.pincode === 'number' ? String(ship.pincode).trim() : '';
    if (!/^\d{6}$/.test(pinStr)) {
      errors.push({ field: 'shippingAddress.pincode', message: 'Shipping pincode must be exactly 6 digits' });
    }
  }

  // 5. Billing Address (optional)
  const bill = body.billingAddress;
  let parsedBilling: any = undefined;
  if (bill && typeof bill === 'object' && !Array.isArray(bill)) {
    if (bill.line1 && !isValidString(bill.line1, 1, 200)) {
      errors.push({ field: 'billingAddress.line1', message: 'Billing address line 1 must not exceed 200 characters' });
    }
    if (bill.line2 && typeof bill.line2 === 'string' && bill.line2.length > 200) {
      errors.push({ field: 'billingAddress.line2', message: 'Billing address line 2 must not exceed 200 characters' });
    }
    if (bill.pincode && !/^\d{6}$/.test(String(bill.pincode).trim())) {
      errors.push({ field: 'billingAddress.pincode', message: 'Billing pincode must be exactly 6 digits' });
    }
    parsedBilling = {
      line1: typeof bill.line1 === 'string' ? bill.line1.trim().slice(0, 200) : '',
      line2: typeof bill.line2 === 'string' ? bill.line2.trim().slice(0, 200) : null,
      city: typeof bill.city === 'string' ? bill.city.trim().slice(0, 100) : '',
      state: typeof bill.state === 'string' ? bill.state.trim().slice(0, 100) : '',
      pincode: typeof bill.pincode === 'string' || typeof bill.pincode === 'number' ? String(bill.pincode).trim().slice(0, 10) : '',
      country: typeof bill.country === 'string' ? bill.country.trim().slice(0, 50) : 'India',
    };
  }

  // 6. Customer Notes (optional)
  let customerNotes: string | undefined = undefined;
  if (body.customerNotes !== undefined && body.customerNotes !== null && body.customerNotes !== '') {
    if (typeof body.customerNotes !== 'string' || body.customerNotes.length > 1000) {
      errors.push({ field: 'customerNotes', message: 'Customer notes must not exceed 1000 characters' });
    } else {
      customerNotes = body.customerNotes.trim();
    }
  }

  // 7. Idempotency Key (mandatory for checkout duplicate protection)
  let idempotencyKey: string | undefined = undefined;
  if (!body.idempotencyKey || typeof body.idempotencyKey !== 'string') {
    errors.push({
      field: 'idempotencyKey',
      message: 'Idempotency key is required for order creation and duplicate protection',
    });
  } else {
    const trimmedKey = body.idempotencyKey.trim();
    if (trimmedKey.length < 8 || trimmedKey.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(trimmedKey)) {
      errors.push({
        field: 'idempotencyKey',
        message: 'Idempotency key must be between 8 and 128 alphanumeric, hyphen, or underscore characters',
      });
    } else {
      idempotencyKey = trimmedKey;
    }
  }

  // 8. Explicit Items (optional override for direct checkout)
  let items: { productId: string; quantity: number }[] | undefined = undefined;
  if (body.items !== undefined && body.items !== null) {
    if (!Array.isArray(body.items) || body.items.length === 0) {
      errors.push({ field: 'items', message: 'Items must be a non-empty array when specified' });
    } else {
      items = [];
      for (let i = 0; i < body.items.length; i++) {
        const item = body.items[i];
        if (!item || typeof item !== 'object') {
          errors.push({ field: `items[${i}]`, message: 'Invalid item object' });
          continue;
        }
        if (!isValidIdentifier(item.productId)) {
          errors.push({ field: `items[${i}].productId`, message: 'Valid product ID is required' });
        }
        const qty = Number(item.quantity);
        if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
          errors.push({ field: `items[${i}].quantity`, message: 'Quantity must be an integer between 1 and 99' });
        }
        if (isValidIdentifier(item.productId) && Number.isInteger(qty) && qty >= 1 && qty <= 99) {
          items.push({ productId: String(item.productId).trim(), quantity: qty });
        }
      }
    }
  }

  if (errors.length > 0 || !idempotencyKey) {
    return { errors };
  }

  return {
    errors: [],
    data: {
      customerName: body.customerName.trim().slice(0, 100),
      customerPhone: body.customerPhone.trim(),
      customerEmail,
      shippingAddress: {
        line1: ship.line1.trim().slice(0, 200),
        line2: ship.line2 ? ship.line2.trim().slice(0, 200) : null,
        city: ship.city.trim().slice(0, 100),
        state: ship.state.trim().slice(0, 100),
        pincode: String(ship.pincode).trim().slice(0, 6),
        country: ship.country ? ship.country.trim().slice(0, 50) : 'India',
      },
      billingAddress: parsedBilling,
      customerNotes,
      idempotencyKey,
      items,
    },
  };
}

/**
 * Extracts order ID or orderNumber from query parameters or URL pathname.
 */
export function extractOrderLookup(req: any): { id?: string; orderNumber?: string } | null {
  if (req.query) {
    if (req.query.id && typeof req.query.id === 'string') {
      const clean = req.query.id.trim().slice(0, 100);
      if (isValidIdentifier(clean)) return { id: clean };
    }
    if (req.query.orderNumber && typeof req.query.orderNumber === 'string') {
      const clean = req.query.orderNumber.trim().slice(0, 100);
      return { orderNumber: clean };
    }
  }

  if (req.url) {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.searchParams.get('id')) {
        const clean = url.searchParams.get('id')!.trim().slice(0, 100);
        if (isValidIdentifier(clean)) return { id: clean };
      }
      if (url.searchParams.get('orderNumber')) {
        const clean = url.searchParams.get('orderNumber')!.trim().slice(0, 100);
        return { orderNumber: clean };
      }
      const segments = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
      const idx = segments.indexOf('orders');
      if (idx !== -1 && segments.length > idx + 1) {
        const seg = decodeURIComponent(segments[idx + 1]).trim().slice(0, 100);
        if (seg && seg !== 'index') {
          if (seg.startsWith('ORD-')) {
            return { orderNumber: seg };
          }
          if (isValidIdentifier(seg)) {
            return { id: seg };
          }
        }
      }
    } catch {}
  }

  return null;
}

export default async function handler(req: any, res?: any) {
  const method = (req.method || 'GET').toUpperCase();
  const requestId = getOrCreateRequestId(req);
  const startTime = Date.now();

  try {
    const bodyData = await getRequestBody(req);

    if (isPayloadTooLarge(bodyData)) {
      return respond(res, 413, { error: 'Payload too large (maximum 1MB allowed)' }, { 'X-Request-ID': requestId });
    }
    if (isMalformedJson(bodyData)) {
      return respond(res, 400, { error: 'Malformed JSON payload' }, { 'X-Request-ID': requestId });
    }

    // Authenticate user via Clerk
    const user = await getAuthenticatedUser(req, bodyData);
    if (!user) {
      return respond(res, 401, { error: 'Authentication required' }, { 'X-Request-ID': requestId });
    }

    // ─── POST /api/orders — Create Order ───────────────────────────────────────
    if (method === 'POST') {
      const { errors, data } = validateCreateOrderPayload(bodyData);
      if (errors.length > 0 || !data) {
        return respond(res, 400, { error: 'Validation failed', details: errors }, { 'X-Request-ID': requestId });
      }

      // Idempotency check: If an order with this idempotencyKey already exists for this user, return it
      if (data.idempotencyKey) {
        const existingOrder = await withTimeout(
          prisma.order.findUnique({
            where: { idempotencyKey: data.idempotencyKey },
            include: { items: true },
          }),
          DEFAULT_DB_TIMEOUT_MS,
          'Order.findUnique(idempotencyKey)'
        );

        if (existingOrder) {
          // Verify customer isolation
          if (existingOrder.userId !== user.id) {
            logSecurityEvent('ORDER_IDEMPOTENCY_CROSS_USER_ATTEMPT', {
              userId: user.id,
              existingOrderUserId: existingOrder.userId,
              idempotencyKey: data.idempotencyKey,
            });
            return respond(res, 409, { error: 'Idempotency key collision' }, { 'X-Request-ID': requestId });
          }
          return respond(res, 200, { order: formatOrderResponse(existingOrder), idempotentReplay: true }, { 'X-Request-ID': requestId });
        }
      }

      // Determine items: either from request body or from the user's cart in PostgreSQL
      let cartItemsToOrder: { productId: string; quantity: number }[] = [];
      let userCart: any = null;

      if (data.items && data.items.length > 0) {
        cartItemsToOrder = data.items;
      } else {
        userCart = await withTimeout(
          prisma.cart.findUnique({
            where: { userId: user.id },
            include: { items: true },
          }),
          DEFAULT_DB_TIMEOUT_MS,
          'Cart.findUnique(userId)'
        );

        if (!userCart || !userCart.items || userCart.items.length === 0) {
          return respond(res, 400, { error: 'Cart is empty. Add items before checking out.' }, { 'X-Request-ID': requestId });
        }

        cartItemsToOrder = userCart.items.map((ci: any) => ({
          productId: ci.productId,
          quantity: ci.quantity,
        }));
      }

      // Fetch authoritative product records from DB
      const productIds = cartItemsToOrder.map((item) => item.productId);
      const dbProducts = await withTimeout(
        prisma.product.findMany({
          where: { id: { in: productIds } },
        }),
        DEFAULT_DB_TIMEOUT_MS,
        'Product.findMany(productIds)'
      );

      const productMap = new Map<string, any>();
      for (const p of dbProducts) {
        productMap.set(p.id, p);
      }

      // Validate all products exist and are in stock
      for (const item of cartItemsToOrder) {
        const prod = productMap.get(item.productId);
        if (!prod) {
          return respond(res, 400, { error: `Product with ID ${item.productId} no longer exists.` }, { 'X-Request-ID': requestId });
        }
        if (prod.inStock === false) {
          return respond(res, 400, { error: `Product "${prod.name}" is currently out of stock.` }, { 'X-Request-ID': requestId });
        }
      }

      // Server-side authoritative price calculation using Decimal
      let subtotalDec = new Prisma.Decimal(0);
      let discountTotalDec = new Prisma.Decimal(0);

      const orderItemsData = cartItemsToOrder.map((item) => {
        const prod = productMap.get(item.productId)!;
        const unitPriceDec = new Prisma.Decimal(prod.price.toFixed(2));
        const originalPriceDec = new Prisma.Decimal(prod.originalPrice.toFixed(2));
        const lineTotalDec = unitPriceDec.mul(item.quantity);

        subtotalDec = subtotalDec.add(lineTotalDec);

        if (originalPriceDec.gt(unitPriceDec)) {
          const discountDiff = originalPriceDec.sub(unitPriceDec).mul(item.quantity);
          discountTotalDec = discountTotalDec.add(discountDiff);
        }

        return {
          productId: prod.id,
          productName: prod.name,
          productSlug: prod.slug,
          productImage: prod.image,
          productSku: prod.id,
          unitPrice: unitPriceDec,
          originalPrice: originalPriceDec,
          discountPercent: prod.discountPercent || 0,
          quantity: item.quantity,
          lineTotal: lineTotalDec,
        };
      });

      const shippingFeeDec = new Prisma.Decimal(0); // Free shipping by default
      const taxTotalDec = new Prisma.Decimal(0);
      const grandTotalDec = subtotalDec.add(shippingFeeDec).add(taxTotalDec);

      const customerEmail = data.customerEmail || user.email || `${user.clerkUserId}@customer.alongkar.com`;
      const orderNumber = generateOrderNumber();

      // Execute atomic transaction: Create Order + OrderItems + Clear Cart (if cart checkout)
      const createdOrder = await withTimeout(
        prisma.$transaction(
          async (tx) => {
            const newOrder = await tx.order.create({
              data: {
                orderNumber,
                userId: user.id,
                status: 'PENDING_PAYMENT',
                paymentStatus: 'PENDING',
                shippingStatus: 'NOT_READY',
                subtotal: subtotalDec,
                discountTotal: discountTotalDec,
                shippingFee: shippingFeeDec,
                taxTotal: taxTotalDec,
                grandTotal: grandTotalDec,
                currency: 'INR',
                customerName: data.customerName,
                customerEmail,
                customerPhone: data.customerPhone,
                shippingAddressLine1: data.shippingAddress.line1,
                shippingAddressLine2: data.shippingAddress.line2 || null,
                shippingCity: data.shippingAddress.city,
                shippingState: data.shippingAddress.state,
                shippingPincode: data.shippingAddress.pincode,
                shippingCountry: data.shippingAddress.country || 'India',
                billingAddressLine1: data.billingAddress?.line1 || null,
                billingAddressLine2: data.billingAddress?.line2 || null,
                billingCity: data.billingAddress?.city || null,
                billingState: data.billingAddress?.state || null,
                billingPincode: data.billingAddress?.pincode || null,
                billingCountry: data.billingAddress?.country || null,
                idempotencyKey: data.idempotencyKey || null,
                customerNotes: data.customerNotes || null,
                items: {
                  create: orderItemsData,
                },
              },
              include: {
                items: true,
              },
            });

            // If ordered from userCart, clear the cart items atomically
            if (userCart && userCart.id) {
              await tx.cartItem.deleteMany({
                where: { cartId: userCart.id },
              });
            }

            return newOrder;
          },
          {
            maxWait: 5000,
            timeout: 15000,
          }
        ),
        15000,
        'Order.createTransaction'
      );

      const durationMs = Date.now() - startTime;
      if (durationMs > 1000) {
        logSlowRequest(req, durationMs, { endpoint: '/api/orders', orderNumber: createdOrder.orderNumber });
      }

      return respond(res, 201, { order: formatOrderResponse(createdOrder) }, { 'X-Request-ID': requestId });
    }

    // ─── GET /api/orders — List or Retrieve Single Order ───────────────────────
    if (method === 'GET') {
      const lookup = extractOrderLookup(req);

      // Single Order Retrieval by ID or OrderNumber
      if (lookup) {
        const whereClause: any = { userId: user.id };
        if (lookup.id) whereClause.id = lookup.id;
        if (lookup.orderNumber) whereClause.orderNumber = lookup.orderNumber;

        const order = await withTimeout(
          prisma.order.findFirst({
            where: whereClause,
            include: { items: true },
          }),
          DEFAULT_DB_TIMEOUT_MS,
          'Order.findFirst(single)'
        );

        if (!order) {
          // Strictly return 404 to prevent enumeration of order IDs
          return respond(res, 404, { error: 'Order not found' }, { 'X-Request-ID': requestId });
        }

        return respond(res, 200, { order: formatOrderResponse(order) }, { 'X-Request-ID': requestId });
      }

      // Customer Order History Listing
      const page = Math.max(1, parseInt(String(req.query?.page || 1), 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query?.limit || 10), 10) || 10));
      const skip = (page - 1) * limit;

      const [orders, total] = await withTimeout(
        Promise.all([
          prisma.order.findMany({
            where: { userId: user.id },
            include: { items: true },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
          prisma.order.count({
            where: { userId: user.id },
          }),
        ]),
        DEFAULT_DB_TIMEOUT_MS,
        'Order.findMany(customerHistory)'
      );

      const totalPages = Math.ceil(total / limit) || 1;

      return respond(
        res,
        200,
        {
          orders: orders.map(formatOrderResponse),
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
        },
        { 'X-Request-ID': requestId }
      );
    }

    // Method not allowed
    return respond(res, 405, { error: `Method ${method} Not Allowed` }, { 'X-Request-ID': requestId });
  } catch (error: any) {
    logServerError('Order API Error', error, { requestId, method });
    return respond(res, 500, { error: getSafeErrorMessage(error) }, { 'X-Request-ID': requestId });
  }
}
