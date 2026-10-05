import prisma from '../../../src/lib/prisma.js';
import { getAuthenticatedUser, getRequestBody, respond, isPayloadTooLarge, isMalformedJson } from '../../_utils/auth.js';
import {
  isValidIdentifier,
  getSafeErrorMessage,
  logServerError,
  withTimeout,
  DEFAULT_DB_TIMEOUT_MS,
  getOrCreateRequestId,
  logSlowRequest,
  logSecurityEvent,
} from '../../_utils/security.js';
import {
  getRazorpayClient,
  getRazorpayPublicClientKey,
  rupeesToPaise,
} from '../../_utils/razorpay.js';

export default async function handler(req: any, res: any) {
  const startTime = Date.now();
  const requestId = getOrCreateRequestId(req);

  try {
    // 1. Method check: Only POST allowed
    if (req.method !== 'POST') {
      return respond(
        res,
        405,
        { error: 'Method Not Allowed. Only POST is supported for payment order creation.' },
        { 'X-Request-ID': requestId, Allow: 'POST' }
      );
    }

    // 2. Parse & validate request body
    const bodyData = await getRequestBody(req);

    if (isPayloadTooLarge(bodyData)) {
      logSecurityEvent('payload_too_large', { endpoint: '/api/payments/razorpay/order', requestId });
      return respond(res, 413, { error: 'Payload Too Large: Maximum body size is 1MB.' }, { 'X-Request-ID': requestId });
    }

    if (isMalformedJson(bodyData)) {
      logSecurityEvent('malformed_json', { endpoint: '/api/payments/razorpay/order', requestId });
      return respond(res, 400, { error: 'Bad Request: Malformed JSON payload.' }, { 'X-Request-ID': requestId });
    }

    // 3. User Authentication
    const user = await getAuthenticatedUser(req, bodyData);
    if (!user) {
      logSecurityEvent('unauthorized_payment_order_access', {
        endpoint: '/api/payments/razorpay/order',
        requestId,
      });
      return respond(
        res,
        401,
        { error: 'Unauthorized: Valid authenticated session required.' },
        { 'X-Request-ID': requestId }
      );
    }

    // 4. Request validation: orderId required
    const orderId = bodyData?.orderId;
    if (!orderId || !isValidIdentifier(orderId)) {
      return respond(
        res,
        400,
        { error: 'Bad Request: A valid orderId string is required.' },
        { 'X-Request-ID': requestId }
      );
    }

    // 5. Fetch Alongkar Order with strict Customer Isolation
    const order = await withTimeout(
      prisma.order.findUnique({
        where: { id: orderId },
      }),
      DEFAULT_DB_TIMEOUT_MS,
      'fetch_order_for_payment'
    );

    // If order does not exist or belongs to another user -> 404 (prevent information disclosure)
    if (!order || order.userId !== user.id) {
      return respond(
        res,
        404,
        { error: 'Order not found.' },
        { 'X-Request-ID': requestId }
      );
    }

    // 6. Payment Eligibility Checks
    // Check payment status
    if (order.paymentStatus === 'PAID') {
      return respond(
        res,
        400,
        { error: 'Order is not eligible for payment: This order has already been paid.' },
        { 'X-Request-ID': requestId }
      );
    }

    if (order.paymentStatus === 'REFUNDED' || order.paymentStatus === 'PARTIALLY_REFUNDED') {
      return respond(
        res,
        400,
        { error: 'Order is not eligible for payment: This order has been refunded.' },
        { 'X-Request-ID': requestId }
      );
    }

    if (order.paymentStatus === 'CANCELLED' || order.status === 'CANCELLED') {
      return respond(
        res,
        400,
        { error: 'Order is not eligible for payment: This order has been cancelled.' },
        { 'X-Request-ID': requestId }
      );
    }

    if (order.status !== 'PENDING_PAYMENT') {
      return respond(
        res,
        400,
        { error: `Order is not eligible for payment: Order status is ${order.status}. Only PENDING_PAYMENT orders can be paid.` },
        { 'X-Request-ID': requestId }
      );
    }

    if (order.paymentStatus !== 'PENDING') {
      return respond(
        res,
        400,
        { error: `Order is not eligible for payment: Payment status is ${order.paymentStatus}.` },
        { 'X-Request-ID': requestId }
      );
    }

    // 7. Amount conversion: Grand Total from Database is the single source of truth
    let amountInPaise: number;
    try {
      amountInPaise = rupeesToPaise(order.grandTotal);
    } catch (amountErr: any) {
      logServerError(amountErr, {
        endpoint: '/api/payments/razorpay/order',
        operation: 'convert_grand_total_to_paise',
        userId: user.id,
        requestId,
      });
      return respond(
        res,
        400,
        { error: `Invalid order payable amount: ${amountErr.message}` },
        { 'X-Request-ID': requestId }
      );
    }

    if (amountInPaise <= 0) {
      return respond(
        res,
        400,
        { error: 'Invalid order payable amount: Grand total must be greater than zero.' },
        { 'X-Request-ID': requestId }
      );
    }

    const publicRazorpayKeyId = getRazorpayPublicClientKey();

    // 8. Deterministic Duplicate & Retry Protection
    // If order already has an active Razorpay paymentOrderId and is still in PENDING_PAYMENT, reuse it
    if (order.paymentProvider === 'RAZORPAY' && order.paymentOrderId && order.paymentOrderId.startsWith('order_')) {
      const durationMs = Date.now() - startTime;
      logSlowRequest(durationMs, {
        endpoint: '/api/payments/razorpay/order',
        method: 'POST',
        operation: 'reuse_existing_razorpay_order',
        requestId,
      });

      return respond(
        res,
        200,
        {
          success: true,
          razorpayKeyId: publicRazorpayKeyId,
          razorpayOrderId: order.paymentOrderId,
          alongkarOrderId: order.id,
          orderNumber: order.orderNumber,
          amount: amountInPaise,
          currency: 'INR',
        },
        { 'X-Request-ID': requestId }
      );
    }

    // 9. Initialize Razorpay Server Client & Create Razorpay Order
    const razorpay = getRazorpayClient();

    const razorpayOrderOptions = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: order.orderNumber,
      notes: {
        alongkarOrderId: order.id,
        orderNumber: order.orderNumber,
        customerEmail: order.customerEmail,
      },
    };

    let razorpayOrder: any;
    try {
      razorpayOrder = await withTimeout(
        razorpay.orders.create(razorpayOrderOptions),
        DEFAULT_DB_TIMEOUT_MS,
        'razorpay_orders_create'
      );
    } catch (rzpErr: any) {
      logServerError(rzpErr, {
        endpoint: '/api/payments/razorpay/order',
        operation: 'razorpay_orders_create',
        userId: user.id,
        requestId,
      });

      return respond(
        res,
        502,
        { error: getSafeErrorMessage(rzpErr, 'Failed to create payment order with payment gateway. Please try again.') },
        { 'X-Request-ID': requestId }
      );
    }

    if (!razorpayOrder || !razorpayOrder.id) {
      logServerError(new Error('Razorpay returned empty order response'), {
        endpoint: '/api/payments/razorpay/order',
        operation: 'razorpay_orders_create_empty',
        userId: user.id,
        requestId,
      });

      return respond(
        res,
        502,
        { error: 'Payment gateway returned an invalid order response.' },
        { 'X-Request-ID': requestId }
      );
    }

    // 10. Atomic Conditional Update (CAS) to prevent concurrent overwrites
    // Only update if paymentOrderId is still null. If another concurrent request won the race,
    // updateResult.count will be 0 and we will re-read and return the winning paymentOrderId.
    let effectiveRazorpayOrderId = razorpayOrder.id;

    const updateResult = await withTimeout(
      prisma.order.updateMany({
        where: {
          id: order.id,
          paymentOrderId: null,
        },
        data: {
          paymentProvider: 'RAZORPAY',
          paymentOrderId: razorpayOrder.id,
        },
      }),
      DEFAULT_DB_TIMEOUT_MS,
      'update_order_with_razorpay_id_cas'
    );

    if (updateResult.count === 0) {
      // Another concurrent request committed first. Fetch the winning paymentOrderId.
      const winningOrder = await withTimeout(
        prisma.order.findUnique({
          where: { id: order.id },
          select: { paymentOrderId: true },
        }),
        DEFAULT_DB_TIMEOUT_MS,
        'fetch_winning_payment_order_id'
      );

      if (winningOrder?.paymentOrderId && winningOrder.paymentOrderId.startsWith('order_')) {
        effectiveRazorpayOrderId = winningOrder.paymentOrderId;
      }
    }

    const durationMs = Date.now() - startTime;
    logSlowRequest(durationMs, {
      endpoint: '/api/payments/razorpay/order',
      method: 'POST',
      operation: 'create_razorpay_payment_order',
      requestId,
    });

    // 11. Return Success Response (Public Key only, never Secret Key)
    return respond(
      res,
      updateResult.count > 0 ? 201 : 200,
      {
        success: true,
        razorpayKeyId: publicRazorpayKeyId,
        razorpayOrderId: effectiveRazorpayOrderId,
        alongkarOrderId: order.id,
        orderNumber: order.orderNumber,
        amount: amountInPaise,
        currency: 'INR',
      },
      { 'X-Request-ID': requestId }
    );
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    logServerError(error, {
      endpoint: '/api/payments/razorpay/order',
      method: 'POST',
      operation: 'razorpay_payment_order_unhandled',
      durationMs,
      requestId,
    });

    return respond(
      res,
      500,
      { error: getSafeErrorMessage(error, 'An internal error occurred while initiating payment.') },
      { 'X-Request-ID': requestId }
    );
  }
}
