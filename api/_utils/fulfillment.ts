import prisma from '../../src/lib/prisma.js';
import { withTimeout, DEFAULT_DB_TIMEOUT_MS, isValidIdentifier } from './security.js';

export type FulfillmentIneligibilityReason =
  | 'ORDER_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'ORDER_CANCELLED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_CANCELLED'
  | 'PAYMENT_REFUNDED'
  | 'RAZORPAY_PAYMENT_PENDING'
  | 'RAZORPAY_PAYMENT_NOT_PAID'
  | 'INVALID_ORDER_STATUS'
  | 'ALREADY_SHIPPED'
  | 'ALREADY_DELIVERED'
  | 'ALREADY_RETURNED'
  | 'MISSING_SHIPPING_ADDRESS'
  | 'EMPTY_ORDER_ITEMS'
  | 'INVALID_ORDER_DATA';

export interface FulfillmentEligibilityResult {
  eligible: boolean;
  orderId: string;
  orderNumber?: string | null;
  paymentProvider?: string | null;
  orderStatus?: string | null;
  paymentStatus?: string | null;
  shippingStatus?: string | null;
  reasons: FulfillmentIneligibilityReason[];
  message: string;
  readyForFulfillmentProvider: boolean;
}

export interface FulfillmentOrderInput {
  id: string;
  orderNumber?: string | null;
  userId?: string | null;
  status: string;
  paymentStatus: string;
  shippingStatus?: string | null;
  paymentProvider?: string | null;
  grandTotal?: any;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  shippingAddressLine1?: string | null;
  shippingAddressLine2?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
  shippingPincode?: string | null;
  shippingCountry?: string | null;
  items?: Array<{
    id?: string;
    productId?: string | null;
    productName?: string | null;
    quantity: number;
    unitPrice?: any;
    lineTotal?: any;
  }> | null;
}

export interface PreparedFulfillmentPayload {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  shippingAddress: {
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;
  grandTotal: number;
  paymentMethod: 'COD' | 'PREPAID';
}

export interface FulfillmentServiceResult {
  success: boolean;
  status: number;
  eligible: boolean;
  orderId?: string;
  orderNumber?: string | null;
  reasons?: FulfillmentIneligibilityReason[];
  message: string;
  fulfillmentPayload?: PreparedFulfillmentPayload;
  error?: string;
}

/**
 * Pure evaluator determining whether an order record satisfies all architectural,
 * business, and payment prerequisites to enter the fulfillment pipeline.
 *
 * Server-authoritative: Decisions are based exclusively on validated persisted order state.
 */
export function checkOrderFulfillmentEligibility(order: FulfillmentOrderInput | null | undefined): FulfillmentEligibilityResult {
  if (!order || typeof order !== 'object' || !order.id) {
    return {
      eligible: false,
      orderId: order?.id || '',
      orderNumber: order?.orderNumber || null,
      paymentProvider: order?.paymentProvider || null,
      orderStatus: order?.status || null,
      paymentStatus: order?.paymentStatus || null,
      shippingStatus: order?.shippingStatus || null,
      reasons: ['INVALID_ORDER_DATA'],
      message: 'Order data is missing or invalid.',
      readyForFulfillmentProvider: false,
    };
  }

  const reasons: FulfillmentIneligibilityReason[] = [];
  const status = (order.status || '').toUpperCase();
  const paymentStatus = (order.paymentStatus || '').toUpperCase();
  const shippingStatus = (order.shippingStatus || '').toUpperCase();
  const paymentProvider = (order.paymentProvider || '').toUpperCase();

  // 1. Cancellation checks
  if (status === 'CANCELLED' || shippingStatus === 'CANCELLED') {
    reasons.push('ORDER_CANCELLED');
  }
  if (paymentStatus === 'CANCELLED') {
    reasons.push('PAYMENT_CANCELLED');
  }

  // 2. Payment Failure & Refund checks
  if (paymentStatus === 'FAILED') {
    reasons.push('PAYMENT_FAILED');
  }
  if (paymentStatus === 'REFUNDED') {
    reasons.push('PAYMENT_REFUNDED');
  }

  // 3. Post-Fulfillment state checks (Terminal or in-transit shipments cannot re-enter initial fulfillment)
  if (shippingStatus === 'SHIPPED' || shippingStatus === 'IN_TRANSIT' || status === 'SHIPPED') {
    reasons.push('ALREADY_SHIPPED');
  }
  if (shippingStatus === 'DELIVERED' || status === 'DELIVERED') {
    reasons.push('ALREADY_DELIVERED');
  }
  if (shippingStatus === 'RETURNED') {
    reasons.push('ALREADY_RETURNED');
  }

  // 4. Lifecycle & Payment Provider Rules
  if (status === 'PENDING_PAYMENT') {
    reasons.push('RAZORPAY_PAYMENT_PENDING');
  }

  if (paymentProvider === 'RAZORPAY') {
    if (paymentStatus !== 'PAID') {
      reasons.push('RAZORPAY_PAYMENT_NOT_PAID');
    }
    if (status !== 'CONFIRMED' && status !== 'PROCESSING') {
      if (!reasons.includes('INVALID_ORDER_STATUS') && !reasons.includes('RAZORPAY_PAYMENT_PENDING')) {
        reasons.push('INVALID_ORDER_STATUS');
      }
    }
  } else if (paymentProvider === 'COD') {
    if (status !== 'CONFIRMED' && status !== 'PROCESSING') {
      if (!reasons.includes('INVALID_ORDER_STATUS')) {
        reasons.push('INVALID_ORDER_STATUS');
      }
    }
    if (paymentStatus !== 'PENDING' && paymentStatus !== 'PAID') {
      if (!reasons.includes('PAYMENT_FAILED') && !reasons.includes('PAYMENT_CANCELLED')) {
        reasons.push('INVALID_ORDER_STATUS');
      }
    }
  } else {
    // Unrecognized or missing payment provider
    if (!reasons.includes('INVALID_ORDER_STATUS')) {
      reasons.push('INVALID_ORDER_STATUS');
    }
  }

  // 5. Line items validation (Must have at least one product item)
  if (!order.items || !Array.isArray(order.items) || order.items.length === 0) {
    reasons.push('EMPTY_ORDER_ITEMS');
  }

  // 6. Complete shipping address validation
  const line1 = order.shippingAddressLine1?.trim();
  const city = order.shippingCity?.trim();
  const state = order.shippingState?.trim();
  const pincode = order.shippingPincode?.trim();

  if (!line1 || !city || !state || !pincode || !/^\d{6}$/.test(pincode)) {
    reasons.push('MISSING_SHIPPING_ADDRESS');
  }

  const eligible = reasons.length === 0;

  return {
    eligible,
    orderId: order.id,
    orderNumber: order.orderNumber || null,
    paymentProvider: order.paymentProvider || null,
    orderStatus: order.status || null,
    paymentStatus: order.paymentStatus || null,
    shippingStatus: order.shippingStatus || null,
    reasons,
    message: eligible
      ? 'Order is confirmed and eligible for fulfillment pipeline.'
      : `Order is not eligible for fulfillment: ${reasons.join(', ')}.`,
    readyForFulfillmentProvider: eligible,
  };
}

/**
 * Builds a clean, normalized, provider-agnostic data structure ready for any shipping partner.
 */
export function buildNormalizedFulfillmentPayload(order: any): PreparedFulfillmentPayload {
  const toNum = (val: any) => {
    if (val === null || val === undefined) return 0;
    return typeof val.toNumber === 'function' ? val.toNumber() : Number(val);
  };

  const isCod = (order.paymentProvider || '').toUpperCase() === 'COD';

  return {
    orderId: order.id,
    orderNumber: order.orderNumber || order.id,
    customerName: order.customerName || 'Valued Customer',
    customerPhone: order.customerPhone || '',
    customerEmail: order.customerEmail || '',
    shippingAddress: {
      line1: order.shippingAddressLine1 || '',
      line2: order.shippingAddressLine2 || null,
      city: order.shippingCity || '',
      state: order.shippingState || '',
      pincode: order.shippingPincode || '',
      country: order.shippingCountry || 'India',
    },
    items: (order.items || []).map((item: any) => ({
      productId: item.productId || item.productSku || item.id,
      productName: item.productName || 'Jewellery Item',
      quantity: item.quantity || 1,
      unitPrice: toNum(item.unitPrice),
    })),
    grandTotal: toNum(order.grandTotal),
    paymentMethod: isCod ? 'COD' : 'PREPAID',
  };
}

export interface FulfillmentAuthCaller {
  id?: string;
  clerkUserId?: string;
  isAdmin?: boolean;
}

/**
 * Authoritative Server-Side Fulfillment Boundary Service.
 *
 * Safely loads the target order from the database, verifies user authorization (order owner or admin),
 * and validates fulfillment eligibility without performing any external API calls or unwanted mutations.
 *
 * Idempotent: Calling this multiple times does NOT mutate database records or duplicate fulfillment data.
 */
export async function getOrderFulfillmentEligibility(
  orderIdOrNumber: string,
  caller: FulfillmentAuthCaller | null
): Promise<FulfillmentServiceResult> {
  if (!caller || (!caller.id && !caller.clerkUserId && !caller.isAdmin)) {
    return {
      success: false,
      status: 401,
      eligible: false,
      message: 'Unauthorized: Authentication required to inspect fulfillment eligibility.',
      error: 'UNAUTHORIZED',
    };
  }

  if (!orderIdOrNumber || typeof orderIdOrNumber !== 'string') {
    return {
      success: false,
      status: 400,
      eligible: false,
      message: 'Bad Request: A valid order identifier is required.',
      error: 'INVALID_IDENTIFIER',
    };
  }

  const trimmedId = orderIdOrNumber.trim();
  const isIdLookup = isValidIdentifier(trimmedId);

  const whereClause: any = isIdLookup ? { id: trimmedId } : { orderNumber: trimmedId };

  // If caller is NOT an admin, restrict DB lookup to their own userId to prevent order enumeration
  if (!caller.isAdmin) {
    if (!caller.id) {
      return {
        success: false,
        status: 401,
        eligible: false,
        message: 'Unauthorized: Valid user identifier required.',
        error: 'UNAUTHORIZED',
      };
    }
    whereClause.userId = caller.id;
  }

  const order = await withTimeout(
    prisma.order.findFirst({
      where: whereClause,
      include: {
        items: true,
      },
    }),
    DEFAULT_DB_TIMEOUT_MS,
    'Fulfillment.findOrder'
  );

  if (!order) {
    return {
      success: false,
      status: 404,
      eligible: false,
      reasons: ['ORDER_NOT_FOUND'],
      message: 'Order not found or access unauthorized.',
      error: 'ORDER_NOT_FOUND',
    };
  }

  // Pure validation check
  const check = checkOrderFulfillmentEligibility(order);

  return {
    success: true,
    status: 200,
    eligible: check.eligible,
    orderId: order.id,
    orderNumber: order.orderNumber,
    reasons: check.reasons,
    message: check.message,
    fulfillmentPayload: check.eligible ? buildNormalizedFulfillmentPayload(order) : undefined,
  };
}
