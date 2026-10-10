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
  refundStatus: 'REFUNDED' | 'REFUND_FAILED' | 'ALREADY_REFUNDED' | 'NOT_APPLICABLE';
  refundId?: string;
  message: string;
  error?: string;
}

/**
 * Idempotent Razorpay Refund Processor.
 *
 * Safety Guarantees:
 * 1. Checks gateway for existing refunds for the given payment ID before dispatching a new refund.
 * 2. Uses unique `receipt` parameter (idempotency key for Razorpay).
 * 3. Safely resolves ambiguous timeouts and prevents duplicate charges/refunds.
 * 4. Executes strictly outside any database transaction.
 */
export async function processIdempotentRazorpayRefund(options: {
  db: any;
  order: any;
  cancelReason?: string;
  customRazorpayClient?: any;
}): Promise<{
  success: boolean;
  refundId?: string;
  order?: any;
  error?: string;
  isAlreadyRefunded?: boolean;
}> {
  const { db, order, cancelReason, customRazorpayClient } = options;

  if (!order.paymentTransactionId) {
    return {
      success: false,
      error: 'Order does not have a valid paymentTransactionId to refund.',
    };
  }

  const rzp = customRazorpayClient || getRazorpayClient();
  const paiseAmount = rupeesToPaise(order.grandTotal);
  let refundId: string | undefined;

  try {
    // 1. Pre-Check Gateway: Query existing refunds for this payment ID to avoid double-refunding
    // in case a prior request timed out or succeeded on the gateway
    let existingRefunds: any[] = [];
    try {
      const refundsResponse: any = await withTimeout(
        rzp.payments.fetchMultipleRefund(order.paymentTransactionId),
        DEFAULT_DB_TIMEOUT_MS,
        'razorpay_fetch_multiple_refund'
      );
      if (Array.isArray(refundsResponse?.items)) {
        existingRefunds = refundsResponse.items;
      } else if (Array.isArray(refundsResponse)) {
        existingRefunds = refundsResponse;
      }
    } catch (checkErr: any) {
      // If fetching refunds fails with a non-404 error, log warning but continue carefully
      logEvent('WARN', {
        endpoint: '/api/admin/orders',
        operation: 'razorpay_refund_precheck_skipped',
        category: 'refund',
        message: `Could not pre-fetch refunds for payment ${order.paymentTransactionId}: ${getSafeErrorMessage(checkErr)}`,
      });
    }

    const matchingRefund = existingRefunds.find(
      (r: any) =>
        r &&
        (r.status === 'processed' || r.status === 'created' || r.status === 'success') &&
        (Number(r.amount) === paiseAmount ||
          r.receipt === `ref_${order.orderNumber}` ||
          r.notes?.orderId === order.id)
    );

    if (matchingRefund) {
      refundId = String(matchingRefund.id);
      const finalNotes = order.adminNotes
        ? `${order.adminNotes} | Razorpay Refund Verified: ${refundId}`
        : `Razorpay Refund Verified: ${refundId}`;

      const fullyRefundedOrder = await withTimeout(
        db.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'REFUNDED',
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

    // 2. Dispatch new refund with durable receipt identifier
    const refundResponse: any = await withTimeout(
      rzp.payments.refund(order.paymentTransactionId, {
        amount: paiseAmount,
        receipt: `ref_${order.orderNumber}`,
        notes: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          reason: cancelReason || 'Cancelled by administrator',
        },
      }),
      15000,
      'razorpay_payment_refund'
    );

    refundId = refundResponse?.id ? String(refundResponse.id) : undefined;

    const finalNotes = order.adminNotes
      ? `${order.adminNotes} | Razorpay Refund Initiated: ${refundId || 'SUCCESS'}`
      : `Razorpay Refund Initiated: ${refundId || 'SUCCESS'}`;

    const fullyRefundedOrder = await withTimeout(
      db.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'REFUNDED',
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
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentTransactionId: order.paymentTransactionId,
      },
    });

    // Record failure diagnostics without corrupting order state
    const errorRecordedOrder = await withTimeout(
      db.order.update({
        where: { id: order.id },
        data: {
          paymentFailureReason: `Refund failed: ${errMsg}`.slice(0, 500),
        },
        include: { items: true, user: true },
      }),
      DEFAULT_DB_TIMEOUT_MS,
      'RazorpayRefund.updateFailure'
    );

    return {
      success: false,
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
      return {
        success: true,
        status: 200,
        order: refundResult.order || updatedOrder,
        inventoryRestored,
        restoredItems,
        refundStatus: 'REFUND_FAILED',
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
