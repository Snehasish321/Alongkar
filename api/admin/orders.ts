import prisma from '../../src/lib/prisma.js';
import { requireAdmin, getRequestBody, respond, isPayloadTooLarge, isMalformedJson } from '../_utils/auth.js';
import {
  isValidIdentifier,
  getSafeErrorMessage,
  logServerError,
  withTimeout,
  DEFAULT_DB_TIMEOUT_MS,
  getOrCreateRequestId,
  logSlowRequest,
  logSecurityEvent,
} from '../_utils/security.js';
import { checkOrderFulfillmentEligibility, getOrderFulfillmentEligibility } from '../_utils/fulfillment.js';
import { createShiprocketOrder } from '../_utils/shiprocket.js';
import { cancelAdminOrderWorkflow, retryAdminOrderRefundWorkflow } from '../_utils/orderCancellation.js';

export const ALL_ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;

export const ALL_PAYMENT_STATUSES = [
  'PENDING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;

export const ALL_SHIPPING_STATUSES = [
  'NOT_READY',
  'READY',
  'PROCESSING',
  'SHIPPED',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
] as const;

/**
 * Valid allowed state transitions for OrderStatus.
 * Terminal states (DELIVERED, CANCELLED) cannot be transitioned forward/backward.
 * Shipped orders cannot be transitioned back to cancelled.
 */
export const ALLOWED_ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

/**
 * Valid allowed state transitions for PaymentStatus.
 * PAID cannot move back to PENDING/FAILED.
 * REFUNDED is terminal and cannot move back to PAID.
 */
export const ALLOWED_PAYMENT_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['PAID', 'FAILED', 'CANCELLED'],
  PAID: ['REFUNDED', 'PARTIALLY_REFUNDED'],
  FAILED: ['PENDING', 'CANCELLED'],
  CANCELLED: [],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ['REFUNDED'],
};

/**
 * Valid allowed state transitions for ShippingStatus.
 * Requires payment before moving into fulfillment states.
 */
export const ALLOWED_SHIPPING_STATUS_TRANSITIONS: Record<string, string[]> = {
  NOT_READY: ['READY', 'PROCESSING', 'CANCELLED'],
  READY: ['PROCESSING', 'SHIPPED', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['IN_TRANSIT', 'DELIVERED', 'RETURNED', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'RETURNED', 'CANCELLED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

export function formatAdminOrder(order: any) {
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
    customerClerkId: order.user?.clerkUserId || null,
    customerRegisteredEmail: order.user?.email || null,
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
    fulfillmentEligibility: checkOrderFulfillmentEligibility(order),
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

export function extractAdminOrderLookup(req: any, body?: any): { id?: string; orderNumber?: string } | null {
  if (body && typeof body === 'object') {
    const idVal = body.id || body.orderId;
    if (idVal && typeof idVal === 'string' && isValidIdentifier(idVal.trim())) {
      return { id: idVal.trim() };
    }
    if (body.orderNumber && typeof body.orderNumber === 'string') {
      return { orderNumber: body.orderNumber.trim() };
    }
  }

  if (req.query) {
    if (req.query.id && typeof req.query.id === 'string' && isValidIdentifier(req.query.id.trim())) {
      return { id: req.query.id.trim() };
    }
    if (req.query.orderNumber && typeof req.query.orderNumber === 'string') {
      return { orderNumber: req.query.orderNumber.trim() };
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
          if (seg.startsWith('ORD-')) return { orderNumber: seg };
          if (isValidIdentifier(seg)) return { id: seg };
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

    // Admin authorization check
    const authResult = await requireAdmin(req, bodyData);
    if (!authResult.authorized) {
      logSecurityEvent('ADMIN_ORDER_ACCESS_DENIED', {
        status: authResult.status,
        clerkUserId: authResult.clerkUserId,
        method,
      });
      return respond(res, authResult.status, { error: authResult.error }, { 'X-Request-ID': requestId });
    }

    // ─── GET /api/admin/orders ─────────────────────────────────────────────────
    if (method === 'GET') {
      const lookup = extractAdminOrderLookup(req);

      if (lookup) {
        const whereClause: any = {};
        if (lookup.id) whereClause.id = lookup.id;
        if (lookup.orderNumber) whereClause.orderNumber = lookup.orderNumber;

        const order = await withTimeout(
          prisma.order.findFirst({
            where: whereClause,
            include: {
              items: true,
              user: true,
            },
          }),
          DEFAULT_DB_TIMEOUT_MS,
          'AdminOrder.findFirst'
        );

        if (!order) {
          return respond(res, 404, { error: 'Order not found' }, { 'X-Request-ID': requestId });
        }

        return respond(res, 200, { order: formatAdminOrder(order) }, { 'X-Request-ID': requestId });
      }

      // Query filters
      const where: any = {};
      const status = req.query?.status;
      if (status && typeof status === 'string' && ALL_ORDER_STATUSES.includes(status as any)) {
        where.status = status;
      }

      const paymentStatus = req.query?.paymentStatus;
      if (paymentStatus && typeof paymentStatus === 'string' && ALL_PAYMENT_STATUSES.includes(paymentStatus as any)) {
        where.paymentStatus = paymentStatus;
      }

      const shippingStatus = req.query?.shippingStatus;
      if (shippingStatus && typeof shippingStatus === 'string' && ALL_SHIPPING_STATUSES.includes(shippingStatus as any)) {
        where.shippingStatus = shippingStatus;
      }

      const paymentMethod = req.query?.paymentMethod || req.query?.paymentProvider;
      if (paymentMethod && typeof paymentMethod === 'string') {
        const cleanMethod = paymentMethod.trim().toUpperCase();
        if (cleanMethod === 'RAZORPAY' || cleanMethod === 'COD') {
          where.paymentProvider = cleanMethod;
        }
      }

      const search = req.query?.search;
      if (search && typeof search === 'string' && search.trim().length > 0) {
        const cleanSearch = search.trim().slice(0, 100);
        where.OR = [
          { id: { contains: cleanSearch, mode: 'insensitive' } },
          { orderNumber: { contains: cleanSearch, mode: 'insensitive' } },
          { customerName: { contains: cleanSearch, mode: 'insensitive' } },
          { customerEmail: { contains: cleanSearch, mode: 'insensitive' } },
          { customerPhone: { contains: cleanSearch, mode: 'insensitive' } },
        ];
      }

      const page = Math.max(1, parseInt(String(req.query?.page || 1), 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query?.limit || 20), 10) || 20));
      const skip = (page - 1) * limit;

      const [orders, total, statusGroups, totalAll] = await withTimeout(
        Promise.all([
          prisma.order.findMany({
            where,
            include: {
              items: true,
              user: true,
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip,
            take: limit,
          }),
          prisma.order.count({ where }),
          prisma.order.groupBy({
            by: ['status'],
            _count: { _all: true },
          }),
          prisma.order.count(),
        ]),
        DEFAULT_DB_TIMEOUT_MS,
        'AdminOrder.findMany'
      );

      const countsByStatus: Record<string, number> = {};
      for (const group of statusGroups) {
        countsByStatus[group.status] = group._count._all;
      }

      const stats = {
        total: totalAll,
        pendingPayment: countsByStatus['PENDING_PAYMENT'] || 0,
        confirmed: countsByStatus['CONFIRMED'] || 0,
        processing: countsByStatus['PROCESSING'] || 0,
        shipped: countsByStatus['SHIPPED'] || 0,
        delivered: countsByStatus['DELIVERED'] || 0,
        cancelled: countsByStatus['CANCELLED'] || 0,
      };

      const totalPages = Math.ceil(total / limit) || 1;

      const durationMs = Date.now() - startTime;
      if (durationMs > 1000) {
        logSlowRequest(req, durationMs, { endpoint: '/api/admin/orders', total });
      }

      return respond(
        res,
        200,
        {
          orders: orders.map(formatAdminOrder),
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
          stats,
        },
        { 'X-Request-ID': requestId }
      );
    }

    // ─── PATCH /api/admin/orders — Update Order State & Notes ───────────────────
    if (method === 'PATCH') {
      const lookup = extractAdminOrderLookup(req, bodyData);
      if (!lookup) {
        return respond(res, 400, { error: 'Order ID or orderNumber is required for updating' }, { 'X-Request-ID': requestId });
      }

      const whereClause: any = {};
      if (lookup.id) whereClause.id = lookup.id;
      if (lookup.orderNumber) whereClause.orderNumber = lookup.orderNumber;

      const existingOrder = await withTimeout(
        prisma.order.findFirst({
          where: whereClause,
          include: { items: true, user: true },
        }),
        DEFAULT_DB_TIMEOUT_MS,
        'AdminOrder.findFirstForPatch'
      );

      if (!existingOrder) {
        return respond(res, 404, { error: 'Order not found' }, { 'X-Request-ID': requestId });
      }

      const updateData: any = {};
      const currentOrderStatus = existingOrder.status;
      const currentPaymentStatus = existingOrder.paymentStatus;
      const currentShippingStatus = existingOrder.shippingStatus;

      const targetPaymentStatus = bodyData.paymentStatus !== undefined ? bodyData.paymentStatus : currentPaymentStatus;

      // 1. Validate Order Status transition
      if (bodyData.status !== undefined && bodyData.status !== currentOrderStatus) {
        if (!ALL_ORDER_STATUSES.includes(bodyData.status)) {
          return respond(res, 400, { error: `Invalid order status. Allowed: ${ALL_ORDER_STATUSES.join(', ')}` }, { 'X-Request-ID': requestId });
        }

        // If transitioning to CANCELLED, execute atomic cancellation & inventory restoration workflow
        if (bodyData.status === 'CANCELLED') {
          const cancelResult = await cancelAdminOrderWorkflow({
            orderIdOrNumber: existingOrder.id,
            cancelReason: bodyData.cancelReason || (typeof bodyData.adminNotes === 'string' ? bodyData.adminNotes : undefined),
            adminClerkUserId: authResult.clerkUserId,
          });

          if (!cancelResult.success) {
            return respond(
              res,
              cancelResult.status,
              {
                error: cancelResult.message || cancelResult.error,
                code: cancelResult.error,
              },
              { 'X-Request-ID': requestId }
            );
          }

          return respond(
            res,
            cancelResult.status,
            {
              order: formatAdminOrder(cancelResult.order),
              inventoryRestored: cancelResult.inventoryRestored,
              restoredItems: cancelResult.restoredItems,
              refundStatus: cancelResult.refundStatus,
              message: cancelResult.message,
            },
            { 'X-Request-ID': requestId }
          );
        }

        const allowedOrderTransitions = ALLOWED_ORDER_STATUS_TRANSITIONS[currentOrderStatus] || [];
        if (!allowedOrderTransitions.includes(bodyData.status)) {
          return respond(
            res,
            400,
            {
              error: `Invalid order status transition from "${currentOrderStatus}" to "${bodyData.status}". Allowed transitions: ${allowedOrderTransitions.length > 0 ? allowedOrderTransitions.join(', ') : 'none (terminal state)'}`,
            },
            { 'X-Request-ID': requestId }
          );
        }
        updateData.status = bodyData.status;
      }

      // 2. Validate Payment Status transition
      if (bodyData.paymentStatus !== undefined && bodyData.paymentStatus !== currentPaymentStatus) {
        if (!ALL_PAYMENT_STATUSES.includes(bodyData.paymentStatus)) {
          return respond(res, 400, { error: `Invalid payment status. Allowed: ${ALL_PAYMENT_STATUSES.join(', ')}` }, { 'X-Request-ID': requestId });
        }

        // Direct mutation to CANCELLED or REFUNDED without workflow is strictly blocked
        if (bodyData.paymentStatus === 'CANCELLED') {
          return respond(
            res,
            400,
            {
              error: 'Directly setting paymentStatus to CANCELLED via PATCH is disallowed. Use the order cancellation workflow.',
              code: 'DIRECT_PAYMENT_CANCELLATION_DISALLOWED',
            },
            { 'X-Request-ID': requestId }
          );
        }

        if (bodyData.paymentStatus === 'REFUNDED' || bodyData.paymentStatus === 'PARTIALLY_REFUNDED') {
          return respond(
            res,
            400,
            {
              error: 'Directly setting paymentStatus to REFUNDED via PATCH is disallowed. Use the cancel_order or retry_refund workflow.',
              code: 'DIRECT_REFUND_DISALLOWED',
            },
            { 'X-Request-ID': requestId }
          );
        }

        const allowedPaymentTransitions = ALLOWED_PAYMENT_STATUS_TRANSITIONS[currentPaymentStatus] || [];
        if (!allowedPaymentTransitions.includes(bodyData.paymentStatus)) {
          return respond(
            res,
            400,
            {
              error: `Invalid payment status transition from "${currentPaymentStatus}" to "${bodyData.paymentStatus}". Allowed transitions: ${allowedPaymentTransitions.length > 0 ? allowedPaymentTransitions.join(', ') : 'none (terminal state)'}`,
            },
            { 'X-Request-ID': requestId }
          );
        }
        updateData.paymentStatus = bodyData.paymentStatus;
        if (bodyData.paymentStatus === 'PAID' && !existingOrder.paidAt) {
          updateData.paidAt = new Date();
        }
      }

      // 3. Validate Shipping Status transition
      if (bodyData.shippingStatus !== undefined && bodyData.shippingStatus !== currentShippingStatus) {
        if (!ALL_SHIPPING_STATUSES.includes(bodyData.shippingStatus)) {
          return respond(res, 400, { error: `Invalid shipping status. Allowed: ${ALL_SHIPPING_STATUSES.join(', ')}` }, { 'X-Request-ID': requestId });
        }

        // Direct mutation to CANCELLED without workflow is strictly blocked
        if (bodyData.shippingStatus === 'CANCELLED') {
          return respond(
            res,
            400,
            {
              error: 'Directly setting shippingStatus to CANCELLED via PATCH is disallowed. Use the order cancellation workflow.',
              code: 'DIRECT_SHIPPING_CANCELLATION_DISALLOWED',
            },
            { 'X-Request-ID': requestId }
          );
        }

        const allowedShippingTransitions = ALLOWED_SHIPPING_STATUS_TRANSITIONS[currentShippingStatus] || [];
        if (!allowedShippingTransitions.includes(bodyData.shippingStatus)) {
          return respond(
            res,
            400,
            {
              error: `Invalid shipping status transition from "${currentShippingStatus}" to "${bodyData.shippingStatus}". Allowed transitions: ${allowedShippingTransitions.length > 0 ? allowedShippingTransitions.join(', ') : 'none (terminal state)'}`,
            },
            { 'X-Request-ID': requestId }
          );
        }

        // Cross-guard: Shipping fulfillment states require completed payment
        const fulfillmentStates = ['READY', 'PROCESSING', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'];
        if (fulfillmentStates.includes(bodyData.shippingStatus) && targetPaymentStatus !== 'PAID') {
          return respond(
            res,
            400,
            {
              error: `Cannot progress shipping status to "${bodyData.shippingStatus}" when payment status is "${targetPaymentStatus}". Payment must be PAID prior to fulfillment.`,
            },
            { 'X-Request-ID': requestId }
          );
        }

        updateData.shippingStatus = bodyData.shippingStatus;
        if (bodyData.shippingStatus === 'SHIPPED' && !existingOrder.shippedAt) {
          updateData.shippedAt = new Date();
        }
        if (bodyData.shippingStatus === 'DELIVERED' && !existingOrder.deliveredAt) {
          updateData.deliveredAt = new Date();
        }
      }

      // 4. Cross-guard: Order status cannot be advanced if payment is cancelled or refunded
      if (bodyData.status !== undefined && ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(bodyData.status)) {
        if (['CANCELLED', 'REFUNDED'].includes(targetPaymentStatus)) {
          return respond(
            res,
            400,
            {
              error: `Cannot progress order status to "${bodyData.status}" when payment status is "${targetPaymentStatus}".`,
            },
            { 'X-Request-ID': requestId }
          );
        }
      }

      // 5. Notes & reasons
      if (bodyData.adminNotes !== undefined) {
        updateData.adminNotes = typeof bodyData.adminNotes === 'string' ? bodyData.adminNotes.slice(0, 2000) : null;
      }
      if (bodyData.cancelReason !== undefined) {
        updateData.cancelReason = typeof bodyData.cancelReason === 'string' ? bodyData.cancelReason.slice(0, 1000) : null;
      }

      // 6. Tracking / Shipment info
      if (bodyData.shipmentTrackingNumber !== undefined) {
        updateData.shipmentTrackingNumber = typeof bodyData.shipmentTrackingNumber === 'string' ? bodyData.shipmentTrackingNumber.trim().slice(0, 100) : null;
      }
      if (bodyData.shipmentAwbCode !== undefined) {
        updateData.shipmentAwbCode = typeof bodyData.shipmentAwbCode === 'string' ? bodyData.shipmentAwbCode.trim().slice(0, 100) : null;
      }
      if (bodyData.shipmentProvider !== undefined) {
        updateData.shipmentProvider = typeof bodyData.shipmentProvider === 'string' ? bodyData.shipmentProvider.trim().slice(0, 50) : null;
      }

      // 7. Payment provider references (for manual reconciliation if needed)
      if (bodyData.paymentProvider !== undefined) {
        updateData.paymentProvider = typeof bodyData.paymentProvider === 'string' ? bodyData.paymentProvider.trim().slice(0, 50) : null;
      }
      if (bodyData.paymentOrderId !== undefined) {
        updateData.paymentOrderId = typeof bodyData.paymentOrderId === 'string' ? bodyData.paymentOrderId.trim().slice(0, 100) : null;
      }
      if (bodyData.paymentTransactionId !== undefined) {
        updateData.paymentTransactionId = typeof bodyData.paymentTransactionId === 'string' ? bodyData.paymentTransactionId.trim().slice(0, 100) : null;
      }

      const updatedOrder = await withTimeout(
        prisma.order.update({
          where: { id: existingOrder.id },
          data: updateData,
          include: { items: true, user: true },
        }),
        DEFAULT_DB_TIMEOUT_MS,
        'AdminOrder.update'
      );

      return respond(res, 200, { order: formatAdminOrder(updatedOrder) }, { 'X-Request-ID': requestId });
    }

    // ─── POST /api/admin/orders — Admin Actions (e.g. Check Fulfillment Eligibility) ──
    if (method === 'POST') {
      const action = bodyData?.action;
      if (action === 'check_fulfillment_eligibility' || action === 'prepare_fulfillment') {
        const lookup = extractAdminOrderLookup(req, bodyData);
        const orderIdOrNumber = lookup?.id || lookup?.orderNumber || bodyData?.orderId || bodyData?.orderNumber;
        if (!orderIdOrNumber) {
          return respond(
            res,
            400,
            { error: 'Order ID or orderNumber is required to check fulfillment eligibility.' },
            { 'X-Request-ID': requestId }
          );
        }

        const fulfillmentResult = await getOrderFulfillmentEligibility(orderIdOrNumber, {
          isAdmin: true,
          clerkUserId: authResult.clerkUserId,
        });

        return respond(
          res,
          fulfillmentResult.status,
          fulfillmentResult,
          { 'X-Request-ID': requestId }
        );
      }

      if (action === 'create_shiprocket_order' || action === 'shiprocket_order_create') {
        const lookup = extractAdminOrderLookup(req, bodyData);
        const orderIdOrNumber = lookup?.id || lookup?.orderNumber || bodyData?.orderId || bodyData?.orderNumber;
        if (!orderIdOrNumber) {
          return respond(
            res,
            400,
            { error: 'Order ID or orderNumber is required to create Shiprocket order.' },
            { 'X-Request-ID': requestId }
          );
        }

        const shiprocketResult = await createShiprocketOrder(orderIdOrNumber, {
          isAdmin: true,
          clerkUserId: authResult.clerkUserId,
        });

        return respond(
          res,
          shiprocketResult.status,
          shiprocketResult,
          { 'X-Request-ID': requestId }
        );
      }

      if (action === 'cancel_order' || action === 'admin_order_cancel') {
        const lookup = extractAdminOrderLookup(req, bodyData);
        const orderIdOrNumber = lookup?.id || lookup?.orderNumber || bodyData?.orderId || bodyData?.orderNumber;
        if (!orderIdOrNumber) {
          return respond(
            res,
            400,
            { error: 'Order ID or orderNumber is required to cancel an order.' },
            { 'X-Request-ID': requestId }
          );
        }

        const cancelResult = await cancelAdminOrderWorkflow({
          orderIdOrNumber,
          cancelReason: bodyData?.cancelReason,
          adminClerkUserId: authResult.clerkUserId,
        });

        if (!cancelResult.success) {
          return respond(
            res,
            cancelResult.status,
            {
              error: cancelResult.message || cancelResult.error,
              code: cancelResult.error,
            },
            { 'X-Request-ID': requestId }
          );
        }

        return respond(
          res,
          cancelResult.status,
          {
            success: true,
            order: formatAdminOrder(cancelResult.order),
            inventoryRestored: cancelResult.inventoryRestored,
            restoredItems: cancelResult.restoredItems,
            refundStatus: cancelResult.refundStatus,
            refundId: cancelResult.refundId,
            message: cancelResult.message,
          },
          { 'X-Request-ID': requestId }
        );
      }

      if (action === 'retry_refund' || action === 'process_refund' || action === 'admin_order_refund') {
        const lookup = extractAdminOrderLookup(req, bodyData);
        const orderIdOrNumber = lookup?.id || lookup?.orderNumber || bodyData?.orderId || bodyData?.orderNumber;
        if (!orderIdOrNumber) {
          return respond(
            res,
            400,
            { error: 'Order ID or orderNumber is required to process refund.' },
            { 'X-Request-ID': requestId }
          );
        }

        const refundResult = await retryAdminOrderRefundWorkflow({
          orderIdOrNumber,
          adminClerkUserId: authResult.clerkUserId,
        });

        if (!refundResult.success) {
          return respond(
            res,
            refundResult.status,
            {
              error: refundResult.message || refundResult.error,
              code: refundResult.error,
              order: refundResult.order ? formatAdminOrder(refundResult.order) : undefined,
            },
            { 'X-Request-ID': requestId }
          );
        }

        return respond(
          res,
          refundResult.status,
          {
            success: true,
            order: formatAdminOrder(refundResult.order),
            refundStatus: refundResult.refundStatus,
            refundId: refundResult.refundId,
            message: refundResult.message,
          },
          { 'X-Request-ID': requestId }
        );
      }

      return respond(res, 400, { error: `Unrecognized admin action "${action}".` }, { 'X-Request-ID': requestId });
    }

    return respond(res, 405, { error: `Method ${method} Not Allowed` }, { 'X-Request-ID': requestId });
  } catch (error: any) {
    logServerError('Admin Order API Error', error, { requestId, method });
    return respond(res, 500, { error: getSafeErrorMessage(error) }, { 'X-Request-ID': requestId });
  }
}
