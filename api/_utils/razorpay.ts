import crypto from 'crypto';
import Razorpay from 'razorpay';
import { Prisma } from '@prisma/client';
import { withTimeout, DEFAULT_DB_TIMEOUT_MS, getSafeErrorMessage } from './security.js';
import { deductOrderInventoryTx, invalidateDeductedProductsCache, type AggregatedOrderItem } from './inventory.js';

/**
 * Validates and retrieves server-side Razorpay configuration.
 * Never exposes the key_secret to client-facing objects.
 */
export function getRazorpayConfig(): { keyId: string; keySecret: string } {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials are not configured on the server (missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET).');
  }

  return { keyId, keySecret };
}

/**
 * Returns the public Razorpay Key ID safe to share with the frontend client for checkout.
 */
export function getRazorpayPublicClientKey(): string {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  if (!keyId) {
    throw new Error('RAZORPAY_KEY_ID is not configured on the server.');
  }
  return keyId;
}

/**
 * Initializes and returns a server-side Razorpay SDK client instance.
 * Safe for serverless environments.
 */
export function getRazorpayClient(): Razorpay {
  const { keyId, keySecret } = getRazorpayConfig();

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

/**
 * Converts INR monetary amounts (Rupees) safely to paise (smallest currency unit),
 * avoiding floating-point rounding errors.
 * Accepts Prisma.Decimal, number, or string.
 *
 * Example: 1499.99 INR -> 149999 paise
 * Example: 500.00 INR -> 50000 paise
 */
export function rupeesToPaise(amountInRupees: number | string | Prisma.Decimal): number {
  if (amountInRupees === null || amountInRupees === undefined) {
    throw new Error('Cannot convert null or undefined amount to paise.');
  }

  let numValue: number;
  if (typeof amountInRupees === 'object' && 'toNumber' in amountInRupees && typeof amountInRupees.toNumber === 'function') {
    numValue = amountInRupees.toNumber();
  } else if (typeof amountInRupees === 'string') {
    numValue = parseFloat(amountInRupees);
  } else if (typeof amountInRupees === 'number') {
    numValue = amountInRupees;
  } else {
    numValue = Number(amountInRupees);
  }

  if (isNaN(numValue) || !Number.isFinite(numValue)) {
    throw new Error(`Invalid monetary amount: "${amountInRupees}". Must be a valid finite number.`);
  }

  if (numValue <= 0) {
    throw new Error(`Payable amount must be greater than 0. Received: ${numValue}`);
  }

  // Math.round to handle minor float artifacts like 1499.99 * 100 = 149998.99999999997
  return Math.round(numValue * 100);
}

/**
 * Converts paise back to Rupees for display/logging.
 */
export function paiseToRupees(paise: number): number {
  if (typeof paise !== 'number' || isNaN(paise) || !Number.isFinite(paise)) {
    throw new Error(`Invalid paise amount: "${paise}".`);
  }
  return paise / 100;
}

/**
 * Validates and retrieves server-side Razorpay webhook configuration secret.
 * Webhook secret is distinct from RAZORPAY_KEY_SECRET.
 */
export function getRazorpayWebhookSecret(): string {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured on the server.');
  }
  return webhookSecret;
}

/**
 * Validates the cryptographic Razorpay Checkout.js payment signature server-side.
 * Official Algorithm: HMAC-SHA256(razorpay_order_id + "|" + razorpay_payment_id, RAZORPAY_KEY_SECRET).
 * Uses constant-time equality check to protect against timing attacks.
 */
export function validateRazorpayCheckoutSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string
): boolean {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return false;
  }

  const { keySecret } = getRazorpayConfig();
  const payload = `${razorpayOrderId.trim()}|${razorpayPaymentId.trim()}`;

  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(payload)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const actualBuf = Buffer.from(razorpaySignature.trim(), 'utf8');

  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Validates the cryptographic Razorpay Webhook signature server-side.
 * Official Algorithm: HMAC-SHA256(raw_request_body, RAZORPAY_WEBHOOK_SECRET).
 * Uses constant-time equality check to protect against timing attacks.
 */
export function validateRazorpayWebhookSignature(
  rawBody: string | Buffer,
  signature: string
): boolean {
  if (!rawBody || !signature) {
    return false;
  }

  const webhookSecret = getRazorpayWebhookSecret();
  const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(bodyBuffer)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const actualBuf = Buffer.from(signature.trim(), 'utf8');

  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Atomically transitions an Alongkar order to CONFIRMED + PAID + READY and deducts inventory.
 * Idempotent: If already PAID and CONFIRMED, returns the fresh order without modifying or deducting again.
 * Rejects cancelled or refunded orders.
 */
export async function transitionOrderToPaid(
  prismaClient: any,
  orderId: string,
  paymentTransactionId: string | null,
  paidAt?: Date
): Promise<any> {
  const now = paidAt || new Date();
  let successfullyDeductedItems: AggregatedOrderItem[] = [];

  const updatedOrder = await withTimeout(
    prismaClient.$transaction(async (tx: any) => {
      const freshOrder = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!freshOrder) {
        throw new Error('ORDER_NOT_FOUND');
      }

      // Idempotency: If order was already marked PAID and CONFIRMED, do not re-deduct inventory
      if (freshOrder.paymentStatus === 'PAID' && freshOrder.status === 'CONFIRMED') {
        return freshOrder;
      }

      if (freshOrder.status === 'CANCELLED' || freshOrder.paymentStatus === 'CANCELLED') {
        throw new Error('ORDER_CANCELLED');
      }

      if (freshOrder.paymentStatus === 'REFUNDED' || freshOrder.paymentStatus === 'PARTIALLY_REFUNDED') {
        throw new Error('ORDER_REFUNDED');
      }

      // Atomic inventory deduction for all items in the confirmed order
      if (freshOrder.items && freshOrder.items.length > 0) {
        const itemsToDeduct = freshOrder.items
          .filter((item: any) => item.productId)
          .map((item: any) => ({
            productId: item.productId,
            quantity: item.quantity,
          }));

        if (itemsToDeduct.length > 0) {
          const deductionResult = await deductOrderInventoryTx(tx, itemsToDeduct, {
            orderId: freshOrder.id,
            reason: 'payment_received_and_confirmed',
          });
          if (!deductionResult.success) {
            throw new Error(`INSUFFICIENT_STOCK:${deductionResult.conflictProductId || 'UNKNOWN'}`);
          }
          successfullyDeductedItems = deductionResult.deductedItems;
        }
      }

      const updated = await tx.order.update({
        where: { id: freshOrder.id },
        data: {
          paymentStatus: 'PAID',
          status: 'CONFIRMED',
          shippingStatus: 'READY',
          paymentTransactionId: paymentTransactionId || freshOrder.paymentTransactionId,
          paidAt: freshOrder.paidAt || now,
          paymentFailureReason: null,
        },
      });

      // Clear customer's persistent cart upon successful server payment confirmation
      if (freshOrder.userId) {
        const userCart = await tx.cart.findUnique({
          where: { userId: freshOrder.userId },
        });
        if (userCart) {
          await tx.cartItem.deleteMany({
            where: { cartId: userCart.id },
          });
        }
      }

      return updated;
    }),
    DEFAULT_DB_TIMEOUT_MS,
    'transition_order_to_paid_tx'
  );

  // Invalidate Redis product catalog and item caches for all deducted products
  if (successfullyDeductedItems.length > 0) {
    invalidateDeductedProductsCache(successfullyDeductedItems).catch(() => {});
  }

  return updatedOrder;
}

export interface GatewayReconciliationResult {
  status: 'paid' | 'unpaid' | 'gateway_error' | 'validation_error';
  paymentId?: string;
  razorpayOrder?: any;
  paymentDetails?: any;
  error?: string;
  isRetryable?: boolean;
}

/**
 * Server-side helper to query the Razorpay API, inspect the status of a Razorpay order,
 * and identify any valid captured payments that match the Alongkar order.
 */
export async function fetchAndReconcileGatewayOrder(
  order: {
    id: string;
    orderNumber?: string;
    paymentOrderId: string | null;
    grandTotal: any;
    currency?: string;
  },
  razorpayClient?: any,
  mockOverrides?: {
    testRazorpayOrder?: any;
    testRazorpayPayments?: any;
    testPayment?: any;
  }
): Promise<GatewayReconciliationResult> {
  if (!order.paymentOrderId || typeof order.paymentOrderId !== 'string' || !order.paymentOrderId.startsWith('order_')) {
    return {
      status: 'validation_error',
      error: 'Order does not have a valid Razorpay order ID.',
    };
  }

  const expectedCurrency = order.currency || 'INR';
  let expectedAmountPaise: number;
  try {
    expectedAmountPaise = rupeesToPaise(order.grandTotal);
  } catch (err: any) {
    return {
      status: 'validation_error',
      error: `Invalid order payable amount: ${err.message}`,
    };
  }

  const rzp = razorpayClient || getRazorpayClient();

  // 1. Fetch Razorpay Order from gateway
  let rzpOrder: any;
  try {
    if (mockOverrides?.testRazorpayOrder) {
      rzpOrder = mockOverrides.testRazorpayOrder;
    } else {
      rzpOrder = await withTimeout(
        rzp.orders.fetch(order.paymentOrderId),
        DEFAULT_DB_TIMEOUT_MS,
        'razorpay_orders_fetch'
      );
    }
  } catch (err: any) {
    return {
      status: 'gateway_error',
      error: getSafeErrorMessage(err, 'Failed to fetch order status from payment gateway.'),
      isRetryable: true,
    };
  }

  if (!rzpOrder || rzpOrder.id !== order.paymentOrderId) {
    return {
      status: 'validation_error',
      error: 'Gateway order ID does not match expected Alongkar order record.',
    };
  }

  if (rzpOrder.currency && rzpOrder.currency !== expectedCurrency) {
    return {
      status: 'validation_error',
      error: `Gateway order currency mismatch: expected ${expectedCurrency}, got ${rzpOrder.currency}.`,
    };
  }

  // 2. If order status is paid or amount_paid >= expected or attempts > 0, fetch payments
  const isMarkedPaid = rzpOrder.status === 'paid' || Number(rzpOrder.amount_paid) >= expectedAmountPaise;
  const hasAttempts = isMarkedPaid || (typeof rzpOrder.attempts === 'number' && rzpOrder.attempts > 0);

  if (!hasAttempts && !isMarkedPaid) {
    return {
      status: 'unpaid',
      razorpayOrder: rzpOrder,
    };
  }

  // Fetch payments list for this order
  let paymentsCollection: any;
  try {
    if (mockOverrides?.testRazorpayPayments) {
      paymentsCollection = mockOverrides.testRazorpayPayments;
    } else if (mockOverrides?.testPayment) {
      paymentsCollection = { items: [mockOverrides.testPayment] };
    } else {
      paymentsCollection = await withTimeout(
        rzp.orders.fetchPayments(order.paymentOrderId),
        DEFAULT_DB_TIMEOUT_MS,
        'razorpay_orders_fetch_payments'
      );
    }
  } catch (err: any) {
    if (isMarkedPaid) {
      return {
        status: 'gateway_error',
        error: getSafeErrorMessage(err, 'Failed to fetch payment details from payment gateway.'),
        isRetryable: true,
      };
    }
    return {
      status: 'gateway_error',
      error: getSafeErrorMessage(err, 'Failed to query gateway payments.'),
      isRetryable: true,
    };
  }

  const items = Array.isArray(paymentsCollection?.items)
    ? paymentsCollection.items
    : Array.isArray(paymentsCollection)
    ? paymentsCollection
    : [];

  // Look for a captured payment that matches this order, amount, and currency
  const capturedPayments = items.filter((p: any) => p && (p.status === 'captured' || p.captured === true));

  for (const p of capturedPayments) {
    // Validate order_id if present on payment entity
    if (p.order_id && p.order_id !== order.paymentOrderId) {
      continue;
    }

    // Validate currency
    if (p.currency && p.currency !== expectedCurrency) {
      return {
        status: 'validation_error',
        error: `Payment currency mismatch: expected ${expectedCurrency}, received ${p.currency}.`,
        paymentDetails: p,
      };
    }

    // Validate amount
    if (Number(p.amount) !== expectedAmountPaise) {
      return {
        status: 'validation_error',
        error: `Payment amount mismatch: expected ${expectedAmountPaise} paise, received ${p.amount} paise.`,
        paymentDetails: p,
      };
    }

    // Valid captured payment found!
    return {
      status: 'paid',
      paymentId: p.id,
      razorpayOrder: rzpOrder,
      paymentDetails: p,
    };
  }

  // If order itself is marked paid on gateway, but no captured payment matched:
  if (isMarkedPaid) {
    if (items.length > 0) {
      const failedPayment = items.find((p: any) => p && (p.status === 'failed' || p.error_description));
      return {
        status: 'validation_error',
        error: failedPayment?.error_description || 'Gateway order marked paid but no valid captured payment found.',
        razorpayOrder: rzpOrder,
      };
    }
  }

  return {
    status: 'unpaid',
    razorpayOrder: rzpOrder,
  };
}
