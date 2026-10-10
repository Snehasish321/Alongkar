/**
 * Admin Order Fulfilment Controls Unit Test Suite
 *
 * Verifies server-side sequential stage transitions, customer cancellation protection,
 * online payment prerequisites, COD compatibility, and terminal immutability.
 *
 * Uses strictly in-memory mocked database operations.
 * Does NOT connect to Neon, call external services, or mutate live records.
 */

process.env.SKIP_TEST_DB_GUARD_AUTO = 'true';
await import('./testDbGuard.js');

import {
  advanceOrderFulfilmentStageWorkflow,
} from '../api/_utils/fulfillment.js';
import {
  getOrderFulfilmentStage,
  hasPendingCancellationRequest,
  FULFILMENT_STAGE_SEQUENCE,
  FULFILMENT_STAGE_METADATA,
  FulfilmentStage,
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

/**
 * Creates an in-memory mock database client simulating Prisma
 */
function createMockPrismaClient(initialOrder: any) {
  let currentOrder = JSON.parse(JSON.stringify(initialOrder));

  return {
    getInternalOrder: () => currentOrder,
    order: {
      findFirst: async ({ where }: any) => {
        if (where.id && where.id !== currentOrder.id) return null;
        if (where.orderNumber && where.orderNumber !== currentOrder.orderNumber) return null;
        return JSON.parse(JSON.stringify(currentOrder));
      },
      update: async ({ where, data }: any) => {
        if (where.id !== currentOrder.id) {
          throw new Error(`Order ${where.id} not found in mock store`);
        }
        currentOrder = {
          ...currentOrder,
          ...data,
        };
        return JSON.parse(JSON.stringify(currentOrder));
      },
    },
  };
}

async function runTests() {
  console.log('====================================================================');
  console.log('ADMIN ORDER FULFILMENT STATUS TRANSITION CONTROLS — UNIT TESTS');
  console.log('====================================================================\n');

  // ─── 1. Pure Evaluator Tests: getOrderFulfilmentStage ───────────────────────────
  console.log('--- 1. getOrderFulfilmentStage Pure Evaluator ---');
  {
    assert(
      getOrderFulfilmentStage({ status: 'CONFIRMED', shippingStatus: 'READY' }) === 'REVIEWING',
      'Maps CONFIRMED + READY to REVIEWING'
    );
    assert(
      getOrderFulfilmentStage({ status: 'PROCESSING', shippingStatus: 'PROCESSING' }) === 'PACKAGING',
      'Maps PROCESSING + PROCESSING to PACKAGING'
    );
    assert(
      getOrderFulfilmentStage({ status: 'SHIPPED', shippingStatus: 'SHIPPED' }) === 'PICKUP_BY_DELIVERY_PARTNER',
      'Maps SHIPPED + SHIPPED to PICKUP_BY_DELIVERY_PARTNER'
    );
    assert(
      getOrderFulfilmentStage({ status: 'SHIPPED', shippingStatus: 'IN_TRANSIT' }) === 'OUT_FOR_DELIVERY',
      'Maps SHIPPED + IN_TRANSIT to OUT_FOR_DELIVERY'
    );
    assert(
      getOrderFulfilmentStage({ status: 'DELIVERED', shippingStatus: 'DELIVERED' }) === 'DELIVERED',
      'Maps DELIVERED + DELIVERED to DELIVERED'
    );
    assert(
      getOrderFulfilmentStage({ status: 'CANCELLED', shippingStatus: 'CANCELLED' }) === null,
      'Returns null for CANCELLED order'
    );
  }

  // ─── 2. Pure Evaluator Tests: hasPendingCancellationRequest ───────────────────
  console.log('\n--- 2. hasPendingCancellationRequest Pure Evaluator ---');
  {
    assert(
      hasPendingCancellationRequest({ status: 'CONFIRMED', cancelReason: 'Customer changed mind' }) === true,
      'Detects pending cancellation when cancelReason is present on active order'
    );
    assert(
      hasPendingCancellationRequest({ status: 'CANCELLED', cancelReason: 'Customer changed mind' }) === false,
      'Returns false if order is already CANCELLED'
    );
    assert(
      hasPendingCancellationRequest({ status: 'CONFIRMED', customerNotes: 'Please cancel this order immediately' }) === true,
      'Detects cancellation request in customerNotes'
    );
    assert(
      hasPendingCancellationRequest({ status: 'CONFIRMED', adminNotes: 'Flagged: [cancellation_pending] by support' }) === true,
      'Detects cancellation request tag in adminNotes'
    );
    assert(
      hasPendingCancellationRequest({ status: 'CONFIRMED', cancelReason: null, customerNotes: 'Please ring bell', adminNotes: 'Standard order' }) === false,
      'Returns false when no cancellation request exists'
    );
  }

  // ─── 3. Sequential Stage Progression (Happy Path) ─────────────────────────────
  console.log('\n--- 3. Sequential Stage Progression (Happy Path: Full Lifecycle) ---');
  {
    const baseOrder = {
      id: 'cuid_test_order_fulfilment_1',
      orderNumber: 'ORD-2026-F001',
      status: 'CONFIRMED',
      shippingStatus: 'READY',
      paymentStatus: 'PAID',
      paymentProvider: 'RAZORPAY',
      grandTotal: 12500,
      adminNotes: null,
      shippedAt: null,
      deliveredAt: null,
    };

    const mockDb = createMockPrismaClient(baseOrder);

    // Step 1: REVIEWING -> PACKAGING
    const step1 = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: baseOrder.id,
      adminClerkUserId: 'admin_test_1',
      dbClient: mockDb as any,
    });
    assert(step1.success === true, 'Step 1: Successfully advanced to PACKAGING');
    assert(step1.currentStage === 'PACKAGING', 'Step 1: Current stage is PACKAGING');
    assert(step1.nextStage === 'PICKUP_BY_DELIVERY_PARTNER', 'Step 1: Next stage is PICKUP_BY_DELIVERY_PARTNER');
    assert(mockDb.getInternalOrder().status === 'PROCESSING', 'Step 1: DB status is PROCESSING');
    assert(mockDb.getInternalOrder().shippingStatus === 'PROCESSING', 'Step 1: DB shippingStatus is PROCESSING');

    // Step 2: PACKAGING -> PICKUP_BY_DELIVERY_PARTNER
    const step2 = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: baseOrder.id,
      adminClerkUserId: 'admin_test_1',
      dbClient: mockDb as any,
    });
    assert(step2.success === true, 'Step 2: Successfully advanced to PICKUP_BY_DELIVERY_PARTNER');
    assert(step2.currentStage === 'PICKUP_BY_DELIVERY_PARTNER', 'Step 2: Current stage is PICKUP_BY_DELIVERY_PARTNER');
    assert(step2.nextStage === 'OUT_FOR_DELIVERY', 'Step 2: Next stage is OUT_FOR_DELIVERY');
    assert(mockDb.getInternalOrder().status === 'SHIPPED', 'Step 2: DB status is SHIPPED');
    assert(mockDb.getInternalOrder().shippingStatus === 'SHIPPED', 'Step 2: DB shippingStatus is SHIPPED');
    assert(Boolean(mockDb.getInternalOrder().shippedAt), 'Step 2: DB shippedAt timestamp is recorded');

    // Step 3: PICKUP_BY_DELIVERY_PARTNER -> OUT_FOR_DELIVERY
    const step3 = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: baseOrder.id,
      adminClerkUserId: 'admin_test_1',
      dbClient: mockDb as any,
    });
    assert(step3.success === true, 'Step 3: Successfully advanced to OUT_FOR_DELIVERY');
    assert(step3.currentStage === 'OUT_FOR_DELIVERY', 'Step 3: Current stage is OUT_FOR_DELIVERY');
    assert(step3.nextStage === 'DELIVERED', 'Step 3: Next stage is DELIVERED');
    assert(mockDb.getInternalOrder().status === 'SHIPPED', 'Step 3: DB status remains SHIPPED');
    assert(mockDb.getInternalOrder().shippingStatus === 'IN_TRANSIT', 'Step 3: DB shippingStatus is IN_TRANSIT');

    // Step 4: OUT_FOR_DELIVERY -> DELIVERED
    const step4 = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: baseOrder.id,
      adminClerkUserId: 'admin_test_1',
      dbClient: mockDb as any,
    });
    assert(step4.success === true, 'Step 4: Successfully advanced to DELIVERED');
    assert(step4.currentStage === 'DELIVERED', 'Step 4: Current stage is DELIVERED');
    assert(step4.nextStage === null, 'Step 4: Next stage is null (terminal)');
    assert(mockDb.getInternalOrder().status === 'DELIVERED', 'Step 4: DB status is DELIVERED');
    assert(mockDb.getInternalOrder().shippingStatus === 'DELIVERED', 'Step 4: DB shippingStatus is DELIVERED');
    assert(Boolean(mockDb.getInternalOrder().deliveredAt), 'Step 4: DB deliveredAt timestamp is recorded');

    // Step 5: Advancement beyond DELIVERED is rejected
    const step5 = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: baseOrder.id,
      adminClerkUserId: 'admin_test_1',
      dbClient: mockDb as any,
    });
    assert(step5.success === false, 'Step 5: Advancement beyond DELIVERED is rejected');
    assert(step5.status === 400, 'Step 5: Returns HTTP 400');
    assert(step5.error === 'ALREADY_DELIVERED', 'Step 5: Error is ALREADY_DELIVERED');
  }

  // ─── 4. Rejection of Skipped Transitions ──────────────────────────────────────
  console.log('\n--- 4. Rejection of Skipped Transitions ---');
  {
    const reviewingOrder = {
      id: 'cuid_test_order_skip',
      orderNumber: 'ORD-2026-F002',
      status: 'CONFIRMED',
      shippingStatus: 'READY',
      paymentStatus: 'PAID',
      paymentProvider: 'RAZORPAY',
    };
    const mockDb = createMockPrismaClient(reviewingOrder);

    const skipToDelivered = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: reviewingOrder.id,
      targetStage: 'DELIVERED',
      dbClient: mockDb as any,
    });
    assert(skipToDelivered.success === false, 'Skipping from REVIEWING directly to DELIVERED is rejected');
    assert(skipToDelivered.status === 400, 'Returns HTTP 400');
    assert(skipToDelivered.error === 'INVALID_TRANSITION', 'Returns INVALID_TRANSITION');

    const skipToPickup = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: reviewingOrder.id,
      targetStage: 'PICKUP_BY_DELIVERY_PARTNER',
      dbClient: mockDb as any,
    });
    assert(skipToPickup.success === false, 'Skipping from REVIEWING directly to PICKUP is rejected');
    assert(skipToPickup.error === 'INVALID_TRANSITION', 'Returns INVALID_TRANSITION');
  }

  // ─── 5. Rejection of Backward Transitions ─────────────────────────────────────
  console.log('\n--- 5. Rejection of Backward Transitions ---');
  {
    const shippedOrder = {
      id: 'cuid_test_order_back',
      orderNumber: 'ORD-2026-F003',
      status: 'SHIPPED',
      shippingStatus: 'SHIPPED',
      paymentStatus: 'PAID',
      paymentProvider: 'RAZORPAY',
    };
    const mockDb = createMockPrismaClient(shippedOrder);

    const backwardToPackaging = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: shippedOrder.id,
      targetStage: 'PACKAGING',
      dbClient: mockDb as any,
    });
    assert(backwardToPackaging.success === false, 'Transitioning backwards from PICKUP to PACKAGING is rejected');
    assert(backwardToPackaging.status === 400, 'Returns HTTP 400');
    assert(backwardToPackaging.error === 'BACKWARD_TRANSITION_DISALLOWED', 'Returns BACKWARD_TRANSITION_DISALLOWED');

    const backwardToReviewing = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: shippedOrder.id,
      targetStage: 'REVIEWING',
      dbClient: mockDb as any,
    });
    assert(backwardToReviewing.success === false, 'Transitioning backwards from PICKUP to REVIEWING is rejected');
    assert(backwardToReviewing.error === 'BACKWARD_TRANSITION_DISALLOWED', 'Returns BACKWARD_TRANSITION_DISALLOWED');
  }

  // ─── 6. Protection of Pending Customer Cancellation Requests ──────────────────
  console.log('\n--- 6. Protection of Pending Customer Cancellation Requests (Requirement R4) ---');
  {
    // Case A: Order in PACKAGING with pending cancelReason trying to advance to PICKUP
    const packagingWithCancel = {
      id: 'cuid_test_order_cancel_pend_1',
      orderNumber: 'ORD-2026-F004',
      status: 'PROCESSING',
      shippingStatus: 'PROCESSING',
      paymentStatus: 'PAID',
      paymentProvider: 'RAZORPAY',
      cancelReason: 'Customer requested cancellation due to wrong address',
    };
    const mockDbA = createMockPrismaClient(packagingWithCancel);

    const pickupBlocked = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: packagingWithCancel.id,
      dbClient: mockDbA as any,
    });
    assert(pickupBlocked.success === false, 'Advancing to PICKUP is blocked when customer cancellation is pending');
    assert(pickupBlocked.status === 409, 'Returns HTTP 409 Conflict');
    assert(pickupBlocked.error === 'PENDING_CANCELLATION_REQUEST', 'Returns PENDING_CANCELLATION_REQUEST');

    // Case B: Order in REVIEWING with pending cancelReason advancing to PACKAGING
    // (Requirement R4 specifies: "block advancement to pickup or any later stage until the request is resolved")
    const reviewingWithCancel = {
      id: 'cuid_test_order_cancel_pend_2',
      orderNumber: 'ORD-2026-F005',
      status: 'CONFIRMED',
      shippingStatus: 'READY',
      paymentStatus: 'PAID',
      paymentProvider: 'RAZORPAY',
      cancelReason: 'Customer requested cancellation',
    };
    const mockDbB = createMockPrismaClient(reviewingWithCancel);

    const packagingAllowed = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: reviewingWithCancel.id,
      dbClient: mockDbB as any,
    });
    assert(packagingAllowed.success === true, 'Advancing from REVIEWING to PACKAGING is allowed before pickup');
    assert(packagingAllowed.currentStage === 'PACKAGING', 'Current stage moved to PACKAGING');

    // Subsequent advancement to PICKUP must now be blocked
    const pickupBlockedNext = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: reviewingWithCancel.id,
      dbClient: mockDbB as any,
    });
    assert(pickupBlockedNext.success === false, 'Subsequent advance to PICKUP is strictly blocked by pending cancel');
    assert(pickupBlockedNext.status === 409, 'Returns HTTP 409');
    assert(pickupBlockedNext.error === 'PENDING_CANCELLATION_REQUEST', 'Returns PENDING_CANCELLATION_REQUEST');
  }

  // ─── 7. Cancelled Order Immutability ───────────────────────────────────────────
  console.log('\n--- 7. Cancelled Order Immutability ---');
  {
    const cancelledOrder = {
      id: 'cuid_test_order_cancelled',
      orderNumber: 'ORD-2026-F006',
      status: 'CANCELLED',
      shippingStatus: 'CANCELLED',
      paymentStatus: 'REFUNDED',
      paymentProvider: 'RAZORPAY',
    };
    const mockDb = createMockPrismaClient(cancelledOrder);

    const cancelledAdvance = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: cancelledOrder.id,
      dbClient: mockDb as any,
    });
    assert(cancelledAdvance.success === false, 'Advancing a cancelled order is rejected');
    assert(cancelledAdvance.status === 400, 'Returns HTTP 400');
    assert(cancelledAdvance.error === 'ORDER_CANCELLED', 'Returns ORDER_CANCELLED');
  }

  // ─── 8. Online Payment Prerequisites vs COD Progression ────────────────────────
  console.log('\n--- 8. Online Payment Prerequisites vs COD Progression ---');
  {
    // Online order unpaid
    const unpaidOnlineOrder = {
      id: 'cuid_test_order_unpaid',
      orderNumber: 'ORD-2026-F007',
      status: 'CONFIRMED',
      shippingStatus: 'READY',
      paymentStatus: 'PENDING',
      paymentProvider: 'RAZORPAY',
    };
    const mockDbUnpaid = createMockPrismaClient(unpaidOnlineOrder);

    const unpaidAdvance = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: unpaidOnlineOrder.id,
      dbClient: mockDbUnpaid as any,
    });
    assert(unpaidAdvance.success === false, 'Advancing unpaid online order is rejected');
    assert(unpaidAdvance.status === 400, 'Returns HTTP 400');
    assert(unpaidAdvance.error === 'PAYMENT_NOT_COMPLETED', 'Returns PAYMENT_NOT_COMPLETED');

    // COD order with PENDING paymentStatus
    const codOrder = {
      id: 'cuid_test_order_cod',
      orderNumber: 'ORD-2026-F008',
      status: 'CONFIRMED',
      shippingStatus: 'READY',
      paymentStatus: 'PENDING',
      paymentProvider: 'COD',
    };
    const mockDbCod = createMockPrismaClient(codOrder);

    const codAdvance = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: codOrder.id,
      dbClient: mockDbCod as any,
    });
    assert(codAdvance.success === true, 'COD order with paymentStatus PENDING can advance to PACKAGING');
    assert(codAdvance.currentStage === 'PACKAGING', 'COD order advances to PACKAGING successfully');
  }

  // ─── 9. Financial, Inventory, and Gateway Invariance ──────────────────────────
  console.log('\n--- 9. Financial, Inventory, and Gateway Invariance (Requirement R5) ---');
  {
    const originalOrder = {
      id: 'cuid_test_order_invariance',
      orderNumber: 'ORD-2026-F009',
      status: 'CONFIRMED',
      shippingStatus: 'READY',
      paymentStatus: 'PAID',
      paymentProvider: 'RAZORPAY',
      paymentTransactionId: 'pay_1234567890',
      grandTotal: 50000,
    };
    const mockDb = createMockPrismaClient(originalOrder);

    await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: originalOrder.id,
      adminClerkUserId: 'admin_test_invariance',
      dbClient: mockDb as any,
    });

    const updated = mockDb.getInternalOrder();
    assert(updated.paymentStatus === 'PAID', 'Payment status remains PAID (not altered by stage advance)');
    assert(updated.paymentTransactionId === 'pay_1234567890', 'paymentTransactionId is untouched');
    assert(updated.grandTotal === 50000, 'grandTotal is untouched');
    assert(typeof updated.adminNotes === 'string' && updated.adminNotes.includes('admin_test_invariance'), 'Appends audit note with admin identifier');
  }

  // ─── 10. Duplicate & Concurrent Transition Protection ──────────────────────────
  console.log('\n--- 10. Duplicate & Concurrent Transition Protection (Requirement R8) ---');
  {
    const orderState = {
      id: 'cuid_test_order_race',
      orderNumber: 'ORD-2026-F010',
      status: 'CONFIRMED',
      shippingStatus: 'READY',
      paymentStatus: 'PAID',
      paymentProvider: 'RAZORPAY',
    };
    const mockDb = createMockPrismaClient(orderState);

    // Simulated Request A: moves from REVIEWING -> PACKAGING
    const reqA = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: orderState.id,
      targetStage: 'PACKAGING',
      adminClerkUserId: 'admin_1',
      dbClient: mockDb as any,
    });
    assert(reqA.success === true, 'First transition to PACKAGING succeeds');
    assert(reqA.currentStage === 'PACKAGING', 'First transition sets stage to PACKAGING');

    // Duplicate Request B arrives with stale targetStage 'PACKAGING'
    const reqB = await advanceOrderFulfilmentStageWorkflow({
      orderIdOrNumber: orderState.id,
      targetStage: 'PACKAGING',
      adminClerkUserId: 'admin_2',
      dbClient: mockDb as any,
    });
    assert(reqB.success === false, 'Duplicate transition to PACKAGING is rejected');
    assert(reqB.status === 400, 'Duplicate transition returns HTTP 400');
    assert(reqB.error === 'INVALID_TRANSITION', 'Duplicate transition returns INVALID_TRANSITION');
  }

  console.log('\n====================================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
