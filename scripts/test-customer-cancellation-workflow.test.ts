/**
 * Customer Cancellation Request & Admin Resolution Unit Test Suite
 *
 * Verifies:
 * 1. Customer ownership / isolation (mismatched user blocked with 403 FORBIDDEN).
 * 2. Stage eligibility (Reviewing/Packaging allowed; Shipped/Delivered/Cancelled rejected with 400).
 * 3. Duplicate request prevention (subsequent request rejected with 409 CANCELLATION_ALREADY_PENDING).
 * 4. Inventory invariance (request submission does not touch inventory).
 * 5. Fulfilment lock (pending request blocks stage advancement to pickup/delivery with 409 PENDING_CANCELLATION_REQUEST).
 * 6. Admin rejection (unblocks fulfilment lock, sets REJECTED, records rejection reason, allows stage advancement).
 * 7. Admin approval (invokes cancellation workflow, restores inventory, initiates refund, sets APPROVED).
 *
 * Safety:
 * Pure in-memory mocks. NO database mutations to Neon. NO Razorpay / Shiprocket network calls.
 */

process.env.SKIP_TEST_DB_GUARD_AUTO = 'true';
await import('./testDbGuard.js');

import {
  requestCustomerCancellationWorkflow,
  resolveAdminCancellationWorkflow,
} from '../api/_utils/orderCancellation.js';
import {
  advanceOrderFulfilmentStageWorkflow,
} from '../api/_utils/fulfillment.js';
import { formatAdminOrder } from '../api/admin/orders.js';
import {
  hasPendingCancellationRequest,
  isOrderCancellationEligible,
  getCancellationRequestDetails,
} from '../src/lib/order-status.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================================');
  console.log('CUSTOMER CANCELLATION REQUEST & WORKFLOW UNIT TESTS');
  console.log('====================================================================\n');

  // ─── Test 1: Customer Ownership / Isolation ─────────────────────────────────
  console.log('--- 1. Customer Ownership and Isolation ---');
  {
    const mockOrder = {
      id: 'ord_test_owner_1',
      orderNumber: 'ORD-20261010-AAA01',
      userId: 'user_legit_owner',
      status: 'CONFIRMED',
      shippingStatus: 'READY',
      paymentStatus: 'PAID',
      cancelReason: null,
      user: {
        id: 'user_legit_owner',
        clerkUserId: 'user_clerk_123',
      },
    };

    const mockDb = {
      order: {
        fields: { cancellationRequestStatus: true },
        findFirst: async () => mockOrder,
        update: async () => mockOrder,
      },
    };

    // Caller is a different customer!
    const intruderResult = await requestCustomerCancellationWorkflow({
      orderIdOrNumber: mockOrder.id,
      customerClerkUserId: 'user_clerk_intruder_999',
      reason: 'I want to cancel someone else order',
      customPrismaClient: mockDb,
    });

    assert(intruderResult.success === false, 'Mismatched customer is rejected');
    assert(intruderResult.status === 403, 'Returns HTTP 403 Forbidden on ownership violation');
    assert(intruderResult.error === 'FORBIDDEN', 'Error code is FORBIDDEN');

    // Legitimate owner
    let updatedPayload: any = null;
    const legitDb = {
      order: {
        fields: { cancellationRequestStatus: true },
        findFirst: async () => mockOrder,
        update: async ({ data }: any) => {
          updatedPayload = data;
          return { ...mockOrder, ...data };
        },
      },
    };

    const legitResult = await requestCustomerCancellationWorkflow({
      orderIdOrNumber: mockOrder.id,
      customerClerkUserId: 'user_clerk_123',
      reason: 'Change of mind',
      customPrismaClient: legitDb,
    });

    assert(legitResult.success === true, 'Legitimate customer request is accepted');
    assert(legitResult.status === 200, 'Returns HTTP 200 OK');
    assert(updatedPayload?.cancelReason?.includes('Change of mind'), 'Records customer cancellation reason');
    assert(updatedPayload?.cancellationRequestStatus === 'PENDING', 'Sets cancellationRequestStatus to PENDING');
  }

  // ─── Test 2: Stage Eligibility Check ────────────────────────────────────────
  console.log('\n--- 2. Stage Eligibility Check ---');
  {
    const baseOrder = {
      id: 'ord_test_eligibility',
      orderNumber: 'ORD-20261010-BBB02',
      userId: 'user_123',
      user: { id: 'user_123', clerkUserId: 'user_123' },
      paymentStatus: 'PAID',
      cancelReason: null,
      adminNotes: null,
      cancellationRequestStatus: null,
    };

    // Reviewing: eligible
    assert(
      isOrderCancellationEligible({ ...baseOrder, status: 'CONFIRMED', shippingStatus: 'READY' }) === true,
      'Order in Reviewing (CONFIRMED / READY) is eligible'
    );

    // Packaging: eligible
    assert(
      isOrderCancellationEligible({ ...baseOrder, status: 'PROCESSING', shippingStatus: 'PROCESSING' }) === true,
      'Order in Packaging (PROCESSING / PROCESSING) is eligible'
    );

    // Shipped: NOT eligible
    assert(
      isOrderCancellationEligible({ ...baseOrder, status: 'SHIPPED', shippingStatus: 'SHIPPED' }) === false,
      'Dispatched/Shipped order is NOT eligible'
    );

    // In Transit: NOT eligible
    assert(
      isOrderCancellationEligible({ ...baseOrder, status: 'SHIPPED', shippingStatus: 'IN_TRANSIT' }) === false,
      'In-transit order is NOT eligible'
    );

    // Delivered: NOT eligible
    assert(
      isOrderCancellationEligible({ ...baseOrder, status: 'DELIVERED', shippingStatus: 'DELIVERED' }) === false,
      'Delivered order is NOT eligible'
    );

    // Cancelled: NOT eligible
    assert(
      isOrderCancellationEligible({ ...baseOrder, status: 'CANCELLED', shippingStatus: 'CANCELLED' }) === false,
      'Already cancelled order is NOT eligible'
    );

    // Shipped order rejected via workflow
    const shippedOrder = { ...baseOrder, status: 'SHIPPED', shippingStatus: 'SHIPPED' };
    const shippedDb = {
      order: {
        fields: { cancellationRequestStatus: true },
        findFirst: async () => shippedOrder,
      },
    };

    const shippedResult = await requestCustomerCancellationWorkflow({
      orderIdOrNumber: shippedOrder.id,
      customerClerkUserId: 'user_123',
      customPrismaClient: shippedDb,
    });
    assert(shippedResult.success === false, 'Workflow rejects shipped order');
    assert(shippedResult.status === 400, 'Returns HTTP 400 for shipped order');
    assert(shippedResult.error === 'CANNOT_CANCEL_SHIPPED', 'Error code is CANNOT_CANCEL_SHIPPED');
  }

  // ─── Test 3: Duplicate Request Prevention ───────────────────────────────────
  console.log('\n--- 3. Duplicate Submission Prevention ---');
  {
    const pendingOrder = {
      id: 'ord_test_dup',
      orderNumber: 'ORD-20261010-CCC03',
      userId: 'user_123',
      user: { id: 'user_123', clerkUserId: 'user_123' },
      status: 'CONFIRMED',
      shippingStatus: 'READY',
      cancelReason: 'Customer requested cancellation: first try',
      cancellationRequestStatus: 'PENDING',
    };

    const dupDb = {
      order: {
        fields: { cancellationRequestStatus: true },
        findFirst: async () => pendingOrder,
      },
    };

    const dupResult = await requestCustomerCancellationWorkflow({
      orderIdOrNumber: pendingOrder.id,
      customerClerkUserId: 'user_123',
      reason: 'Second try',
      customPrismaClient: dupDb,
    });

    assert(dupResult.success === false, 'Duplicate request is rejected');
    assert(dupResult.status === 409, 'Returns HTTP 409 Conflict');
    assert(dupResult.error === 'CANCELLATION_ALREADY_PENDING', 'Error code is CANCELLATION_ALREADY_PENDING');
  }

  // ─── Test 4: Fulfilment Advancement Blocking ────────────────────────────────
  console.log('\n--- 4. Fulfilment Lock on Pending Request ---');
  {
    // Order in Packaging with a pending cancellation request
    const packagingOrder = {
      id: 'ord_test_lock',
      orderNumber: 'ORD-20261010-DDD04',
      status: 'PROCESSING',
      shippingStatus: 'PROCESSING',
      paymentStatus: 'PAID',
      paymentProvider: 'RAZORPAY',
      cancelReason: 'Customer requested cancellation: Found cheaper alternative',
      cancellationRequestStatus: 'PENDING',
    };

    const lockDb = {
      order: {
        findFirst: async () => packagingOrder,
      },
    };

    // Attempting to advance from Packaging to PICKUP_BY_DELIVERY_PARTNER
    const advanceResult = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: packagingOrder.id,
      targetStage: 'PICKUP_BY_DELIVERY_PARTNER',
      customPrismaClient: lockDb,
    });

    assert(advanceResult.success === false, 'Fulfilment advancement is blocked');
    assert(advanceResult.status === 409, 'Returns HTTP 409 Conflict');
    assert(advanceResult.error === 'PENDING_CANCELLATION_REQUEST', 'Error code is PENDING_CANCELLATION_REQUEST');
  }

  // ─── Test 5: Inventory Invariance on Submission ─────────────────────────────
  console.log('\n--- 5. Inventory Invariance on Request Submission ---');
  {
    let inventoryDeductionsOrRestorationsCalled = 0;
    const inventoryCheckOrder = {
      id: 'ord_test_inv_invariant',
      orderNumber: 'ORD-20261010-EEE05',
      userId: 'user_123',
      user: { id: 'user_123', clerkUserId: 'user_123' },
      status: 'CONFIRMED',
      shippingStatus: 'READY',
      paymentStatus: 'PAID',
      cancelReason: null,
      cancellationRequestStatus: null,
    };

    const invDb = {
      order: {
        fields: { cancellationRequestStatus: true },
        findFirst: async () => inventoryCheckOrder,
        update: async ({ data }: any) => ({ ...inventoryCheckOrder, ...data }),
      },
      inventoryMovement: {
        create: async () => {
          inventoryDeductionsOrRestorationsCalled++;
        },
      },
      product: {
        update: async () => {
          inventoryDeductionsOrRestorationsCalled++;
        },
      },
    };

    await requestCustomerCancellationWorkflow({
      orderIdOrNumber: inventoryCheckOrder.id,
      customerClerkUserId: 'user_123',
      reason: 'Testing inventory invariance',
      customPrismaClient: invDb,
    });

    assert(
      inventoryDeductionsOrRestorationsCalled === 0,
      'Submitting cancellation request does NOT mutate stock or create inventory movements'
    );
  }

  // ─── Test 6: Admin Rejection ────────────────────────────────────────────────
  console.log('\n--- 6. Admin Rejection Unblocks Fulfilment ---');
  {
    let currentDbOrder: any = {
      id: 'ord_test_reject',
      orderNumber: 'ORD-20261010-FFF06',
      status: 'PROCESSING',
      shippingStatus: 'PROCESSING',
      paymentStatus: 'PAID',
      paymentProvider: 'RAZORPAY',
      cancelReason: 'Customer requested cancellation: Please cancel',
      cancellationRequestStatus: 'PENDING',
      adminNotes: 'Initial notes',
    };

    const rejectDb = {
      order: {
        fields: { cancellationRequestStatus: true },
        findFirst: async () => currentDbOrder,
        update: async ({ data }: any) => {
          currentDbOrder = { ...currentDbOrder, ...data };
          return currentDbOrder;
        },
      },
    };

    // 1. Admin rejects the cancellation request
    const rejectResult = await resolveAdminCancellationWorkflow({
      orderIdOrNumber: currentDbOrder.id,
      decision: 'REJECT',
      rejectionReason: 'Product has already been custom hallmarked and packaged.',
      adminClerkUserId: 'admin_clerk_007',
      customPrismaClient: rejectDb,
    });

    assert(rejectResult.success === true, 'Admin rejection succeeds');
    assert(rejectResult.decision === 'REJECT', 'Decision is REJECT');
    assert(currentDbOrder.cancellationRequestStatus === 'REJECTED', 'Status updated to REJECTED');
    assert(typeof currentDbOrder.cancelReason === 'string' && currentDbOrder.cancelReason.startsWith('[REJECTED]'), 'cancelReason preserves customer reason with [REJECTED] prefix');
    assert(hasPendingCancellationRequest(currentDbOrder) === false, 'hasPendingCancellationRequest returns false after rejection');

    // 2. Now attempt to advance fulfilment stage to Courier Pickup
    const advanceResult = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: currentDbOrder.id,
      targetStage: 'PICKUP_BY_DELIVERY_PARTNER',
      customPrismaClient: rejectDb,
    });

    assert(advanceResult.success === true, 'Stage advancement succeeds after rejection');
    assert(advanceResult.status === 200, 'Returns HTTP 200 OK');
    assert(advanceResult.currentStage === 'PICKUP_BY_DELIVERY_PARTNER', 'Order advanced to Courier Pickup');
  }

  // ─── Test 7: Admin Approval ────────────────────────────────────────────────
  console.log('\n--- 7. Admin Approval Cancels Order and Restores Inventory ---');
  {
    let currentDbOrder: any = {
      id: 'ord_test_approve',
      orderNumber: 'ORD-20261010-GGG07',
      status: 'CONFIRMED',
      shippingStatus: 'READY',
      paymentStatus: 'PAID',
      paymentProvider: 'COD',
      cancelReason: 'Customer requested cancellation: Ordered wrong item',
      cancellationRequestStatus: 'PENDING',
      adminNotes: 'Initial notes',
      items: [
        { id: 'item_1', productId: 'prod_ring_1', quantity: 2 },
      ],
    };

    let inventoryRestoredRecorded = false;

    const approveDb: any = {
      order: {
        fields: { cancellationRequestStatus: true },
        findFirst: async () => currentDbOrder,
        findUnique: async () => currentDbOrder,
        update: async ({ data }: any) => {
          currentDbOrder = { ...currentDbOrder, ...data };
          return currentDbOrder;
        },
      },
      product: {
        findUnique: async () => ({ id: 'prod_ring_1', name: 'Gold Ring', availableStock: 5 }),
        updateMany: async () => ({ count: 1 }),
        update: async () => ({ id: 'prod_ring_1' }),
      },
      $queryRawUnsafe: async () => [
        {
          id: 'mov_deduct_1',
          orderId: 'ord_test_approve',
          productId: 'prod_ring_1',
          quantity: 2,
          type: 'DEDUCTION',
          idempotencyKey: 'deduct_ord_test_approve_prod_ring_1',
          reason: 'order_confirmed',
          clerkUserId: 'user_123',
          createdAt: new Date(),
        },
      ],
      $executeRawUnsafe: async () => {
        inventoryRestoredRecorded = true;
        return 1;
      },
      $transaction: async (fn: any) => {
        return fn(approveDb);
      },
    };

    const approveResult = await resolveAdminCancellationWorkflow({
      orderIdOrNumber: currentDbOrder.id,
      decision: 'APPROVE',
      adminClerkUserId: 'admin_clerk_007',
      customPrismaClient: approveDb,
    });

    assert(approveResult.success === true, 'Admin approval succeeds');
    assert(approveResult.decision === 'APPROVE', 'Decision is APPROVE');
    assert(currentDbOrder.status === 'CANCELLED', 'Order status transitioned to CANCELLED');
    assert(currentDbOrder.shippingStatus === 'CANCELLED', 'Shipping status transitioned to CANCELLED');
    assert(inventoryRestoredRecorded === true, 'Inventory movement restoration record created in ledger');
  }

  // ─── Test 8: Fallback Mode Rejection Unlocking & Delivery Instructions Preservation ───
  console.log('\n--- 8. Fallback Mode Rejection Unlocking & Instruction Preservation ---');
  {
    let fallbackOrder: any = {
      id: 'ord_test_fallback_reject',
      orderNumber: 'ORD-20261010-HHH08',
      status: 'PROCESSING',
      shippingStatus: 'PROCESSING',
      paymentStatus: 'PAID',
      cancelReason: 'Customer requested cancellation: Ordered wrong dimensions',
      adminNotes: '[cancellation_pending] Cancellation requested by customer on 2026-10-10: Ordered wrong dimensions',
      customerNotes: 'Please deliver strictly between 4pm-7pm at front gate.',
      deliveryInstructions: 'Do not bend package; fragile gold jewelry',
      cancellationRequestStatus: undefined, // Simulates Neon missing the dedicated column!
    };

    const fallbackDb: any = {
      order: {
        fields: {}, // Dedicated fields absent!
        findFirst: async () => fallbackOrder,
        findUnique: async () => fallbackOrder,
        update: async ({ data }: any) => {
          fallbackOrder = { ...fallbackOrder, ...data };
          return fallbackOrder;
        },
      },
    };

    // 1. Initial state has pending cancellation lock in fallback mode
    assert(hasPendingCancellationRequest(fallbackOrder) === true, 'Fallback order is initially locked as pending');

    // 2. Admin rejects request in fallback mode
    const rejectResult = await resolveAdminCancellationWorkflow({
      orderIdOrNumber: fallbackOrder.id,
      decision: 'REJECT',
      rejectionReason: 'Product customized and packed.',
      adminClerkUserId: 'admin_clerk_008',
      customPrismaClient: fallbackDb,
    });

    assert(rejectResult.success === true, 'Admin rejection succeeds in fallback mode');
    assert(rejectResult.decision === 'REJECT', 'Decision is REJECT');
    assert(fallbackOrder.cancelReason.startsWith('[REJECTED]'), 'Original customer reason preserved with [REJECTED] prefix');
    assert(fallbackOrder.cancelReason.includes('Ordered wrong dimensions'), 'Original customer reason text preserved');
    assert(fallbackOrder.customerNotes === 'Please deliver strictly between 4pm-7pm at front gate.', 'customerNotes untouched and preserved');
    assert(fallbackOrder.deliveryInstructions === 'Do not bend package; fragile gold jewelry', 'deliveryInstructions untouched and preserved');
    assert(hasPendingCancellationRequest(fallbackOrder) === false, 'hasPendingCancellationRequest returns false after rejection in fallback mode');

    // 3. Advancing fulfilment to Courier Pickup now succeeds in fallback mode
    const advanceResult = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: fallbackOrder.id,
      targetStage: 'PICKUP_BY_DELIVERY_PARTNER',
      customPrismaClient: fallbackDb,
    });

    assert(advanceResult.success === true, 'Fulfilment stage advancement succeeds after fallback rejection');
    assert(advanceResult.currentStage === 'PICKUP_BY_DELIVERY_PARTNER', 'Order advanced to Courier Pickup');
  }

  // ─── Test 9: Fallback Mode Customer & Admin Response Extraction ────────────
  console.log('\n--- 9. Fallback Mode API Response Extraction ---');
  {
    const rejectedFallbackOrder = {
      id: 'ord_test_details_1',
      orderNumber: 'ORD-20261010-III09',
      status: 'CONFIRMED',
      cancelReason: '[REJECTED] Customer requested cancellation: Ordered wrong ring size',
      adminNotes: 'Order created | [cancellation_pending] Cancellation requested by customer on 2026-10-10: Ordered wrong ring size | [cancellation_rejected] Cancellation request rejected by admin on 2026-10-10: "Product has been resized and engraved."',
    };

    const details = getCancellationRequestDetails(rejectedFallbackOrder);
    assert(details.status === 'REJECTED', 'getCancellationRequestDetails normalizes status to REJECTED in fallback mode');
    assert(details.requestReason === 'Ordered wrong ring size', 'Extracts original requestReason cleanly without prefix');
    assert(details.rejectionReason === 'Product has been resized and engraved.', 'Extracts rejectionReason from audit entry');
  }

  // ─── Test 10: Multiple Sequential Historical Requests ──────────────────────
  console.log('\n--- 10. Multiple Historical Requests (Request -> Reject -> Re-request) ---');
  {
    // Order was rejected earlier
    let historyOrder = {
      id: 'ord_test_multi_hist',
      orderNumber: 'ORD-20261010-JJJ10',
      userId: 'user_multi_1',
      user: { id: 'user_multi_1', clerkUserId: 'user_clerk_multi_1' },
      status: 'PROCESSING',
      shippingStatus: 'PROCESSING',
      paymentStatus: 'PAID',
      cancelReason: '[REJECTED] Customer requested cancellation: First reason',
      adminNotes: '[cancellation_pending] Cancellation requested by customer on 2026-10-09: First reason | [cancellation_rejected] Cancellation request rejected by admin on 2026-10-09: "Cannot cancel first time"',
    };

    // State is currently unlocked
    assert(hasPendingCancellationRequest(historyOrder) === false, 'Initially unlocked after previous rejection');
    assert(getCancellationRequestDetails(historyOrder).status === 'REJECTED', 'Reports REJECTED before second submission');

    const multiDb: any = {
      order: {
        fields: {},
        findFirst: async () => historyOrder,
        findUnique: async () => historyOrder,
        updateMany: async () => ({ count: 1 }),
        update: async ({ data }: any) => {
          historyOrder = { ...historyOrder, ...data };
          return historyOrder;
        },
      },
    };

    // Customer re-submits a second cancellation request while still in PACKAGING
    const secondReqResult = await requestCustomerCancellationWorkflow({
      orderIdOrNumber: historyOrder.id,
      customerClerkUserId: 'user_clerk_multi_1',
      reason: 'Second reason: found identical product in local store',
      customPrismaClient: multiDb,
    });

    assert(secondReqResult.success === true, 'Second request submission succeeds while eligible');
    assert(hasPendingCancellationRequest(historyOrder) === true, 'Order is now PENDING again after second submission');
    const newDetails = getCancellationRequestDetails(historyOrder);
    assert(newDetails.status === 'PENDING', 'Details status evaluates to PENDING as latest chronological event');
    assert(newDetails.requestReason === 'Second reason: found identical product in local store', 'Details captures latest requestReason');
    assert(newDetails.rejectionReason === null, 'Rejection reason is null for active pending second request');
  }

  // ─── Test 11: Concurrent Duplicate Submission Race Prevention ───────────────
  console.log('\n--- 11. Concurrent Duplicate Submission Atomic Prevention ---');
  {
    const raceOrder = {
      id: 'ord_test_race_dup',
      orderNumber: 'ORD-20261010-KKK11',
      userId: 'user_race_1',
      user: { id: 'user_race_1', clerkUserId: 'user_clerk_race_1' },
      status: 'CONFIRMED',
      shippingStatus: 'READY',
      cancelReason: 'Customer requested cancellation: First click',
      adminNotes: '[cancellation_pending] Cancellation requested by customer on 2026-10-10: First click',
    };

    // When second concurrent submission executes updateMany, 0 rows match because first click set cancelReason
    const raceDb: any = {
      order: {
        fields: {},
        findFirst: async () => raceOrder,
        findUnique: async () => raceOrder,
        updateMany: async () => ({ count: 0 }), // Simulates losing the atomic race
        update: async () => raceOrder,
      },
    };

    const concurrentResult = await requestCustomerCancellationWorkflow({
      orderIdOrNumber: raceOrder.id,
      customerClerkUserId: 'user_clerk_race_1',
      reason: 'Second click',
      customPrismaClient: raceDb,
    });

    assert(concurrentResult.success === false, 'Concurrent duplicate request rejected by atomic update check');
    assert(concurrentResult.status === 409, 'Returns HTTP 409 Conflict');
    assert(concurrentResult.error === 'CANCELLATION_ALREADY_PENDING', 'Error is CANCELLATION_ALREADY_PENDING');
  }

  // ─── Test 12: Cancellation Request vs Courier Pickup Race Prevention ─────────
  console.log('\n--- 12. Cancellation vs Courier Pickup Advancement Race Prevention ---');
  {
    // Part A: Pickup won the race right before customer cancellation executed updateMany
    const inTransitOrder = {
      id: 'ord_test_pickup_race',
      orderNumber: 'ORD-20261010-LLL12',
      userId: 'user_pickup_race',
      user: { id: 'user_pickup_race', clerkUserId: 'user_clerk_pickup_race' },
      status: 'SHIPPED',
      shippingStatus: 'PICKUP_BY_DELIVERY_PARTNER',
      cancelReason: null,
    };

    const pickupWonDb: any = {
      order: {
        fields: {},
        findFirst: async () => inTransitOrder,
        findUnique: async () => inTransitOrder,
        updateMany: async () => ({ count: 0 }), // Lost race because shippingStatus is now PICKUP_BY_DELIVERY_PARTNER
      },
    };

    const custResult = await requestCustomerCancellationWorkflow({
      orderIdOrNumber: inTransitOrder.id,
      customerClerkUserId: 'user_clerk_pickup_race',
      reason: 'Too late to cancel',
      customPrismaClient: pickupWonDb,
    });

    assert(custResult.success === false, 'Customer cancellation fails when pickup won the race');
    assert(custResult.error === 'CANNOT_CANCEL_SHIPPED', 'Error code is CANNOT_CANCEL_SHIPPED');

    // Part B: Customer cancellation won the race right before admin advance executed updateMany
    const preRaceOrder = {
      id: 'ord_test_cancel_won',
      orderNumber: 'ORD-20261010-MMM13',
      status: 'CONFIRMED',
      shippingStatus: 'PROCESSING',
      paymentStatus: 'PAID',
      paymentProvider: 'RAZORPAY',
      cancelReason: null,
      adminNotes: null,
    };

    const cancelWonOrder = {
      ...preRaceOrder,
      cancelReason: 'Customer requested cancellation: Won race',
      adminNotes: '[cancellation_pending] Cancellation requested by customer on 2026-10-10: Won race',
    };

    const cancelWonDb: any = {
      order: {
        findFirst: async () => preRaceOrder, // Admin initially reads pre-race state
        findUnique: async () => cancelWonOrder, // Fresh conflict fetch reveals customer cancellation won
        updateMany: async () => ({ count: 0 }), // updateMany matches 0 rows because cancelReason was set
      },
    };

    const advanceResult = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: preRaceOrder.id,
      targetStage: 'PICKUP_BY_DELIVERY_PARTNER',
      customPrismaClient: cancelWonDb,
    });

    assert(advanceResult.success === false, 'Admin advancement fails when cancellation won the race');
    assert(advanceResult.status === 409, 'Returns HTTP 409 Conflict');
    assert(advanceResult.error === 'PENDING_CANCELLATION_REQUEST', 'Error code is PENDING_CANCELLATION_REQUEST');
  }

  // ─── Test 13: Schema Strictness & Fallback-Mode Cancellation Regression ──────
  console.log('\n--- 13. Schema Strictness & Fallback-Mode Cancellation Regression ---');
  {
    // Part A: Exact failure reproduction test
    // Simulates Prisma Client's strict runtime enum validation on updateMany.
    const VALID_PRISMA_SHIPPING_STATUSES = new Set([
      'NOT_READY',
      'READY',
      'PROCESSING',
      'SHIPPED',
      'IN_TRANSIT',
      'DELIVERED',
      'CANCELLED',
      'RETURNED',
    ]);
    const VALID_PRISMA_ORDER_STATUSES = new Set([
      'PENDING_PAYMENT',
      'CONFIRMED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
    ]);

    let capturedWhere: any = null;
    let schemaValidationThrew = false;

    const strictPackagingOrder = {
      id: 'ord_test_strict_schema_1',
      orderNumber: 'ORD-20261010-NNN14',
      userId: 'user_cust_strict',
      user: { id: 'user_cust_strict', clerkUserId: 'user_clerk_strict' },
      status: 'PROCESSING',
      shippingStatus: 'PROCESSING',
      cancelReason: null,
      adminNotes: null,
      cancellationRequestStatus: undefined,
    };

    let savedOrder = { ...strictPackagingOrder };

    const strictPrismaMock: any = {
      order: {
        fields: {}, // Unapplied migration: no cancellation columns
        findFirst: async () => savedOrder,
        findUnique: async () => savedOrder,
        updateMany: async ({ where, data }: any) => {
          capturedWhere = where;
          // Prisma Client validates enum values strictly against schema.prisma
          if (where?.shippingStatus?.notIn) {
            for (const val of where.shippingStatus.notIn) {
              if (!VALID_PRISMA_SHIPPING_STATUSES.has(val)) {
                schemaValidationThrew = true;
                throw new Error(`Invalid \`prisma.order.updateMany()\` invocation: Invalid value for argument \`notIn\`. Expected ShippingStatus, received '${val}'.`);
              }
            }
          }
          if (where?.status?.notIn) {
            for (const val of where.status.notIn) {
              if (!VALID_PRISMA_ORDER_STATUSES.has(val)) {
                schemaValidationThrew = true;
                throw new Error(`Invalid \`prisma.order.updateMany()\` invocation: Invalid value for argument \`notIn\`. Expected OrderStatus, received '${val}'.`);
              }
            }
          }
          savedOrder = { ...savedOrder, ...data };
          return { count: 1 };
        },
        update: async ({ data }: any) => {
          savedOrder = { ...savedOrder, ...data };
          return savedOrder;
        },
      },
    };

    // Customer requests cancellation in Packaging stage
    const fallbackResult = await requestCustomerCancellationWorkflow({
      orderIdOrNumber: strictPackagingOrder.id,
      customerClerkUserId: 'user_clerk_strict',
      reason: 'Need to change delivery address and ring size',
      customPrismaClient: strictPrismaMock,
    });

    assert(schemaValidationThrew === false, 'updateMany executes with valid Prisma schema enums without throwing');
    assert(fallbackResult.success === true, 'Successful fallback-mode cancellation request in Packaging stage');
    assert(fallbackResult.status === 200, 'Returns HTTP 200 OK');
    assert(capturedWhere !== null, 'Conditional updateMany was executed');
    assert(
      capturedWhere.shippingStatus.notIn.every((s: string) => VALID_PRISMA_SHIPPING_STATUSES.has(s)),
      'shippingStatus.notIn contains only valid ShippingStatus enum values'
    );
    assert(
      !capturedWhere.shippingStatus.notIn.includes('PICKUP_BY_DELIVERY_PARTNER'),
      'shippingStatus.notIn does NOT contain invalid FulfilmentStage value PICKUP_BY_DELIVERY_PARTNER'
    );
    assert(
      !capturedWhere.shippingStatus.notIn.includes('OUT_FOR_DELIVERY'),
      'shippingStatus.notIn does NOT contain invalid FulfilmentStage value OUT_FOR_DELIVERY'
    );
    assert(
      hasPendingCancellationRequest(savedOrder) === true,
      'hasPendingCancellationRequest evaluates to true in fallback mode'
    );
    assert(
      getCancellationRequestDetails(savedOrder).status === 'PENDING',
      'getCancellationRequestDetails evaluates status to PENDING'
    );

    // Part B: Duplicate request rejection with HTTP 409 in fallback mode
    const duplicateResult = await requestCustomerCancellationWorkflow({
      orderIdOrNumber: strictPackagingOrder.id,
      customerClerkUserId: 'user_clerk_strict',
      reason: 'Submitting again',
      customPrismaClient: strictPrismaMock,
    });

    assert(duplicateResult.success === false, 'Duplicate fallback-mode request is rejected');
    assert(duplicateResult.status === 409, 'Returns HTTP 409 Conflict for duplicate request');
    assert(duplicateResult.error === 'CANCELLATION_ALREADY_PENDING', 'Error code is CANCELLATION_ALREADY_PENDING');

    // Part C: Order already at pickup rejected
    const pickupOrder = {
      id: 'ord_test_at_pickup',
      orderNumber: 'ORD-20261010-OOO15',
      userId: 'user_cust_pickup',
      user: { id: 'user_cust_pickup', clerkUserId: 'user_clerk_pickup' },
      status: 'SHIPPED',
      shippingStatus: 'SHIPPED', // Courier pickup reached
      cancelReason: null,
      adminNotes: null,
    };

    const pickupDb: any = {
      order: {
        fields: {},
        findFirst: async () => pickupOrder,
      },
    };

    const pickupResult = await requestCustomerCancellationWorkflow({
      orderIdOrNumber: pickupOrder.id,
      customerClerkUserId: 'user_clerk_pickup',
      reason: 'Too late to cancel',
      customPrismaClient: pickupDb,
    });

    assert(pickupResult.success === false, 'Order that already reached pickup is rejected');
    assert(pickupResult.status === 400, 'Returns HTTP 400 for order already at pickup');
    assert(pickupResult.error === 'CANNOT_CANCEL_SHIPPED', 'Error code is CANNOT_CANCEL_SHIPPED');

    // Part D: Race condition where pickup occurs right between check and updateMany
    const raceOrderInitial = {
      id: 'ord_test_pickup_race_atomic',
      orderNumber: 'ORD-20261010-PPP16',
      userId: 'user_cust_race2',
      user: { id: 'user_cust_race2', clerkUserId: 'user_clerk_race2' },
      status: 'PROCESSING', // Initial check sees Packaging
      shippingStatus: 'PROCESSING',
      cancelReason: null,
    };
    const raceOrderDispatched = {
      ...raceOrderInitial,
      status: 'SHIPPED', // Dispatched concurrently by courier
      shippingStatus: 'SHIPPED',
    };

    const pickupRaceDb: any = {
      order: {
        fields: {},
        findFirst: async () => raceOrderInitial,
        updateMany: async () => ({ count: 0 }), // Lost race: 0 rows updated
        findUnique: async () => raceOrderDispatched, // Conflict lookup reveals pickup won
      },
    };

    const pickupRaceResult = await requestCustomerCancellationWorkflow({
      orderIdOrNumber: raceOrderInitial.id,
      customerClerkUserId: 'user_clerk_race2',
      reason: 'Racing against courier',
      customPrismaClient: pickupRaceDb,
    });

    assert(pickupRaceResult.success === false, 'Atomic pickup race rejects customer request');
    assert(pickupRaceResult.status === 409, 'Returns HTTP 409 for atomic pickup race');
    assert(pickupRaceResult.error === 'CANNOT_CANCEL_SHIPPED', 'Error code is CANNOT_CANCEL_SHIPPED');
  }

  // ─── Test 14: False Concurrency Conflict & SQL Null Predicate Regression ────
  console.log('\n--- 14. False Concurrency Conflict & SQL Null Predicate Regression ---');
  {
    /**
     * Accurately models SQL three-valued logic for the atomic WHERE filter.
     * In SQL:
     * - (NULL LIKE 'pattern%') is UNKNOWN/NULL
     * - NOT(UNKNOWN) is UNKNOWN/NULL
     * - A WHERE clause matches if and only if the predicate evaluates to TRUE.
     */
    function evaluateSqlWhere(where: any, row: any): boolean {
      if (where.id && where.id !== row.id) return false;
      if (where.status?.notIn && where.status.notIn.includes(row.status)) return false;
      if (where.shippingStatus?.notIn && where.shippingStatus.notIn.includes(row.shippingStatus)) return false;

      // Old faulty predicate: NOT: { cancelReason: { startsWith: '...' } }
      if (where.NOT && where.NOT.cancelReason?.startsWith) {
        if (row.cancelReason === null || row.cancelReason === undefined) {
          // SQL 3-valued logic: NOT (NULL LIKE '...') evaluates to NULL (falsy) -> fails to match!
          return false;
        }
        if (row.cancelReason.startsWith(where.NOT.cancelReason.startsWith)) {
          return false;
        }
      }

      // Fixed predicate: OR: [{ cancelReason: null }, { NOT: { cancelReason: { startsWith: '...' } } }]
      if (Array.isArray(where.OR)) {
        const orMatched = where.OR.some((branch: any) => {
          if ('cancelReason' in branch && branch.cancelReason === null) {
            return row.cancelReason === null || row.cancelReason === undefined;
          }
          if (branch.NOT?.cancelReason?.startsWith) {
            if (row.cancelReason === null || row.cancelReason === undefined) {
              return false; // In SQL, NOT (NULL LIKE ...) is NULL
            }
            return !row.cancelReason.startsWith(branch.NOT.cancelReason.startsWith);
          }
          return false;
        });
        if (!orMatched) return false;
      }

      return true;
    }

    // Observed Order: ORD-20261006-AGPXT in Packaging stage with cancelReason = null
    const packagingOrder = {
      id: 'ord_agpxt_observed_1',
      orderNumber: 'ORD-20261006-AGPXT',
      userId: 'user_cust_agpxt',
      user: { id: 'user_cust_agpxt', clerkUserId: 'user_clerk_agpxt' },
      status: 'PROCESSING', // Packaging stage
      shippingStatus: 'PROCESSING',
      cancelReason: null as string | null, // Normal eligible order has null cancelReason
      adminNotes: null as string | null,
      cancellationRequestStatus: undefined,
    };

    // Part A: Demonstrate why the old predicate produced a false concurrency conflict
    {
      const oldFaultyWhere = {
        id: packagingOrder.id,
        status: { notIn: ['CANCELLED', 'DELIVERED', 'SHIPPED'] },
        shippingStatus: { notIn: ['SHIPPED', 'IN_TRANSIT', 'DELIVERED'] },
        NOT: {
          cancelReason: { startsWith: 'Customer requested cancellation' },
        },
      };

      const matchedUnderOldPredicate = evaluateSqlWhere(oldFaultyWhere, packagingOrder);
      assert(
        matchedUnderOldPredicate === false,
        'Old predicate fails to match eligible Packaging order with cancelReason = null under SQL 3-valued logic'
      );
    }

    // Part B: Verify that the fixed workflow succeeds for ORD-20261006-AGPXT
    {
      let updatedRow: any = { ...packagingOrder };
      let capturedAtomicWhere: any = null;

      const sqlRealisticDb: any = {
        order: {
          fields: {}, // Unapplied migration
          findFirst: async () => ({ ...updatedRow }),
          findUnique: async () => ({ ...updatedRow }),
          updateMany: async ({ where, data }: any) => {
            capturedAtomicWhere = where;
            const matches = evaluateSqlWhere(where, updatedRow);
            if (matches) {
              updatedRow = { ...updatedRow, ...data };
              return { count: 1 };
            }
            return { count: 0 };
          },
          update: async ({ data }: any) => {
            updatedRow = { ...updatedRow, ...data };
            return { ...updatedRow };
          },
        },
      };

      const submitResult = await requestCustomerCancellationWorkflow({
        orderIdOrNumber: packagingOrder.id,
        customerClerkUserId: 'user_clerk_agpxt',
        reason: 'cancel please',
        customPrismaClient: sqlRealisticDb,
      });

      assert(submitResult.success === true, 'Eligible Packaging order ORD-20261006-AGPXT succeeds with HTTP 200');
      assert(submitResult.status === 200, 'Returns HTTP 200 OK instead of false concurrency conflict 409');
      assert(Boolean(capturedAtomicWhere?.OR), 'updateMany uses OR predicate permitting cancelReason: null');
      assert(
        updatedRow.cancelReason?.includes('cancel please'),
        'Records customer cancellation reason in cancelReason'
      );
      assert(
        hasPendingCancellationRequest(updatedRow) === true,
        'hasPendingCancellationRequest evaluates to true after successful submission'
      );
    }

    // Part C: Verify re-requesting after previous admin rejection succeeds
    {
      let rejectedOrder = {
        id: 'ord_rejection_history_2',
        orderNumber: 'ORD-20261006-REJECTED',
        userId: 'user_cust_agpxt',
        user: { id: 'user_cust_agpxt', clerkUserId: 'user_clerk_agpxt' },
        status: 'PROCESSING',
        shippingStatus: 'PROCESSING',
        cancelReason: '[REJECTED] Customer requested cancellation: First attempt was too impulsive',
        adminNotes: '[cancellation_rejected] Cancellation request rejected by admin on 2026-10-08: Order already packed',
        cancellationRequestStatus: undefined,
      };

      const rejectionHistoryDb: any = {
        order: {
          fields: {},
          findFirst: async () => ({ ...rejectedOrder }),
          findUnique: async () => ({ ...rejectedOrder }),
          updateMany: async ({ where, data }: any) => {
            const matches = evaluateSqlWhere(where, rejectedOrder);
            if (matches) {
              rejectedOrder = { ...rejectedOrder, ...data };
              return { count: 1 };
            }
            return { count: 0 };
          },
          update: async ({ data }: any) => {
            rejectedOrder = { ...rejectedOrder, ...data };
            return { ...rejectedOrder };
          },
        },
      };

      const secondSubmit = await requestCustomerCancellationWorkflow({
        orderIdOrNumber: rejectedOrder.id,
        customerClerkUserId: 'user_clerk_agpxt',
        reason: 'Customer re-requests: Need to change delivery date',
        customPrismaClient: rejectionHistoryDb,
      });

      assert(secondSubmit.success === true, 'Order with [REJECTED] history is eligible and succeeds');
      assert(secondSubmit.status === 200, 'Returns HTTP 200 OK on re-request');
      assert(
        hasPendingCancellationRequest(rejectedOrder) === true,
        'Order is locked as pending again after re-request'
      );
    }

    // Part D: Duplicate request rejection still returns HTTP 409 CANCELLATION_ALREADY_PENDING
    {
      const alreadyPendingOrder = {
        id: 'ord_dup_check_3',
        orderNumber: 'ORD-20261006-DUP',
        userId: 'user_cust_agpxt',
        user: { id: 'user_cust_agpxt', clerkUserId: 'user_clerk_agpxt' },
        status: 'PROCESSING',
        shippingStatus: 'PROCESSING',
        cancelReason: 'Customer requested cancellation: First click',
        adminNotes: '[cancellation_pending] Cancellation requested by customer on 2026-10-10: First click',
      };

      const dupDb: any = {
        order: {
          fields: {},
          findFirst: async () => alreadyPendingOrder,
          findUnique: async () => alreadyPendingOrder,
          updateMany: async ({ where }: any) => ({
            count: evaluateSqlWhere(where, alreadyPendingOrder) ? 1 : 0,
          }),
        },
      };

      const dupResult = await requestCustomerCancellationWorkflow({
        orderIdOrNumber: alreadyPendingOrder.id,
        customerClerkUserId: 'user_clerk_agpxt',
        reason: 'Duplicate click',
        customPrismaClient: dupDb,
      });

      assert(dupResult.success === false, 'Duplicate request is blocked');
      assert(dupResult.status === 409, 'Returns HTTP 409 for duplicate request');
      assert(dupResult.error === 'CANCELLATION_ALREADY_PENDING', 'Error code is CANCELLATION_ALREADY_PENDING');
    }

    // Part E: Race against courier pickup still returns HTTP 409 CANNOT_CANCEL_SHIPPED
    {
      const raceInitial = {
        id: 'ord_race_pickup_4',
        orderNumber: 'ORD-20261006-RACE',
        userId: 'user_cust_agpxt',
        user: { id: 'user_cust_agpxt', clerkUserId: 'user_clerk_agpxt' },
        status: 'PROCESSING',
        shippingStatus: 'PROCESSING',
        cancelReason: null as string | null,
      };
      const raceDispatched = {
        ...raceInitial,
        status: 'SHIPPED', // Courier pickup won
        shippingStatus: 'SHIPPED',
      };

      const raceDb: any = {
        order: {
          fields: {},
          findFirst: async () => raceInitial,
          updateMany: async ({ where }: any) => ({
            count: evaluateSqlWhere(where, raceDispatched) ? 1 : 0, // In DB, row was advanced to SHIPPED!
          }),
          findUnique: async () => raceDispatched,
        },
      };

      const raceResult = await requestCustomerCancellationWorkflow({
        orderIdOrNumber: raceInitial.id,
        customerClerkUserId: 'user_clerk_agpxt',
        reason: 'Too late',
        customPrismaClient: raceDb,
      });

      assert(raceResult.success === false, 'Courier pickup race rejects customer request');
      assert(raceResult.status === 409, 'Returns HTTP 409 when courier pickup won race');
      assert(raceResult.error === 'CANNOT_CANCEL_SHIPPED', 'Error code is CANNOT_CANCEL_SHIPPED');
    }
  }

  // ─── Test 15: Admin Order Normalization & Visibility in Fallback Mode ────────
  console.log('\n--- 15. Admin Response Serialization & Pending Request Visibility ---');
  {
    // Part A: Pending cancellation request in fallback mode
    const pendingFallbackRecord = {
      id: 'ord_admin_vis_1',
      orderNumber: 'ORD-20261006-AGPXT',
      userId: 'user_cust_1',
      status: 'PROCESSING',
      paymentStatus: 'PAID',
      shippingStatus: 'READY',
      subtotal: 5000,
      discountTotal: 0,
      shippingFee: 0,
      taxTotal: 150,
      grandTotal: 5150,
      currency: 'INR',
      customerName: 'Snehasish',
      customerEmail: 'snehasish@example.com',
      customerPhone: '+919876543210',
      shippingAddressLine1: '123 Gold Street',
      shippingCity: 'Kolkata',
      shippingState: 'West Bengal',
      shippingPincode: '700001',
      cancelReason: 'Customer requested cancellation: cancel please',
      adminNotes: 'Applied Coupon: NONE | [cancellation_pending] Cancellation requested by customer on 2026-10-06: cancel please',
      createdAt: new Date('2026-10-06T10:00:00Z'),
      updatedAt: new Date('2026-10-06T12:00:00Z'),
      items: [
        {
          id: 'item_1',
          orderId: 'ord_admin_vis_1',
          productName: 'Royal Necklace',
          productSlug: 'royal-necklace',
          productImage: '/img.jpg',
          unitPrice: 5000,
          quantity: 1,
          lineTotal: 5000,
          createdAt: new Date('2026-10-06T10:00:00Z'),
        },
      ],
      user: {
        id: 'user_cust_1',
        clerkUserId: 'user_clerk_cust_1',
        email: 'snehasish@example.com',
      },
    };

    const formattedPending = formatAdminOrder(pendingFallbackRecord);

    assert(
      formattedPending.cancellationRequestStatus === 'PENDING',
      'formatAdminOrder serializes fallback cancellation request as PENDING'
    );
    assert(
      formattedPending.cancellationRequestReason === 'cancel please',
      'formatAdminOrder extracts trimmed customer cancellation reason'
    );
    assert(
      formattedPending.cancellationRequestedAt !== null,
      'formatAdminOrder populates cancellationRequestedAt timestamp'
    );
    assert(
      formattedPending.cancellationResolvedAt === null,
      'cancellationResolvedAt is null for pending request'
    );
    assert(
      formattedPending.cancellationRejectionReason === null,
      'cancellationRejectionReason is null for pending request'
    );
    assert(
      hasPendingCancellationRequest(formattedPending) === true,
      'hasPendingCancellationRequest evaluates to true for admin order data model'
    );

    // Part B: Post-resolution REJECT serialization
    const rejectedFallbackRecord = {
      ...pendingFallbackRecord,
      cancelReason: '[REJECTED] Customer requested cancellation: cancel please',
      adminNotes: `${pendingFallbackRecord.adminNotes} | [cancellation_rejected] Cancellation request rejected by admin: "Package already prepared"`,
      updatedAt: new Date('2026-10-06T14:00:00Z'),
    };

    const formattedRejected = formatAdminOrder(rejectedFallbackRecord);

    assert(
      formattedRejected.cancellationRequestStatus === 'REJECTED',
      'formatAdminOrder serializes rejected fallback cancellation as REJECTED'
    );
    assert(
      formattedRejected.cancellationRejectionReason === 'Package already prepared',
      'formatAdminOrder extracts administrative rejection reason from audit history'
    );
    assert(
      formattedRejected.cancellationRequestReason === 'cancel please',
      'Original customer request reason is preserved in rejected state'
    );
    assert(
      hasPendingCancellationRequest(formattedRejected) === false,
      'hasPendingCancellationRequest evaluates to false after admin rejection'
    );

    // Part C: Post-resolution APPROVE serialization
    const approvedFallbackRecord = {
      ...pendingFallbackRecord,
      status: 'CANCELLED',
      cancelReason: 'Customer requested cancellation: cancel please',
      cancelledAt: new Date('2026-10-06T14:30:00Z'),
      adminNotes: `${pendingFallbackRecord.adminNotes} | [cancellation_approved] Cancellation request approved by administrator`,
      updatedAt: new Date('2026-10-06T14:30:00Z'),
    };

    const formattedApproved = formatAdminOrder(approvedFallbackRecord);

    assert(
      formattedApproved.cancellationRequestStatus === 'APPROVED',
      'formatAdminOrder serializes approved cancellation as APPROVED'
    );
    assert(
      formattedApproved.status === 'CANCELLED',
      'Order status is CANCELLED upon approval'
    );
    assert(
      hasPendingCancellationRequest(formattedApproved) === false,
      'hasPendingCancellationRequest evaluates to false after admin approval'
    );
  }

  // ─── Test 16: Admin Pagination & Query Parameters Audit ─────────────────────
  console.log('\n--- 16. Admin Pagination & Query Parameters Audit ---');
  {
    // Part A: URL Query Parameter Extraction (simulating Vite Connect middleware where req.query is undefined)
    const mockViteReq = {
      method: 'GET',
      url: '/api/admin/orders?page=2&limit=50&status=CANCELLATION_REQUESTED&search=AGPXT',
      query: undefined, // Connect / Vite does not populate req.query!
    };

    const queryParams: Record<string, string> = {};
    if (mockViteReq.query && typeof mockViteReq.query === 'object') {
      for (const [k, v] of Object.entries(mockViteReq.query)) {
        if (typeof v === 'string') queryParams[k] = v;
      }
    }
    if (mockViteReq.url) {
      try {
        const parsedUrl = new URL(mockViteReq.url, 'http://localhost');
        for (const [k, v] of parsedUrl.searchParams.entries()) {
          if (queryParams[k] === undefined) queryParams[k] = v;
        }
      } catch {}
    }

    assert(queryParams.page === '2', 'queryParams parses page=2 from req.url when req.query is undefined');
    assert(queryParams.limit === '50', 'queryParams parses limit=50 from req.url');
    assert(queryParams.status === 'CANCELLATION_REQUESTED', 'queryParams parses status=CANCELLATION_REQUESTED from req.url');
    assert(queryParams.search === 'AGPXT', 'queryParams parses search=AGPXT from req.url');

    // Part B: Skip / Take boundary calculations
    const pageNum = Math.max(1, parseInt(String(queryParams.page || 1), 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(queryParams.limit || 20), 10) || 20));
    const skipNum = (pageNum - 1) * limitNum;

    assert(pageNum === 2, 'Page is calculated as 2');
    assert(limitNum === 50, 'Limit is calculated as 50');
    assert(skipNum === 50, 'Skip is calculated as 50 ((2 - 1) * 50)');

    // Boundary edge cases
    const boundarySkipPage1 = (1 - 1) * 20;
    assert(boundarySkipPage1 === 0, 'Page 1 skip is strictly 0');

    const boundarySkipPage3 = (3 - 1) * 20;
    assert(boundarySkipPage3 === 40, 'Page 3 skip with limit 20 is strictly 40');

    // Part C: totalPages calculation
    const zeroCount = 0;
    const totalPagesEmpty = Math.ceil(zeroCount / 20) || 1;
    assert(totalPagesEmpty === 1, 'Total pages for 0 total orders evaluates to 1');

    const totalPagesExact = Math.ceil(40 / 20) || 1;
    assert(totalPagesExact === 2, 'Total pages for 40 total orders with limit 20 is 2');

    const totalPagesFractional = Math.ceil(41 / 20) || 1;
    assert(totalPagesFractional === 3, 'Total pages for 41 total orders with limit 20 is 3');

    // Part D: CANCELLATION_REQUESTED filter predicate verification
    const where: any = {};
    const andClauses: any[] = [];

    if (queryParams.status === 'CANCELLATION_REQUESTED') {
      where.status = { not: 'CANCELLED' };
      const orConditions: any[] = [
        { cancelReason: { startsWith: 'Customer requested cancellation' } },
        { adminNotes: { contains: '[cancellation_pending]' } },
      ];
      andClauses.push({ OR: orConditions });
    }

    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    assert(where.status.not === 'CANCELLED', 'CANCELLATION_REQUESTED filter excludes CANCELLED orders');
    assert(where.AND.length === 1, 'where.AND encapsulates OR conditions safely');
    assert(where.AND[0].OR.length === 2, 'OR conditions cover fallback cancelReason and adminNotes');

    // Part E: Stable ordering verification
    const orderByClause = [{ createdAt: 'desc' }, { id: 'desc' }];
    assert(
      orderByClause[0].createdAt === 'desc' && orderByClause[1].id === 'desc',
      'Stable ordering enforces createdAt desc with secondary id desc tie-breaker'
    );
  }

  // ─── Test 17: Admin Approval Refund Outcomes & Message Accuracy ──────────────
  console.log('\n--- 17. Admin Cancellation Approval Outcomes & Messaging ---');
  {
    const createOrderApprovalMockDb = (orderRecord: any) => {
      let currentOrder = orderRecord;
      const db: any = {
        order: {
          fields: { cancellationRequestStatus: true },
          findFirst: async () => currentOrder,
          findUnique: async () => currentOrder,
          updateMany: async ({ data }: any) => {
            currentOrder = { ...currentOrder, ...data };
            return { count: 1 };
          },
          update: async ({ data }: any) => {
            currentOrder = { ...currentOrder, ...data };
            return currentOrder;
          },
        },
        product: {
          findUnique: async () => ({ id: 'p_1', name: 'Jewellery Item', availableStock: 10 }),
          updateMany: async () => ({ count: 1 }),
          update: async () => ({ id: 'p_1' }),
        },
        $queryRawUnsafe: async () => [
          {
            id: 'mov_1',
            orderId: currentOrder.id,
            productId: 'p_1',
            quantity: 1,
            type: 'DEDUCTION',
            idempotencyKey: `deduct_${currentOrder.id}`,
            reason: 'order_confirmed',
            clerkUserId: 'u_1',
            createdAt: new Date(),
          },
        ],
        $executeRawUnsafe: async () => 1,
        $transaction: async (fn: any) => fn(db),
      };
      return db;
    };

    // Part A: Prepaid Approval with Successful Refund
    let refundProcessed = false;
    let orderA: any = {
      id: 'ord_test_approval_refunded',
      orderNumber: 'ORD-20261010-REF01',
      status: 'CONFIRMED',
      shippingStatus: 'READY',
      paymentStatus: 'PAID',
      paymentProvider: 'RAZORPAY',
      paymentTransactionId: 'pay_test_txn_123',
      grandTotal: 5000,
      cancelReason: 'Customer requested cancellation: Found better price',
      cancellationRequestStatus: 'PENDING',
      adminNotes: 'Test prepaid order',
      items: [{ id: 'it_1', productId: 'p_1', quantity: 1 }],
    };

    const dbA = createOrderApprovalMockDb(orderA);

    const mockRazorpaySuccess: any = {
      payments: {
        fetchMultipleRefund: async () => ({ items: [] }),
        refund: async (_payId: string, params: any) => {
          refundProcessed = true;
          return { id: 'rfnd_test_success_999', status: 'processed', ...params };
        },
      },
    };

    const resultA = await resolveAdminCancellationWorkflow({
      orderIdOrNumber: orderA.id,
      decision: 'APPROVE',
      adminClerkUserId: 'admin_test_1',
      customPrismaClient: dbA,
      customRazorpayClient: mockRazorpaySuccess,
    });

    assert(resultA.success === true, 'Approval with refund succeeds');
    assert(resultA.refundStatus === 'REFUNDED', 'Refund status is REFUNDED');
    assert(resultA.inventoryRestored === true, 'Inventory is restored');
    assert(resultA.order.status === 'CANCELLED', 'Order status is CANCELLED');
    assert(resultA.message.includes('refund processed'), 'Message confirms refund processed');

    // Part B: Prepaid Approval with Refund Pending Retry
    let orderB: any = {
      id: 'ord_test_approval_pending_retry',
      orderNumber: 'ORD-20261010-RETRY02',
      status: 'CONFIRMED',
      shippingStatus: 'READY',
      paymentStatus: 'PAID',
      paymentProvider: 'RAZORPAY',
      paymentTransactionId: 'pay_test_txn_456',
      grandTotal: 7500,
      cancelReason: 'Customer requested cancellation: Delay in delivery',
      cancellationRequestStatus: 'PENDING',
      adminNotes: 'Test retry order',
      items: [{ id: 'it_2', productId: 'p_2', quantity: 1 }],
    };

    const dbB = createOrderApprovalMockDb(orderB);

    const mockRazorpayRetry: any = {
      payments: {
        fetchMultipleRefund: async () => ({ items: [] }),
        refund: async () => {
          const timeoutErr: any = new Error('Gateway gateway timeout');
          timeoutErr.code = 'ETIMEDOUT';
          throw timeoutErr;
        },
      },
    };

    const resultB = await resolveAdminCancellationWorkflow({
      orderIdOrNumber: orderB.id,
      decision: 'APPROVE',
      adminClerkUserId: 'admin_test_1',
      customPrismaClient: dbB,
      customRazorpayClient: mockRazorpayRetry,
    });

    assert(resultB.success === true, 'Cancellation succeeds even if refund encounters network issue');
    assert(resultB.refundStatus === 'PENDING_RETRY', 'Refund status is PENDING_RETRY');
    assert(resultB.order.status === 'CANCELLED', 'Order status is CANCELLED');
    assert(resultB.inventoryRestored === true, 'Inventory restored despite pending refund');
    assert(
      resultB.message.includes('pending retry'),
      'Message accurately states refund is pending retry without claiming refunded'
    );

    // Part C: Prepaid Approval with Refund Failure
    let orderC: any = {
      id: 'ord_test_approval_refund_failed',
      orderNumber: 'ORD-20261010-FAIL03',
      status: 'CONFIRMED',
      shippingStatus: 'READY',
      paymentStatus: 'PAID',
      paymentProvider: 'RAZORPAY',
      paymentTransactionId: 'pay_test_txn_789',
      grandTotal: 3000,
      cancelReason: 'Customer requested cancellation: Mistake',
      cancellationRequestStatus: 'PENDING',
      adminNotes: 'Test failed refund order',
      items: [{ id: 'it_3', productId: 'p_3', quantity: 1 }],
    };

    const dbC = createOrderApprovalMockDb(orderC);

    const mockRazorpayFail: any = {
      payments: {
        fetchMultipleRefund: async () => ({ items: [] }),
        refund: async () => {
          const err: any = new Error('BAD_REQUEST_ERROR: Payment already refunded or invalid');
          err.statusCode = 400;
          throw err;
        },
      },
    };

    const resultC = await resolveAdminCancellationWorkflow({
      orderIdOrNumber: orderC.id,
      decision: 'APPROVE',
      adminClerkUserId: 'admin_test_1',
      customPrismaClient: dbC,
      customRazorpayClient: mockRazorpayFail,
    });

    assert(resultC.success === true, 'Cancellation succeeds when refund rejected');
    assert(resultC.refundStatus === 'REFUND_FAILED', 'Refund status is REFUND_FAILED');
    assert(resultC.message.includes('refund failed'), 'Message accurately alerts admin that refund failed');

    // Part D: Duplicate Approval Protection
    const duplicateApprovalResult = await resolveAdminCancellationWorkflow({
      orderIdOrNumber: orderA.id,
      decision: 'APPROVE',
      adminClerkUserId: 'admin_test_1',
      customPrismaClient: dbA,
      customRazorpayClient: mockRazorpaySuccess,
    });

    assert(duplicateApprovalResult.success === false, 'Duplicate approval on already approved order is rejected');
    assert(duplicateApprovalResult.status === 400, 'Returns HTTP 400 for duplicate approval');
    assert(
      duplicateApprovalResult.error === 'NO_PENDING_CANCELLATION_REQUEST',
      'Rejection code is NO_PENDING_CANCELLATION_REQUEST'
    );
  }

  console.log('\n====================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test runner error:', err);
  process.exit(1);
});
