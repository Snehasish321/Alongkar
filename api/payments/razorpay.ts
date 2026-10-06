import crypto from 'crypto';
import prisma from '../../src/lib/prisma.js';
import {
  getAuthenticatedUser,
  getRequestBody,
  getRawAndParsedBody,
  respond,
  isPayloadTooLarge,
  isMalformedJson,
} from '../_utils/auth.js';
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
import {
  getRazorpayClient,
  getRazorpayPublicClientKey,
  validateRazorpayCheckoutSignature,
  validateRazorpayWebhookSignature,
  rupeesToPaise,
} from '../_utils/razorpay.js';
import { logEvent } from '../_utils/logger.js';

function isValidRazorpayPaymentId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  return trimmed.length >= 5 && trimmed.length <= 100 && /^[a-zA-Z0-9_]+$/.test(trimmed);
}

function isValidRazorpayOrderId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  return trimmed.length >= 5 && trimmed.length <= 100 && /^[a-zA-Z0-9_]+$/.test(trimmed);
}

function isValidRazorpaySignature(sig: unknown): sig is string {
  if (typeof sig !== 'string') return false;
  const trimmed = sig.trim();
  return trimmed.length >= 10 && trimmed.length <= 256 && /^[a-fA-F0-9]+$/.test(trimmed);
}

// ============================================================================
// 1. ORDER CREATION HANDLER (POST /api/payments/razorpay/order)
// ============================================================================
export async function handleCreatePaymentOrder(req: any, res: any, inRequestId?: string, inStartTime?: number) {
  const startTime = inStartTime || Date.now();
  const requestId = inRequestId || getOrCreateRequestId(req);
  try {
    if (req.method !== 'POST') {
      return respond(
        res,
        405,
        { error: 'Method Not Allowed. Only POST is supported for payment order creation.' },
        { 'X-Request-ID': requestId, Allow: 'POST' }
      );
    }

    const bodyData = await getRequestBody(req);

    if (isPayloadTooLarge(bodyData)) {
      logSecurityEvent('payload_too_large', { endpoint: '/api/payments/razorpay/order', requestId });
      return respond(res, 413, { error: 'Payload Too Large: Maximum body size is 1MB.' }, { 'X-Request-ID': requestId });
    }

    if (isMalformedJson(bodyData)) {
      logSecurityEvent('malformed_json', { endpoint: '/api/payments/razorpay/order', requestId });
      return respond(res, 400, { error: 'Bad Request: Malformed JSON payload.' }, { 'X-Request-ID': requestId });
    }

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

    const orderId = bodyData?.orderId;
    if (!orderId || !isValidIdentifier(orderId)) {
      return respond(
        res,
        400,
        { error: 'Bad Request: A valid orderId string is required.' },
        { 'X-Request-ID': requestId }
      );
    }

    const order = await withTimeout(
      prisma.order.findUnique({
        where: { id: orderId },
      }),
      DEFAULT_DB_TIMEOUT_MS,
      'fetch_order_for_payment'
    );

    if (!order || order.userId !== user.id) {
      return respond(
        res,
        404,
        { error: 'Order not found.' },
        { 'X-Request-ID': requestId }
      );
    }

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
      if (req._testRazorpayOrder) {
        razorpayOrder = req._testRazorpayOrder;
      } else {
        razorpayOrder = await withTimeout(
          razorpay.orders.create(razorpayOrderOptions),
          DEFAULT_DB_TIMEOUT_MS,
          'razorpay_orders_create'
        );
      }
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

// ============================================================================
// 2. CHECKOUT PAYMENT VERIFICATION HANDLER (POST /api/payments/razorpay/verify)
// ============================================================================
export async function handleVerifyPayment(req: any, res: any, inRequestId?: string, inStartTime?: number) {
  const startTime = inStartTime || Date.now();
  const requestId = inRequestId || getOrCreateRequestId(req);
  try {
    if (req.method !== 'POST') {
      return respond(
        res,
        405,
        { error: 'Method Not Allowed. Only POST is supported for payment verification.' },
        { 'X-Request-ID': requestId, Allow: 'POST' }
      );
    }

    const bodyData = await getRequestBody(req);

    if (isPayloadTooLarge(bodyData)) {
      logSecurityEvent('payload_too_large', { endpoint: '/api/payments/razorpay/verify', requestId });
      return respond(res, 413, { error: 'Payload Too Large: Maximum body size is 1MB.' }, { 'X-Request-ID': requestId });
    }

    if (isMalformedJson(bodyData)) {
      logSecurityEvent('malformed_json', { endpoint: '/api/payments/razorpay/verify', requestId });
      return respond(res, 400, { error: 'Bad Request: Malformed JSON payload.' }, { 'X-Request-ID': requestId });
    }

    const user = await getAuthenticatedUser(req, bodyData);
    if (!user) {
      logSecurityEvent('unauthorized_payment_verify_access', {
        endpoint: '/api/payments/razorpay/verify',
        requestId,
      });
      return respond(
        res,
        401,
        { error: 'Unauthorized: Valid authenticated session required.' },
        { 'X-Request-ID': requestId }
      );
    }

    const { orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = bodyData || {};

    if (!orderId || !isValidIdentifier(orderId)) {
      return respond(
        res,
        400,
        { error: 'Bad Request: A valid orderId string is required.' },
        { 'X-Request-ID': requestId }
      );
    }

    if (!isValidRazorpayPaymentId(razorpayPaymentId)) {
      return respond(
        res,
        400,
        { error: 'Bad Request: A valid razorpayPaymentId is required.' },
        { 'X-Request-ID': requestId }
      );
    }

    if (!isValidRazorpayOrderId(razorpayOrderId)) {
      return respond(
        res,
        400,
        { error: 'Bad Request: A valid razorpayOrderId is required.' },
        { 'X-Request-ID': requestId }
      );
    }

    if (!isValidRazorpaySignature(razorpaySignature)) {
      return respond(
        res,
        400,
        { error: 'Bad Request: A valid razorpaySignature is required.' },
        { 'X-Request-ID': requestId }
      );
    }

    const order = await withTimeout(
      prisma.order.findUnique({
        where: { id: orderId },
      }),
      DEFAULT_DB_TIMEOUT_MS,
      'fetch_order_for_verification'
    );

    if (!order || order.userId !== user.id) {
      return respond(
        res,
        404,
        { error: 'Order not found.' },
        { 'X-Request-ID': requestId }
      );
    }

    if (order.status === 'CANCELLED' || order.paymentStatus === 'CANCELLED') {
      return respond(
        res,
        400,
        { error: 'Order is not eligible for verification: This order has been cancelled.' },
        { 'X-Request-ID': requestId }
      );
    }

    if (order.paymentStatus === 'REFUNDED' || order.paymentStatus === 'PARTIALLY_REFUNDED') {
      return respond(
        res,
        400,
        { error: 'Order is not eligible for verification: This order has been refunded.' },
        { 'X-Request-ID': requestId }
      );
    }

    if (order.paymentProvider !== 'RAZORPAY') {
      return respond(
        res,
        400,
        { error: `Payment provider mismatch: Expected RAZORPAY but order is ${order.paymentProvider}.` },
        { 'X-Request-ID': requestId }
      );
    }

    if (!order.paymentOrderId || order.paymentOrderId !== razorpayOrderId) {
      logSecurityEvent('razorpay_order_id_mismatch', {
        endpoint: '/api/payments/razorpay/verify',
        orderId: order.id,
        expectedRazorpayOrderId: order.paymentOrderId,
        receivedRazorpayOrderId: razorpayOrderId,
        requestId,
      });
      return respond(
        res,
        400,
        { error: 'Payment order ID does not match the Alongkar order record.' },
        { 'X-Request-ID': requestId }
      );
    }

    if (order.paymentStatus === 'PAID' && order.status === 'CONFIRMED') {
      return respond(
        res,
        200,
        {
          success: true,
          alreadyPaid: true,
          message: 'Payment has already been verified and confirmed.',
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            paymentStatus: order.paymentStatus,
            shippingStatus: order.shippingStatus,
            paidAt: order.paidAt,
            grandTotal: order.grandTotal,
            currency: order.currency,
          },
        },
        { 'X-Request-ID': requestId }
      );
    }

    const isSignatureValid = validateRazorpayCheckoutSignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    );

    if (!isSignatureValid) {
      logSecurityEvent('razorpay_signature_verification_failed', {
        endpoint: '/api/payments/razorpay/verify',
        orderId: order.id,
        userId: user.id,
        razorpayOrderId,
        razorpayPaymentId,
        requestId,
      });

      return respond(
        res,
        400,
        { error: 'Payment signature verification failed. The payment could not be authenticated.' },
        { 'X-Request-ID': requestId }
      );
    }

    const razorpay = getRazorpayClient();
    let paymentDetails: any;
    try {
      if (req._testPayment) {
        paymentDetails = req._testPayment;
      } else {
        paymentDetails = await withTimeout(
          razorpay.payments.fetch(razorpayPaymentId),
          DEFAULT_DB_TIMEOUT_MS,
          'razorpay_payments_fetch'
        );
      }
    } catch (fetchErr: any) {
      logServerError(fetchErr, {
        endpoint: '/api/payments/razorpay/verify',
        operation: 'razorpay_payments_fetch',
        userId: user.id,
        orderId: order.id,
        requestId,
      });

      return respond(
        res,
        502,
        { error: getSafeErrorMessage(fetchErr, 'Failed to verify payment status with gateway.') },
        { 'X-Request-ID': requestId }
      );
    }

    if (!paymentDetails || paymentDetails.id !== razorpayPaymentId) {
      return respond(
        res,
        400,
        { error: 'Gateway payment verification failed: Invalid payment details received.' },
        { 'X-Request-ID': requestId }
      );
    }

    if (paymentDetails.order_id !== razorpayOrderId) {
      logSecurityEvent('razorpay_payment_order_mismatch', {
        endpoint: '/api/payments/razorpay/verify',
        orderId: order.id,
        paymentOrderId: paymentDetails.order_id,
        expectedOrderId: razorpayOrderId,
        requestId,
      });
      return respond(
        res,
        400,
        { error: 'Gateway verification failed: Payment does not belong to the associated Razorpay order.' },
        { 'X-Request-ID': requestId }
      );
    }

    let expectedAmountPaise: number;
    try {
      expectedAmountPaise = rupeesToPaise(order.grandTotal);
    } catch (err: any) {
      return respond(res, 500, { error: 'Failed to compute order payable amount.' }, { 'X-Request-ID': requestId });
    }

    if (Number(paymentDetails.amount) !== expectedAmountPaise) {
      logSecurityEvent('razorpay_payment_amount_mismatch', {
        endpoint: '/api/payments/razorpay/verify',
        orderId: order.id,
        gatewayAmount: paymentDetails.amount,
        expectedAmount: expectedAmountPaise,
        requestId,
      });
      return respond(
        res,
        400,
        { error: 'Gateway verification failed: Payment amount mismatch.' },
        { 'X-Request-ID': requestId }
      );
    }

    if (paymentDetails.currency !== order.currency) {
      logSecurityEvent('razorpay_payment_currency_mismatch', {
        endpoint: '/api/payments/razorpay/verify',
        orderId: order.id,
        gatewayCurrency: paymentDetails.currency,
        expectedCurrency: order.currency,
        requestId,
      });
      return respond(
        res,
        400,
        { error: 'Gateway verification failed: Payment currency mismatch.' },
        { 'X-Request-ID': requestId }
      );
    }

    if (paymentDetails.status !== 'captured') {
      logEvent('INFO', {
        endpoint: '/api/payments/razorpay/verify',
        operation: 'payment_not_captured',
        extra: {
          orderId: order.id,
          paymentStatus: paymentDetails.status,
          razorpayPaymentId,
        },
        message: `Payment ${razorpayPaymentId} is not captured yet (status: ${paymentDetails.status}). Order remains pending.`,
      });

      return respond(
        res,
        400,
        {
          error: `Payment is not in captured status (current gateway status: ${paymentDetails.status}). Please wait for settlement or contact support.`,
        },
        { 'X-Request-ID': requestId }
      );
    }

    const now = new Date();
    const updatedOrder = await withTimeout(
      prisma.$transaction(async (tx) => {
        const freshOrder = await tx.order.findUnique({
          where: { id: order.id },
        });

        if (!freshOrder) {
          throw new Error('ORDER_NOT_FOUND');
        }

        if (freshOrder.paymentStatus === 'PAID' && freshOrder.status === 'CONFIRMED') {
          return freshOrder;
        }

        if (freshOrder.status === 'CANCELLED' || freshOrder.paymentStatus === 'CANCELLED') {
          throw new Error('ORDER_CANCELLED');
        }

        return await tx.order.update({
          where: { id: freshOrder.id },
          data: {
            paymentStatus: 'PAID',
            status: 'CONFIRMED',
            shippingStatus: 'READY',
            paymentTransactionId: razorpayPaymentId,
            paidAt: freshOrder.paidAt || now,
            paymentFailureReason: null,
          },
        });
      }),
      DEFAULT_DB_TIMEOUT_MS,
      'commit_verified_payment_transaction'
    );

    logEvent('INFO', {
      endpoint: '/api/payments/razorpay/verify',
      operation: 'payment_verified_and_confirmed',
      userId: user.id,
      extra: {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        paymentTransactionId: razorpayPaymentId,
        grandTotal: updatedOrder.grandTotal,
      },
      message: `Order #${updatedOrder.orderNumber} successfully verified & transitioned to CONFIRMED/PAID.`,
    });

    const durationMs = Date.now() - startTime;
    logSlowRequest(durationMs, {
      endpoint: '/api/payments/razorpay/verify',
      method: 'POST',
      operation: 'verify_razorpay_payment',
      requestId,
    });

    return respond(
      res,
      200,
      {
        success: true,
        message: 'Payment successfully verified and order confirmed.',
        order: {
          id: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          status: updatedOrder.status,
          paymentStatus: updatedOrder.paymentStatus,
          shippingStatus: updatedOrder.shippingStatus,
          paidAt: updatedOrder.paidAt,
          grandTotal: updatedOrder.grandTotal,
          currency: updatedOrder.currency,
        },
      },
      { 'X-Request-ID': requestId }
    );
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    logServerError(error, {
      endpoint: '/api/payments/razorpay/verify',
      method: 'POST',
      operation: 'razorpay_verify_payment_unhandled',
      durationMs,
      requestId,
    });

    return respond(
      res,
      500,
      { error: getSafeErrorMessage(error, 'An internal error occurred while verifying payment.') },
      { 'X-Request-ID': requestId }
    );
  }
}

// ============================================================================
// 3. SERVER-TO-SERVER WEBHOOK HANDLER (POST /api/payments/razorpay/webhook)
// ============================================================================
export async function handleWebhook(req: any, res: any, inRequestId?: string, inStartTime?: number) {
  const startTime = inStartTime || Date.now();
  const requestId = inRequestId || getOrCreateRequestId(req);
  try {
    if (req.method !== 'POST') {
      return respond(
        res,
        405,
        { error: 'Method Not Allowed. Only POST is supported for webhook events.' },
        { 'X-Request-ID': requestId, Allow: 'POST' }
      );
    }

    const { rawBody, data: parsedBody } = await getRawAndParsedBody(req);

    if (!rawBody || rawBody.length === 0) {
      logSecurityEvent('empty_webhook_payload', { endpoint: '/api/payments/razorpay/webhook', requestId });
      return respond(res, 400, { error: 'Bad Request: Empty webhook payload.' }, { 'X-Request-ID': requestId });
    }

    const incomingSignature =
      req.headers?.['x-razorpay-signature'] ||
      req.headers?.['X-Razorpay-Signature'];

    if (!incomingSignature || typeof incomingSignature !== 'string') {
      logSecurityEvent('missing_webhook_signature', { endpoint: '/api/payments/razorpay/webhook', requestId });
      return respond(res, 400, { error: 'Bad Request: Missing X-Razorpay-Signature header.' }, { 'X-Request-ID': requestId });
    }

    const isSignatureValid = validateRazorpayWebhookSignature(rawBody, incomingSignature);
    if (!isSignatureValid) {
      logSecurityEvent('invalid_webhook_signature', {
        endpoint: '/api/payments/razorpay/webhook',
        requestId,
      });
      return respond(
        res,
        400,
        { error: 'Invalid webhook signature.' },
        { 'X-Request-ID': requestId }
      );
    }

    let payload: any = parsedBody;
    if (!payload && typeof rawBody === 'string') {
      try {
        payload = JSON.parse(rawBody);
      } catch (parseErr: any) {
        logSecurityEvent('webhook_json_parse_error', { endpoint: '/api/payments/razorpay/webhook', requestId });
        return respond(res, 400, { error: 'Bad Request: Malformed JSON payload.' }, { 'X-Request-ID': requestId });
      }
    }

    const event = payload?.event;
    if (!event || typeof event !== 'string') {
      return respond(res, 400, { error: 'Bad Request: Missing event field.' }, { 'X-Request-ID': requestId });
    }

    logEvent('INFO', {
      endpoint: '/api/payments/razorpay/webhook',
      operation: 'razorpay_webhook_received',
      requestId,
      category: 'webhook',
      message: `Razorpay webhook event received: ${event}`,
    });

    if (event === 'payment.captured') {
      const paymentEntity = payload?.payload?.payment?.entity;
      if (!paymentEntity) {
        return respond(res, 400, { error: 'Missing payment entity in webhook payload.' }, { 'X-Request-ID': requestId });
      }

      const razorpayPaymentId = paymentEntity.id;
      const razorpayOrderId = paymentEntity.order_id;
      const paymentStatus = paymentEntity.status;
      const paymentAmount = Number(paymentEntity.amount);
      const paymentCurrency = paymentEntity.currency;

      if (!razorpayOrderId || !razorpayPaymentId) {
        return respond(res, 400, { error: 'Missing payment or order IDs in webhook payload.' }, { 'X-Request-ID': requestId });
      }

      const order = await withTimeout(
        prisma.order.findFirst({
          where: { paymentOrderId: razorpayOrderId },
        }),
        DEFAULT_DB_TIMEOUT_MS,
        'fetch_order_for_webhook_payment_captured'
      );

      if (!order) {
        logEvent('WARN', {
          endpoint: '/api/payments/razorpay/webhook',
          operation: 'order_not_found_for_payment_captured',
          extra: { razorpayOrderId, razorpayPaymentId },
          message: `Webhook received for unknown Razorpay order: ${razorpayOrderId}`,
        });
        return respond(res, 200, { received: true, status: 'order_not_found' }, { 'X-Request-ID': requestId });
      }

      if (order.status === 'CANCELLED' || order.paymentStatus === 'CANCELLED') {
        logEvent('WARN', {
          endpoint: '/api/payments/razorpay/webhook',
          operation: 'payment_captured_on_cancelled_order',
          extra: { orderId: order.id, razorpayOrderId, razorpayPaymentId },
          message: 'Ignored payment.captured webhook for cancelled Alongkar order',
        });
        return respond(res, 200, { received: true, status: 'ignored_cancelled_order' }, { 'X-Request-ID': requestId });
      }

      if (order.paymentStatus === 'PAID' && order.status === 'CONFIRMED') {
        return respond(res, 200, { received: true, status: 'already_processed', idempotentReplay: true }, { 'X-Request-ID': requestId });
      }

      let expectedAmountPaise: number;
      try {
        expectedAmountPaise = rupeesToPaise(order.grandTotal);
      } catch (err: any) {
        return respond(res, 500, { error: 'Failed to compute order payable amount.' }, { 'X-Request-ID': requestId });
      }

      if (paymentAmount !== expectedAmountPaise || paymentCurrency !== order.currency) {
        logSecurityEvent('webhook_amount_or_currency_mismatch', {
          endpoint: '/api/payments/razorpay/webhook',
          orderId: order.id,
          expectedAmount: expectedAmountPaise,
          receivedAmount: paymentAmount,
          expectedCurrency: order.currency,
          receivedCurrency: paymentCurrency,
          requestId,
        });
        return respond(res, 400, { error: 'Payment amount or currency mismatch with order record.' }, { 'X-Request-ID': requestId });
      }

      if (paymentStatus !== 'captured') {
        logEvent('INFO', {
          endpoint: '/api/payments/razorpay/webhook',
          operation: 'webhook_payment_not_captured',
          extra: { orderId: order.id, status: paymentStatus },
          message: `Webhook payment.captured had non-captured status: ${paymentStatus}`,
        });
        return respond(res, 200, { received: true, status: 'payment_not_captured' }, { 'X-Request-ID': requestId });
      }

      const now = new Date();
      await withTimeout(
        prisma.$transaction(async (tx) => {
          const freshOrder = await tx.order.findUnique({
            where: { id: order.id },
          });

          if (!freshOrder || freshOrder.status === 'CANCELLED') {
            return;
          }

          if (freshOrder.paymentStatus === 'PAID' && freshOrder.status === 'CONFIRMED') {
            return;
          }

          await tx.order.update({
            where: { id: freshOrder.id },
            data: {
              paymentStatus: 'PAID',
              status: 'CONFIRMED',
              shippingStatus: 'READY',
              paymentTransactionId: razorpayPaymentId,
              paidAt: freshOrder.paidAt || now,
              paymentFailureReason: null,
            },
          });
        }),
        DEFAULT_DB_TIMEOUT_MS,
        'webhook_commit_payment_captured'
      );

      return respond(res, 200, { received: true, status: 'processed', orderId: order.id }, { 'X-Request-ID': requestId });
    }

    if (event === 'order.paid') {
      const orderEntity = payload?.payload?.order?.entity;
      const paymentEntity = payload?.payload?.payment?.entity;

      if (!orderEntity) {
        return respond(res, 400, { error: 'Missing order entity in webhook payload.' }, { 'X-Request-ID': requestId });
      }

      const razorpayOrderId = orderEntity.id;
      const razorpayPaymentId = paymentEntity?.id || null;
      const razorpayOrderStatus = orderEntity.status;

      if (!razorpayOrderId) {
        return respond(res, 400, { error: 'Missing razorpayOrderId in order.paid webhook.' }, { 'X-Request-ID': requestId });
      }

      const order = await withTimeout(
        prisma.order.findFirst({
          where: { paymentOrderId: razorpayOrderId },
        }),
        DEFAULT_DB_TIMEOUT_MS,
        'fetch_order_for_webhook_order_paid'
      );

      if (!order) {
        return respond(res, 200, { received: true, status: 'order_not_found' }, { 'X-Request-ID': requestId });
      }

      if (order.status === 'CANCELLED' || order.paymentStatus === 'CANCELLED') {
        return respond(res, 200, { received: true, status: 'ignored_cancelled_order' }, { 'X-Request-ID': requestId });
      }

      if (order.paymentStatus === 'PAID' && order.status === 'CONFIRMED') {
        return respond(res, 200, { received: true, status: 'already_processed', idempotentReplay: true }, { 'X-Request-ID': requestId });
      }

      let expectedAmountPaise: number;
      try {
        expectedAmountPaise = rupeesToPaise(order.grandTotal);
      } catch (err: any) {
        return respond(res, 500, { error: 'Failed to compute order payable amount.' }, { 'X-Request-ID': requestId });
      }

      if (Number(orderEntity.amount_paid || orderEntity.amount) !== expectedAmountPaise) {
        logSecurityEvent('webhook_order_paid_amount_mismatch', {
          endpoint: '/api/payments/razorpay/webhook',
          orderId: order.id,
          expectedAmount: expectedAmountPaise,
          receivedAmount: orderEntity.amount_paid || orderEntity.amount,
          requestId,
        });
        return respond(res, 400, { error: 'Order paid amount mismatch.' }, { 'X-Request-ID': requestId });
      }

      const now = new Date();
      await withTimeout(
        prisma.$transaction(async (tx) => {
          const freshOrder = await tx.order.findUnique({
            where: { id: order.id },
          });

          if (!freshOrder || freshOrder.status === 'CANCELLED') {
            return;
          }

          if (freshOrder.paymentStatus === 'PAID' && freshOrder.status === 'CONFIRMED') {
            return;
          }

          await tx.order.update({
            where: { id: freshOrder.id },
            data: {
              paymentStatus: 'PAID',
              status: 'CONFIRMED',
              shippingStatus: 'READY',
              paymentTransactionId: razorpayPaymentId || freshOrder.paymentTransactionId,
              paidAt: freshOrder.paidAt || now,
              paymentFailureReason: null,
            },
          });
        }),
        DEFAULT_DB_TIMEOUT_MS,
        'webhook_commit_order_paid'
      );

      return respond(res, 200, { received: true, status: 'processed', orderId: order.id }, { 'X-Request-ID': requestId });
    }

    if (event === 'payment.failed') {
      const paymentEntity = payload?.payload?.payment?.entity;
      if (!paymentEntity) {
        return respond(res, 400, { error: 'Missing payment entity in webhook payload.' }, { 'X-Request-ID': requestId });
      }

      const razorpayOrderId = paymentEntity.order_id;
      const errorDescription = paymentEntity.error_description || paymentEntity.error_reason || 'Payment failed on gateway';

      if (!razorpayOrderId) {
        return respond(res, 200, { received: true, status: 'no_order_id' }, { 'X-Request-ID': requestId });
      }

      const order = await withTimeout(
        prisma.order.findFirst({
          where: { paymentOrderId: razorpayOrderId },
        }),
        DEFAULT_DB_TIMEOUT_MS,
        'fetch_order_for_webhook_payment_failed'
      );

      if (!order) {
        return respond(res, 200, { received: true, status: 'order_not_found' }, { 'X-Request-ID': requestId });
      }

      if (order.paymentStatus === 'PAID' || order.status === 'CONFIRMED') {
        logEvent('INFO', {
          endpoint: '/api/payments/razorpay/webhook',
          operation: 'payment_failed_ignored_for_paid_order',
          extra: { orderId: order.id },
          message: 'Ignored payment.failed event for already-paid order',
        });
        return respond(res, 200, { received: true, status: 'ignored_already_paid' }, { 'X-Request-ID': requestId });
      }

      await withTimeout(
        prisma.order.update({
          where: { id: order.id },
          data: {
            paymentFailureReason: String(errorDescription).slice(0, 500),
          },
        }),
        DEFAULT_DB_TIMEOUT_MS,
        'webhook_record_payment_failure'
      );

      return respond(res, 200, { received: true, status: 'failure_recorded', orderId: order.id }, { 'X-Request-ID': requestId });
    }

    return respond(res, 200, { received: true, status: 'ignored_unsupported_event' }, { 'X-Request-ID': requestId });
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    logServerError(error, {
      endpoint: '/api/payments/razorpay/webhook',
      method: 'POST',
      operation: 'razorpay_webhook_unhandled',
      durationMs,
      requestId,
    });

    return respond(
      res,
      500,
      { error: getSafeErrorMessage(error, 'An internal error occurred while processing webhook.') },
      { 'X-Request-ID': requestId }
    );
  }
}

// ============================================================================
// MAIN ROUTER (api/payments/razorpay.ts)
// ============================================================================
export default async function handler(req: any, res: any) {
  const startTime = Date.now();
  const requestId = getOrCreateRequestId(req);

  // Determine target action
  let action: string | undefined;

  if (typeof req.query?.action === 'string' && req.query.action.trim()) {
    action = req.query.action.trim();
  } else if (typeof req.url === 'string') {
    const urlObj = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
    const pathname = urlObj.pathname;
    if (pathname.endsWith('/order') || pathname.includes('/order/')) action = 'order';
    else if (pathname.endsWith('/verify') || pathname.includes('/verify/')) action = 'verify';
    else if (pathname.endsWith('/webhook') || pathname.includes('/webhook/')) action = 'webhook';
  }

  if (!action && req.body && typeof req.body === 'object' && typeof req.body.action === 'string') {
    action = req.body.action.trim();
  }

  if (action === 'order') {
    return handleCreatePaymentOrder(req, res, requestId, startTime);
  } else if (action === 'verify') {
    return handleVerifyPayment(req, res, requestId, startTime);
  } else if (action === 'webhook') {
    return handleWebhook(req, res, requestId, startTime);
  } else {
    return respond(
      res,
      404,
      { error: 'Not Found: Invalid payment endpoint route.' },
      { 'X-Request-ID': requestId }
    );
  }
}
