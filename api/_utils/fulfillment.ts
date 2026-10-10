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

export {
  type FulfilmentStage,
  FULFILMENT_STAGE_SEQUENCE,
  FULFILMENT_STAGE_METADATA,
  getOrderFulfilmentStage,
  hasPendingCancellationRequest,
} from '../../src/lib/order-status.js';

import {
  type FulfilmentStage,
  FULFILMENT_STAGE_SEQUENCE,
  FULFILMENT_STAGE_METADATA,
  getOrderFulfilmentStage,
  hasPendingCancellationRequest,
} from '../../src/lib/order-status.js';


export interface AdvanceFulfilmentStageInput {
  orderIdOrNumber: string;
  targetStage?: string;
  adminClerkUserId?: string;
  customPrismaClient?: any;
}

export interface AdvanceFulfilmentStageResult {
  success: boolean;
  status: number;
  order?: any;
  previousStage?: FulfilmentStage;
  currentStage?: FulfilmentStage;
  nextStage?: FulfilmentStage | null;
  message: string;
  error?: string;
}

/**
 * Server-authoritative workflow advancing an order sequentially through the fulfilment lifecycle.
 *
 * Safety Invariants:
 * 1. Enforces strict sequential order (+1 stage only). Rejects skipped or backward transitions.
 * 2. Rejects cancelled or delivered orders.
 * 3. Blocks advancement to pickup or delivery if a customer cancellation request is pending.
 * 4. Preserves payment status, refunds, and inventory completely.
 * 5. Does not trigger external shipping calls (Shiprocket) merely from stage advancement.
 */
export async function advanceOrderFulfilmentStageWorkflow(
  input: AdvanceFulfilmentStageInput
): Promise<AdvanceFulfilmentStageResult> {
  const { orderIdOrNumber, targetStage, adminClerkUserId, customPrismaClient } = input;
  const db = customPrismaClient || (input as any).dbClient || prisma;

  if (!orderIdOrNumber || typeof orderIdOrNumber !== 'string') {
    return {
      success: false,
      status: 400,
      message: 'A valid order ID or order number is required.',
      error: 'INVALID_IDENTIFIER',
    };
  }

  const trimmed = orderIdOrNumber.trim();
  const isOrderNumber = trimmed.startsWith('ORD-');
  const whereClause: any = isOrderNumber ? { orderNumber: trimmed } : { id: trimmed };

  const existingOrder: any = await withTimeout(
    db.order.findFirst({
      where: whereClause,
      include: { items: true, user: true },
    }),
    DEFAULT_DB_TIMEOUT_MS,
    'AdvanceFulfilment.findFirst'
  );

  if (!existingOrder) {
    return {
      success: false,
      status: 404,
      message: `Order "${trimmed}" was not found.`,
      error: 'ORDER_NOT_FOUND',
    };
  }

  // 1. Terminal State Checks
  if (existingOrder.status === 'CANCELLED' || existingOrder.shippingStatus === 'CANCELLED') {
    return {
      success: false,
      status: 400,
      order: existingOrder,
      message: `Order #${existingOrder.orderNumber} is cancelled and cannot advance through fulfilment stages.`,
      error: 'ORDER_CANCELLED',
    };
  }

  if (existingOrder.status === 'DELIVERED' || existingOrder.shippingStatus === 'DELIVERED') {
    return {
      success: false,
      status: 400,
      order: existingOrder,
      message: `Order #${existingOrder.orderNumber} is already delivered and has reached its terminal fulfilment stage.`,
      error: 'ALREADY_DELIVERED',
    };
  }

  // 2. Payment Prerequisites for Online Orders
  const isCod = (existingOrder.paymentProvider || '').toUpperCase() === 'COD';
  if (!isCod && existingOrder.paymentStatus !== 'PAID') {
    return {
      success: false,
      status: 400,
      order: existingOrder,
      message: `Online orders must have completed payment (PAID) prior to advancing past review. Current payment status is "${existingOrder.paymentStatus}".`,
      error: 'PAYMENT_NOT_COMPLETED',
    };
  }

  // 3. Determine Current and Next Permitted Stage
  const currentStage = getOrderFulfilmentStage(existingOrder);
  if (!currentStage) {
    return {
      success: false,
      status: 400,
      order: existingOrder,
      message: 'Could not determine valid active fulfilment stage for this order.',
      error: 'INVALID_CURRENT_STAGE',
    };
  }

  const currentMeta = FULFILMENT_STAGE_METADATA[currentStage];
  const nextStage = currentMeta.nextStage;

  if (!nextStage) {
    return {
      success: false,
      status: 400,
      order: existingOrder,
      currentStage,
      message: `Order is in stage "${currentStage}" with no further valid forward transitions.`,
      error: 'NO_NEXT_STAGE',
    };
  }

  // If client passed a specific targetStage, validate that it matches exactly the next sequential stage
  if (targetStage && typeof targetStage === 'string') {
    const requested = targetStage.trim().toUpperCase();
    if (requested !== nextStage) {
      // Check if backward
      const currentIndex = FULFILMENT_STAGE_SEQUENCE.indexOf(currentStage);
      const requestedIndex = FULFILMENT_STAGE_SEQUENCE.indexOf(requested as FulfilmentStage);

      if (requestedIndex !== -1 && requestedIndex < currentIndex) {
        return {
          success: false,
          status: 400,
          order: existingOrder,
          currentStage,
          nextStage,
          message: `Backward transitions are disallowed. Cannot transition from "${currentStage}" back to "${requested}".`,
          error: 'BACKWARD_TRANSITION_DISALLOWED',
        };
      }

      return {
        success: false,
        status: 400,
        order: existingOrder,
        currentStage,
        nextStage,
        message: `Skipped transitions are disallowed. Cannot transition directly from "${currentStage}" to "${requested}". The only permitted next stage is "${nextStage}".`,
        error: 'INVALID_TRANSITION',
      };
    }
  }

  // 4. Pending Cancellation Request Protection (Requirement R4)
  // If a customer cancellation request is pending, block advancement to pickup or later stages
  if (hasPendingCancellationRequest(existingOrder)) {
    const pickupOrLater: FulfilmentStage[] = ['PICKUP_BY_DELIVERY_PARTNER', 'OUT_FOR_DELIVERY', 'DELIVERED'];
    if (pickupOrLater.includes(nextStage)) {
      return {
        success: false,
        status: 409,
        order: existingOrder,
        currentStage,
        nextStage,
        message: `Cannot advance order to "${FULFILMENT_STAGE_METADATA[nextStage].label}": a customer cancellation request is pending resolution. Please resolve the cancellation request first.`,
        error: 'PENDING_CANCELLATION_REQUEST',
      };
    }
  }

  // 5. Execute Stage Advancement Update
  const nextMeta = FULFILMENT_STAGE_METADATA[nextStage];
  const updateData: any = {
    status: nextMeta.targetOrderStatus,
    shippingStatus: nextMeta.targetShippingStatus,
  };

  const now = new Date();
  if (nextMeta.targetShippingStatus === 'SHIPPED' && !existingOrder.shippedAt) {
    updateData.shippedAt = now;
  }
  if (nextMeta.targetShippingStatus === 'DELIVERED' && !existingOrder.deliveredAt) {
    updateData.deliveredAt = now;
  }

  // Audit trail note
  const auditEntry = `Fulfilment: advanced to ${nextStage} on ${now.toISOString().split('T')[0]}${adminClerkUserId ? ` by ${adminClerkUserId}` : ''}`;
  updateData.adminNotes = existingOrder.adminNotes
    ? `${existingOrder.adminNotes} | ${auditEntry}`.slice(0, 2000)
    : auditEntry;

  // Atomic conditional check when advancing to pickup or beyond to guard against concurrent cancellation requests
  const pickupOrLaterStages: FulfilmentStage[] = ['PICKUP_BY_DELIVERY_PARTNER', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  if (typeof db.order?.updateMany === 'function' && pickupOrLaterStages.includes(nextStage)) {
    const atomicAdvancement: any = await withTimeout(
      db.order.updateMany({
        where: {
          id: existingOrder.id,
          status: { notIn: ['CANCELLED'] },
          NOT: {
            cancelReason: { startsWith: 'Customer requested cancellation' },
          },
        },
        data: updateData,
      }),
      DEFAULT_DB_TIMEOUT_MS,
      'AdvanceFulfilment.updateMany'
    );

    if (atomicAdvancement?.count === 0) {
      const freshOrder: any = typeof db.order?.findUnique === 'function'
        ? await withTimeout(
            db.order.findUnique({
              where: { id: existingOrder.id },
              include: { items: true, user: true },
            }),
            DEFAULT_DB_TIMEOUT_MS,
            'AdvanceFulfilment.findUniqueConflict'
          )
        : await withTimeout(
            db.order.findFirst({
              where: { id: existingOrder.id },
              include: { items: true, user: true },
            }),
            DEFAULT_DB_TIMEOUT_MS,
            'AdvanceFulfilment.findFirstConflict'
          );

      if (freshOrder && hasPendingCancellationRequest(freshOrder)) {
        return {
          success: false,
          status: 409,
          order: freshOrder,
          currentStage,
          nextStage,
          message: `Cannot advance order to "${FULFILMENT_STAGE_METADATA[nextStage].label}": a customer cancellation request is pending resolution. Please resolve the cancellation request first.`,
          error: 'PENDING_CANCELLATION_REQUEST',
        };
      }

      return {
        success: false,
        status: 409,
        order: freshOrder || existingOrder,
        currentStage,
        nextStage,
        message: 'Order status changed concurrently and could not be advanced.',
        error: 'CONCURRENT_MODIFICATION',
      };
    }
  }

  const updatedOrder = await withTimeout(
    db.order.update({
      where: { id: existingOrder.id },
      data: updateData,
      include: { items: true, user: true },
    }),
    DEFAULT_DB_TIMEOUT_MS,
    'AdvanceFulfilment.update'
  );

  const updatedCurrentStage = getOrderFulfilmentStage(updatedOrder as any) || nextStage;
  const futureNextStage = FULFILMENT_STAGE_METADATA[updatedCurrentStage]?.nextStage || null;

  return {
    success: true,
    status: 200,
    order: updatedOrder,
    previousStage: currentStage,
    currentStage: updatedCurrentStage,
    nextStage: futureNextStage,
    message: `Order #${existingOrder.orderNumber} successfully advanced to ${nextMeta.label}.`,
  };
}
