/**
 * Phase 3-J Task 2: Atomic Refund Concurrency & Recovery Unit Test Suite
 *
 * Verifies database-backed atomic claim coordination, concurrent race condition prevention,
 * provider timeout claim retention, and interrupted operation recovery in memory.
 *
 * Does NOT connect to any database, network, or external Razorpay service.
 */

// Set guard unit-test mode before loading guard module to prevent any DB connection
process.env.SKIP_TEST_DB_GUARD_AUTO = 'true';
await import('./testDbGuard.js');

import {
  parseRefundClaim,
  processIdempotentRazorpayRefund,
  retryAdminOrderRefundWorkflow,
  REFUND_CLAIM_PREFIX,
  REFUND_CLAIM_TIMEOUT_MS,
} from '../api/_utils/orderCancellation.js';

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
 * Creates an in-memory mock database that faithfully emulates PostgreSQL
 * row-level atomic conditional updates (`updateMany`) and ACID behavior.
 */
function createMockDb(initialOverrides: any = {}) {
  let orderRecord: any = {
    id: 'cuid_test_order_concurrency',
    orderNumber: 'ORD-2026-CONC-1',
    grandTotal: 5000.0, // 500,000 paise
    paymentTransactionId: 'pay_conc_123',
    paymentProvider: 'RAZORPAY',
    paymentStatus: 'PAID',
    paymentSessionId: null,
    adminNotes: null,
    paymentFailureReason: null,
    items: [],
    ...initialOverrides,
  };

  return {
    get record() {
      return { ...orderRecord };
    },
    order: {
      findUnique: async ({ where }: any) => {
        if (where.id === orderRecord.id) {
          return { ...orderRecord };
        }
        return null;
      },
      findFirst: async ({ where }: any) => {
        if (where.id === orderRecord.id || where.orderNumber === orderRecord.orderNumber) {
          return { ...orderRecord };
        }
        return null;
      },
      updateMany: async ({ where, data }: any) => {
        if (where.id !== orderRecord.id) {
          return { count: 0 };
        }
        if (where.paymentStatus && where.paymentStatus !== orderRecord.paymentStatus) {
          return { count: 0 };
        }
        // Strict conditional check on paymentSessionId
        const expectedSession = where.paymentSessionId;
        const currentSession = orderRecord.paymentSessionId;
        const matchesSession =
          (expectedSession === null && !currentSession) ||
          expectedSession === currentSession;

        if (!matchesSession) {
          return { count: 0 }; // Row was claimed or changed by another transaction!
        }

        // Atomic update success
        orderRecord = { ...orderRecord, ...data };
        return { count: 1 };
      },
      update: async ({ where, data }: any) => {
        if (where.id !== orderRecord.id) {
          throw new Error('Record not found');
        }
        orderRecord = { ...orderRecord, ...data };
        return { ...orderRecord };
      },
    },
  };
}

async function runTests() {
  console.log('====================================================================');
  console.log('PHASE 3-J TASK 2: ATOMIC REFUND CONCURRENCY & RECOVERY UNIT TESTS');
  console.log('====================================================================\n');

  // ─── 1. parseRefundClaim helper tests ─────────────────────────────────────
  console.log('--- 1. Refund Claim Token Parser Tests ---');
  {
    assert(parseRefundClaim(null).hasClaim === false, 'Null has no claim');
    assert(parseRefundClaim(undefined).hasClaim === false, 'Undefined has no claim');
    assert(parseRefundClaim('').hasClaim === false, 'Empty string has no claim');
    assert(parseRefundClaim('normal_checkout_session').hasClaim === false, 'Unrelated session string has no claim');

    const activeToken = `${REFUND_CLAIM_PREFIX}req_123:${Date.now()}`;
    const activeInfo = parseRefundClaim(activeToken);
    assert(activeInfo.hasClaim === true, 'Identifies active claim token');
    assert(activeInfo.claimId === 'req_123', 'Extracts claimId');
    assert(activeInfo.isExpired === false, 'Fresh claim is not expired');

    // Stale token (>60s old)
    const staleTime = Date.now() - (REFUND_CLAIM_TIMEOUT_MS + 5000);
    const staleToken = `${REFUND_CLAIM_PREFIX}req_old:${staleTime}`;
    const staleInfo = parseRefundClaim(staleToken);
    assert(staleInfo.hasClaim === true, 'Identifies stale claim token');
    assert(staleInfo.isExpired === true, 'Identifies claim as expired (>60s)');
  }

  // ─── 2. Single Normal Refund Lifecycle ────────────────────────────────────
  console.log('\n--- 2. Single Normal Refund Lifecycle ---');
  {
    const mockDb = createMockDb();
    let gatewayDispatchCount = 0;
    const mockRzp = {
      payments: {
        fetchMultipleRefund: async () => ({ items: [] }),
        refund: async (_payId: string, params: any) => {
          gatewayDispatchCount++;
          return { id: 'rfnd_normal_1', status: 'processed', ...params };
        },
      },
    };

    const res = await processIdempotentRazorpayRefund({
      db: mockDb,
      order: mockDb.record,
      customRazorpayClient: mockRzp,
    });

    assert(res.success === true, 'Refund succeeds');
    assert(res.refundId === 'rfnd_normal_1', 'Returns refund ID');
    assert(gatewayDispatchCount === 1, 'Gateway refund dispatched exactly once');
    assert(mockDb.record.paymentStatus === 'REFUNDED', 'Order paymentStatus updated to REFUNDED');
    assert(mockDb.record.paymentSessionId === null, 'Claim released (paymentSessionId is null)');
  }

  // ─── 3. Concurrent Duplicate Requests (Atomic Race Simulation) ───────────
  console.log('\n--- 3. Concurrent Duplicate Requests (Atomic updateMany Race) ---');
  {
    const mockDb = createMockDb();
    let gatewayDispatchCount = 0;

    const mockRzp = {
      payments: {
        fetchMultipleRefund: async () => ({ items: [] }),
        refund: async (_payId: string, params: any) => {
          gatewayDispatchCount++;
          // Simulate network latency (20ms)
          await new Promise((r) => setTimeout(r, 20));
          return { id: 'rfnd_winner', status: 'processed', ...params };
        },
      },
    };

    // Simulate 5 simultaneous refund retry requests firing at the same time
    const results = await Promise.all([
      processIdempotentRazorpayRefund({ db: mockDb, order: mockDb.record, customRazorpayClient: mockRzp }),
      processIdempotentRazorpayRefund({ db: mockDb, order: mockDb.record, customRazorpayClient: mockRzp }),
      processIdempotentRazorpayRefund({ db: mockDb, order: mockDb.record, customRazorpayClient: mockRzp }),
      processIdempotentRazorpayRefund({ db: mockDb, order: mockDb.record, customRazorpayClient: mockRzp }),
      processIdempotentRazorpayRefund({ db: mockDb, order: mockDb.record, customRazorpayClient: mockRzp }),
    ]);

    const successCount = results.filter((r) => r.success).length;
    const inProgressCount = results.filter((r) => !r.success && r.isInProgress).length;

    assert(gatewayDispatchCount === 1, 'CRITICAL: Gateway payments.refund dispatched EXACTLY ONCE across 5 concurrent requests');
    assert(successCount === 1, 'Exactly one concurrent request acquired claim and succeeded');
    assert(inProgressCount === 4, 'Remaining 4 concurrent requests were cleanly rejected with isInProgress: true');
  }

  // ─── 4. Immediate Duplicate Retry while First Request is In-Flight ────────
  console.log('\n--- 4. Active In-Flight Claim Blocks Immediate Retry ---');
  {
    // Order already has an active claim token acquired 5 seconds ago
    const activeToken = `${REFUND_CLAIM_PREFIX}active_claim_1:${Date.now() - 5000}`;
    const mockDb = createMockDb({ paymentSessionId: activeToken });

    let gatewayCalled = false;
    const mockRzp = {
      payments: {
        fetchMultipleRefund: async () => {
          gatewayCalled = true;
          return { items: [] };
        },
        refund: async () => {
          gatewayCalled = true;
          return {};
        },
      },
    };

    const res = await processIdempotentRazorpayRefund({
      db: mockDb,
      order: mockDb.record,
      customRazorpayClient: mockRzp,
    });

    assert(res.success === false, 'Retry returns success: false');
    assert(res.isInProgress === true, 'Returns isInProgress: true');
    assert(res.error?.includes('currently in progress'), 'Explains operation is in progress');
    assert(gatewayCalled === false, 'Did not contact gateway at all; blocked locally by active claim');

    // Test retryAdminOrderRefundWorkflow wrapping
    const workflowRes = await retryAdminOrderRefundWorkflow({
      orderIdOrNumber: mockDb.record.id,
      customPrismaClient: mockDb,
      customRazorpayClient: mockRzp,
    });

    assert(workflowRes.success === false, 'Workflow returns success: false');
    assert(workflowRes.status === 409, 'Workflow returns HTTP 409 Conflict');
    assert(workflowRes.error === 'REFUND_IN_PROGRESS', 'Workflow returns code REFUND_IN_PROGRESS');
    assert(workflowRes.refundStatus === 'PENDING_RETRY', 'refundStatus indicates PENDING_RETRY');
  }

  // ─── 5. Provider Timeout / Network Failure Retains Claim Token ─────────────
  console.log('\n--- 5. Provider Timeout / Network Failure Retains Claim Token ---');
  {
    const mockDb = createMockDb();
    const mockRzp = {
      payments: {
        fetchMultipleRefund: async () => ({ items: [] }),
        refund: async () => {
          throw new Error('razorpay_payment_refund operation timed out after 15000ms');
        },
      },
    };

    const res = await processIdempotentRazorpayRefund({
      db: mockDb,
      order: mockDb.record,
      customRazorpayClient: mockRzp,
    });

    assert(res.success === false, 'Timeout returns success: false');
    assert(res.isUnresolved === true, 'Flags operation as isUnresolved: true (outcome uncertain)');
    assert(mockDb.record.paymentStatus === 'PAID', 'Preserves paymentStatus as PAID');
    assert(
      typeof mockDb.record.paymentSessionId === 'string' &&
        mockDb.record.paymentSessionId.startsWith(REFUND_CLAIM_PREFIX),
      'CRITICAL: Claim token is RETAINED in paymentSessionId so rapid retries do not duplicate'
    );
    assert(
      mockDb.record.paymentFailureReason?.includes('outcome uncertain'),
      'Notes in paymentFailureReason that outcome is uncertain'
    );
  }

  // ─── 6. Recovery: Interrupted Stale Claim Succeeded at Gateway ─────────────
  console.log('\n--- 6. Recovery: Interrupted Stale Claim Succeeded at Gateway ---');
  {
    // Simulate order whose serverless process crashed 70 seconds ago after dispatching refund
    const staleTime = Date.now() - 70000;
    const staleToken = `${REFUND_CLAIM_PREFIX}crashed_claim:${staleTime}`;
    const mockDb = createMockDb({
      paymentSessionId: staleToken,
      paymentFailureReason: 'Refund in-progress / timeout (outcome uncertain): timed out',
    });

    let newRefundCallCount = 0;
    const existingGatewayRefund = {
      id: 'rfnd_recovered_gateway_777',
      status: 'processed',
      receipt: `ref_${mockDb.record.orderNumber}`,
      amount: 500000,
    };

    const mockRzp = {
      payments: {
        fetchMultipleRefund: async () => ({ items: [existingGatewayRefund] }),
        refund: async () => {
          newRefundCallCount++;
          return { id: 'rfnd_duplicate' };
        },
      },
    };

    const res = await processIdempotentRazorpayRefund({
      db: mockDb,
      order: mockDb.record,
      customRazorpayClient: mockRzp,
    });

    assert(res.success === true, 'Recovery succeeds with success: true');
    assert(res.isAlreadyRefunded === true, 'Recognized as already refunded at gateway');
    assert(res.refundId === 'rfnd_recovered_gateway_777', 'Captured existing gateway refund ID');
    assert(newRefundCallCount === 0, 'Did NOT call gateway refund API again');
    assert(mockDb.record.paymentStatus === 'REFUNDED', 'Order transitioned to REFUNDED');
    assert(mockDb.record.paymentSessionId === null, 'Stale claim was cleared');
    assert(mockDb.record.paymentFailureReason === null, 'paymentFailureReason was cleared');
  }

  // ─── 7. Recovery: Interrupted Stale Claim Did Not Succeed at Gateway ────────
  console.log('\n--- 7. Recovery: Interrupted Stale Claim Did Not Succeed at Gateway ---');
  {
    // Stale claim from 75s ago, but gateway confirmed 0 refunds for this receipt
    const staleTime = Date.now() - 75000;
    const staleToken = `${REFUND_CLAIM_PREFIX}stale_claim_lost:${staleTime}`;
    const mockDb = createMockDb({ paymentSessionId: staleToken });

    let newRefundCallCount = 0;
    let newlyDispatchedReceipt: string | undefined;

    const mockRzp = {
      payments: {
        fetchMultipleRefund: async () => ({ items: [] }), // No refund at gateway
        refund: async (_payId: string, params: any) => {
          newRefundCallCount++;
          newlyDispatchedReceipt = params.receipt;
          return { id: 'rfnd_new_fresh_dispatch', status: 'processed', ...params };
        },
      },
    };

    const res = await processIdempotentRazorpayRefund({
      db: mockDb,
      order: mockDb.record,
      customRazorpayClient: mockRzp,
    });

    assert(res.success === true, 'Dispatches fresh refund after confirming stale claim did not process');
    assert(res.refundId === 'rfnd_new_fresh_dispatch', 'Captured newly dispatched refund ID');
    assert(newRefundCallCount === 1, 'Dispatched fresh refund to gateway exactly once');
    assert(newlyDispatchedReceipt === `ref_${mockDb.record.orderNumber}`, 'Used expected receipt');
    assert(mockDb.record.paymentStatus === 'REFUNDED', 'Order transitioned to REFUNDED');
    assert(mockDb.record.paymentSessionId === null, 'Claim token cleared on success');
  }

  // ─── 8. Recovery: Gateway Network Failure During Stale Claim Check ────────
  console.log('\n--- 8. Gateway Network Failure During Stale Claim Check (Retain Unresolved) ---');
  {
    const staleTime = Date.now() - 80000;
    const staleToken = `${REFUND_CLAIM_PREFIX}stale_claim_network_down:${staleTime}`;
    const mockDb = createMockDb({ paymentSessionId: staleToken });

    let newRefundCallCount = 0;
    const mockRzp = {
      payments: {
        fetchMultipleRefund: async () => {
          throw new Error('ETIMEDOUT: Failed to query gateway refunds');
        },
        refund: async () => {
          newRefundCallCount++;
          return {};
        },
      },
    };

    const res = await processIdempotentRazorpayRefund({
      db: mockDb,
      order: mockDb.record,
      customRazorpayClient: mockRzp,
    });

    assert(res.success === false, 'Returns success: false when gateway status is uncertain');
    assert(res.isUnresolved === true, 'Flags isUnresolved: true');
    assert(newRefundCallCount === 0, 'Did NOT attempt new refund while previous state is uncertain');
    assert(
      mockDb.record.paymentSessionId === staleToken,
      'Stale claim is RETAINED until gateway can be contacted'
    );
  }

  console.log('\n====================================================================');
  console.log(`TASK 2 CONCURRENCY TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
