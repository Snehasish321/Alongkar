import prisma from '../../src/lib/prisma.js';
import {
  withTimeout,
  DEFAULT_DB_TIMEOUT_MS,
  isValidIdentifier,
  getSafeErrorMessage,
  logServerError,
  logEvent,
} from './security.js';
import {
  restoreOrderInventoryTx,
  invalidateRestoredProductsCache,
  type AggregatedOrderItem,
} from './inventory.js';
import { getRazorpayClient, rupeesToPaise } from './razorpay.js';
import { hasPendingCancellationRequest, isOrderCancellationEligible } from '../../src/lib/order-status.js';

export interface CancelAdminOrderInput {
  orderIdOrNumber: string;
  cancelReason?: string;
  adminClerkUserId?: string;
  customPrismaClient?: any;
  customRazorpayClient?: any;
}

export interface CancelAdminOrderResult {
  success: boolean;
  status: number;
  order?: any;
  inventoryRestored: boolean;
  restoredItems: AggregatedOrderItem[];
  refundStatus: 'NOT_APPLICABLE' | 'REFUNDED' | 'REFUND_FAILED' | 'PENDING_RETRY';
  refundId?: string;
  message: string;
  error?: string;
}

export interface RetryAdminRefundInput {
  orderIdOrNumber: string;
  adminClerkUserId?: string;
  customPrismaClient?: any;
  customRazorpayClient?: any;
}

export interface RetryAdminRefundResult {
  success: boolean;
  status: number;
  order?: any;
  refundStatus: 'REFUNDED' | 'REFUND_FAILED' | 'ALREADY_REFUNDED' | 'NOT_APPLICABLE' | 'PENDING_RETRY';
  refundId?: string;
  message: string;
  error?: string;
}

/**
 * Strictly verifies whether a candidate Razorpay refund matches the expected
 * full cancellation refund for an Alongkar order.
 *
 * Safety rules:
 * 1. Must be a valid non-null object.
 * 2. Gateway status must be 'processed', 'created', or 'success'.
 * 3. Exact deterministic receipt `ref_${order.orderNumber}` is REQUIRED.
 *    - Missing, null, empty, or non-string receipt is rejected.
 *    - Different receipt is rejected.
 * 4. Exact payable amount in paise is REQUIRED.
 *    - Amount alone is NEVER sufficient.
 *    - An unrelated partial refund or mismatched amount is rejected.
 * 5. If refund notes contain orderId or orderNumber, they must not contradict the expected order.
 * 6. Malformed or non-numeric amounts are safely rejected.
 */
export function isMatchingCancellationRefund(
  candidate: any,
  order: { id: string; orderNumber: string },
  expectedPaiseAmount: number,
  allowedStatuses: string[] = ['processed', 'created', 'success']
): boolean {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  if (!order || typeof order !== 'object' || typeof order.orderNumber !== 'string' || typeof order.id !== 'string') {
    return false;
  }

  const expectedOrderNumber = order.orderNumber.trim();
  const expectedOrderId = order.id.trim();
  if (!expectedOrderNumber || !expectedOrderId) {
    return false;
  }

  // 1. Status verification: allowed states
  const rawStatus = candidate.status;
  if (typeof rawStatus !== 'string') {
    return false;
  }
  const status = rawStatus.trim().toLowerCase();
  if (!allowedStatuses.includes(status)) {
    return false;
  }

  // 2. Receipt verification: exact deterministic receipt is mandatory
  if (typeof candidate.receipt !== 'string') {
    return false;
  }
  const candidateReceipt = candidate.receipt.trim();
  const expectedReceipt = `ref_${expectedOrderNumber}`;
  if (!candidateReceipt || candidateReceipt !== expectedReceipt) {
    return false;
  }

  // 3. Amount verification: exact paise match is mandatory
  const rawAmount = candidate.amount;
  const candidateAmount = typeof rawAmount === 'number' ? rawAmount : Number(rawAmount);
  if (!Number.isFinite(candidateAmount) || candidateAmount <= 0) {
    return false;
  }
  if (candidateAmount !== expectedPaiseAmount) {
    return false;
  }

  // 4. Notes validation: reject if notes explicitly contradict orderId or orderNumber
  if (candidate.notes && typeof candidate.notes === 'object') {
    const noteOrderId = candidate.notes.orderId;
    if (typeof noteOrderId === 'string' && noteOrderId.trim() && noteOrderId.trim() !== expectedOrderId) {
      return false;
    }
    const noteOrderNumber = candidate.notes.orderNumber;
    if (typeof noteOrderNumber === 'string' && noteOrderNumber.trim() && noteOrderNumber.trim() !== expectedOrderNumber) {
      return false;
    }
  }

  return true;
}

export const REFUND_CLAIM_PREFIX = 'REFUND_CLAIM:';
export const REFUND_CLAIM_TIMEOUT_MS = 60000; // 60 seconds

export interface RefundClaimInfo {
  hasClaim: boolean;
  claimId?: string;
  timestamp?: number;
  isExpired: boolean;
}

export function parseRefundClaim(sessionId: string | null | undefined): RefundClaimInfo {
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith(REFUND_CLAIM_PREFIX)) {
    return { hasClaim: false, isExpired: true };
  }
  const parts = sessionId.split(':');
  if (parts.length < 3) {
    return { hasClaim: false, isExpired: true };
  }
  const claimId = parts[1];
  const timestamp = Number(parts[2]);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return { hasClaim: true, claimId, isExpired: true };
  }
  const isExpired = Date.now() - timestamp > REFUND_CLAIM_TIMEOUT_MS;
  return { hasClaim: true, claimId, timestamp, isExpired };
}

export interface ProcessRazorpayRefundResult {
  success: boolean;
  refundId?: string;
  order?: any;
  error?: string;
  isAlreadyRefunded?: boolean;
  isInProgress?: boolean;
  isUnresolved?: boolean;
}

/**
 * Idempotent Razorpay Refund Processor with Database-Backed Atomic Coordination.
 *
 * Safety Guarantees:
 * 1. Checks gateway for existing refunds for the given payment ID before dispatching a new refund.
 * 2. Uses unique `receipt` parameter (`ref_${order.orderNumber}`) and strict matching (isMatchingCancellationRefund).
 * 3. Uses atomic conditional database update on `paymentSessionId` to acquire exclusive row claim across serverless instances.
 * 4. Concurrent duplicate requests are rejected immediately with `isInProgress: true` (HTTP 409).
 * 5. Timeouts / network uncertainties retain the claim token and mark outcome uncertain to prevent premature second dispatch.
 * 6. Interrupted or stale claims (>60s) reconcile with Razorpay pre-check before allowing any new dispatch.
 * 7. Executes strictly outside any ACID inventory database transaction.
 */
export async function processIdempotentRazorpayRefund(options: {
  db: any;
  order: any;
  cancelReason?: string;
  customRazorpayClient?: any;
}): Promise<ProcessRazorpayRefundResult> {
  const { db, order, cancelReason, customRazorpayClient } = options;

  if (!order || !order.id) {
    return {
      success: false,
      error: 'A valid order record with id is required.',
    };
  }

  if (!order.paymentTransactionId) {
    return {
      success: false,
      error: 'Order does not have a valid paymentTransactionId to refund.',
    };
  }

  // 1. Fetch fresh order from database to inspect current paymentStatus and paymentSessionId
  let freshOrder: any;
  try {
    freshOrder = await withTimeout(
      db.order.findUnique({
        where: { id: order.id },
        include: { items: true, user: true },
      }),
      DEFAULT_DB_TIMEOUT_MS,
      'RazorpayRefund.fetchFreshOrder'
    );
  } catch (dbErr: any) {
    logServerError('Failed to fetch fresh order for refund processing', dbErr, {
      extra: { orderId: order.id },
    });
    return {
      success: false,
      error: 'Database error reading order status for refund.',
    };
  }

  if (!freshOrder) {
    return {
      success: false,
      error: 'Order was not found in database.',
    };
  }

  if (freshOrder.paymentStatus === 'REFUNDED') {
    return {
      success: true,
      order: freshOrder,
      isAlreadyRefunded: true,
    };
  }

  // 2. Check for active in-flight refund claim on paymentSessionId
  const currentClaimInfo = parseRefundClaim(freshOrder.paymentSessionId);
  if (currentClaimInfo.hasClaim && !currentClaimInfo.isExpired) {
    // Another concurrent serverless request is actively processing this refund
    return {
      success: false,
      isInProgress: true,
      error: 'A refund operation is currently in progress for this order. Please wait for it to complete.',
      order: freshOrder,
    };
  }

  const rzp = customRazorpayClient || getRazorpayClient();
  const paiseAmount = rupeesToPaise(freshOrder.grandTotal);
  let refundId: string | undefined;

  // 3. Pre-Check Gateway: Query existing refunds for this payment ID to avoid double-refunding.
  // Also used to recover from stale interrupted claims (>60s) where gateway outcome was unknown.
  let existingRefunds: any[] = [];
  let fetchSucceeded = false;
  try {
    const refundsResponse: any = await withTimeout(
      rzp.payments.fetchMultipleRefund(freshOrder.paymentTransactionId),
      DEFAULT_DB_TIMEOUT_MS,
      'razorpay_fetch_multiple_refund'
    );
    if (Array.isArray(refundsResponse?.items)) {
      existingRefunds = refundsResponse.items;
    } else if (Array.isArray(refundsResponse)) {
      existingRefunds = refundsResponse;
    }
    fetchSucceeded = true;
  } catch (checkErr: any) {
    logEvent('WARN', {
      endpoint: '/api/admin/orders',
      operation: 'razorpay_refund_precheck_skipped',
      category: 'refund',
      message: `Could not pre-fetch refunds for payment ${freshOrder.paymentTransactionId}: ${getSafeErrorMessage(checkErr)}`,
    });
  }

  // If a stale claim existed but gateway pre-check could NOT be reached, we cannot safely know
  // if Razorpay processed the earlier refund or not. Retain unresolved state.
  if (currentClaimInfo.hasClaim && !fetchSucceeded) {
    return {
      success: false,
      isUnresolved: true,
      error: 'A previous refund operation could not be verified with the payment gateway due to network error. Please retry after gateway connectivity is restored.',
      order: freshOrder,
    };
  }

  // Strict matching against existing refunds on the payment
  const matchingRefund = existingRefunds.find((r: any) =>
    isMatchingCancellationRefund(r, freshOrder, paiseAmount)
  );

  if (matchingRefund) {
    refundId = String(matchingRefund.id);
    const finalNotes = freshOrder.adminNotes
      ? `${freshOrder.adminNotes} | Razorpay Refund Verified: ${refundId}`
      : `Razorpay Refund Verified: ${refundId}`;

    const fullyRefundedOrder = await withTimeout(
      db.order.update({
        where: { id: freshOrder.id },
        data: {
          paymentStatus: 'REFUNDED',
          paymentSessionId: null, // Clear refund claim
          adminNotes: finalNotes.slice(0, 2000),
          paymentFailureReason: null,
        },
        include: { items: true, user: true },
      }),
      DEFAULT_DB_TIMEOUT_MS,
      'RazorpayRefund.updateVerified'
    );

    return {
      success: true,
      refundId,
      order: fullyRefundedOrder,
      isAlreadyRefunded: true,
    };
  }

  // 4. Atomic Database Claim Acquisition:
  // Use updateMany with conditional matching on current paymentSessionId & paymentStatus = 'PAID'.
  // PostgreSQL applies an exclusive row-level lock; only exactly ONE concurrent caller will obtain count === 1.
  const claimId = `claim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const claimToken = `${REFUND_CLAIM_PREFIX}${claimId}:${Date.now()}`;

  const claimWhere: any = {
    id: freshOrder.id,
    paymentStatus: 'PAID',
    paymentSessionId: freshOrder.paymentSessionId ?? null,
  };

  let claimResult: any;
  try {
    claimResult = await withTimeout(
      db.order.updateMany({
        where: claimWhere,
        data: {
          paymentSessionId: claimToken,
        },
      }),
      DEFAULT_DB_TIMEOUT_MS,
      'RazorpayRefund.acquireClaim'
    );
  } catch (claimErr: any) {
    logServerError('Failed to execute atomic claim update for refund', claimErr, {
      extra: { orderId: freshOrder.id },
    });
    return {
      success: false,
      error: 'Failed to acquire refund claim lock in database.',
    };
  }

  if (!claimResult || claimResult.count === 0) {
    // Another concurrent request acquired the claim between our check and update!
    return {
      success: false,
      isInProgress: true,
      error: 'A refund operation was just claimed by a concurrent request. Please wait.',
      order: freshOrder,
    };
  }

  // 5. Dispatch new refund to Razorpay with durable deterministic receipt
  try {
    const refundResponse: any = await withTimeout(
      rzp.payments.refund(freshOrder.paymentTransactionId, {
        amount: paiseAmount,
        receipt: `ref_${freshOrder.orderNumber}`,
        notes: {
          orderId: freshOrder.id,
          orderNumber: freshOrder.orderNumber,
          reason: cancelReason || 'Cancelled by administrator',
        },
      }),
      15000,
      'razorpay_payment_refund'
    );

    refundId = refundResponse?.id ? String(refundResponse.id) : undefined;

    const finalNotes = freshOrder.adminNotes
      ? `${freshOrder.adminNotes} | Razorpay Refund Initiated: ${refundId || 'SUCCESS'}`
      : `Razorpay Refund Initiated: ${refundId || 'SUCCESS'}`;

    const fullyRefundedOrder = await withTimeout(
      db.order.update({
        where: { id: freshOrder.id },
        data: {
          paymentStatus: 'REFUNDED',
          paymentSessionId: null, // Clear refund claim
          adminNotes: finalNotes.slice(0, 2000),
          paymentFailureReason: null,
        },
        include: { items: true, user: true },
      }),
      DEFAULT_DB_TIMEOUT_MS,
      'RazorpayRefund.updateSuccess'
    );

    return {
      success: true,
      refundId,
      order: fullyRefundedOrder,
      isAlreadyRefunded: false,
    };
  } catch (refundErr: any) {
    const errMsg = getSafeErrorMessage(refundErr, 'Failed to process Razorpay refund.');
    logServerError('Razorpay refund dispatch failed', refundErr, {
      extra: {
        orderId: freshOrder.id,
        orderNumber: freshOrder.orderNumber,
        paymentTransactionId: freshOrder.paymentTransactionId,
      },
    });

    const isTimeoutOrNetwork =
      errMsg.toLowerCase().includes('time') ||
      errMsg.toLowerCase().includes('timeout') ||
      errMsg.toLowerCase().includes('network') ||
      errMsg.toLowerCase().includes('abort') ||
      errMsg.toLowerCase().includes('econnreset') ||
      errMsg.toLowerCase().includes('fetch failed');

    // If timeout or network uncertainty: RETAIN claimToken in paymentSessionId
    // so immediate concurrent retries are blocked until gateway status can be safely reconciled.
    // If definitive provider rejection: release claimToken so admin can retry after correcting issues.
    const updatedSessionId = isTimeoutOrNetwork ? claimToken : null;
    const failureReason = isTimeoutOrNetwork
      ? `Refund in-progress / timeout (outcome uncertain): ${errMsg}`
      : `Refund failed: ${errMsg}`;

    let errorRecordedOrder: any;
    try {
      errorRecordedOrder = await withTimeout(
        db.order.update({
          where: { id: freshOrder.id },
          data: {
            paymentSessionId: updatedSessionId,
            paymentFailureReason: failureReason.slice(0, 500),
          },
          include: { items: true, user: true },
        }),
        DEFAULT_DB_TIMEOUT_MS,
        'RazorpayRefund.updateFailure'
      );
    } catch {
      // If DB update fails, freshOrder will still reflect the in-flight state
      errorRecordedOrder = freshOrder;
    }

    return {
      success: false,
      isUnresolved: isTimeoutOrNetwork,
      error: errMsg,
      order: errorRecordedOrder,
    };
  }
}

/**
 * Server-authoritative admin order cancellation workflow.
 *
 * Guarantees:
 * 1. Strict state machine validation: rejects DELIVERED, SHIPPED/IN_TRANSIT, or already CANCELLED orders.
 * 2. Atomic DB transaction: order status update + InventoryMovement restoration committed together.
 * 3. Durable idempotency: concurrent cancellations safely serialize; duplicate stock restoration is prevented.
 * 4. Safe legacy order handling: orders without deduction ledger records do NOT trigger phantom inventory restock.
 * 5. Redis cache invalidation occurs strictly post-commit.
 * 6. External Razorpay refund executes outside DB transaction with failure recording and idempotent retry safety.
 */
export async function cancelAdminOrderWorkflow(
  input: CancelAdminOrderInput
): Promise<CancelAdminOrderResult> {
  const { orderIdOrNumber, cancelReason, adminClerkUserId, customPrismaClient, customRazorpayClient } = input;
  const db = customPrismaClient || prisma;

  if (!orderIdOrNumber || typeof orderIdOrNumber !== 'string') {
    return {
      success: false,
      status: 400,
      inventoryRestored: false,
      restoredItems: [],
      refundStatus: 'NOT_APPLICABLE',
      message: 'A valid order ID or order number is required for cancellation.',
      error: 'INVALID_IDENTIFIER',
    };
  }

  const trimmedId = orderIdOrNumber.trim();
  const isIdLookup = isValidIdentifier(trimmedId);
  const whereClause: any = isIdLookup ? { id: trimmedId } : { orderNumber: trimmedId };

  // 1. Initial lookup and pre-flight validation
  const existingOrder: any = await withTimeout(
    db.order.findFirst({
      where: whereClause,
      include: { items: true, user: true },
    }),
    DEFAULT_DB_TIMEOUT_MS,
    'CancelAdminOrder.findFirst'
  );

  if (!existingOrder) {
    return {
      success: false,
      status: 404,
      inventoryRestored: false,
      restoredItems: [],
      refundStatus: 'NOT_APPLICABLE',
      message: `Order "${trimmedId}" was not found.`,
      error: 'ORDER_NOT_FOUND',
    };
  }

  // 2. State machine eligibility checks
  if (existingOrder.status === 'CANCELLED') {
    // If order was already cancelled, check if this is a prepaid order needing refund recovery
    const isPaidPrepaid =
      (existingOrder.paymentProvider || '').toUpperCase() !== 'COD' &&
      existingOrder.paymentStatus === 'PAID' &&
      !!existingOrder.paymentTransactionId;

    if (isPaidPrepaid) {
      return {
        success: false,
        status: 409,
        order: existingOrder,
        inventoryRestored: false,
        restoredItems: [],
        refundStatus: 'PENDING_RETRY',
        message: `Order #${existingOrder.orderNumber} is already cancelled, but payment refund is pending. Use the "Retry Refund" action to process the refund safely without modifying inventory.`,
        error: 'ALREADY_CANCELLED_REFUND_PENDING',
      };
    }

    return {
      success: false,
      status: 409,
      order: existingOrder,
      inventoryRestored: false,
      restoredItems: [],
      refundStatus: 'NOT_APPLICABLE',
      message: `Order #${existingOrder.orderNumber} is already cancelled.`,
      error: 'ALREADY_CANCELLED',
    };
  }

  if (existingOrder.status === 'DELIVERED' || existingOrder.shippingStatus === 'DELIVERED') {
    return {
      success: false,
      status: 400,
      inventoryRestored: false,
      restoredItems: [],
      refundStatus: 'NOT_APPLICABLE',
      message: `Order #${existingOrder.orderNumber} has already been delivered to the customer and cannot be cancelled.`,
      error: 'CANNOT_CANCEL_DELIVERED',
    };
  }

  const inTransitShippingStatuses = ['SHIPPED', 'IN_TRANSIT'];
  if (inTransitShippingStatuses.includes(existingOrder.shippingStatus) || existingOrder.status === 'SHIPPED') {
    return {
      success: false,
      status: 400,
      inventoryRestored: false,
      restoredItems: [],
      refundStatus: 'NOT_APPLICABLE',
      message: `Order #${existingOrder.orderNumber} is already in transit or dispatched with the carrier (${existingOrder.shippingStatus}) and cannot be automatically cancelled.`,
      error: 'CANNOT_CANCEL_SHIPPED',
    };
  }

  if (existingOrder.paymentStatus === 'REFUNDED') {
    return {
      success: false,
      status: 400,
      inventoryRestored: false,
      restoredItems: [],
      refundStatus: 'NOT_APPLICABLE',
      message: `Order #${existingOrder.orderNumber} has already been refunded.`,
      error: 'ALREADY_REFUNDED',
    };
  }

  // 3. PostgreSQL Transaction: Atomically restore inventory and transition order state
  let txResult: {
    updatedOrder: any;
    restoredItems: AggregatedOrderItem[];
    inventoryRestored: boolean;
    isPaidPrepaid: boolean;
  };

  try {
    txResult = await withTimeout(
      db.$transaction(
        async (tx: any) => {
          const freshOrder = await tx.order.findUnique({
            where: { id: existingOrder.id },
            include: { items: true, user: true },
          });

          if (!freshOrder) {
            throw new Error('ORDER_NOT_FOUND');
          }

          // Concurrency re-check inside transaction
          if (freshOrder.status === 'CANCELLED') {
            throw new Error('ALREADY_CANCELLED');
          }

          let restoredItems: AggregatedOrderItem[] = [];
          let inventoryRestored = false;
          let inventoryNote = '';

          // Only attempt inventory restoration if order was confirmed, processing, or paid
          const shouldAttemptRestoration =
            freshOrder.status === 'CONFIRMED' ||
            freshOrder.status === 'PROCESSING' ||
            freshOrder.paymentStatus === 'PAID';

          if (shouldAttemptRestoration) {
            const restorationResult = await restoreOrderInventoryTx(tx, freshOrder.id, {
              reason: cancelReason || 'order_cancelled_by_admin',
              clerkUserId: adminClerkUserId,
              type: 'RESTORATION_CANCELLATION',
            });

            if (restorationResult.success) {
              inventoryRestored = true;
              restoredItems = restorationResult.restoredItems;
              const totalRestoredQty = restoredItems.reduce((sum, it) => sum + it.quantity, 0);
              inventoryNote = `Inventory restored (${totalRestoredQty} pcs)`;
            } else if (restorationResult.reason === 'NO_INVENTORY_DEDUCTED') {
              inventoryNote = '[Legacy Order: No durable deduction records found; inventory was not modified]';
            } else if (restorationResult.reason === 'ALREADY_RESTORED') {
              throw new Error('ALREADY_RESTORED');
            } else {
              throw new Error(`INVENTORY_RESTORATION_FAILED:${restorationResult.error}`);
            }
          }

          const now = new Date();
          const auditParts = [
            `Cancelled by admin${adminClerkUserId ? ` (${adminClerkUserId})` : ''} on ${now.toISOString().split('T')[0]}`,
          ];
          if (cancelReason) auditParts.push(`Reason: ${cancelReason}`);
          if (inventoryNote) auditParts.push(inventoryNote);

          const auditStr = auditParts.join(' | ');
          const currentNotes = freshOrder.adminNotes || '';
          const updatedAdminNotes = currentNotes ? `${currentNotes} | ${auditStr}` : auditStr;

          const isCod = (freshOrder.paymentProvider || '').toUpperCase() === 'COD';
          const isPaidPrepaid = !isCod && freshOrder.paymentStatus === 'PAID';

          const updateData: any = {
            status: 'CANCELLED',
            shippingStatus: 'CANCELLED',
            cancelledAt: now,
            cancelReason: cancelReason || 'Cancelled by administrator',
            adminNotes: updatedAdminNotes.slice(0, 2000),
          };

          // For COD or unpaid orders, payment transitions immediately to CANCELLED
          if (isCod || !isPaidPrepaid) {
            updateData.paymentStatus = 'CANCELLED';
          }

          const updatedOrder = await tx.order.update({
            where: { id: freshOrder.id },
            data: updateData,
            include: { items: true, user: true },
          });

          return {
            updatedOrder,
            restoredItems,
            inventoryRestored,
            isPaidPrepaid,
          };
        },
        {
          maxWait: 5000,
          timeout: 15000,
        }
      ),
      DEFAULT_DB_TIMEOUT_MS + 5000,
      'cancel_admin_order_tx'
    );
  } catch (err: any) {
    const rawMsg = String(err?.message || '');
    if (
      rawMsg.includes('ALREADY_CANCELLED') ||
      rawMsg.includes('idempotencyKey') ||
      rawMsg.includes('unique constraint') ||
      rawMsg.includes('P2002') ||
      rawMsg.includes('ALREADY_RESTORED')
    ) {
      return {
        success: false,
        status: 409,
        inventoryRestored: false,
        restoredItems: [],
        refundStatus: 'NOT_APPLICABLE',
        message: `Order #${existingOrder.orderNumber} is already cancelled or restored.`,
        error: 'ALREADY_CANCELLED',
      };
    }

    logServerError('Failed to cancel order in database transaction', err, {
      extra: {
        orderId: existingOrder.id,
        orderNumber: existingOrder.orderNumber,
      },
    });

    return {
      success: false,
      status: 500,
      inventoryRestored: false,
      restoredItems: [],
      refundStatus: 'NOT_APPLICABLE',
      message: `Failed to cancel order: ${getSafeErrorMessage(err)}`,
      error: 'TRANSACTION_FAILED',
    };
  }

  const { updatedOrder, restoredItems, inventoryRestored, isPaidPrepaid } = txResult;

  // 4. Post-Commit: Invalidate Redis caches for restored products
  if (restoredItems.length > 0) {
    invalidateRestoredProductsCache(restoredItems).catch(() => {});
  }

  // 5. External Razorpay Refund step (executed safely outside DB transaction)
  if (isPaidPrepaid && updatedOrder.paymentTransactionId) {
    const refundResult = await processIdempotentRazorpayRefund({
      db,
      order: updatedOrder,
      cancelReason,
      customRazorpayClient,
    });

    if (refundResult.success) {
      const finalOrder = refundResult.order || updatedOrder;
      logEvent('INFO', {
        endpoint: '/api/admin/orders',
        operation: 'order_cancelled_and_refunded',
        category: 'cancellation',
        extra: {
          orderId: finalOrder.id,
          orderNumber: finalOrder.orderNumber,
          refundId: refundResult.refundId,
          grandTotal: finalOrder.grandTotal,
        },
        message: `Order #${finalOrder.orderNumber} successfully cancelled, inventory restored, and refunded via Razorpay.`,
      });

      return {
        success: true,
        status: 200,
        order: finalOrder,
        inventoryRestored,
        restoredItems,
        refundStatus: 'REFUNDED',
        refundId: refundResult.refundId,
        message: `Order #${finalOrder.orderNumber} successfully cancelled, ${inventoryRestored ? 'inventory restored, ' : ''}and payment of ₹${Number(finalOrder.grandTotal).toLocaleString('en-IN')} refunded to customer.`,
      };
    } else {
      const refundStatus =
        refundResult.isInProgress || refundResult.isUnresolved
          ? 'PENDING_RETRY'
          : 'REFUND_FAILED';

      return {
        success: true,
        status: 200,
        order: refundResult.order || updatedOrder,
        inventoryRestored,
        restoredItems,
        refundStatus,
        message: `Order #${updatedOrder.orderNumber} was cancelled and inventory restored, but automatic payment refund could not be completed (${refundResult.error}). Please review and retry the refund.`,
      };
    }
  }

  // Non-prepaid or COD order completion
  logEvent('INFO', {
    endpoint: '/api/admin/orders',
    operation: 'order_cancelled',
    category: 'cancellation',
    extra: {
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.orderNumber,
      paymentProvider: updatedOrder.paymentProvider,
      inventoryRestored,
    },
    message: `Order #${updatedOrder.orderNumber} successfully cancelled by admin.`,
  });

  return {
    success: true,
    status: 200,
    order: updatedOrder,
    inventoryRestored,
    restoredItems,
    refundStatus: 'NOT_APPLICABLE',
    message: `Order #${updatedOrder.orderNumber} successfully cancelled.${inventoryRestored ? ' Inventory has been restored.' : ''}`,
  };
}

/**
 * Server-authoritative Admin Refund Recovery / Retry Workflow.
 *
 * Allows administrators to safely retry a failed or timed-out refund for an already-cancelled
 * prepaid order WITHOUT modifying or duplicate-restoring inventory.
 */
export async function retryAdminOrderRefundWorkflow(
  input: RetryAdminRefundInput
): Promise<RetryAdminRefundResult> {
  const { orderIdOrNumber, customPrismaClient, customRazorpayClient } = input;
  const db = customPrismaClient || prisma;

  if (!orderIdOrNumber || typeof orderIdOrNumber !== 'string') {
    return {
      success: false,
      status: 400,
      refundStatus: 'NOT_APPLICABLE',
      message: 'A valid order ID or order number is required.',
      error: 'INVALID_IDENTIFIER',
    };
  }

  const trimmedId = orderIdOrNumber.trim();
  const isIdLookup = isValidIdentifier(trimmedId);
  const whereClause: any = isIdLookup ? { id: trimmedId } : { orderNumber: trimmedId };

  const existingOrder: any = await withTimeout(
    db.order.findFirst({
      where: whereClause,
      include: { items: true, user: true },
    }),
    DEFAULT_DB_TIMEOUT_MS,
    'RetryAdminRefund.findFirst'
  );

  if (!existingOrder) {
    return {
      success: false,
      status: 404,
      refundStatus: 'NOT_APPLICABLE',
      message: `Order "${trimmedId}" was not found.`,
      error: 'ORDER_NOT_FOUND',
    };
  }

  if (existingOrder.paymentStatus === 'REFUNDED') {
    return {
      success: true,
      status: 200,
      order: existingOrder,
      refundStatus: 'ALREADY_REFUNDED',
      message: `Order #${existingOrder.orderNumber} is already marked as REFUNDED.`,
    };
  }

  const isCod = (existingOrder.paymentProvider || '').toUpperCase() === 'COD';
  if (isCod) {
    return {
      success: false,
      status: 400,
      refundStatus: 'NOT_APPLICABLE',
      message: `Order #${existingOrder.orderNumber} was placed using Cash on Delivery (COD) and cannot be refunded electronically.`,
      error: 'COD_NOT_REFUNDABLE',
    };
  }

  if (!existingOrder.paymentTransactionId) {
    return {
      success: false,
      status: 400,
      refundStatus: 'NOT_APPLICABLE',
      message: `Order #${existingOrder.orderNumber} does not have a recorded payment transaction ID.`,
      error: 'MISSING_TRANSACTION_ID',
    };
  }

  // Execute idempotent refund (does NOT touch inventory ledger or stock levels)
  const refundResult = await processIdempotentRazorpayRefund({
    db,
    order: existingOrder,
    cancelReason: existingOrder.cancelReason || 'Admin refund retry',
    customRazorpayClient,
  });

  if (!refundResult.success) {
    if (refundResult.isInProgress) {
      return {
        success: false,
        status: 409,
        order: refundResult.order || existingOrder,
        refundStatus: 'PENDING_RETRY',
        message: refundResult.error || 'A refund operation is currently in progress for this order. Please wait for it to complete.',
        error: 'REFUND_IN_PROGRESS',
      };
    }

    if (refundResult.isUnresolved) {
      return {
        success: false,
        status: 409,
        order: refundResult.order || existingOrder,
        refundStatus: 'PENDING_RETRY',
        message: refundResult.error || 'Refund operation outcome is uncertain. Please retry after verifying with the gateway.',
        error: 'REFUND_UNRESOLVED',
      };
    }

    return {
      success: false,
      status: 502,
      order: refundResult.order || existingOrder,
      refundStatus: 'REFUND_FAILED',
      message: `Failed to issue refund: ${refundResult.error}`,
      error: 'GATEWAY_REFUND_FAILED',
    };
  }

  const finalOrder = refundResult.order || existingOrder;

  return {
    success: true,
    status: 200,
    order: finalOrder,
    refundStatus: 'REFUNDED',
    refundId: refundResult.refundId,
    message: `Payment of ₹${Number(finalOrder.grandTotal).toLocaleString('en-IN')} successfully refunded via Razorpay${refundResult.refundId ? ` (Refund ID: ${refundResult.refundId})` : ''}.`,
  };
}

export type ReconciliationOutcome =
  | 'RECONCILED_PROCESSED'
  | 'CONFIRMED_PROCESSED'
  | 'PENDING_AT_GATEWAY'
  | 'GATEWAY_FAILED'
  | 'NO_GATEWAY_REFUND'
  | 'CONFLICT_NEEDS_REVIEW'
  | 'DISCREPANCY_REVERTED'
  | 'ACTIVE_CLAIM_IN_PROGRESS'
  | 'GATEWAY_UNREACHABLE'
  | 'NOT_APPLICABLE';

export interface ReconcileRefundResult {
  success: boolean;
  status: number;
  outcome: ReconciliationOutcome;
  order?: any;
  refundId?: string | null;
  gatewayStatus?: string | null;
  discrepancyDetected?: boolean;
  message: string;
  error?: string;
}

/**
 * Reconciles an order's local refund status with Razorpay's actual gateway records.
 *
 * Safety Invariants:
 * 1. NEVER dispatches a new refund to Razorpay.
 * 2. NEVER touches inventory or the inventory movement ledger.
 * 3. NEVER clears an active (non-expired <60s) refund claim.
 * 4. Strictly matches using deterministic receipt `ref_${order.orderNumber}` and exact paise amount.
 * 5. Safely reverts a local REFUNDED status to PAID if the gateway definitively reports the refund failed.
 * 6. Marks ambiguous outcomes (network failure, partial refunds, multiple candidates) for admin review.
 */
export async function reconcileOrderRefundWithGateway(params: {
  orderIdOrNumber: string;
  adminClerkUserId?: string;
  customPrismaClient?: any;
  customRazorpayClient?: any;
}): Promise<ReconcileRefundResult> {
  const { orderIdOrNumber, customPrismaClient, customRazorpayClient } = params;
  const db = customPrismaClient || prisma;

  if (!orderIdOrNumber || typeof orderIdOrNumber !== 'string') {
    return {
      success: false,
      status: 400,
      outcome: 'NOT_APPLICABLE',
      message: 'A valid order ID or order number is required.',
      error: 'INVALID_IDENTIFIER',
    };
  }

  const trimmedId = orderIdOrNumber.trim();
  const isIdLookup = isValidIdentifier(trimmedId);
  const whereClause: any = isIdLookup ? { id: trimmedId } : { orderNumber: trimmedId };

  const existingOrder: any = await withTimeout(
    db.order.findFirst({
      where: whereClause,
      include: { items: true, user: true },
    }),
    DEFAULT_DB_TIMEOUT_MS,
    'ReconcileRefund.findFirst'
  );

  if (!existingOrder) {
    return {
      success: false,
      status: 404,
      outcome: 'NOT_APPLICABLE',
      message: `Order "${trimmedId}" was not found.`,
      error: 'ORDER_NOT_FOUND',
    };
  }

  const isCod = (existingOrder.paymentProvider || '').toUpperCase() === 'COD';
  if (isCod) {
    return {
      success: false,
      status: 400,
      outcome: 'NOT_APPLICABLE',
      order: existingOrder,
      message: `Order #${existingOrder.orderNumber} was placed via COD; electronic gateway refunds do not apply.`,
      error: 'COD_NOT_APPLICABLE',
    };
  }

  if (!existingOrder.paymentTransactionId) {
    return {
      success: false,
      status: 400,
      outcome: 'NOT_APPLICABLE',
      order: existingOrder,
      message: `Order #${existingOrder.orderNumber} does not have a recorded payment transaction ID.`,
      error: 'MISSING_TRANSACTION_ID',
    };
  }

  if (existingOrder.status !== 'CANCELLED') {
    return {
      success: false,
      status: 400,
      outcome: 'NOT_APPLICABLE',
      order: existingOrder,
      message: `Order #${existingOrder.orderNumber} is in status "${existingOrder.status}". Only cancelled orders are subject to refund reconciliation.`,
      error: 'ORDER_NOT_CANCELLED',
    };
  }

  // 1. Check for Active (non-expired) Claim Lock
  const claimInfo = parseRefundClaim(existingOrder.paymentSessionId);
  if (claimInfo.hasClaim && !claimInfo.isExpired) {
    return {
      success: false,
      status: 409,
      outcome: 'ACTIVE_CLAIM_IN_PROGRESS',
      order: existingOrder,
      message: 'A refund operation was initiated recently (under 60s ago) and is currently in progress. Please wait before reconciling.',
      error: 'REFUND_IN_PROGRESS',
    };
  }

  // 2. Query Razorpay Gateway (READ-ONLY)
  const rzp = customRazorpayClient || getRazorpayClient();
  let existingRefunds: any[] = [];
  try {
    const refundsResponse: any = await withTimeout(
      rzp.payments.fetchMultipleRefund(existingOrder.paymentTransactionId),
      DEFAULT_DB_TIMEOUT_MS,
      'razorpay_fetch_multiple_refund'
    );
    if (Array.isArray(refundsResponse?.items)) {
      existingRefunds = refundsResponse.items;
    } else if (Array.isArray(refundsResponse)) {
      existingRefunds = refundsResponse;
    }
  } catch (fetchErr: any) {
    const errorMsg = getSafeErrorMessage(fetchErr, 'Failed to query Razorpay refunds');
    logServerError('Razorpay fetchMultipleRefund failed during reconciliation', fetchErr, {
      extra: { orderId: existingOrder.id, paymentTransactionId: existingOrder.paymentTransactionId },
    });
    return {
      success: false,
      status: 502,
      outcome: 'GATEWAY_UNREACHABLE',
      order: existingOrder,
      message: `Could not reach Razorpay to verify refund records: ${errorMsg}`,
      error: 'GATEWAY_UNREACHABLE',
    };
  }

  const expectedPaiseAmount = rupeesToPaise(existingOrder.grandTotal);
  const matchingCandidates = existingRefunds.filter((r: any) =>
    isMatchingCancellationRefund(r, existingOrder, expectedPaiseAmount, ['processed', 'created', 'success', 'failed'])
  );

  // 3. Ambiguity Check: Multiple matching refunds
  if (matchingCandidates.length > 1) {
    const updatedOrder = await withTimeout(
      db.order.update({
        where: { id: existingOrder.id },
        data: {
          paymentFailureReason: 'Reconciliation conflict: multiple matching refunds detected on gateway. Manual review required.',
        },
        include: { items: true, user: true },
      }),
      DEFAULT_DB_TIMEOUT_MS,
      'ReconcileRefund.conflict'
    );
    return {
      success: false,
      status: 409,
      outcome: 'CONFLICT_NEEDS_REVIEW',
      order: updatedOrder,
      discrepancyDetected: true,
      message: `Found ${matchingCandidates.length} matching refunds on Razorpay for this order. Requires manual administrative review.`,
      error: 'MULTIPLE_MATCHING_REFUNDS',
    };
  }

  // 4. Ambiguity Check: Partial or non-matching refunds present on payment
  if (matchingCandidates.length === 0 && existingRefunds.length > 0) {
    const updatedOrder = await withTimeout(
      db.order.update({
        where: { id: existingOrder.id },
        data: {
          paymentFailureReason: 'Reconciliation conflict: unrecognized or partial refund found on payment. Manual review required.',
        },
        include: { items: true, user: true },
      }),
      DEFAULT_DB_TIMEOUT_MS,
      'ReconcileRefund.partialConflict'
    );
    return {
      success: false,
      status: 409,
      outcome: 'CONFLICT_NEEDS_REVIEW',
      order: updatedOrder,
      discrepancyDetected: true,
      message: 'One or more refunds exist on this payment, but none strictly match the expected full cancellation receipt and amount. Manual review required.',
      error: 'PARTIAL_OR_UNMATCHED_REFUNDS',
    };
  }

  // 5. Exactly 1 matching refund candidate found
  if (matchingCandidates.length === 1) {
    const candidate = matchingCandidates[0];
    const candidateId = String(candidate.id || '');
    const candidateStatus = String(candidate.status || '').toLowerCase();

    // Case 5A: Definitively Processed at Gateway
    if (candidateStatus === 'processed' || candidateStatus === 'success') {
      const alreadyRefundedLocally = existingOrder.paymentStatus === 'REFUNDED';
      const finalNotes = existingOrder.adminNotes
        ? `${existingOrder.adminNotes} | Reconciliation: Verified Razorpay Refund ${candidateId}`
        : `Reconciliation: Verified Razorpay Refund ${candidateId}`;

      const updatedOrder = await withTimeout(
        db.order.update({
          where: { id: existingOrder.id },
          data: {
            paymentStatus: 'REFUNDED',
            paymentSessionId: null, // Clear any claim lock
            paymentFailureReason: null,
            adminNotes: finalNotes.slice(0, 2000),
          },
          include: { items: true, user: true },
        }),
        DEFAULT_DB_TIMEOUT_MS,
        'ReconcileRefund.updateProcessed'
      );

      return {
        success: true,
        status: 200,
        outcome: alreadyRefundedLocally ? 'CONFIRMED_PROCESSED' : 'RECONCILED_PROCESSED',
        order: updatedOrder,
        refundId: candidateId,
        gatewayStatus: candidateStatus,
        discrepancyDetected: !alreadyRefundedLocally,
        message: alreadyRefundedLocally
          ? `Local and gateway records both confirm refund ${candidateId} is processed.`
          : `Reconciled: Gateway confirms refund ${candidateId} is processed. Order updated to REFUNDED.`,
      };
    }

    // Case 5B: Pending Settlement at Gateway (status === 'created')
    if (candidateStatus === 'created') {
      const updatedOrder = await withTimeout(
        db.order.update({
          where: { id: existingOrder.id },
          data: {
            paymentFailureReason: `Reconciliation: Refund ${candidateId} created at gateway, awaiting processing/settlement.`,
          },
          include: { items: true, user: true },
        }),
        DEFAULT_DB_TIMEOUT_MS,
        'ReconcileRefund.updateCreated'
      );

      return {
        success: true,
        status: 200,
        outcome: 'PENDING_AT_GATEWAY',
        order: updatedOrder,
        refundId: candidateId,
        gatewayStatus: candidateStatus,
        discrepancyDetected: existingOrder.paymentStatus === 'REFUNDED',
        message: `Refund ${candidateId} was accepted at Razorpay, but is still pending processing/settlement.`,
      };
    }

    // Case 5C: Definitively Failed at Gateway (status === 'failed')
    if (candidateStatus === 'failed') {
      const wasRefunded = existingOrder.paymentStatus === 'REFUNDED';
      const errorDesc = candidate.error_description || candidate.error_code || 'Gateway reported refund failure';
      const updatedOrder = await withTimeout(
        db.order.update({
          where: { id: existingOrder.id },
          data: {
            paymentStatus: 'PAID', // Revert to PAID so admin can retry
            paymentSessionId: null, // Clear claim lock
            paymentFailureReason: `Reconciliation: Gateway reported refund failed: ${errorDesc}`.slice(0, 500),
          },
          include: { items: true, user: true },
        }),
        DEFAULT_DB_TIMEOUT_MS,
        'ReconcileRefund.updateFailed'
      );

      return {
        success: true,
        status: 200,
        outcome: wasRefunded ? 'DISCREPANCY_REVERTED' : 'GATEWAY_FAILED',
        order: updatedOrder,
        refundId: candidateId,
        gatewayStatus: candidateStatus,
        discrepancyDetected: wasRefunded,
        message: `Gateway reported that refund ${candidateId} failed: ${errorDesc}. Order is in PAID status and ready for retry.`,
      };
    }
  }

  // 6. Zero refunds found on Razorpay for this payment
  if (existingOrder.paymentStatus === 'REFUNDED') {
    // Discrepancy! Locally marked REFUNDED, but 0 refunds exist on Razorpay!
    const updatedOrder = await withTimeout(
      db.order.update({
        where: { id: existingOrder.id },
        data: {
          paymentFailureReason: 'Reconciliation discrepancy: Marked REFUNDED locally but no refund records exist on Razorpay gateway.',
        },
        include: { items: true, user: true },
      }),
      DEFAULT_DB_TIMEOUT_MS,
      'ReconcileRefund.missingRefundDiscrepancy'
    );

    return {
      success: false,
      status: 409,
      outcome: 'CONFLICT_NEEDS_REVIEW',
      order: updatedOrder,
      discrepancyDetected: true,
      message: 'Discrepancy detected: Order is marked as REFUNDED locally, but no refund exists on Razorpay gateway. Manual investigation required.',
      error: 'REFUND_NOT_FOUND_ON_GATEWAY',
    };
  }

  // Zero refunds on Razorpay and local paymentStatus is PAID / FAILED / etc.
  // Clear any expired stale claim so admin can retry!
  const updatedOrder = await withTimeout(
    db.order.update({
      where: { id: existingOrder.id },
      data: {
        paymentSessionId: null, // Release stale claim
        paymentFailureReason: 'Reconciliation: No refund found on gateway. Stale claims cleared. Ready for refund retry.',
      },
      include: { items: true, user: true },
    }),
    DEFAULT_DB_TIMEOUT_MS,
    'ReconcileRefund.clearedStaleClaim'
  );

  return {
    success: true,
    status: 200,
    outcome: 'NO_GATEWAY_REFUND',
    order: updatedOrder,
    discrepancyDetected: false,
    message: 'No refund found on Razorpay gateway for this order. Any stale claims have been cleared, and the order is ready for refund retry.',
  };
}

export interface RequestCustomerCancellationInput {
  orderIdOrNumber: string;
  customerClerkUserId: string;
  reason?: string;
  customPrismaClient?: any;
}

export interface RequestCustomerCancellationResult {
  success: boolean;
  status: number;
  order?: any;
  message: string;
  error?: string;
}

/**
 * Server-authoritative customer order cancellation request workflow.
 *
 * Safety Invariants:
 * 1. Validates authenticated customer ownership strictly against the order's user record.
 * 2. Enforces state eligibility: only orders in Reviewing or Packaging (not shipped, delivered, or cancelled) are eligible.
 * 3. Rejects duplicate submissions with HTTP 409 Conflict if a cancellation request is already pending.
 * 4. Persists the request safely, engaging the fulfillment lock so the order cannot advance to courier pickup or delivery.
 * 5. Does NOT mutate product inventory or issue refunds at this request stage (inventory remains intact until approved).
 */
export async function requestCustomerCancellationWorkflow(
  input: RequestCustomerCancellationInput
): Promise<RequestCustomerCancellationResult> {
  const { orderIdOrNumber, customerClerkUserId, reason, customPrismaClient } = input;
  const db = customPrismaClient || prisma;

  if (!customerClerkUserId || typeof customerClerkUserId !== 'string' || !customerClerkUserId.trim()) {
    return {
      success: false,
      status: 401,
      message: 'Authentication required. Customer identity must be verified.',
      error: 'UNAUTHORIZED',
    };
  }

  if (!orderIdOrNumber || typeof orderIdOrNumber !== 'string' || !orderIdOrNumber.trim()) {
    return {
      success: false,
      status: 400,
      message: 'A valid order identifier or order number is required.',
      error: 'INVALID_IDENTIFIER',
    };
  }

  const trimmedId = orderIdOrNumber.trim();
  const isOrderNum = trimmedId.startsWith('ORD-');
  const whereClause: any = isOrderNum ? { orderNumber: trimmedId } : { id: trimmedId };

  const order: any = await withTimeout(
    db.order.findFirst({
      where: whereClause,
      include: { items: true, user: true },
    }),
    DEFAULT_DB_TIMEOUT_MS,
    'RequestCancellation.findFirst'
  );

  if (!order) {
    return {
      success: false,
      status: 404,
      message: `Order "${trimmedId}" was not found.`,
      error: 'ORDER_NOT_FOUND',
    };
  }

  // 1. Ownership Verification (Customer Isolation)
  const isOwner =
    order.user?.clerkUserId === customerClerkUserId ||
    order.user?.id === customerClerkUserId ||
    order.userId === customerClerkUserId;

  if (!isOwner) {
    return {
      success: false,
      status: 403,
      message: 'Access denied: You do not have permission to request cancellation for this order.',
      error: 'FORBIDDEN',
    };
  }

  // 2. Terminal State Checks
  if (order.status === 'CANCELLED') {
    return {
      success: false,
      status: 400,
      order,
      message: `Order #${order.orderNumber} is already cancelled.`,
      error: 'ORDER_ALREADY_CANCELLED',
    };
  }

  if (order.status === 'DELIVERED' || order.shippingStatus === 'DELIVERED') {
    return {
      success: false,
      status: 400,
      order,
      message: `Order #${order.orderNumber} has already been delivered and cannot be cancelled.`,
      error: 'CANNOT_CANCEL_DELIVERED',
    };
  }

  const inTransitShippingStatuses = ['SHIPPED', 'IN_TRANSIT'];
  if (inTransitShippingStatuses.includes(order.shippingStatus) || order.status === 'SHIPPED') {
    return {
      success: false,
      status: 400,
      order,
      message: `Order #${order.orderNumber} is already in transit with the delivery partner and cannot be cancelled online.`,
      error: 'CANNOT_CANCEL_SHIPPED',
    };
  }

  // 3. Duplicate Request Check
  if (hasPendingCancellationRequest(order)) {
    return {
      success: false,
      status: 409,
      order,
      message: `A cancellation request for Order #${order.orderNumber} is already pending administrator review.`,
      error: 'CANCELLATION_ALREADY_PENDING',
    };
  }

  // 4. Lifecycle Eligibility Check (Reviewing or Packaging only)
  if (!isOrderCancellationEligible(order)) {
    return {
      success: false,
      status: 400,
      order,
      message: `Order #${order.orderNumber} is not currently eligible for cancellation. Only orders in Reviewing or Packaging can be requested for cancellation.`,
      error: 'NOT_ELIGIBLE_FOR_CANCELLATION',
    };
  }

  // 5. Database Update: Persist the cancellation request
  const now = new Date();
  const trimmedReason = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 500) : null;
  const cancelReasonText = trimmedReason
    ? `Customer requested cancellation: ${trimmedReason}`
    : 'Customer requested cancellation';

  const auditEntry = `[cancellation_pending] Cancellation requested by customer on ${now.toISOString().split('T')[0]}${trimmedReason ? `: ${trimmedReason}` : ''}`;
  const updatedAdminNotes = order.adminNotes
    ? `${order.adminNotes} | ${auditEntry}`.slice(0, 2000)
    : auditEntry;

  const updateData: any = {
    cancelReason: cancelReasonText,
    adminNotes: updatedAdminNotes,
  };

  // Dedicated fields for environments where the schema/database has them (or mocked in unit tests)
  const hasDedicatedColumns = Boolean(
    customPrismaClient?.order?.fields?.cancellationRequestStatus ||
    (!customPrismaClient && db.order && 'cancellationRequestStatus' in (db.order.fields || {}))
  );

  if (hasDedicatedColumns) {
    updateData.cancellationRequestStatus = 'PENDING';
    updateData.cancellationRequestedAt = now;
    updateData.cancellationRequestReason = trimmedReason;
  }

  // Atomic conditional update to prevent concurrent duplicate submissions or races with courier pickup
  if (typeof db.order?.updateMany === 'function') {
    const atomicWhere: any = {
      id: order.id,
      status: { notIn: ['CANCELLED', 'DELIVERED', 'SHIPPED'] },
      shippingStatus: { notIn: ['SHIPPED', 'IN_TRANSIT', 'DELIVERED'] },
      OR: [
        { cancelReason: null },
        {
          NOT: {
            cancelReason: { startsWith: 'Customer requested cancellation' },
          },
        },
      ],
    };

    if (hasDedicatedColumns) {
      atomicWhere.AND = [
        {
          OR: [
            { cancellationRequestStatus: null },
            { cancellationRequestStatus: { not: 'PENDING' } },
          ],
        },
      ];
    }

    const atomicResult: any = await withTimeout(
      db.order.updateMany({
        where: atomicWhere,
        data: updateData,
      }),
      DEFAULT_DB_TIMEOUT_MS,
      'RequestCancellation.updateMany'
    );

    if (atomicResult?.count === 0) {
      // Race or conflict detected: re-fetch fresh order to give exact reason
      const freshOrder: any = typeof db.order?.findUnique === 'function'
        ? await withTimeout(
            db.order.findUnique({
              where: { id: order.id },
              include: { items: true, user: true },
            }),
            DEFAULT_DB_TIMEOUT_MS,
            'RequestCancellation.findUniqueConflict'
          )
        : await withTimeout(
            db.order.findFirst({
              where: { id: order.id },
              include: { items: true, user: true },
            }),
            DEFAULT_DB_TIMEOUT_MS,
            'RequestCancellation.findFirstConflict'
          );

      if (freshOrder && hasPendingCancellationRequest(freshOrder)) {
        return {
          success: false,
          status: 409,
          order: freshOrder,
          message: `A cancellation request for Order #${order.orderNumber} is already pending administrator review.`,
          error: 'CANCELLATION_ALREADY_PENDING',
        };
      }

      if (freshOrder && !isOrderCancellationEligible(freshOrder)) {
        const shipping = (freshOrder.shippingStatus || '').toUpperCase();
        const isDispatched =
          ['PICKUP_BY_DELIVERY_PARTNER', 'OUT_FOR_DELIVERY', 'DELIVERED', 'SHIPPED', 'IN_TRANSIT'].includes(shipping) ||
          ['SHIPPED', 'DELIVERED'].includes((freshOrder.status || '').toUpperCase());
        return {
          success: false,
          status: isDispatched ? 409 : 400,
          order: freshOrder,
          message: isDispatched
            ? `Order #${order.orderNumber} is already in transit with the delivery partner and cannot be cancelled online.`
            : `Order #${order.orderNumber} is not currently eligible for cancellation.`,
          error: isDispatched ? 'CANNOT_CANCEL_SHIPPED' : 'NOT_ELIGIBLE_FOR_CANCELLATION',
        };
      }

      return {
        success: false,
        status: 409,
        order: freshOrder || order,
        message: `Unable to submit cancellation request due to a concurrent order modification.`,
        error: 'CONCURRENT_MODIFICATION',
      };
    }
  }

  const updatedOrder = await withTimeout(
    db.order.update({
      where: { id: order.id },
      data: updateData,
      include: { items: true, user: true },
    }),
    DEFAULT_DB_TIMEOUT_MS,
    'RequestCancellation.update'
  );

  return {
    success: true,
    status: 200,
    order: updatedOrder,
    message: `Cancellation request for Order #${order.orderNumber} submitted successfully. Our team will review your request.`,
  };
}

export interface ResolveAdminCancellationInput {
  orderIdOrNumber: string;
  decision: 'APPROVE' | 'REJECT';
  rejectionReason?: string;
  adminClerkUserId?: string;
  customPrismaClient?: any;
  customRazorpayClient?: any;
}

export interface ResolveAdminCancellationResult {
  success: boolean;
  status: number;
  order?: any;
  decision: 'APPROVE' | 'REJECT';
  inventoryRestored?: boolean;
  refundStatus?: string;
  refundId?: string;
  message: string;
  error?: string;
}

/**
 * Server-authoritative admin workflow to resolve customer cancellation requests.
 *
 * Safety Invariants:
 * 1. Requires valid admin credentials (never trust client-supplied decision status).
 * 2. On APPROVE: invokes the full server-side order cancellation workflow, safely
 *    restoring stock in the InventoryMovement ledger and initiating Razorpay refunds for prepaid orders.
 * 3. On REJECT: clears the pending cancellation lock, records the rejection rationale,
 *    and allows fulfilment advancement to proceed.
 * 4. Preserves payment, inventory, and audit invariants throughout.
 */
export async function resolveAdminCancellationWorkflow(
  input: ResolveAdminCancellationInput
): Promise<ResolveAdminCancellationResult> {
  const {
    orderIdOrNumber,
    decision,
    rejectionReason,
    adminClerkUserId,
    customPrismaClient,
    customRazorpayClient,
  } = input;
  const db = customPrismaClient || prisma;

  if (!orderIdOrNumber || typeof orderIdOrNumber !== 'string' || !orderIdOrNumber.trim()) {
    return {
      success: false,
      status: 400,
      decision,
      message: 'A valid order identifier or order number is required.',
      error: 'INVALID_IDENTIFIER',
    };
  }

  const upperDecision = String(decision || '').trim().toUpperCase();
  if (upperDecision !== 'APPROVE' && upperDecision !== 'REJECT') {
    return {
      success: false,
      status: 400,
      decision: 'REJECT',
      message: 'Decision must be either "APPROVE" or "REJECT".',
      error: 'INVALID_DECISION',
    };
  }

  const trimmedId = orderIdOrNumber.trim();
  const isOrderNum = trimmedId.startsWith('ORD-');
  const whereClause: any = isOrderNum ? { orderNumber: trimmedId } : { id: trimmedId };

  const existingOrder: any = await withTimeout(
    db.order.findFirst({
      where: whereClause,
      include: { items: true, user: true },
    }),
    DEFAULT_DB_TIMEOUT_MS,
    'ResolveCancellation.findFirst'
  );

  if (!existingOrder) {
    return {
      success: false,
      status: 404,
      decision: upperDecision as any,
      message: `Order "${trimmedId}" was not found.`,
      error: 'ORDER_NOT_FOUND',
    };
  }

  // Verify that a cancellation request is actually pending
  if (!hasPendingCancellationRequest(existingOrder)) {
    return {
      success: false,
      status: 400,
      decision: upperDecision as any,
      order: existingOrder,
      message: `Order #${existingOrder.orderNumber} does not have a pending customer cancellation request to resolve.`,
      error: 'NO_PENDING_CANCELLATION_REQUEST',
    };
  }

  const now = new Date();

  // ─── Case 1: APPROVE ──────────────────────────────────────────────────────────
  if (upperDecision === 'APPROVE') {
    const cancelReason = existingOrder.cancelReason || 'Customer cancellation request approved by administrator';
    const cancelResult = await cancelAdminOrderWorkflow({
      orderIdOrNumber: existingOrder.id,
      cancelReason,
      adminClerkUserId,
      customPrismaClient: db,
      customRazorpayClient,
    });

    if (!cancelResult.success) {
      return {
        success: false,
        status: cancelResult.status,
        decision: 'APPROVE',
        order: cancelResult.order || existingOrder,
        message: cancelResult.message || cancelResult.error || 'Failed to approve cancellation request.',
        error: cancelResult.error,
      };
    }

    // Persist dedicated fields if supported
    let finalOrder = cancelResult.order;
    const hasDedicatedColumns = Boolean(
      customPrismaClient?.order?.fields?.cancellationRequestStatus ||
      (!customPrismaClient && db.order && 'cancellationRequestStatus' in (db.order.fields || {}))
    );

    if (hasDedicatedColumns) {
      try {
        finalOrder = await withTimeout(
          db.order.update({
            where: { id: existingOrder.id },
            data: {
              cancellationRequestStatus: 'APPROVED',
              cancellationResolvedAt: now,
            },
            include: { items: true, user: true },
          }),
          DEFAULT_DB_TIMEOUT_MS,
          'ResolveCancellation.updateApproved'
        );
      } catch {
        // Fall back to cancelResult.order if dedicated fields aren't in database
      }
    }

    let message = `Cancellation request for Order #${existingOrder.orderNumber} was approved. Order cancelled and inventory restored.`;
    if (cancelResult.refundStatus === 'REFUNDED') {
      message = `Cancellation request for Order #${existingOrder.orderNumber} was approved. Order cancelled, inventory restored, and refund processed.`;
    } else if (cancelResult.refundStatus === 'PENDING_RETRY') {
      message = `Cancellation request for Order #${existingOrder.orderNumber} was approved and inventory restored, but refund is pending retry.`;
    } else if (cancelResult.refundStatus === 'REFUND_FAILED') {
      message = `Cancellation request for Order #${existingOrder.orderNumber} was approved and inventory restored, but refund failed. Please retry refund.`;
    }

    return {
      success: true,
      status: 200,
      decision: 'APPROVE',
      order: finalOrder,
      inventoryRestored: cancelResult.inventoryRestored,
      refundStatus: cancelResult.refundStatus,
      refundId: cancelResult.refundId,
      message,
    };
  }

  // ─── Case 2: REJECT ───────────────────────────────────────────────────────────
  const trimmedRejection = typeof rejectionReason === 'string' && rejectionReason.trim()
    ? rejectionReason.trim().slice(0, 500)
    : null;

  const auditLog = `[cancellation_rejected] Cancellation request rejected by admin${adminClerkUserId ? ` (${adminClerkUserId})` : ''} on ${now.toISOString().split('T')[0]}${trimmedRejection ? `: "${trimmedRejection}"` : ''}`;
  const updatedAdminNotes = existingOrder.adminNotes
    ? `${existingOrder.adminNotes} | ${auditLog}`.slice(0, 2000)
    : auditLog;

  // Preserve original cancellation reason with [REJECTED] prefix so fulfillment is unlocked
  // while preserving full audit history and customer reason for modal display
  const currentReason = existingOrder.cancelReason || '';
  const preservedCancelReason = currentReason.startsWith('[REJECTED]')
    ? currentReason
    : (currentReason ? `[REJECTED] ${currentReason}`.slice(0, 1000) : null);

  const updateData: any = {
    cancelReason: preservedCancelReason,
    adminNotes: updatedAdminNotes,
  };

  const hasDedicatedColumns = Boolean(
    customPrismaClient?.order?.fields?.cancellationRequestStatus ||
    (!customPrismaClient && db.order && 'cancellationRequestStatus' in (db.order.fields || {}))
  );

  if (hasDedicatedColumns) {
    updateData.cancellationRequestStatus = 'REJECTED';
    updateData.cancellationResolvedAt = now;
    updateData.cancellationRejectionReason = trimmedRejection;
  }

  const updatedOrder = await withTimeout(
    db.order.update({
      where: { id: existingOrder.id },
      data: updateData,
      include: { items: true, user: true },
    }),
    DEFAULT_DB_TIMEOUT_MS,
    'ResolveCancellation.updateRejected'
  );

  return {
    success: true,
    status: 200,
    decision: 'REJECT',
    order: updatedOrder,
    message: `Cancellation request for Order #${existingOrder.orderNumber} was rejected. Fulfilment advancement is now permitted.`,
  };
}
